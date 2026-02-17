import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Client } from "minecraft-launcher-core";
import { getInstanceDir, InstanceConfig, listInstances, updateInstance } from "./instances";
import { StoredAccount, getAccountById } from "./accounts";
import { ensureVanillaInstalled, getVanillaVersionJarPath } from "./vanillaInstall";
import { pickFabricLoader } from "./fabric";
import { installFabricVersion } from "./fabricInstall";
import { pickLoaderVersion, prepareLoaderInstall, resolveForgeInstallerPath } from "./loaderSupport";
import crypto from "node:crypto";
import { getDataRoot, getAssetsRoot, getLibrariesRoot, getVersionsRoot } from "./paths";
import { autoInstallMissingDependenciesForInstance } from "./dependencyAutoInstall";
import { getSelectedLocalCapeForAccount } from "./capes";
import https from "node:https";
import { pipeline } from "node:stream/promises";

const running = new Map<string, any>(); // instanceId -> child process
const launching = new Set<string>(); // instanceId currently in launcher bootstrap
const cancelRequested = new Set<string>(); // stop requested before child process is available

export type LaunchRuntimePrefs = {
  jvmArgs?: string;
  preLaunch?: string;
  postExit?: string;
  serverAddress?: string;
};

function ensureDirs(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function ensureInstanceDirs(gameDir: string) {
  ensureDirs(gameDir);
  ensureDirs(path.join(gameDir, "mods"));
  ensureDirs(path.join(gameDir, "config"));
  ensureDirs(path.join(gameDir, "resourcepacks"));
  ensureDirs(path.join(gameDir, "shaderpacks"));
  ensureDirs(path.join(gameDir, "saves"));
  ensureDirs(path.join(gameDir, "logs"));
  ensureDirs(path.join(gameDir, ".fishbattery"));
}

function ensureSharedMinecraftDirs(root: string) {
  ensureDirs(root);
  ensureDirs(path.join(root, "versions"));
  ensureDirs(path.join(root, "libraries"));
  ensureDirs(path.join(root, "assets"));
  ensureDirs(path.join(root, "assets", "indexes"));
  ensureDirs(path.join(root, "assets", "objects"));
}

function findBundledJavaExe(): string | null {
  if (process.platform === "win32") {
    const candidates = [
      path.join(process.resourcesPath, "runtime", "java21", "bin", "javaw.exe"),
      path.join(process.resourcesPath, "runtime", "java21", "bin", "java.exe"),
      path.join(process.cwd(), "runtime", "java21", "bin", "javaw.exe"),
      path.join(process.cwd(), "runtime", "java21", "bin", "java.exe")
    ];
    for (const p of candidates) if (fs.existsSync(p)) return p;
    return null;
  }

  const candidates = [
    path.join(process.resourcesPath, "runtime", "java21", "bin", "java"),
    path.join(process.cwd(), "runtime", "java21", "bin", "java")
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function pickJavaExecutable(onLog?: (line: string) => void) {
  const bundled = findBundledJavaExe();
  if (bundled) {
    onLog?.(`[launcher] Using bundled Java 21: ${bundled}`);
    return bundled;
  }
  onLog?.("[launcher] No bundled Java found; using PATH java");
  return "java";
}

function splitShellWords(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    out.push(m[1] ?? m[2] ?? m[0]);
  }
  return out;
}

function parseServerAddress(raw: string): { host: string; port?: number } | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  const idx = value.lastIndexOf(":");
  if (idx > 0 && idx < value.length - 1 && !value.includes("]")) {
    const host = value.slice(0, idx).trim();
    const p = Number(value.slice(idx + 1).trim());
    if (host && Number.isFinite(p) && p > 0 && p <= 65535) return { host, port: p };
  }
  return { host: value };
}

async function runHookCommand(phase: "pre-launch" | "post-exit", command: string, onLog?: (line: string) => void) {
  const cmd = String(command ?? "").trim();
  if (!cmd) return;

  onLog?.(`[hook] Running ${phase} hook: ${cmd}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, {
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    child.stdout?.on("data", (d) => {
      const text = String(d).trim();
      if (text) onLog?.(`[hook:${phase}] ${text}`);
    });

    child.stderr?.on("data", (d) => {
      const text = String(d).trim();
      if (text) {
        stderr += (stderr ? "\n" : "") + text;
        onLog?.(`[hook:${phase}:stderr] ${text}`);
      }
    });

    child.on("error", (err) => {
      reject(new Error(`${phase} hook failed to start: ${String((err as any)?.message ?? err)}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        onLog?.(`[hook] ${phase} hook completed`);
        resolve();
        return;
      }
      reject(new Error(`${phase} hook exited with code ${code}${stderr ? `\n${stderr}` : ""}`));
    });
  });
}

