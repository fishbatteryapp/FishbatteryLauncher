import { invoke } from "@tauri-apps/api/core";

type LauncherAccount = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  subscriptionTier?: string | null;
};

type LauncherAccountDb = {
  activeAccountId: string | null;
  accounts: LauncherAccount[];
  updatedAt: number;
};

type LauncherSession = {
  accessToken: string;
  refreshToken?: string;
  accountId?: string | null;
  updatedAt: number;
};

export type LauncherAccountState = {
  configured: boolean;
  signedIn: boolean;
  activeAccountId: string | null;
  activeAccount: LauncherAccount | null;
  accounts: LauncherAccount[];
  updatedAt: number | null;
  error: string | null;
};

export type LauncherLoginResult =
  | { requiresTwoFactor: false; state: LauncherAccountState }
  | { requiresTwoFactor: true; challengeToken: string };

type AuthResponse = {
  accessToken?: string;
  token?: string;
  refreshToken?: string;
  requiresTwoFactor?: boolean;
  challengeToken?: string;
  account?: unknown;
  user?: unknown;
  accounts?: unknown;
  activeAccountId?: string;
};

type LauncherSubscriptionStatus = {
  tier: "free" | "premium" | "founder";
  premium: boolean;
  source: "server" | "local-fallback";
  features: {
    adsFree: boolean;
    advancedThemes: boolean;
    earlyExperimental: boolean;
    cloudSyncPriority: boolean;
    advancedBenchmarking: boolean;
  };
  upgradeUrl: string | null;
};

const DB_KEY = "fishbattery.launcherAccounts";
const SESSION_KEY = "fishbattery.launcherSession";
const DEFAULT_API_BASE = "https://api.fishbattery.app";
const DEFAULT_UPGRADE_URL = "https://fishbattery.app/upgrade";

function mirrorLauncherAccountsDb(db: LauncherAccountDb): void {
  void invoke("launcher_accounts_sync", { payload: db }).catch(() => {});
}

function mirrorLauncherSession(session: LauncherSession | null): void {
  const payload = session
    ? session
    : {
        accessToken: null,
        refreshToken: null,
        accountId: null,
        updatedAt: Date.now()
      };
  void invoke("launcher_session_sync", { payload }).catch(() => {});
}

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

function getApiBase(): string | null {
  const raw = readEnv("FISHBATTERY_ACCOUNT_API") || readEnv("FISHBATTERY_ACCOUNT_API_URL") || DEFAULT_API_BASE;
  return raw ? raw.replace(/\/+$/, "") : null;
}

export function getLauncherAccountApiBase(): string | null {
  return getApiBase();
}

function getPath(envKey: string, fallback: string): string {
  const raw = readEnv(envKey);
  if (!raw) return fallback;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

const PATH_REGISTER = getPath("FISHBATTERY_ACCOUNT_REGISTER_PATH", "/v1/auth/register");
const PATH_LOGIN = getPath("FISHBATTERY_ACCOUNT_LOGIN_PATH", "/v1/auth/login");
const PATH_LOGIN_2FA = getPath("FISHBATTERY_ACCOUNT_LOGIN_2FA_PATH", "/v1/auth/login/2fa");
const PATH_LOGOUT = getPath("FISHBATTERY_ACCOUNT_LOGOUT_PATH", "/v1/auth/logout");
const PATH_SESSION = getPath("FISHBATTERY_ACCOUNT_SESSION_PATH", "/v1/auth/session");
const PATH_SWITCH = getPath("FISHBATTERY_ACCOUNT_SWITCH_PATH", "/v1/auth/switch");
const PATH_PROFILE_UPDATE = getPath("FISHBATTERY_ACCOUNT_PROFILE_UPDATE_PATH", "/v1/account/profile");
const PATH_SUBSCRIPTION_STATUS = getPath("FISHBATTERY_ACCOUNT_SUBSCRIPTION_STATUS_PATH", "/v1/subscription/status");
const PATH_BILLING_CHECKOUT_SESSION = getPath("FISHBATTERY_ACCOUNT_BILLING_CHECKOUT_PATH", "/v1/billing/checkout-session");
const PATH_BILLING_PORTAL_SESSION = getPath("FISHBATTERY_ACCOUNT_BILLING_PORTAL_PATH", "/v1/billing/portal-session");

function normalizeTier(value: unknown): "free" | "premium" | "founder" {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "premium") return "premium";
  if (raw === "founder") return "founder";
  return "free";
}

