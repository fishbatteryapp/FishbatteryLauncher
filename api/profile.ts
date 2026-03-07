import { requestLauncherAccountAuthed } from "./launcherAccount";

type ProfileVisibilityState = {
  publicEnabled: boolean;
  updatedAt: number;
};

type PlaytimeState = {
  totalMs: number;
  sessions: number;
  lastPlayedAt: number | null;
  perInstanceMs: Record<string, number>;
};

const VISIBILITY_KEY = "fishbattery.profile.visibility";
const PLAYTIME_KEY = "fishbattery.profile.playtime";

function defaultVisibilityState(): ProfileVisibilityState {
  return { publicEnabled: false, updatedAt: Date.now() };
}

function defaultPlaytimeState(): PlaytimeState {
  return {
    totalMs: 0,
    sessions: 0,
    lastPlayedAt: null,
    perInstanceMs: {}
  };
}

function readVisibilityState(): ProfileVisibilityState {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (!raw) return defaultVisibilityState();
    const parsed = JSON.parse(raw) as Partial<ProfileVisibilityState>;
    return {
      publicEnabled: !!parsed.publicEnabled,
      updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : Date.now()
    };
  } catch {
    return defaultVisibilityState();
  }
}

function writeVisibilityState(state: ProfileVisibilityState): void {
  localStorage.setItem(VISIBILITY_KEY, JSON.stringify(state));
}

function readPlaytimeState(): PlaytimeState {
  try {
    const raw = localStorage.getItem(PLAYTIME_KEY);
    if (!raw) return defaultPlaytimeState();
    const parsed = JSON.parse(raw) as Partial<PlaytimeState>;
    return {
      totalMs: Math.max(0, Number(parsed.totalMs || 0)),
      sessions: Math.max(0, Number(parsed.sessions || 0)),
      lastPlayedAt: Number.isFinite(Number(parsed.lastPlayedAt)) ? Number(parsed.lastPlayedAt) : null,
      perInstanceMs:
        parsed.perInstanceMs && typeof parsed.perInstanceMs === "object"
          ? (parsed.perInstanceMs as Record<string, number>)
          : {}
    };
  } catch {
    return defaultPlaytimeState();
  }
}

function toPublicRamLabel(totalRamMb: number) {
  const gb = Math.max(1, Math.round(totalRamMb / 1024));
  return `${gb} GB`;
}

function detectHardwareSummary() {
  const cores = Number((navigator as any)?.hardwareConcurrency || 0);
  const memGb = Number((navigator as any)?.deviceMemory || 0);
  const totalRamMb = memGb > 0 ? Math.round(memGb * 1024) : 8192;
  return {
    cpuModel: "Detected by client",
    cpuCores: cores > 0 ? cores : 4,
    totalRamMb,
    gpuModel: null as string | null
  };
}

export async function profileGetVisibility() {
  return readVisibilityState();
}

export async function profileSetVisibility(publicEnabled: boolean) {
  const next: ProfileVisibilityState = {
    publicEnabled: !!publicEnabled,
    updatedAt: Date.now()
  };
  writeVisibilityState(next);
  return next;
}

export async function profileGetSummary() {
  const playtime = readPlaytimeState();
  const visibility = readVisibilityState();
  const hw = detectHardwareSummary();

  return {
    generatedAt: new Date().toISOString(),
    activeInstanceId: null,
    activeInstance: null,
    totals: {
      instances: 0,
      installedMods: 0,
      totalPlaytimeMs: Math.max(0, Number(playtime.totalMs || 0)),
      sessions: Math.max(0, Number(playtime.sessions || 0)),
      lastPlayedAt: playtime.lastPlayedAt
    },
    hardware: {
      cpuModel: hw.cpuModel,
      cpuCores: hw.cpuCores,
      totalRamMb: hw.totalRamMb,
      gpuModel: hw.gpuModel
    },
    hardwarePublic: {
      cpuCores: hw.cpuCores,
      ram: toPublicRamLabel(hw.totalRamMb),
      gpu: hw.gpuModel ? "Detected" : "Unknown"
    },
    latestBenchmark: null,
    bestBenchmark: null,
    setups: [],
    visibility
  };
}

export async function profilePublishPublic(payload: unknown): Promise<{
  shareId: string;
  publicEnabled: boolean;
  updatedAt: number;
  shareUrl: string;
}> {
  const visibility = readVisibilityState();
  if (!visibility.publicEnabled) {
    throw new Error("Public profile is disabled. Enable it before sharing a public link.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Profile payload must be an object.");
  }

  const serialized = JSON.stringify(payload);
  if (!serialized || serialized === "{}") {
    throw new Error("Profile payload is empty.");
  }
  if (serialized.length > 200_000) {
    throw new Error("Profile payload is too large to publish.");
  }

  const normalizedPayload = JSON.parse(serialized) as Record<string, unknown>;
  const response = (await requestLauncherAccountAuthed("/v1/profile/public/publish", {
    method: "POST",
    body: {
      publicEnabled: true,
      payload: normalizedPayload
    }
  })) as any;
  const shareId = String(response?.shareId || "").trim();
  const shareUrl = String(response?.shareUrl || "").trim();
  const updatedAt = Number(response?.updatedAt || 0);
  const publicEnabled = !!response?.publicEnabled;
  if (!shareId || !shareUrl) throw new Error("Profile publish did not return a valid share link.");
  return {
    shareId,
    publicEnabled,
    updatedAt,
    shareUrl
  };
}

