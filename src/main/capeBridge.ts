import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";
import { InstanceConfig, getInstanceDir } from "./instances";
import { downloadBuffer } from "./modrinth";
import { getDataRoot } from "./paths";

type LoaderWithBridge = "fabric" | "quilt" | "forge" | "neoforge";
type GitHubBridgeLoader = "fabric" | "quilt";

const BRIDGE_PREFIX = "fishbattery-cape-bridge-";
const BRIDGE_REPO_OWNER = process.env.CAPE_BRIDGE_REPO_OWNER || "fishbatteryapp";
const BRIDGE_REPO_NAME = process.env.CAPE_BRIDGE_REPO_NAME || "fishbattery-cape-bridge";
const BRIDGE_GITHUB_API = `https://api.github.com/repos/${BRIDGE_REPO_OWNER}/${BRIDGE_REPO_NAME}`;
const BRIDGE_UA = "FishbatteryLauncher cape-bridge resolver";

function isLoaderWithBridge(loader: InstanceConfig["loader"]): loader is LoaderWithBridge {
  return loader === "fabric" || loader === "quilt" || loader === "forge" || loader === "neoforge";
}

function isGitHubBridgeLoader(loader: LoaderWithBridge): loader is GitHubBridgeLoader {
  return loader === "fabric" || loader === "quilt";
}

function expectedBundledJarName(loader: LoaderWithBridge) {
  return `${BRIDGE_PREFIX}${loader}.jar`;
}

function resolveBridgeJarPath(loader: LoaderWithBridge): string | null {
  const file = expectedBundledJarName(loader);
  const candidates = [
    // Dev/source tree path
    path.join(process.cwd(), "launcher-cape-bridges", loader, file),
    // Packaged app resource path
    path.join(process.resourcesPath, "launcher-cape-bridges", loader, file)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) return candidate;
  }
  return null;
}

function cleanBridgeJars(modsDir: string) {
  if (!fs.existsSync(modsDir)) return;
  for (const entry of fs.readdirSync(modsDir)) {
    if (!entry.startsWith(BRIDGE_PREFIX) || !entry.endsWith(".jar")) continue;
    try {
      fs.rmSync(path.join(modsDir, entry), { force: true });
    } catch {
      // best effort cleanup
    }
  }
}

type GithubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GithubRelease = {
  tag_name: string;
  draft: boolean;
  assets: GithubReleaseAsset[];
};

async function fetchGithubJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": BRIDGE_UA,
      Accept: "application/vnd.github+json"
    }
  });
  if (!res.ok) throw new Error(`GitHub release request failed (${res.status})`);
  return (await res.json()) as T;
}

function getTagModVersion(tag: string, mcVersion: string, loader: GitHubBridgeLoader): string | null {
  const prefix = `v${mcVersion}-`;
  const suffix = `-${loader}`;
  if (!tag.startsWith(prefix) || !tag.endsWith(suffix)) return null;
  const middle = tag.slice(prefix.length, tag.length - suffix.length).trim();
  return middle || null;
}

function chooseBridgeAsset(
  release: GithubRelease,
  mcVersion: string,
  loader: GitHubBridgeLoader
): GithubReleaseAsset | null {
  const suffix = `-${mcVersion}-${loader}.jar`;
  const preferred =
    release.assets.find(
      (a) => a?.name?.startsWith(BRIDGE_PREFIX) && a.name.toLowerCase().endsWith(suffix.toLowerCase())
    ) ?? null;
  if (preferred) return preferred;
  return release.assets.find((a) => a?.name?.toLowerCase().endsWith(".jar")) ?? null;
}