function readDb(): LauncherAccountDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as LauncherAccountDb;
    if (!Array.isArray(parsed.accounts)) throw new Error("invalid");
    mirrorLauncherAccountsDb(parsed);
    return parsed;
  } catch {
    const fallback = { activeAccountId: null, accounts: [], updatedAt: Date.now() };
    mirrorLauncherAccountsDb(fallback);
    return fallback;
  }
}

function writeDb(db: LauncherAccountDb): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  mirrorLauncherAccountsDb(db);
}

function loadSession(): LauncherSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LauncherSession;
    if (!parsed?.accessToken) return null;
    mirrorLauncherSession(parsed);
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: LauncherSession | null): void {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    mirrorLauncherSession(null);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  mirrorLauncherSession(session);
}

function normalizeAccount(raw: unknown): LauncherAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const id = String(src.id ?? src.accountId ?? src.userId ?? "").trim();
  const email = String(src.email ?? "").trim();
  const displayName = String(src.displayName ?? src.username ?? src.name ?? email ?? "").trim();
  if (!id || !email || !displayName) return null;
  const avatarUrl = src.avatarUrl == null ? null : String(src.avatarUrl);
  const subscriptionTier = src.subscriptionTier == null ? null : String(src.subscriptionTier);
  return { id, email, displayName, avatarUrl, subscriptionTier };
}

function normalizeAccounts(rawAccounts: unknown, rawSingle?: unknown): LauncherAccount[] {
  const list = Array.isArray(rawAccounts) ? rawAccounts : [];
  const fromList = list.map((entry) => normalizeAccount(entry)).filter((x): x is LauncherAccount => !!x);
  const single = normalizeAccount(rawSingle);
  const merged = single ? [single, ...fromList] : fromList;
  const dedup = new Map<string, LauncherAccount>();
  for (const item of merged) dedup.set(item.id, item);
  return Array.from(dedup.values());
}

function stateFromDb(db: LauncherAccountDb, error: string | null = null): LauncherAccountState {
  const active =
    db.accounts.find((entry) => entry.id === db.activeAccountId) ??
    (db.accounts.length ? db.accounts[0] : null);
  return {
    configured: !!getApiBase(),
    signedIn: !!active,
    activeAccountId: active?.id ?? null,
    activeAccount: active,
    accounts: db.accounts,
    updatedAt: db.updatedAt || null,
    error
  };
}

function shouldInvalidateLocalSession(statusCode: number, message: string): boolean {
  const lowered = String(message || "").toLowerCase();
  if (statusCode === 401) return true;
  if (lowered.includes("token expired")) return true;
  if (lowered.includes("invalid token")) return true;
  if (lowered.includes("jwt expired")) return true;
  if (lowered.includes("jwt malformed")) return true;
  return false;
}

async function requestAuth(
  path: string,
  init: { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: Record<string, unknown>; accessToken?: string }
): Promise<AuthResponse> {
  const base = getApiBase();
  if (!base) throw new Error("Launcher account API is not configured.");
  const headers: Record<string, string> = {
    Accept: "application/json"
  };
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.accessToken) headers.Authorization = `Bearer ${init.accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined
    });
  } catch (err: unknown) {
    const detail =
      (err && typeof err === "object" && "message" in err && String((err as { message?: unknown }).message)) ||
      String(err || "Unknown network error");
    throw new Error(
      `Could not reach Fishbattery API (${base}${path}). ` +
        `Check API uptime and CORS allowlist for https://tauri.localhost. Details: ${detail}`
    );
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg =
      (payload && typeof payload === "object" && "message" in payload && String((payload as any).message)) ||
      `Account API returned ${res.status}`;
    const err: any = new Error(msg);
    err.statusCode = Number(res.status || 0);
    throw err;
  }
  if (!payload || typeof payload !== "object") return {};
  return payload as AuthResponse;
}

