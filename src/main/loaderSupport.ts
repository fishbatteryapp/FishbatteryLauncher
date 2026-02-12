import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";
import { pickFabricLoader } from "./fabric";
import { installFabricVersion } from "./fabricInstall";
import { installVanillaVersion } from "./vanillaInstall";
import { getDataRoot, getVersionsRoot } from "./paths";

export type LoaderKind = "vanilla" | "fabric" | "quilt" | "forge" | "neoforge";

type QuiltLoaderEntry = {
  loader?: { version?: string; stable?: boolean };
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "user-agent": "FishbatteryLauncher/0.2.1" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "FishbatteryLauncher/0.2.1" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function parseMavenMetadataVersions(xml: string): string[] {
  const out: string[] = [];
  const re = /<version>([^<]+)<\/version>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const v = String(m[1] || "").trim();
    if (v) out.push(v);
  }
  return Array.from(new Set(out));
}

function scoreForgeLikeVersion(v: string): number[] {
  return v
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((x) => Number(x));
}

function compareVersionDesc(a: string, b: string): number {
  const pa = scoreForgeLikeVersion(a);
  const pb = scoreForgeLikeVersion(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return db - da;
  }
  return b.localeCompare(a);
}

async function pickQuiltLoader(mcVersion: string): Promise<string> {
  const list = await fetchJson<QuiltLoaderEntry[]>(
    `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}`
  );
  if (!Array.isArray(list) || !list.length) {
    throw new Error(`No Quilt loaders available for Minecraft ${mcVersion}`);
  }
  const stable = list.find((x) => x?.loader?.stable && x?.loader?.version);
  const chosen = stable?.loader?.version ?? list.find((x) => x?.loader?.version)?.loader?.version;
  if (!chosen) throw new Error(`No valid Quilt loader entry for Minecraft ${mcVersion}`);
  return chosen;
}

async function installQuiltVersion(mcVersion: string, loaderVersion: string): Promise<void> {
  await installVanillaVersion(mcVersion);
  const versionsDir = getVersionsRoot();
  const quiltId = `quilt-loader-${loaderVersion}-${mcVersion}`;
  const quiltDir = path.join(versionsDir, quiltId);
  ensureDir(quiltDir);

  const profile = await fetchJson<any>(
    `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
  );
  const outJson = path.join(quiltDir, `${quiltId}.json`);
  const outJar = path.join(quiltDir, `${quiltId}.jar`);

  fs.writeFileSync(
    outJson,
    JSON.stringify(
      {
        ...profile,
        id: quiltId
      },
      null,
      2
    ),
    "utf8"
  );

  const vanillaJar = path.join(versionsDir, mcVersion, `${mcVersion}.jar`);
  if (!fs.existsSync(vanillaJar)) throw new Error(`Vanilla jar missing: ${vanillaJar}`);
  fs.copyFileSync(vanillaJar, outJar);
}

async function pickForgeVersion(mcVersion: string): Promise<string> {
  const xml = await fetchText("https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml");
  const all = parseMavenMetadataVersions(xml).filter((v) => v.startsWith(`${mcVersion}-`));
  if (!all.length) throw new Error(`No Forge versions found for Minecraft ${mcVersion}`);
  return all.sort(compareVersionDesc)[0];
}

async function pickNeoForgeVersion(mcVersion: string): Promise<string> {
  const mcCompact = mcVersion.replace(/^1\./, "");
  const xml = await fetchText("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml");
  const all = parseMavenMetadataVersions(xml);
  const preferred = all.filter((v) => v.startsWith(`${mcCompact}.`));
  const chosen = (preferred.length ? preferred : all).sort(compareVersionDesc)[0];
  if (!chosen) throw new Error(`No NeoForge versions found for Minecraft ${mcVersion}`);
  return chosen;
}

export async function pickLoaderVersion(loader: LoaderKind, mcVersion: string): Promise<string | undefined> {
  if (loader === "vanilla") return undefined;
  if (loader === "fabric") return pickFabricLoader(mcVersion, true);
  if (loader === "quilt") return pickQuiltLoader(mcVersion);
  if (loader === "forge") return pickForgeVersion(mcVersion);
  if (loader === "neoforge") return pickNeoForgeVersion(mcVersion);
  return undefined;
}

async function ensureForgeInstaller(kind: "forge" | "neoforge", version: string): Promise<string> {
  const base =
    kind === "forge"
      ? `https://maven.minecraftforge.net/net/minecraftforge/forge/${encodeURIComponent(version)}/forge-${encodeURIComponent(version)}-installer.jar`
      : `https://maven.neoforged.net/releases/net/neoforged/neoforge/${encodeURIComponent(version)}/neoforge-${encodeURIComponent(version)}-installer.jar`;

  const targetDir = path.join(getDataRoot(), "loaders", kind, version);
  ensureDir(targetDir);
  const outFile = path.join(targetDir, `${kind}-${version}-installer.jar`);
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) return outFile;
  const res = await fetch(base, { headers: { "user-agent": "FishbatteryLauncher/0.2.1" } });
  if (!res.ok) throw new Error(`Failed downloading ${kind} installer (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outFile, buf);
  return outFile;
}

export async function prepareLoaderInstall(opts: {
  instanceId: string;
  mcVersion: string;
  loader: LoaderKind;
  loaderVersion?: string;
}): Promise<{ loaderVersion?: string; installerPath?: string }> {
  const loaderVersion = opts.loaderVersion || (await pickLoaderVersion(opts.loader, opts.mcVersion));
  if (opts.loader === "vanilla") {
    await installVanillaVersion(opts.mcVersion);
    return {};
  }
  if (opts.loader === "fabric") {
    if (!loaderVersion) throw new Error("Fabric loader version missing");
    await installFabricVersion(opts.instanceId, opts.mcVersion, loaderVersion);
    return { loaderVersion };
  }
  if (opts.loader === "quilt") {
    if (!loaderVersion) throw new Error("Quilt loader version missing");
    await installQuiltVersion(opts.mcVersion, loaderVersion);
    return { loaderVersion };
  }
  if (opts.loader === "forge" || opts.loader === "neoforge") {
    if (!loaderVersion) throw new Error(`${opts.loader} version missing`);
    const installerPath = await ensureForgeInstaller(opts.loader, loaderVersion);
    return { loaderVersion, installerPath };
  }
  return {};
}

export function resolveForgeInstallerPath(loader: "forge" | "neoforge", version?: string): string | null {
  if (!version) return null;
  const p = path.join(getDataRoot(), "loaders", loader, version, `${loader}-${version}-installer.jar`);
  return fs.existsSync(p) ? p : null;
}
