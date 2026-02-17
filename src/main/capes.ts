import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import fetch from "node-fetch";
import { readJsonFile, writeJsonFile } from "./store";
import { downloadBuffer } from "./modrinth";
import { getLauncherAccountApiBase, requestLauncherAccountAuthed } from "./launcherAccount";

export type LocalCapeTier = "free" | "premium" | "founder";

export type LocalCapeItem = {
  id: string;
  name: string;
  tier: LocalCapeTier;
  fileName: string;
  fullPath: string;
  previewDataUrl: string;
  downloadUrl?: string | null;
  fileDataUrl?: string | null;
};

export type LocalCapeCatalog = {
  roots: string[];
  items: LocalCapeItem[];
};

type LauncherCapeSelectionDb = {
  byAccountId: Record<string, string | null>;
};

const CAPE_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const CAPE_CACHE_TTL_MS = 60_000;
const CAPE_CATALOG_PATH = String(process.env.FISHBATTERY_ACCOUNT_CAPES_PATH || "/v1/capes/launcher").trim();
const CAPE_CATALOG_PUBLIC_PATH = String(process.env.FISHBATTERY_ACCOUNT_CAPES_PUBLIC_PATH || "/v1/capes/launcher/public").trim();
const CAPE_SELECTED_PATH = String(
  process.env.FISHBATTERY_ACCOUNT_CAPES_SELECTED_PATH || "/v1/capes/launcher/selected"
).trim();
let catalogCache: { at: number; catalog: LocalCapeCatalog } | null = null;
let selectedCapeEndpointUnsupported = false;

