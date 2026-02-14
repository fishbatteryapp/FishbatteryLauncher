import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { getInstanceDir } from "./instances";
import { getModCacheDir } from "./paths";
import { downloadBuffer, resolveLatestModrinth, searchModrinthProjects } from "./modrinth";
import { validateInstanceMods } from "./modValidation";

type LoaderKind = "fabric";

type AutoDependencyResult = {
  installed: string[];
  skipped: string[];
  failed: string[];
};

const KNOWN_DEP_PROJECT_IDS: Record<string, string> = {
  "clothconfig": "9s6osm5g",
  "cloth-config": "9s6osm5g",
  "fabricapi": "P7dR8mSH",
  "fabric-api": "P7dR8mSH",
  "modmenu": "mOgUt4GM",
  "architectury": "lhGA9TYQ",
  "architecturyapi": "lhGA9TYQ",
  "autoconfig": "9s6osm5g",
  "autoconfig1u": "9s6osm5g",
  "autoconfigupdatedapi": "9s6osm5g"
};

const MOD_DEPENDENCY_HINTS: Record<string, string[]> = {
  // Upstream mod currently references Cloth AutoConfig classes without declaring dependency metadata.
  "pvpessentialsrefined": ["cloth-config2"],
  // Optional in upstream metadata but commonly expected by users.
  "dynamicfps": ["cloth-config2"]
};

function normalize(id: string) {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[-_]/g, "");
}

function sha1Of(buf: Buffer) {
  const h = crypto.createHash("sha1");
  h.update(buf);
  return h.digest("hex");
}

function readFabricModIdFromJar(filePath: string): string | null {
  try {
    const zip = new AdmZip(filePath);
    const e = zip.getEntry("fabric.mod.json");
    if (!e) return null;
    const parsed = JSON.parse(zip.readAsText(e)) as any;
    return typeof parsed?.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
}

function collectInstalledModIds(modsDir: string): Set<string> {
  const out = new Set<string>();
  if (!fs.existsSync(modsDir)) return out;
  for (const f of fs.readdirSync(modsDir)) {
    if (!f.endsWith(".jar")) continue;
    const id = readFabricModIdFromJar(path.join(modsDir, f));
    if (id) out.add(normalize(id));
  }
  return out;
}

function missingDepIdsFromValidation(instanceId: string): string[] {
  const result = validateInstanceMods(instanceId);
  const out = new Set<string>();
  for (const issue of result.issues) {
    if (issue.code !== "missing-dependency") continue;
    const depId = issue.modIds?.[1];
    if (!depId) continue;
    out.add(depId);
  }
  return [...out];
}

async function resolveProjectIdForDependency(depId: string): Promise<string | null> {
  const key = normalize(depId);
  if (KNOWN_DEP_PROJECT_IDS[key]) return KNOWN_DEP_PROJECT_IDS[key];

  try {
    const hits = await searchModrinthProjects(depId, "fabric", 8);
    if (!hits.length) return null;
    const strict = hits.find(
      (h) => normalize(h.slug) === key || normalize(h.title) === key || normalize(h.title).includes(key)
    );
    return (strict ?? hits[0]).project_id || null;
  } catch {
    return null;
  }
}

export async function autoInstallMissingDependenciesForInstance(opts: {
  instanceId: string;
  mcVersion: string;
  loader: LoaderKind;
  onLog?: (line: string) => void;
}): Promise<AutoDependencyResult> {
  const { instanceId, mcVersion, loader, onLog } = opts;
  if (loader !== "fabric") return { installed: [], skipped: [], failed: [] };

  const modsDir = path.join(getInstanceDir(instanceId), "mods");
  fs.mkdirSync(modsDir, { recursive: true });
  const cacheDir = getModCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });

  const installed = collectInstalledModIds(modsDir);
  const initialMissing = missingDepIdsFromValidation(instanceId);
  for (const [modId, deps] of Object.entries(MOD_DEPENDENCY_HINTS)) {
    if (!installed.has(normalize(modId))) continue;
    for (const dep of deps) {
      if (!installed.has(normalize(dep))) initialMissing.push(dep);
    }
  }
  if (!initialMissing.length) return { installed: [], skipped: [], failed: [] };

  const result: AutoDependencyResult = { installed: [], skipped: [], failed: [] };
  const queue = [...initialMissing];
  const seenNorm = new Set<string>();

  while (queue.length) {
    const depId = String(queue.shift() || "").trim();
    if (!depId) continue;
    const depNorm = normalize(depId);
    if (seenNorm.has(depNorm)) continue;
    seenNorm.add(depNorm);

    if (installed.has(depNorm)) {
      result.skipped.push(depId);
      continue;
    }

    const projectId = await resolveProjectIdForDependency(depId);
    if (!projectId) {
      result.failed.push(`${depId} (project not found)`);
      continue;
    }

    const resolved = await resolveLatestModrinth({ projectId, mcVersion, loader: "fabric" }).catch(() => null);
    if (!resolved) {
      result.failed.push(`${depId} (no compatible version for ${mcVersion})`);
      continue;
    }

    try {
      const cacheName = resolved.sha1
        ? `dep-auto-${projectId}-${resolved.sha1}.jar`
        : `dep-auto-${projectId}-${resolved.fileName}`;
      const cachedPath = path.join(cacheDir, cacheName);
      if (!fs.existsSync(cachedPath)) {
        const buf = await downloadBuffer(resolved.url);
        if (resolved.sha1) {
          const got = sha1Of(buf);
          if (got !== resolved.sha1) throw new Error(`SHA1 mismatch for ${depId}`);
        }
        fs.writeFileSync(cachedPath, buf);
      }

      const resolvedModId = readFabricModIdFromJar(cachedPath) || depId;
      const resolvedNorm = normalize(resolvedModId);
      if (installed.has(resolvedNorm)) {
        result.skipped.push(depId);
        continue;
      }

      const safeFile = resolved.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const target = path.join(modsDir, `depauto__${resolvedNorm}__${safeFile}`);
      fs.copyFileSync(cachedPath, target);
      installed.add(resolvedNorm);
      result.installed.push(`${resolvedModId} (${resolved.versionName})`);
      onLog?.(`[deps] Installed dependency: ${resolvedModId} (${resolved.versionName})`);

      for (const nextProjectId of resolved.requiredProjectIds || []) {
        const nextResolved = await resolveLatestModrinth({ projectId: nextProjectId, mcVersion, loader: "fabric" }).catch(
          () => null
        );
        if (!nextResolved) continue;
        const synthetic = nextResolved.fileName.replace(/\.jar$/i, "");
        if (!seenNorm.has(normalize(synthetic))) queue.push(synthetic);
      }
    } catch (e: any) {
      result.failed.push(`${depId} (${String(e?.message ?? e)})`);
    }
  }

  return result;
}
