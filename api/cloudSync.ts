import { invoke } from "@tauri-apps/api/core";
import { requestLauncherAccountAuthed } from "./launcherAccount";

type SyncConflictPolicy = "ask" | "newer-wins" | "prefer-local" | "prefer-cloud";

type CloudSyncSnapshot = {
  settings: Record<string, unknown>;
  activeInstanceId: string | null;
  instances: unknown[];
  modsStateByInstance: Record<string, unknown>;
  packsStateByInstance: Record<string, unknown>;
  rawUpdatedAt?: number;
  settingsUpdatedAt: number;
  instancesUpdatedAt: number;
  capturedAt: number;
};

type CloudSyncRemote = {
  revision: number;
  updatedAt: number;
  payload: CloudSyncSnapshot;
};

type CloudSyncState = {
  lastSyncedAt: number | null;
  lastStatus: "idle" | "up-to-date" | "pushed" | "pulled" | "conflict" | "error";
  lastError: string | null;
  lastRemoteRevision: number | null;
  lastSnapshotHash: string | null;
};

type SyncNowInput = {
  settings: Record<string, unknown>;
  policy?: SyncConflictPolicy;
  resolveConflict?: boolean;
};

export type SyncNowResult = {
  ok: boolean;
  status: "up-to-date" | "pushed" | "pulled" | "conflict" | "error" | "skipped";
  message: string;
  lastSyncedAt: number | null;
  lastRemoteRevision: number | null;
  settingsPatch?: Record<string, unknown> | null;
  conflict?: {
    localSettingsUpdatedAt: number;
    localInstancesUpdatedAt: number;
    remoteSettingsUpdatedAt: number;
    remoteInstancesUpdatedAt: number;
  };
};

const STATE_KEY = "fishbattery.cloudSyncState";
const DEFAULT_STATE: CloudSyncState = {
  lastSyncedAt: null,
  lastStatus: "idle",
  lastError: null,
  lastRemoteRevision: null,
  lastSnapshotHash: null
};

function readRuntimeOverride(name: string): string {
  const g = globalThis as Record<string, unknown>;
  const direct = g[name];
  if (typeof direct === "string") return direct;
  const envBlob = g.__FISHBATTERY_ENV__;
  if (envBlob && typeof envBlob === "object") {
    const candidate = (envBlob as Record<string, unknown>)[name];
    if (typeof candidate === "string") return candidate;
  }
  return "";
}

function readEnv(name: string): string {
  const runtime = readRuntimeOverride(name).trim();
  if (runtime) return runtime;
  const vite = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env || {};
  const prefixed = String(vite[`VITE_${name}`] ?? "").trim();
  if (prefixed) return prefixed;
  return String(vite[name] ?? "").trim();
}

const PATH_SYNC_STATE = (() => {
  const raw = readEnv("FISHBATTERY_ACCOUNT_SYNC_STATE_PATH") || "/v1/sync/state";
  return raw.startsWith("/") ? raw : `/${raw}`;
})();

function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readLocalSyncState(): CloudSyncState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const state = JSON.parse(raw) as Partial<CloudSyncState>;
    return {
      lastSyncedAt: Number.isFinite(Number(state.lastSyncedAt)) ? Number(state.lastSyncedAt) : null,
      lastStatus:
        state.lastStatus === "up-to-date" ||
        state.lastStatus === "pushed" ||
        state.lastStatus === "pulled" ||
        state.lastStatus === "conflict" ||
        state.lastStatus === "error"
          ? state.lastStatus
          : "idle",
      lastError: state.lastError ? String(state.lastError) : null,
      lastRemoteRevision: Number.isFinite(Number(state.lastRemoteRevision)) ? Number(state.lastRemoteRevision) : null,
      lastSnapshotHash: state.lastSnapshotHash ? String(state.lastSnapshotHash) : null
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeLocalSyncState(state: CloudSyncState): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function sanitizeSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = [
    "theme",
    "blur",
    "accentColor",
    "surfaceAlpha",
    "cornerRadius",
    "borderThickness",
    "pixelFont",
    "updateChannel",
    "showSnapshots",
    "autoUpdateMods",
    "defaultMemoryMb",
    "jvmArgs",
    "settingsUpdatedAt",
    "cloudSyncEnabled",
    "cloudSyncAuto",
    "cloudSyncConflictPolicy"
  ];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(settings || {}, key)) out[key] = settings[key];
  }
  return out;
}