export async function requestLauncherAccountAuthed(
  path: string,
  init: { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: Record<string, unknown> }
): Promise<AuthResponse> {
  const session = loadSession();
  if (!session?.accessToken) throw new Error("Not signed in.");
  try {
    return await requestAuth(path, {
      method: init.method,
      body: init.body,
      accessToken: session.accessToken
    });
  } catch (err: unknown) {
    const statusCode = Number((err as any)?.statusCode || 0);
    const msg = String((err as Error)?.message || err || "");
    if (shouldInvalidateLocalSession(statusCode, msg)) {
      saveSession(null);
      const db: LauncherAccountDb = { activeAccountId: null, accounts: [], updatedAt: Date.now() };
      writeDb(db);
      throw new Error("Session expired. Please sign in again.");
    }
    throw err;
  }
}

function applyAuthResponse(payload: AuthResponse, fallbackAccountId?: string | null): LauncherAccountState {
  const token = String(payload.accessToken || payload.token || "").trim();
  if (!token) throw new Error("Account API did not return an access token.");
  const accounts = normalizeAccounts(payload.accounts, payload.account ?? payload.user);
  const activeAccountId =
    String(payload.activeAccountId || fallbackAccountId || (accounts[0]?.id ?? "")).trim() || null;
  const db: LauncherAccountDb = {
    activeAccountId,
    accounts,
    updatedAt: Date.now()
  };
  writeDb(db);
  saveSession({
    accessToken: token,
    refreshToken: payload.refreshToken ? String(payload.refreshToken) : undefined,
    accountId: activeAccountId,
    updatedAt: Date.now()
  });
  return stateFromDb(db);
}

export async function launcherAccountGetState(): Promise<LauncherAccountState> {
  const base = getApiBase();
  if (!base) {
    return {
      configured: false,
      signedIn: false,
      activeAccountId: null,
      activeAccount: null,
      accounts: [],
      updatedAt: null,
      error: "Launcher account API is not configured."
    };
  }

  const session = loadSession();
  if (!session?.accessToken) return stateFromDb(readDb());

  try {
    const response = await requestAuth(PATH_SESSION, { method: "GET", accessToken: session.accessToken });
    return applyAuthResponse(response, session.accountId ?? null);
  } catch (err: unknown) {
    const statusCode = Number((err as any)?.statusCode || 0);
    const msg = String((err as Error)?.message || err || "");
    const authInvalid = shouldInvalidateLocalSession(statusCode, msg);

    if (authInvalid) {
      saveSession(null);
      const db: LauncherAccountDb = { activeAccountId: null, accounts: [], updatedAt: Date.now() };
      writeDb(db);
      return stateFromDb(db, msg);
    }
    return stateFromDb(readDb(), msg);
  }
}

export async function launcherAccountRegister(
  email: string,
  password: string,
  displayName?: string
): Promise<LauncherAccountState> {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");
  const normalizedDisplayName = String(displayName || "").trim();
  if (!normalizedEmail || !normalizedPassword || !normalizedDisplayName) {
    throw new Error("Email, password, and display name are required.");
  }
  const response = await requestAuth(PATH_REGISTER, {
    method: "POST",
    body: { email: normalizedEmail, password: normalizedPassword, displayName: normalizedDisplayName }
  });
  return applyAuthResponse(response);
}