export function isInstanceRunning(instanceId: string) {
  return running.has(instanceId) || launching.has(instanceId);
}

function killChildProcess(child: any) {
  if (!child) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {}
}

export function stopInstance(instanceId: string) {
  const p = running.get(instanceId);
  if (p) {
    killChildProcess(p);
    running.delete(instanceId);
    launching.delete(instanceId);
    cancelRequested.delete(instanceId);
    return true;
  }

  // Launch is still resolving files/metadata. Mark cancellation and stop as soon as child exists.
  if (launching.has(instanceId)) {
    cancelRequested.add(instanceId);
    return true;
  }

  return false;
}

/**
 * MCLC wants:
 * {
 *   access_token, client_token, uuid, name,
 *   user_properties, meta: { type:'msa', xuid: ... }
 * }
 *
 * If any of these are wrong, MCLC may silently fall back to offline → Player###.
 */
function normalizeAndValidateMclcAuth(raw: any) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Account auth missing/invalid. Remove + re-add the account.");
  }

  const access = raw.access_token ?? raw.accessToken ?? null;
  const uuid = raw.uuid ?? raw.id ?? null;
  const name = raw.name ?? raw.username ?? null;

  const meta = raw.meta ?? null;
  const xuid = meta?.xuid ?? raw.xuid ?? null;

  if (!access || typeof access !== "string") throw new Error("Auth missing access_token. Re-login.");
  if (!uuid || typeof uuid !== "string") throw new Error("Auth missing uuid. Re-login.");
  if (!name || typeof name !== "string") throw new Error("Auth missing name. Re-login.");

  if (!meta || typeof meta !== "object") throw new Error("Auth missing meta. Re-login.");
  if (!xuid || typeof xuid !== "string") throw new Error("Auth missing meta.xuid (XUID). Re-login.");

  const userProps =
    typeof raw.user_properties === "object"
      ? raw.user_properties
      : typeof raw.userProperties === "object"
        ? raw.userProperties
        : {};

  return {
    access_token: access,
    client_token: raw.client_token ?? raw.clientToken ?? crypto.randomBytes(16).toString("hex"),
    uuid,
    name,
    user_properties: userProps,
    meta: {
      ...meta,
      type: meta.type ?? "msa",
      xuid
    }
  };
}

function buildMclcAuthorization(account: StoredAccount) {
  if (!(account as any).mclcAuth) {
    throw new Error("Account is missing mclcAuth. Remove + re-add the account.");
  }
  return normalizeAndValidateMclcAuth((account as any).mclcAuth);
}

function assertFabricInstalled(dataRoot: string, mcVersion: string, loaderVersion: string) {
  const verId = `fabric-loader-${loaderVersion}-${mcVersion}`;
  const verDir = path.join(dataRoot, "versions", verId);

  const json = path.join(verDir, `${verId}.json`);
  const jar = path.join(verDir, `${verId}.jar`);

  const loaderJar = path.join(
    dataRoot,
    "libraries",
    "net",
    "fabricmc",
    "fabric-loader",
    loaderVersion,
    `fabric-loader-${loaderVersion}.jar`
  );

  const intermediaryJar = path.join(
    dataRoot,
    "libraries",
    "net",
    "fabricmc",
    "intermediary",
    mcVersion,
    `intermediary-${mcVersion}.jar`
  );

  const required = [json, jar, loaderJar, intermediaryJar];

  const missing = required.filter((p) => !fs.existsSync(p) || fs.statSync(p).size === 0);
  if (missing.length) {
    throw new Error(`Fabric install incomplete. Missing:\n` + missing.map((m) => `- ${m}`).join("\n"));
  }
}

