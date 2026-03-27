import { invoke } from "@tauri-apps/api/core";
import { requestLauncherAccountAuthed } from "./launcherAccount";

type CloudWorldSyncSummary = {
  currentPlan: "free" | "premium";
  subscriptionTier: "free" | "premium" | "founder";
  planLabel: "Free" | "Premium";
  syncedWorldCountUsed: number;
  syncedWorldCountLimit: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  perWorldSizeLimitBytes: number;
  uploadsBlocked: boolean;
  uploadsBlockedReason: string | null;
  upsellCopy: string;
};

export type CloudSyncedWorldItem = {
  id: string;
  instanceId: string;
  worldId: string;
  worldName: string;
  objectKey: string;
  compressedSizeBytes: number;
  etag: string | null;
  createdAt: number;
  updatedAt: number;
  lastSyncedAt: number;
};

export type CloudWorldSyncState = {
  configured: boolean;
  summary: CloudWorldSyncSummary;
  items: CloudSyncedWorldItem[];
};

const PATH_SYNC_WORLDS = "/v1/sync/worlds";

function normalizeSummary(raw: any): CloudWorldSyncSummary {
  return {
    currentPlan: raw?.currentPlan === "premium" ? "premium" : "free",
    subscriptionTier:
      raw?.subscriptionTier === "premium" || raw?.subscriptionTier === "founder" ? raw.subscriptionTier : "free",
    planLabel: raw?.planLabel === "Premium" ? "Premium" : "Free",
    syncedWorldCountUsed: Number(raw?.syncedWorldCountUsed || 0),
    syncedWorldCountLimit: Number(raw?.syncedWorldCountLimit || 0),
    storageUsedBytes: Number(raw?.storageUsedBytes || 0),
    storageLimitBytes: Number(raw?.storageLimitBytes || 0),
    perWorldSizeLimitBytes: Number(raw?.perWorldSizeLimitBytes || 0),
    uploadsBlocked: !!raw?.uploadsBlocked,
    uploadsBlockedReason: raw?.uploadsBlockedReason ? String(raw.uploadsBlockedReason) : null,
    upsellCopy: raw?.upsellCopy ? String(raw.upsellCopy) : ""
  };
}

function normalizeItem(raw: any): CloudSyncedWorldItem {
  return {
    id: String(raw?.id || ""),
    instanceId: String(raw?.instanceId || ""),
    worldId: String(raw?.worldId || ""),
    worldName: String(raw?.worldName || raw?.worldId || "World"),
    objectKey: String(raw?.objectKey || ""),
    compressedSizeBytes: Number(raw?.compressedSizeBytes || 0),
    etag: raw?.etag ? String(raw.etag) : null,
    createdAt: Number(raw?.createdAt || 0),
    updatedAt: Number(raw?.updatedAt || 0),
    lastSyncedAt: Number(raw?.lastSyncedAt || 0)
  };
}

export async function cloudWorldSyncGetState(): Promise<CloudWorldSyncState> {
  const payload = (await requestLauncherAccountAuthed(PATH_SYNC_WORLDS, { method: "GET" })) as any;
  return {
    configured: payload?.configured !== false,
    summary: normalizeSummary(payload?.summary || {}),
    items: Array.isArray(payload?.items) ? payload.items.map(normalizeItem) : []
  };
}

export async function cloudWorldSyncUploadWorld(input: {
  instanceId: string;
  worldId: string;
  worldName?: string;
}): Promise<{ message: string; item: CloudSyncedWorldItem | null; summary: CloudWorldSyncSummary }> {
  const prepared = (await invoke("instance_world_sync_prepare_archive", {
    instanceId: input.instanceId,
    worldId: input.worldId
  })) as {
    archivePath: string;
    compressedSizeBytes: number;
    worldName: string;
    worldId: string;
  };

  let archivePath = String(prepared?.archivePath || "").trim();
  try {
    const uploadSession = (await requestLauncherAccountAuthed(`${PATH_SYNC_WORLDS}/upload-session`, {
      method: "POST",
      body: {
        instanceId: input.instanceId,
        worldId: input.worldId,
        worldName: input.worldName || prepared?.worldName || input.worldId,
        compressedSizeBytes: Number(prepared?.compressedSizeBytes || 0)
      }
    })) as any;

    await invoke("world_sync_upload_archive", {
      filePath: archivePath,
      uploadUrl: String(uploadSession?.uploadUrl || ""),
      contentType: String(uploadSession?.contentType || "application/zip")
    });
    archivePath = "";

    const completed = (await requestLauncherAccountAuthed(`${PATH_SYNC_WORLDS}/complete`, {
      method: "POST",
      body: {
        instanceId: input.instanceId,
        worldId: input.worldId,
        worldName: input.worldName || prepared?.worldName || input.worldId,
        objectKey: String(uploadSession?.objectKey || "")
      }
    })) as any;

    return {
      message: String(completed?.message || "World sync complete."),
      item: completed?.item ? normalizeItem(completed.item) : null,
      summary: normalizeSummary(completed?.summary || {})
    };
  } finally {
    if (archivePath) {
      try {
        await invoke("world_sync_remove_temp_file", { filePath: archivePath });
      } catch {}
    }
  }
}

export async function cloudWorldSyncRemoveWorld(syncWorldId: string): Promise<{
  message: string;
  summary: CloudWorldSyncSummary;
}> {
  const payload = (await requestLauncherAccountAuthed(`${PATH_SYNC_WORLDS}/${encodeURIComponent(syncWorldId)}`, {
    method: "DELETE"
  })) as any;
  return {
    message: String(payload?.message || "Sync removed. Cloud storage has been freed for another world."),
    summary: normalizeSummary(payload?.summary || {})
  };
}

export async function cloudWorldSyncDownloadWorld(input: {
  syncWorldId: string;
  instanceId: string;
  worldId: string;
  overwriteExisting?: boolean;
}): Promise<{ downloadedBytes: number }> {
  const payload = (await requestLauncherAccountAuthed(
    `${PATH_SYNC_WORLDS}/${encodeURIComponent(input.syncWorldId)}/download`,
    { method: "GET" }
  )) as any;
  const result = (await invoke("world_sync_download_and_extract", {
    instanceId: input.instanceId,
    worldId: input.worldId,
    downloadUrl: String(payload?.downloadUrl || ""),
    overwriteExisting: !!input.overwriteExisting
  })) as any;
  return {
    downloadedBytes: Number(result?.downloadedBytes || 0)
  };
}