async function resolveGithubBridgeRelease(
  mcVersion: string,
  loader: GitHubBridgeLoader,
  onLog?: (line: string) => void
): Promise<{ releaseTag: string; modVersion: string; asset: GithubReleaseAsset } | null> {
  const releases = await fetchGithubJson<GithubRelease[]>(`${BRIDGE_GITHUB_API}/releases?per_page=100`);
  for (const release of releases || []) {
    if (!release || release.draft) continue;
    const modVersion = getTagModVersion(String(release.tag_name || ""), mcVersion, loader);
    if (!modVersion) continue;
    const asset = chooseBridgeAsset(release, mcVersion, loader);
    if (!asset) continue;
    onLog?.(`[capes] Resolved bridge release ${release.tag_name} (${loader}, mc ${mcVersion}).`);
    return { releaseTag: release.tag_name, modVersion, asset };
  }
  return null;
}

function sanitizePathPart(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function getBridgeCachePath(tag: string, assetName: string) {
  const cacheDir = path.join(getDataRoot(), "bridge-cache", sanitizePathPart(tag));
  return {
    cacheDir,
    cacheFile: path.join(cacheDir, sanitizePathPart(assetName))
  };
}

async function resolveGithubBridgeJarPath(
  instance: InstanceConfig,
  onLog?: (line: string) => void
): Promise<string | null> {
  if (!isLoaderWithBridge(instance.loader) || !isGitHubBridgeLoader(instance.loader)) return null;
  const resolved = await resolveGithubBridgeRelease(instance.mcVersion, instance.loader, onLog);
  if (!resolved) {
    onLog?.(`[capes] No GitHub bridge release found for mc=${instance.mcVersion} loader=${instance.loader}.`);
    return null;
  }

  const { cacheDir, cacheFile } = getBridgeCachePath(resolved.releaseTag, resolved.asset.name);
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 0) {
    onLog?.(`[capes] Using cached bridge jar: ${path.basename(cacheFile)}`);
    return cacheFile;
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const bytes = await downloadBuffer(resolved.asset.browser_download_url);
  fs.writeFileSync(cacheFile, bytes);
  onLog?.(`[capes] Downloaded bridge jar from ${resolved.releaseTag}: ${path.basename(cacheFile)}`);
  return cacheFile;
}

export function syncCapeBridgeMod(instance: InstanceConfig, onLog?: (line: string) => void) {
  const modsDir = path.join(getInstanceDir(instance.id), "mods");
  fs.mkdirSync(modsDir, { recursive: true });
  cleanBridgeJars(modsDir);

  if (!isLoaderWithBridge(instance.loader)) {
    onLog?.("[capes] Vanilla instance: skipping launcher cape bridge mod");
    return;
  }

  const source = resolveBridgeJarPath(instance.loader);
  if (!source) {
    onLog?.(
      `[capes] Cape bridge jar missing for ${instance.loader}. Expected ${expectedBundledJarName(instance.loader)} under launcher-cape-bridges/${instance.loader}/`
    );
    return;
  }

  const target = path.join(modsDir, expectedBundledJarName(instance.loader));
  fs.copyFileSync(source, target);
  onLog?.(`[capes] Injected launcher cape bridge mod: ${path.basename(target)}`);
}

export async function syncCapeBridgeModWithGithub(instance: InstanceConfig, onLog?: (line: string) => void) {
  const modsDir = path.join(getInstanceDir(instance.id), "mods");
  fs.mkdirSync(modsDir, { recursive: true });
  cleanBridgeJars(modsDir);

  if (!isLoaderWithBridge(instance.loader)) {
    onLog?.("[capes] Vanilla instance: skipping launcher cape bridge mod");
    return;
  }

  let source: string | null = null;
  try {
    source = await resolveGithubBridgeJarPath(instance, onLog);
  } catch (err: any) {
    onLog?.(`[capes] GitHub bridge resolve failed: ${String(err?.message ?? err)}`);
  }

  if (!source) source = resolveBridgeJarPath(instance.loader);
  if (!source) {
    onLog?.(
      `[capes] Cape bridge jar missing for ${instance.loader}. No GitHub release and no bundled fallback ${expectedBundledJarName(instance.loader)}`
    );
    return;
  }

  const target = path.join(modsDir, path.basename(source));
  fs.copyFileSync(source, target);
  onLog?.(`[capes] Injected launcher cape bridge mod: ${path.basename(target)}`);
}