/**
 * ✅ Canonical IPC entry:
 * launchInstance(instanceId, { accountId, onLog })
 */
export async function launchInstance(
  instanceId: string,
  opts: { accountId: string; onLog?: (line: string) => void; runtimePrefs?: LaunchRuntimePrefs }
) {
  const db = listInstances();
  const inst = db.instances.find((x: any) => x.id === instanceId);
  if (!inst) throw new Error("launch: instance not found");

  const acc = getAccountById(opts.accountId);
  if (!acc) throw new Error("launch: account not found");

  return launchResolved(inst, acc, opts.onLog, opts.runtimePrefs);
}

async function launchResolved(
  instance: InstanceConfig,
  account: StoredAccount,
  onLog?: (line: string) => void,
  runtimePrefs?: LaunchRuntimePrefs
) {
  if (!instance?.id) throw new Error("Launch failed: instance is missing or invalid.");
  if (!instance.mcVersion) throw new Error("Launch failed: instance.mcVersion is missing.");
  if (!account) throw new Error("Launch failed: no account was provided/selected.");

  // ✅ instance folder (mods/config/logs/saves)
  const gameDir = getInstanceDir(instance.id);
  ensureInstanceDirs(gameDir);

  // ✅ shared cache folder (assets/libraries/versions)
  const dataRoot = getDataRoot();
  ensureSharedMinecraftDirs(dataRoot);

  // ✅ downloads assets/objects; skipping causes missing sounds etc.
  await ensureVanillaInstalled(instance.mcVersion);

  const vanillaJar = getVanillaVersionJarPath(instance.mcVersion);
  if (!fs.existsSync(vanillaJar) || fs.statSync(vanillaJar).size === 0) {
    throw new Error(`Vanilla jar missing for ${instance.mcVersion}. Expected: ${vanillaJar}`);
  }

  if (instance.loader === "fabric") {
    // ✅ Fallback: resolve Fabric loader version if missing
    if (!instance.fabricLoaderVersion) {
      const resolved = await pickFabricLoader(instance.mcVersion, true);
      instance.fabricLoaderVersion = resolved;
      updateInstance(instance.id, { fabricLoaderVersion: resolved });
      onLog?.(`[fabric] Resolved loader version ${resolved} for ${instance.mcVersion}`);
    }

    // ✅ Ensure Fabric is installed (auto-install if incomplete)
    try {
      assertFabricInstalled(dataRoot, instance.mcVersion, instance.fabricLoaderVersion);
    } catch {
      onLog?.(`[fabric] Installing Fabric loader ${instance.fabricLoaderVersion} for ${instance.mcVersion}…`);
      await installFabricVersion(instance.id, instance.mcVersion, instance.fabricLoaderVersion);
      assertFabricInstalled(dataRoot, instance.mcVersion, instance.fabricLoaderVersion);
    }
  }

  if (instance.loader === "quilt") {
    if (!instance.quiltLoaderVersion) {
      const resolved = await pickLoaderVersion("quilt", instance.mcVersion);
      if (!resolved) throw new Error(`Unable to resolve Quilt loader for ${instance.mcVersion}`);
      instance.quiltLoaderVersion = resolved;
      updateInstance(instance.id, { quiltLoaderVersion: resolved });
      onLog?.(`[quilt] Resolved loader version ${resolved} for ${instance.mcVersion}`);
    }
    onLog?.(`[quilt] Preparing Quilt loader ${instance.quiltLoaderVersion} for ${instance.mcVersion}…`);
    await prepareLoaderInstall({
      instanceId: instance.id,
      mcVersion: instance.mcVersion,
      loader: "quilt",
      loaderVersion: instance.quiltLoaderVersion
    });
  }

  if (instance.loader === "forge") {
    if (!instance.forgeVersion) {
      const resolved = await pickLoaderVersion("forge", instance.mcVersion);
      if (!resolved) throw new Error(`Unable to resolve Forge version for ${instance.mcVersion}`);
      instance.forgeVersion = resolved;
      updateInstance(instance.id, { forgeVersion: resolved });
      onLog?.(`[forge] Resolved version ${resolved} for ${instance.mcVersion}`);
    }
    await prepareLoaderInstall({
      instanceId: instance.id,
      mcVersion: instance.mcVersion,
      loader: "forge",
      loaderVersion: instance.forgeVersion
    });
  }

  if (instance.loader === "neoforge") {
    if (!instance.neoforgeVersion) {
      const resolved = await pickLoaderVersion("neoforge", instance.mcVersion);
      if (!resolved) throw new Error(`Unable to resolve NeoForge version for ${instance.mcVersion}`);
      instance.neoforgeVersion = resolved;
      updateInstance(instance.id, { neoforgeVersion: resolved });
      onLog?.(`[neoforge] Resolved version ${resolved} for ${instance.mcVersion}`);
    }
    await prepareLoaderInstall({
      instanceId: instance.id,
      mcVersion: instance.mcVersion,
      loader: "neoforge",
      loaderVersion: instance.neoforgeVersion
    });
  }

  if (instance.loader === "fabric" || instance.loader === "quilt") {
    const depFix = await autoInstallMissingDependenciesForInstance({
      instanceId: instance.id,
      mcVersion: instance.mcVersion,
      loader: "fabric",
      onLog
    });
    if (depFix.installed.length) {
      onLog?.(`[deps] Auto-installed ${depFix.installed.length} missing dependencies.`);
    }
  }

  const authorization = buildMclcAuthorization(account);
  onLog?.(`[auth] name=${authorization.name} uuid=${authorization.uuid} xuid=${authorization.meta?.xuid}`);

  const launcher = new Client();
  launching.add(instance.id);
  cancelRequested.delete(instance.id);

  const versionsDir = getVersionsRoot(); // dataRoot/versions
  const fabricId = `fabric-loader-${instance.fabricLoaderVersion}-${instance.mcVersion}`;
  const quiltId = `quilt-loader-${instance.quiltLoaderVersion}-${instance.mcVersion}`;

  const version =
    instance.loader === "fabric"
      ? {
          number: instance.mcVersion,
          type: "release",
          custom: fabricId,
          customVersion: path.join(versionsDir, fabricId, `${fabricId}.json`)
        }
      : instance.loader === "quilt"
        ? {
            number: instance.mcVersion,
            type: "release",
            custom: quiltId,
            customVersion: path.join(versionsDir, quiltId, `${quiltId}.json`)
          }
        : {
            number: instance.mcVersion,
            type: "release"
          };

  const assetsDir = getAssetsRoot();
  const javaExe = pickJavaExecutable(onLog);
  const customJavaArgs = splitShellWords(String(runtimePrefs?.jvmArgs ?? "").trim());

  if (String(runtimePrefs?.preLaunch ?? "").trim()) {
    await runHookCommand("pre-launch", String(runtimePrefs?.preLaunch), onLog);
  }

  // If a launcher-local cape is selected for this account, materialize a copy
  // inside the instance folder and inject a JVM property so the bridge mod
  // can locate & load it at runtime.
  try {
    const selectedCape = await getSelectedLocalCapeForAccount((account as any).id);
    if (selectedCape?.fullPath) {
      try {
        const capeDir = path.join(gameDir, ".fishbattery");
        fs.mkdirSync(capeDir, { recursive: true });
        const dest = path.join(capeDir, path.basename(selectedCape.fullPath));
        try {
          fs.copyFileSync(selectedCape.fullPath, dest);
          customJavaArgs.push(`-Dfishbattery.cape.path=${dest}`);
          onLog?.(`[capes] Injected launcher cape: ${dest}`);
        } catch (err) {
          onLog?.(`[capes] Failed to copy selected cape: ${String((err as any)?.message ?? err)}`);
        }
      } catch (err) {
        onLog?.(`[capes] Could not prepare instance cape folder: ${String((err as any)?.message ?? err)}`);
      }
    }
  } catch (err) {
    onLog?.(`[capes] Could not read selected launcher cape: ${String((err as any)?.message ?? err)}`);
  }

  const launchOpts: any = {
    authorization,
    root: dataRoot,

    version,

    memory: {
      min: "1024M",
      max: `${instance.memoryMb ?? 4096}M`
    },

    javaPath: javaExe,
    customArgs: customJavaArgs,

    overrides: {
      gameDirectory: gameDir,
      assets: assetsDir,
      assetRoot: assetsDir,
      libraries: getLibrariesRoot(),
      versions: getVersionsRoot()
    }
  };

  if (instance.loader === "forge") {
    const installer = resolveForgeInstallerPath("forge", instance.forgeVersion);
    if (!installer) throw new Error(`Forge installer not found for ${instance.forgeVersion ?? "unknown"}`);
    launchOpts.forge = installer;
    onLog?.(`[forge] Using installer ${installer}`);
  } else if (instance.loader === "neoforge") {
    const installer = resolveForgeInstallerPath("neoforge", instance.neoforgeVersion);
    if (!installer) throw new Error(`NeoForge installer not found for ${instance.neoforgeVersion ?? "unknown"}`);
    launchOpts.forge = installer;
    onLog?.(`[neoforge] Using installer ${installer}`);
  }

  const targetServer = parseServerAddress(String(runtimePrefs?.serverAddress ?? ""));
  if (targetServer) {
    const identifier = `${targetServer.host}${targetServer.port ? `:${targetServer.port}` : ""}`;
    launchOpts.quickPlay = {
      // 1.20+ expects quickPlay multiplayer instead of legacy --server/--port flags.
      type: "multiplayer",
      identifier
    };
    // Keep deprecated fields unset; recent Minecraft ignores them and logs noise.
    onLog?.(
      `[launcher] Joining server on launch: ${targetServer.host}${targetServer.port ? `:${targetServer.port}` : ""}`
    );
  }

  onLog?.(`[launcher] Launch version id: ${launchOpts.version?.number} (type=${launchOpts.version?.type})`);
  onLog?.(`[launcher] root=${launchOpts.root}`);
  onLog?.(`[launcher] gameDirectory=${launchOpts.overrides?.gameDirectory}`);
  onLog?.(`[launcher] assets=${launchOpts.overrides?.assets}`);
  onLog?.(`[launcher] libraries=${launchOpts.overrides?.libraries}`);
  onLog?.(`[launcher] versions=${launchOpts.overrides?.versions}`);
  onLog?.(`[launcher] java=${javaExe}`);
  if (customJavaArgs.length) onLog?.(`[launcher] custom JVM args: ${customJavaArgs.join(" ")}`);

  launcher.on("debug", (e: any) => onLog?.(`[debug] ${String(e)}`));
  launcher.on("data", (e: any) => onLog?.(`${String(e)}`));
  launcher.on("progress", (e: any) => onLog?.(`[progress] ${JSON.stringify(e)}`));

  // Validate injected cape file and check for bridge mod presence before launching.
  try {
    const capeArg = customJavaArgs.find((a) => String(a || "").startsWith("-Dfishbattery.cape.path="));
    if (capeArg) {
      const destPath = String(capeArg).split("=")[1] || "";
      try {
        if (destPath && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
          onLog?.(`[capes] Cape file present at launch: ${destPath} (${formatBytes(fs.statSync(destPath).size)})`);
        } else {
          onLog?.(`[capes] Cape file missing or empty at expected path: ${destPath}`);
        }
      } catch (err) {
        onLog?.(`[capes] Error checking cape file at ${destPath}: ${String((err as any)?.message ?? err)}`);
      }
    } else {
      onLog?.(`[capes] No launcher cape JVM property present`);
    }

    try {
      const modsDir = path.join(gameDir, "mods");
      const mods = fs.existsSync(modsDir) ? fs.readdirSync(modsDir) : [];
      const bridgeRegex = /fishbattery.*bridge|cape-bridge|fishbattery-cape-bridge/i;
      const found = mods.find((f: string) => bridgeRegex.test(f));
      if (found) {
        const fp = path.join(modsDir, found);
        let size = 0;
        try {
          size = fs.statSync(fp).size || 0;
        } catch {}
        onLog?.(`[capes] Bridge mod found in instance mods: ${found} (${formatBytes(size)})`);
      } else {
        onLog?.(`[capes] Bridge mod not found in instance mods (${modsDir}). Attempting to fetch release and install bridge.`);
        try {
          await tryInstallBridgeFromGithub(modsDir, instance.mcVersion, instance.loader, onLog);
        } catch (err) {
          onLog?.(`[capes] Failed to install bridge mod: ${String((err as any)?.message ?? err)}`);
        }
      }
    } catch (err) {
      onLog?.(`[capes] Error checking mods folder for bridge mod: ${String((err as any)?.message ?? err)}`);
    }
  } catch (err) {
    onLog?.(`[capes] Pre-launch cape/bridge validation failed: ${String((err as any)?.message ?? err)}`);
  }

  let child: any;
  try {
    child = await launcher.launch(launchOpts);
  } catch (err) {
    launching.delete(instance.id);
    cancelRequested.delete(instance.id);
    throw err;
  }
  if (!child) throw new Error("minecraft-launcher-core returned null process.");

  // Stop was requested while launch bootstrap was running.
  if (cancelRequested.has(instance.id)) {
    onLog?.("[launcher] Stop requested during launch. Terminating process.");
    killChildProcess(child);
    launching.delete(instance.id);
    cancelRequested.delete(instance.id);
    return false;
  }

  running.set(instance.id, child);
  launching.delete(instance.id);
  cancelRequested.delete(instance.id);

  child.on?.("close", () => {
    running.delete(instance.id);
    launching.delete(instance.id);
    cancelRequested.delete(instance.id);
    onLog?.("[launcher] Game exited");

    const postExit = String(runtimePrefs?.postExit ?? "").trim();
    if (postExit) {
      void runHookCommand("post-exit", postExit, onLog).catch((err: any) => {
        onLog?.(`[hook] post-exit hook failed: ${String(err?.message ?? err)}`);
      });
    }
  });

  child.on?.("error", (err: any) => {
    running.delete(instance.id);
    launching.delete(instance.id);
    cancelRequested.delete(instance.id);
    onLog?.(`[launcher] Process error: ${String(err?.message ?? err)}`);
  });

  return true;
}

