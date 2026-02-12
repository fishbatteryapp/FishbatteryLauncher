import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import fetch from "node-fetch";
import { createInstance, getInstanceDir, listInstances, type InstanceConfig } from "./instances";
import { installVanillaVersion } from "./vanillaInstall";
import { pickLoaderVersion, prepareLoaderInstall, type LoaderKind } from "./loaderSupport";

export type ProviderHint = "curseforge" | "technic" | "atlauncher" | "ftb" | "auto";

type ImportPackOptions = {
  providerHint: ProviderHint;
  zipPath: string;
  defaults?: {
    name?: string;
    mcVersion?: string;
    accountId?: string | null;
    memoryMb?: number;
  };
};

type ImportPackResult = {
  instance: InstanceConfig;
  detectedFormat: "modrinth" | "curseforge" | "generic";
  notes: string[];
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function sanitizeName(name: string) {
  return String(name || "Imported Pack").replace(/[<>:\"/\\|?*\x00-\x1F]/g, "_").trim() || "Imported Pack";
}

function uniqueName(base: string) {
  const existing = new Set((listInstances().instances || []).map((x) => String(x.name || "").toLowerCase()));
  if (!existing.has(base.toLowerCase())) return base;
  let i = 2;
  while (existing.has(`${base} (${i})`.toLowerCase())) i++;
  return `${base} (${i})`;
}

function safeRelative(rel: string) {
  if (!rel) return false;
  if (path.isAbsolute(rel)) return false;
  const norm = path.normalize(rel);
  return !norm.startsWith("..") && !norm.includes(`..${path.sep}`);
}

function readEntryText(zip: AdmZip, name: string): string | null {
  const e = zip.getEntry(name);
  if (!e) return null;
  return zip.readAsText(e);
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url, { headers: { "User-Agent": "FishbatteryLauncher/0.2.1" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function createBaseInstance(name: string, mcVersion: string, loader: LoaderKind, opts: ImportPackOptions, notes: string[]) {
  const id = crypto.randomUUID();
  let fabricLoaderVersion: string | undefined = undefined;
  let quiltLoaderVersion: string | undefined = undefined;
  let forgeVersion: string | undefined = undefined;
  let neoforgeVersion: string | undefined = undefined;
  const loaderVersion = loader === "vanilla" ? undefined : await pickLoaderVersion(loader, mcVersion);
  if (loader === "fabric") fabricLoaderVersion = loaderVersion;
  if (loader === "quilt") quiltLoaderVersion = loaderVersion;
  if (loader === "forge") forgeVersion = loaderVersion;
  if (loader === "neoforge") neoforgeVersion = loaderVersion;

  const created = createInstance({
    id,
    name: uniqueName(sanitizeName(name)),
    accountId: opts.defaults?.accountId ?? null,
    mcVersion,
    loader,
    fabricLoaderVersion,
    quiltLoaderVersion,
    forgeVersion,
    neoforgeVersion,
    memoryMb: Number(opts.defaults?.memoryMb || 6144),
    instancePreset: "none",
    jvmArgsOverride: null,
    optimizerBackup: null
  });

  if (created.loader === "vanilla") {
    await installVanillaVersion(created.mcVersion);
    notes.push("Prepared Vanilla base install");
  } else {
    await prepareLoaderInstall({
      instanceId: created.id,
      mcVersion: created.mcVersion,
      loader: created.loader,
      loaderVersion
    });
    notes.push(`Prepared ${created.loader} ${loaderVersion ?? "latest"} for ${created.mcVersion}`);
  }

  return created;
}

async function importModrinthArchive(zip: AdmZip, opts: ImportPackOptions): Promise<ImportPackResult> {
  const rawIndex = readEntryText(zip, "modrinth.index.json");
  if (!rawIndex) throw new Error("Missing modrinth.index.json");

  let idx: any;
  try {
    idx = JSON.parse(rawIndex);
  } catch {
    throw new Error("Invalid modrinth.index.json");
  }

  const mcVersion = String(idx?.dependencies?.minecraft || opts.defaults?.mcVersion || "latest");
  const deps = idx?.dependencies ?? {};
  const hasFabric = !!deps["fabric-loader"];
  const hasQuilt = !!deps["quilt-loader"];
  const hasNeoForge = !!deps["neoforge"] || !!deps["neoforge-loader"];
  const hasForge = !!deps["forge-loader"] || !!deps["forge"];
  const loader: LoaderKind = hasFabric ? "fabric" : hasQuilt ? "quilt" : hasNeoForge ? "neoforge" : hasForge ? "forge" : "vanilla";
  const name = opts.defaults?.name || "Modrinth Pack";
  const notes: string[] = [];

  const inst = await createBaseInstance(name, mcVersion, loader, opts, notes);
  const instDir = getInstanceDir(inst.id);

  for (const f of idx?.files || []) {
    const rel = String(f?.path || "");
    if (!safeRelative(rel)) continue;
    const dl = Array.isArray(f?.downloads) ? String(f.downloads[0] || "") : "";
    if (!dl) continue;
    const buf = await downloadBuffer(dl);
    const out = path.join(instDir, rel);
    ensureDir(path.dirname(out));
    fs.writeFileSync(out, buf);
  }

  for (const ent of zip.getEntries()) {
    if (ent.isDirectory) continue;
    const entryName = ent.entryName.replace(/\\/g, "/");
    const prefix = entryName.startsWith("overrides/")
      ? "overrides/"
      : entryName.startsWith("client-overrides/")
        ? "client-overrides/"
        : "";
    if (!prefix) continue;
    const rel = entryName.slice(prefix.length);
    if (!safeRelative(rel)) continue;
    const out = path.join(instDir, rel);
    ensureDir(path.dirname(out));
    fs.writeFileSync(out, ent.getData());
  }

  notes.push("Applied Modrinth overrides");
  return { instance: inst, detectedFormat: "modrinth", notes };
}

async function importCurseforgeArchive(zip: AdmZip, opts: ImportPackOptions): Promise<ImportPackResult> {
  const rawManifest = readEntryText(zip, "manifest.json");
  if (!rawManifest) throw new Error("Missing CurseForge manifest.json");

  let manifest: any;
  try {
    manifest = JSON.parse(rawManifest);
  } catch {
    throw new Error("Invalid CurseForge manifest.json");
  }

  const mcVersion = String(manifest?.minecraft?.version || opts.defaults?.mcVersion || "latest");
  const loaderIds = (manifest?.minecraft?.modLoaders || []).map((x: any) => String(x?.id || ""));
  const hasFabric = loaderIds.some((x: string) => x.startsWith("fabric-"));
  const hasQuilt = loaderIds.some((x: string) => x.startsWith("quilt-"));
  const hasNeoForge = loaderIds.some((x: string) => x.startsWith("neoforge-"));
  const hasForge = loaderIds.some((x: string) => x.startsWith("forge-"));
  const loader: LoaderKind = hasFabric ? "fabric" : hasQuilt ? "quilt" : hasNeoForge ? "neoforge" : hasForge ? "forge" : "vanilla";
  const notes: string[] = [];
  const name = opts.defaults?.name || String(manifest?.name || "CurseForge Pack");

  const inst = await createBaseInstance(name, mcVersion, loader, opts, notes);
  const instDir = getInstanceDir(inst.id);

  const overridesDir = String(manifest?.overrides || "overrides");
  for (const ent of zip.getEntries()) {
    if (ent.isDirectory) continue;
    const entryName = ent.entryName.replace(/\\/g, "/");
    if (!entryName.startsWith(`${overridesDir}/`)) continue;
    const rel = entryName.slice(overridesDir.length + 1);
    if (!safeRelative(rel)) continue;
    const out = path.join(instDir, rel);
    ensureDir(path.dirname(out));
    fs.writeFileSync(out, ent.getData());
  }

  const unresolvedFiles = Array.isArray(manifest?.files) ? manifest.files.length : 0;
  if (unresolvedFiles > 0) {
    const report = {
      type: "curseforge-import",
      unresolvedProjectFiles: unresolvedFiles,
      reason: "CurseForge mod file URLs are not bundled in the manifest and require provider API resolution"
    };
    fs.writeFileSync(path.join(instDir, "pack-import-report.json"), JSON.stringify(report, null, 2), "utf8");
    notes.push(`CurseForge manifest contains ${unresolvedFiles} mod references not auto-downloadable without provider API keys`);
  }

  return { instance: inst, detectedFormat: "curseforge", notes };
}

async function importGenericArchive(zip: AdmZip, opts: ImportPackOptions): Promise<ImportPackResult> {
  const name = opts.defaults?.name || `${opts.providerHint.toUpperCase()} Pack`;
  const mcVersion = opts.defaults?.mcVersion || "latest";
  const notes: string[] = [];
  const inst = await createBaseInstance(name, mcVersion, "vanilla", opts, notes);
  const instDir = getInstanceDir(inst.id);

  for (const ent of zip.getEntries()) {
    if (ent.isDirectory) continue;
    const entryName = ent.entryName.replace(/\\/g, "/");
    if (!safeRelative(entryName)) continue;

    if (!(entryName.startsWith("mods/") || entryName.startsWith("config/") || entryName.startsWith("resourcepacks/") || entryName.startsWith("shaderpacks/"))) {
      continue;
    }

    const out = path.join(instDir, entryName);
    ensureDir(path.dirname(out));
    fs.writeFileSync(out, ent.getData());
  }

  notes.push("Applied generic archive extraction for mods/config/resourcepacks/shaderpacks");
  return { instance: inst, detectedFormat: "generic", notes };
}

export async function importPackArchive(opts: ImportPackOptions): Promise<ImportPackResult> {
  if (!fs.existsSync(opts.zipPath)) throw new Error("Pack archive not found");
  const zip = new AdmZip(opts.zipPath);

  if (zip.getEntry("modrinth.index.json")) return importModrinthArchive(zip, opts);

  const manifestText = readEntryText(zip, "manifest.json");
  if (manifestText) {
    try {
      const parsed = JSON.parse(manifestText);
      if (String(parsed?.manifestType || "").toLowerCase().includes("minecraftmodpack")) {
        return importCurseforgeArchive(zip, opts);
      }
    } catch {
      // ignore
    }
  }

  return importGenericArchive(zip, opts);
}