export async function launcherAccountLogin(email: string, password: string): Promise<LauncherLoginResult> {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");
  if (!normalizedEmail || !normalizedPassword) throw new Error("Email and password are required.");

  const response = await requestAuth(PATH_LOGIN, {
    method: "POST",
    body: { email: normalizedEmail, password: normalizedPassword }
  });
  if (response?.requiresTwoFactor) {
    const challengeToken = String(response.challengeToken || "").trim();
    if (!challengeToken) throw new Error("2FA challenge is missing. Please try signing in again.");
    return { requiresTwoFactor: true, challengeToken };
  }
  return { requiresTwoFactor: false, state: applyAuthResponse(response) };
}

export async function launcherAccountLogin2fa(challengeToken: string, code: string): Promise<LauncherAccountState> {
  const normalizedChallenge = String(challengeToken || "").trim();
  const normalizedCode = String(code || "").replace(/\s+/g, "");
  if (!normalizedChallenge) throw new Error("2FA challenge token is required.");
  if (!/^\d{6}$/.test(normalizedCode)) throw new Error("Enter a valid 6-digit authenticator code.");
  const response = await requestAuth(PATH_LOGIN_2FA, {
    method: "POST",
    body: { challengeToken: normalizedChallenge, code: normalizedCode }
  });
  return applyAuthResponse(response);
}

export async function launcherAccountSwitch(accountId: string): Promise<LauncherAccountState> {
  const normalized = String(accountId || "").trim();
  if (!normalized) throw new Error("Account ID is required.");
  const session = loadSession();
  if (!session?.accessToken) throw new Error("Not signed in.");
  const response = await requestAuth(PATH_SWITCH, {
    method: "POST",
    body: { accountId: normalized },
    accessToken: session.accessToken
  });
  return applyAuthResponse(response, normalized);
}

export async function launcherAccountLogout(): Promise<LauncherAccountState> {
  const session = loadSession();
  if (session?.accessToken && getApiBase()) {
    try {
      await requestAuth(PATH_LOGOUT, { method: "POST", accessToken: session.accessToken });
    } catch {}
  }
  saveSession(null);
  const db: LauncherAccountDb = { activeAccountId: null, accounts: [], updatedAt: Date.now() };
  writeDb(db);
  return stateFromDb(db);
}

export async function launcherAccountUpdateProfile(patch: {
  displayName?: string;
  avatarUrl?: string | null;
}): Promise<LauncherAccountState> {
  const session = loadSession();
  if (!session?.accessToken) throw new Error("Not signed in.");
  const body: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "displayName")) {
    const displayName = String(patch.displayName || "").trim();
    if (!displayName) throw new Error("Display name is required.");
    body.displayName = displayName;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "avatarUrl")) {
    const avatar = patch.avatarUrl == null ? null : String(patch.avatarUrl).trim();
    body.avatarUrl = avatar || null;
  }
  if (!Object.keys(body).length) throw new Error("No profile changes provided.");
  const response = await requestAuth(PATH_PROFILE_UPDATE, {
    method: "PATCH",
    body,
    accessToken: session.accessToken
  });
  return applyAuthResponse(response, session.accountId ?? null);
}

export async function launcherAccountGetSubscriptionStatus(): Promise<LauncherSubscriptionStatus> {
  const session = loadSession();
  if (!session?.accessToken) throw new Error("Not signed in.");
  try {
    const payload = await requestAuth(PATH_SUBSCRIPTION_STATUS, {
      method: "GET",
      accessToken: session.accessToken
    });
    const tier = normalizeTier((payload as any)?.tier);
    const premium = tier === "premium" || tier === "founder";
    const featuresRaw = ((payload as any)?.features || {}) as Record<string, unknown>;
    return {
      tier,
      premium: Boolean((payload as any)?.premium ?? premium),
      source: "server",
      features: {
        adsFree: Boolean(featuresRaw.adsFree ?? premium),
        advancedThemes: Boolean(featuresRaw.advancedThemes ?? premium),
        earlyExperimental: Boolean(featuresRaw.earlyExperimental ?? premium),
        cloudSyncPriority: Boolean(featuresRaw.cloudSyncPriority ?? premium),
        advancedBenchmarking: Boolean(featuresRaw.advancedBenchmarking ?? premium)
      },
      upgradeUrl: (payload as any)?.upgradeUrl ? String((payload as any).upgradeUrl) : null
    };
  } catch {
    const db = readDb();
    const active =
      db.accounts.find((entry) => entry.id === db.activeAccountId) ??
      (db.accounts.length ? db.accounts[0] : null);
    const tier = normalizeTier(active?.subscriptionTier);
    const premium = tier === "premium" || tier === "founder";
    return {
      tier,
      premium,
      source: "local-fallback",
      features: {
        adsFree: premium,
        advancedThemes: premium,
        earlyExperimental: premium,
        cloudSyncPriority: premium,
        advancedBenchmarking: premium
      },
      upgradeUrl: DEFAULT_UPGRADE_URL
    };
  }
}