function decodeDataUrl(input: string): Buffer | null {
  const raw = String(input || "").trim();
  const m = raw.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (!m) return null;
  try {
    return Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
}

function mimeFromExt(extRaw: string): string {
  const ext = String(extRaw || "").toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function encodeDataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function titleFromFileName(fileName: string) {
  const base = path.basename(fileName, path.extname(fileName));
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function sanitizeId(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_");
}

function normalizeTier(raw: unknown): LocalCapeTier {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "founder") return "founder";
  if (value === "premium") return "premium";
  return "free";
}

function inferExt(fileName: string, fallbackUrl?: string | null) {
  const fromName = path.extname(String(fileName || "")).toLowerCase();
  if (CAPE_IMAGE_EXTENSIONS.has(fromName)) return fromName;
  const candidate = String(fallbackUrl || "")
    .split("?")[0]
    .split("#")[0];
  const fromUrl = path.extname(candidate).toLowerCase();
  if (CAPE_IMAGE_EXTENSIONS.has(fromUrl)) return fromUrl;
  return ".png";
}

function getCapeCacheRoot() {
  const p = path.join(app.getPath("userData"), "capes", "cache");
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function getCachedCapePath(capeId: string, fileName: string, fallbackUrl?: string | null) {
  const ext = inferExt(fileName, fallbackUrl);
  return path.join(getCapeCacheRoot(), `${sanitizeId(capeId)}${ext}`);
}

function getSelectionRoot() {
  const root = path.join(app.getPath("userData"), "capes");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function getSelectionPath() {
  return path.join(getSelectionRoot(), "selection.json");
}

function loadSelectionDb(): LauncherCapeSelectionDb {
  return readJsonFile<LauncherCapeSelectionDb>(getSelectionPath(), { byAccountId: {} });
}

function saveSelectionDb(db: LauncherCapeSelectionDb) {
  writeJsonFile(getSelectionPath(), db);
}

function readCachedSelection(accountId: string): string | null {
  const key = String(accountId || "").trim();
  if (!key) return null;
  const db = loadSelectionDb();
  const raw = db.byAccountId?.[key];
  return raw == null ? null : String(raw);
}

function writeCachedSelection(accountId: string, capeId: string | null) {
  const key = String(accountId || "").trim();
  if (!key) return;
  const db = loadSelectionDb();
  db.byAccountId = db.byAccountId || {};
  db.byAccountId[key] = capeId ? String(capeId) : null;
  saveSelectionDb(db);
}

function toEmptyCatalog(): LocalCapeCatalog {
  return { roots: ["cloud"], items: [] };
}

function pickFirstString(...values: unknown[]) {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function resolveAbsoluteUrl(raw: string | null): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^(data:|https?:\/\/)/i.test(value)) return value;
  const base = String(getLauncherAccountApiBase() || "").trim();
  if (!base) return value;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function normalizeSelectedCapeId(raw: unknown): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  return value || null;
}

function isSelectedCapeEndpointMissingError(err: unknown): boolean {
  const message = String((err as any)?.message || err || "").toLowerCase();
  return (
    message.includes("returned 404") ||
    message.includes("cannot get") ||
    message.includes("cannot put") ||
    message.includes("not found")
  );
}

async function fetchSelectedCapeIdFromAccountApi(): Promise<string | null> {
  if (selectedCapeEndpointUnsupported) throw new Error("selected endpoint unsupported");
  const payload = (await requestLauncherAccountAuthed(CAPE_SELECTED_PATH, {
    method: "GET"
  })) as any;
  return normalizeSelectedCapeId(payload?.selectedCapeId ?? payload?.capeId ?? null);
}

async function persistSelectedCapeIdToAccountApi(capeId: string | null): Promise<string | null> {
  if (selectedCapeEndpointUnsupported) throw new Error("selected endpoint unsupported");
  const payload = (await requestLauncherAccountAuthed(CAPE_SELECTED_PATH, {
    method: "PUT",
    body: { capeId: capeId || null }
  })) as any;
  return normalizeSelectedCapeId(payload?.selectedCapeId ?? payload?.capeId ?? capeId);
}

async function fetchPublicCapeCatalogPayload(): Promise<any | null> {
  const base = String(getLauncherAccountApiBase() || "").trim();
  if (!base) return null;
  const url = (() => {
    try {
      return new URL(CAPE_CATALOG_PUBLIC_PATH, base).toString();
    } catch {
      return `${base.replace(/\/+$/, "")}${CAPE_CATALOG_PUBLIC_PATH.startsWith("/") ? "" : "/"}${CAPE_CATALOG_PUBLIC_PATH}`;
    }
  })();
  const res = await fetch(url, {
    headers: {
      "User-Agent": "FishbatteryLauncher/0.2.3",
      Accept: "application/json"
    }
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function listLocalCapes(forceRefresh = false): Promise<LocalCapeCatalog> {
  if (!forceRefresh && catalogCache && Date.now() - catalogCache.at < CAPE_CACHE_TTL_MS) {
    return catalogCache.catalog;
  }

  try {
    let payload: any | null = null;
    try {
      payload = (await requestLauncherAccountAuthed(CAPE_CATALOG_PATH, {
        method: "GET"
      })) as any;
    } catch {
      payload = await fetchPublicCapeCatalogPayload();
    }
    if (!payload) throw new Error("Cape catalog unavailable");
    const rawItems = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.capes) ? payload.capes : [];
    const items: LocalCapeItem[] = [];
    const seen = new Set<string>();

    for (const raw of rawItems) {
      const id = pickFirstString(raw?.id, raw?.capeId, raw?.slug);
      if (!id || seen.has(id)) continue;
      const name = pickFirstString(raw?.name, raw?.title, raw?.displayName, id);
      const tier = normalizeTier(raw?.tier);
      const fileName = pickFirstString(raw?.fileName, raw?.filename, `${sanitizeId(id)}.png`);
      const downloadUrl = resolveAbsoluteUrl(pickFirstString(raw?.downloadUrl, raw?.fileUrl, raw?.url) || null);
      const fileDataUrl = pickFirstString(raw?.fileDataUrl) || null;
      const previewDataInline = pickFirstString(raw?.previewDataUrl, raw?.thumbnailDataUrl);
      const previewUrlRaw = previewDataInline
        ? previewDataInline
        : pickFirstString(raw?.previewUrl, raw?.thumbnailUrl, raw?.imageUrl, downloadUrl);
      const previewUrl = resolveAbsoluteUrl(previewUrlRaw || null) || "";
      let previewDataUrl = previewUrl;
      if (previewDataInline?.startsWith("data:")) {
        previewDataUrl = previewDataInline;
      } else {
        const previewSource = previewUrl || downloadUrl || "";
        if (previewSource.startsWith("data:")) {
          previewDataUrl = previewSource;
        } else if (/^https?:\/\//i.test(previewSource)) {
          try {
            const bytes = await downloadBuffer(previewSource);
            const ext = inferExt(fileName, previewSource);
            previewDataUrl = encodeDataUrl(bytes, mimeFromExt(ext));
          } catch {
            previewDataUrl = previewSource;
          }
        }
      }
      const fullPath = getCachedCapePath(id, fileName, downloadUrl || previewDataUrl || null);
      items.push({
        id,
        name,
        tier,
        fileName,
        fullPath,
        previewDataUrl,
        downloadUrl,
        fileDataUrl
      });
      seen.add(id);
    }

    const catalog: LocalCapeCatalog = { roots: ["cloud"], items };
    catalogCache = { at: Date.now(), catalog };
    return catalog;
  } catch {
    const empty = toEmptyCatalog();
    catalogCache = { at: Date.now(), catalog: empty };
    return empty;
  }
}

export async function getSelectedLocalCapeId(accountId: string): Promise<string | null> {
  const key = String(accountId || "").trim();
  if (!key) return null;
  try {
    const selectedCapeId = await fetchSelectedCapeIdFromAccountApi();
    writeCachedSelection(key, selectedCapeId);
    return selectedCapeId;
  } catch (err) {
    if (isSelectedCapeEndpointMissingError(err)) selectedCapeEndpointUnsupported = true;
    return readCachedSelection(key);
  }
}

export async function setSelectedLocalCapeId(accountId: string, capeId: string | null) {
  const key = String(accountId || "").trim();
  if (!key) throw new Error("setSelectedLocalCapeId: accountId missing");
  const normalizedCapeId = capeId ? String(capeId) : null;
  try {
    const selectedCapeId = await persistSelectedCapeIdToAccountApi(normalizedCapeId);
    writeCachedSelection(key, selectedCapeId);
    return { accountId: key, capeId: selectedCapeId };
  } catch (err) {
    if (isSelectedCapeEndpointMissingError(err)) selectedCapeEndpointUnsupported = true;
    writeCachedSelection(key, normalizedCapeId);
    return { accountId: key, capeId: normalizedCapeId };
  }
}

async function ensureCachedCapeFile(item: LocalCapeItem): Promise<string | null> {
  try {
    if (fs.existsSync(item.fullPath) && fs.statSync(item.fullPath).size > 0) return item.fullPath;
  } catch {
    // continue
  }

  fs.mkdirSync(path.dirname(item.fullPath), { recursive: true });
  let bytes: Buffer | null = null;

  if (item.fileDataUrl) {
    bytes = decodeDataUrl(item.fileDataUrl);
  }

  if (!bytes && item.downloadUrl) {
    try {
      bytes = await downloadBuffer(item.downloadUrl);
    } catch {
      bytes = null;
    }
  }

  if (!bytes && item.previewDataUrl?.startsWith("data:")) {
    bytes = decodeDataUrl(item.previewDataUrl);
  }

  if (!bytes) return null;
  fs.writeFileSync(item.fullPath, bytes);
  return item.fullPath;
}

export async function getSelectedLocalCapeForAccount(accountId: string): Promise<LocalCapeItem | null> {
  const selectedId = await getSelectedLocalCapeId(accountId);
  if (!selectedId) return null;
  const catalog = await listLocalCapes();
  const selected = catalog.items.find((item) => item.id === selectedId) ?? null;
  if (!selected) return null;
  const cachedPath = await ensureCachedCapeFile(selected);
  if (!cachedPath) {
    // Keep cloud-backed selection even when local cache file could not be materialized.
    return selected;
  }
  return {
    ...selected,
    fullPath: cachedPath
  };
}