async function tryInstallBridgeFromGithub(modsDir: string, mcVersion: string, loader: string, onLog?: (m: string) => void) {
  const owner = "fishbatteryapp";
  const repo = "fishbattery-cape-bridge";
  const tag = "v1.2.2"; // target release

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
  const headers: any = { "User-Agent": "FishbatteryLauncher/1.0", Accept: "application/vnd.github.v3+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;

  const release = await new Promise<any>((resolve, reject) => {
    const req = https.get(apiUrl, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${body}`));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });

  const assets: any[] = release.assets || [];
  const desired = assets.find(a => {
    const name = String(a.name || "").toLowerCase();
    return name.includes(String(mcVersion).toLowerCase()) && name.includes(String(loader || "fabric").toLowerCase()) && name.endsWith('.jar');
  }) || assets.find(a => String(a.name || "").toLowerCase().includes('fabric') && a.name.endsWith('.jar'));

  if (!desired) throw new Error('No suitable bridge JAR found in release assets');

  const outPath = path.join(modsDir, desired.name);
  onLog?.(`[capes] Downloading bridge asset ${desired.name} to ${outPath}`);

  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createWriteStream(outPath);
    const headers2: any = { "User-Agent": "FishbatteryLauncher/1.0" };
    if (process.env.GITHUB_TOKEN) headers2.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    https.get(desired.browser_download_url, { headers: headers2 }, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) return reject(new Error(`Download failed: ${res.statusCode}`));
      pipeline(res, fileStream).then(() => resolve()).catch(reject);
    }).on('error', reject);
  });

  onLog?.(`[capes] Bridge asset installed: ${outPath}`);
}