async function openExternalUrl(url: string): Promise<boolean> {
  const normalized = String(url || "").trim();
  if (!/^https?:\/\//i.test(normalized)) return false;
  try {
    return await invoke<boolean>("external_open", { url: normalized });
  } catch {
    window.open(normalized, "_blank", "noopener,noreferrer");
    return true;
  }
}

function getBillingReturnBaseUrl(): string {
  const preferred = readEnv("FISHBATTERY_ACCOUNT_RETURN_URL");
  if (/^https?:\/\//i.test(preferred)) return preferred;
  const fallback = readEnv("FISHBATTERY_UPGRADE_URL") || DEFAULT_UPGRADE_URL;
  if (/^https?:\/\//i.test(fallback)) return fallback;
  return DEFAULT_UPGRADE_URL;
}

export async function launcherAccountCheckout(plan: "monthly" | "yearly"): Promise<boolean> {
  const normalizedPlan = plan === "yearly" ? "yearly" : "monthly";
  const session = loadSession();
  if (!session?.accessToken) throw new Error("Not signed in.");
  const returnUrl = getBillingReturnBaseUrl();
  const payload = await requestAuth(PATH_BILLING_CHECKOUT_SESSION, {
    method: "POST",
    accessToken: session.accessToken,
    body: {
      plan: normalizedPlan,
      successUrl: returnUrl,
      cancelUrl: returnUrl
    }
  });
  const url = String((payload as any)?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Billing API did not return a valid checkout URL.");
  return openExternalUrl(url);
}

export async function launcherAccountBillingPortal(): Promise<boolean> {
  const session = loadSession();
  if (!session?.accessToken) throw new Error("Not signed in.");
  const returnUrl = getBillingReturnBaseUrl();
  const payload = await requestAuth(PATH_BILLING_PORTAL_SESSION, {
    method: "POST",
    accessToken: session.accessToken,
    body: { returnUrl }
  });
  const url = String((payload as any)?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Billing API did not return a valid portal URL.");
  return openExternalUrl(url);
}

export async function launcherAccountOpenUpgradePage(): Promise<boolean> {
  let url = readEnv("FISHBATTERY_UPGRADE_URL") || DEFAULT_UPGRADE_URL;
  try {
    const status = await launcherAccountGetSubscriptionStatus();
    if (status.upgradeUrl) url = status.upgradeUrl;
  } catch {}
  if (!url) return false;
  return openExternalUrl(url);
}

export async function launcherAccountGoogleLogin(): Promise<LauncherAccountState> {
  throw new Error("Google desktop launcher login is not ported yet in Tauri. Use email/password for now.");
}

export async function hasLauncherPremiumAccess(): Promise<boolean> {
  try {
    const status = await launcherAccountGetSubscriptionStatus();
    return status.tier === "premium" || status.tier === "founder" || !!status.premium;
  } catch {
    return false;
  }
}

export async function hasLauncherFounderAccess(): Promise<boolean> {
  try {
    const status = await launcherAccountGetSubscriptionStatus();
    return status.tier === "founder";
  } catch {
    return false;
  }
}