function collectLocalSnapshot(settings: Record<string, unknown>): CloudSyncSnapshot {
  const settingsPatch = sanitizeSettings(settings || {});
  const settingsUpdatedAt = numberOr(settingsPatch.settingsUpdatedAt, Date.now());
  return {
    settings: settingsPatch,
    activeInstanceId: null,
    instances: [],
    modsStateByInstance: {},
    packsStateByInstance: {},
    settingsUpdatedAt,
    instancesUpdatedAt: 0,
    capturedAt: Date.now()
  };
}

async function collectFullLocalSnapshot(settings: Record<string, unknown>): Promise<CloudSyncSnapshot> {
  const settingsPatch = sanitizeSettings(settings || {});
  const settingsUpdatedAt = numberOr(settingsPatch.settingsUpdatedAt, Date.now());
  let instancesPayload: any = null;
  try {
    instancesPayload = await invoke("instances_sync_export");
  } catch {
    instancesPayload = null;
  }

  const instances = Array.isArray(instancesPayload?.instances) ? instancesPayload.instances : [];
  const activeInstanceId =
    instancesPayload?.activeInstanceId == null ? null : String(instancesPayload.activeInstanceId);
  const modsStateByInstance =
    instancesPayload?.modsStateByInstance && typeof instancesPayload.modsStateByInstance === "object"
      ? (instancesPayload.modsStateByInstance as Record<string, unknown>)
      : {};
  const packsStateByInstance =
    instancesPayload?.packsStateByInstance && typeof instancesPayload.packsStateByInstance === "object"
      ? (instancesPayload.packsStateByInstance as Record<string, unknown>)
      : {};
  const rawUpdatedAt = numberOr(instancesPayload?.updatedAt, 0);

  const inferredInstancesUpdatedAt = Math.max(
    rawUpdatedAt,
    ...instances.map((item: any) =>
      Math.max(
        numberOr(item?.updatedAt, 0),
        numberOr(item?.createdAt, 0),
        numberOr(item?.lastPlayedAt, 0)
      )
    )
  );

  return {
    settings: settingsPatch,
    activeInstanceId,
    instances,
    modsStateByInstance,
    packsStateByInstance,
    rawUpdatedAt,
    settingsUpdatedAt,
    instancesUpdatedAt: inferredInstancesUpdatedAt,
    capturedAt: Date.now()
  };
}

function hashSnapshot(snapshot: CloudSyncSnapshot): string {
  const str = JSON.stringify(snapshot);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

async function fetchRemoteSyncState(): Promise<CloudSyncRemote> {
  const payload = (await requestLauncherAccountAuthed(PATH_SYNC_STATE, { method: "GET" })) as any;
  const remotePayload = (payload?.payload || {}) as Partial<CloudSyncSnapshot>;
  return {
    revision: numberOr(payload?.revision, 0),
    updatedAt: numberOr(payload?.updatedAt, 0),
    payload: {
      settings: (remotePayload.settings || {}) as Record<string, unknown>,
      activeInstanceId:
        remotePayload.activeInstanceId == null ? null : String(remotePayload.activeInstanceId),
      instances: Array.isArray(remotePayload.instances) ? remotePayload.instances : [],
      modsStateByInstance:
        remotePayload.modsStateByInstance && typeof remotePayload.modsStateByInstance === "object"
          ? (remotePayload.modsStateByInstance as Record<string, unknown>)
          : {},
      packsStateByInstance:
        remotePayload.packsStateByInstance && typeof remotePayload.packsStateByInstance === "object"
          ? (remotePayload.packsStateByInstance as Record<string, unknown>)
          : {},
      settingsUpdatedAt: numberOr(remotePayload.settingsUpdatedAt, 0),
      instancesUpdatedAt: numberOr(remotePayload.instancesUpdatedAt, 0),
      capturedAt: numberOr(remotePayload.capturedAt, 0)
    }
  };
}

async function pushRemoteSyncState(snapshot: CloudSyncSnapshot, baseRevision: number | null): Promise<CloudSyncRemote> {
  const payload = (await requestLauncherAccountAuthed(PATH_SYNC_STATE, {
    method: "PUT",
    body: {
      baseRevision,
      payload: snapshot
    }
  })) as any;
  return {
    revision: numberOr(payload?.revision, 0),
    updatedAt: numberOr(payload?.updatedAt, Date.now()),
    payload: {
      settings: (payload?.payload?.settings || {}) as Record<string, unknown>,
      activeInstanceId: payload?.payload?.activeInstanceId ?? null,
      instances: Array.isArray(payload?.payload?.instances) ? payload.payload.instances : [],
      modsStateByInstance:
        payload?.payload?.modsStateByInstance && typeof payload.payload.modsStateByInstance === "object"
          ? payload.payload.modsStateByInstance
          : {},
      packsStateByInstance:
        payload?.payload?.packsStateByInstance && typeof payload.payload.packsStateByInstance === "object"
          ? payload.payload.packsStateByInstance
          : {},
      settingsUpdatedAt: numberOr(payload?.payload?.settingsUpdatedAt, 0),
      instancesUpdatedAt: numberOr(payload?.payload?.instancesUpdatedAt, 0),
      capturedAt: numberOr(payload?.payload?.capturedAt, 0)
    }
  };
}

async function applyRemoteSnapshot(
  snapshot: CloudSyncSnapshot
): Promise<{ settingsPatch: Record<string, unknown> }> {
  try {
    await invoke("instances_sync_import", {
      payload: {
        activeInstanceId: snapshot.activeInstanceId,
        instances: Array.isArray(snapshot.instances) ? snapshot.instances : [],
        modsStateByInstance:
          snapshot.modsStateByInstance && typeof snapshot.modsStateByInstance === "object"
            ? snapshot.modsStateByInstance
            : {},
        packsStateByInstance:
          snapshot.packsStateByInstance && typeof snapshot.packsStateByInstance === "object"
            ? snapshot.packsStateByInstance
            : {},
        updatedAt: numberOr(snapshot.rawUpdatedAt, snapshot.instancesUpdatedAt || snapshot.capturedAt || Date.now())
      }
    });
  } catch {
    // Keep settings pull resilient even if instance import fails.
  }
  return { settingsPatch: sanitizeSettings(snapshot.settings || {}) };
}

function chooseConflictPolicy(
  policy: SyncConflictPolicy,
  local: CloudSyncSnapshot,
  remote: CloudSyncSnapshot
): "local" | "remote" | "conflict" {
  if (policy === "prefer-local") return "local";
  if (policy === "prefer-cloud") return "remote";
  if (policy === "newer-wins") {
    const localEdge = Math.max(local.settingsUpdatedAt || 0, local.instancesUpdatedAt || 0);
    const remoteEdge = Math.max(remote.settingsUpdatedAt || 0, remote.instancesUpdatedAt || 0);
    return localEdge >= remoteEdge ? "local" : "remote";
  }
  return "conflict";
}

export async function cloudSyncGetState() {
  return readLocalSyncState();
}

export async function cloudSyncSyncNow(input: SyncNowInput): Promise<SyncNowResult> {
  const meta = readLocalSyncState();
  try {
    const localSnapshot = await collectFullLocalSnapshot(input?.settings || {});
    const localHash = hashSnapshot(localSnapshot);
    const remote = await fetchRemoteSyncState();
    const remoteHash = hashSnapshot(remote.payload);

    if (remoteHash === localHash) {
      const next: CloudSyncState = {
        ...meta,
        lastSyncedAt: Date.now(),
        lastStatus: "up-to-date",
        lastError: null,
        lastRemoteRevision: remote.revision,
        lastSnapshotHash: localHash
      };
      writeLocalSyncState(next);
      return {
        ok: true,
        status: "up-to-date",
        message: "Cloud sync is up to date.",
        lastSyncedAt: next.lastSyncedAt,
        lastRemoteRevision: next.lastRemoteRevision
      };
    }

    const remoteChangedSinceLastSync =
      meta.lastRemoteRevision != null && remote.revision !== meta.lastRemoteRevision;
    const localChangedSinceLastSync =
      meta.lastSnapshotHash != null ? meta.lastSnapshotHash !== localHash : true;

    if (remoteChangedSinceLastSync && !localChangedSinceLastSync) {
      const applied = await applyRemoteSnapshot(remote.payload);
      const next: CloudSyncState = {
        ...meta,
        lastSyncedAt: Date.now(),
        lastStatus: "pulled",
        lastError: null,
        lastRemoteRevision: remote.revision,
        lastSnapshotHash: remoteHash
      };
      writeLocalSyncState(next);
      return {
        ok: true,
        status: "pulled",
        message: "Pulled latest cloud state.",
        lastSyncedAt: next.lastSyncedAt,
        lastRemoteRevision: next.lastRemoteRevision,
        settingsPatch: applied.settingsPatch
      };
    }

    if (!remoteChangedSinceLastSync && localChangedSinceLastSync) {
      const pushed = await pushRemoteSyncState(localSnapshot, remote.revision);
      const next: CloudSyncState = {
        ...meta,
        lastSyncedAt: Date.now(),
        lastStatus: "pushed",
        lastError: null,
        lastRemoteRevision: pushed.revision,
        lastSnapshotHash: localHash
      };
      writeLocalSyncState(next);
      return {
        ok: true,
        status: "pushed",
        message: "Pushed local state to cloud.",
        lastSyncedAt: next.lastSyncedAt,
        lastRemoteRevision: next.lastRemoteRevision
      };
    }

    const chosen = chooseConflictPolicy(input?.policy || "ask", localSnapshot, remote.payload);
    if (chosen === "local") {
      const pushed = await pushRemoteSyncState(localSnapshot, remote.revision);
      const next: CloudSyncState = {
        ...meta,
        lastSyncedAt: Date.now(),
        lastStatus: "pushed",
        lastError: null,
        lastRemoteRevision: pushed.revision,
        lastSnapshotHash: localHash
      };
      writeLocalSyncState(next);
      return {
        ok: true,
        status: "pushed",
        message: "Conflict resolved using local state.",
        lastSyncedAt: next.lastSyncedAt,
        lastRemoteRevision: next.lastRemoteRevision
      };
    }
    if (chosen === "remote") {
      const applied = await applyRemoteSnapshot(remote.payload);
      const next: CloudSyncState = {
        ...meta,
        lastSyncedAt: Date.now(),
        lastStatus: "pulled",
        lastError: null,
        lastRemoteRevision: remote.revision,
        lastSnapshotHash: remoteHash
      };
      writeLocalSyncState(next);
      return {
        ok: true,
        status: "pulled",
        message: "Conflict resolved using cloud state.",
        lastSyncedAt: next.lastSyncedAt,
        lastRemoteRevision: next.lastRemoteRevision,
        settingsPatch: applied.settingsPatch
      };
    }

    const conflictNext: CloudSyncState = {
      ...meta,
      lastStatus: "conflict",
      lastError: "Sync conflict detected. Choose local or cloud state.",
      lastRemoteRevision: remote.revision
    };
    writeLocalSyncState(conflictNext);
    return {
      ok: false,
      status: "conflict",
      message: "Sync conflict detected.",
      lastSyncedAt: meta.lastSyncedAt,
      lastRemoteRevision: remote.revision,
      conflict: {
        localSettingsUpdatedAt: numberOr(localSnapshot.settingsUpdatedAt, 0),
        localInstancesUpdatedAt: numberOr(localSnapshot.instancesUpdatedAt, 0),
        remoteSettingsUpdatedAt: numberOr(remote.payload.settingsUpdatedAt, 0),
        remoteInstancesUpdatedAt: numberOr(remote.payload.instancesUpdatedAt, 0)
      }
    };
  } catch (err: unknown) {
    const msg = String((err as Error)?.message || err || "Sync failed");
    const next: CloudSyncState = {
      ...meta,
      lastStatus: "error",
      lastError: msg
    };
    writeLocalSyncState(next);
    return {
      ok: false,
      status: "error",
      message: msg,
      lastSyncedAt: next.lastSyncedAt,
      lastRemoteRevision: next.lastRemoteRevision
    };
  }
}

