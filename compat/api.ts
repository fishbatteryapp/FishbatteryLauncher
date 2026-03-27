import { invoke } from "@tauri-apps/api/core";
import { cloudSyncGetState, cloudSyncSyncNow } from "@/api/cloudSync";
import {
  cloudWorldSyncDownloadWorld,
  cloudWorldSyncGetState,
  cloudWorldSyncRemoveWorld,
  cloudWorldSyncUploadWorld
} from "@/api/cloudWorlds";
import {
  launcherAccountBillingPortal,
  launcherAccountCheckout,
  launcherAccountGetState,
  launcherAccountGetSubscriptionStatus,
  launcherAccountGoogleLogin,
  launcherAccountLogin,
  launcherAccountLogin2fa,
  launcherAccountLogout,
  launcherAccountOpenUpgradePage,
  launcherAccountRegister,
  launcherAccountSwitch,
  launcherAccountUpdateProfile
} from "@/api/launcherAccount";
import {
  profileGetSummary,
  profileGetVisibility,
  profileSetVisibility,
  profilePublishPublic
} from "@/api/profile";
import { modrinthPacksSearch, providerPacksSearch } from "@/api/packsSearch";

const explicitApiMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  launcherAccountGetState: () => launcherAccountGetState(),
  launcherAccountRegister: (email: string, password: string, displayName?: string) =>
    launcherAccountRegister(email, password, displayName),
  launcherAccountLogin: (email: string, password: string) => launcherAccountLogin(email, password),
  launcherAccountLogin2fa: (challengeToken: string, code: string) => launcherAccountLogin2fa(challengeToken, code),
  launcherAccountGoogleLogin: () => launcherAccountGoogleLogin(),
  launcherAccountSwitch: (accountId: string) => launcherAccountSwitch(accountId),
  launcherAccountLogout: () => launcherAccountLogout(),
  launcherAccountGetSubscriptionStatus: () => launcherAccountGetSubscriptionStatus(),
  launcherAccountCheckout: (plan: "monthly" | "yearly") => launcherAccountCheckout(plan),
  launcherAccountBillingPortal: () => launcherAccountBillingPortal(),
  launcherAccountOpenUpgradePage: () => launcherAccountOpenUpgradePage(),
  launcherAccountUpdateProfile: (patch: { displayName?: string; avatarUrl?: string | null }) =>
    launcherAccountUpdateProfile(patch),
  cloudSyncGetState: () => cloudSyncGetState(),
  cloudSyncSyncNow: (payload: {
    settings: Record<string, unknown>;
    policy?: "ask" | "newer-wins" | "prefer-local" | "prefer-cloud";
    resolveConflict?: boolean;
  }) => cloudSyncSyncNow(payload),
  cloudWorldSyncGetState: () => cloudWorldSyncGetState(),
  cloudWorldSyncUploadWorld: (payload: { instanceId: string; worldId: string; worldName?: string }) =>
    cloudWorldSyncUploadWorld(payload),
  cloudWorldSyncRemoveWorld: (syncWorldId: string) => cloudWorldSyncRemoveWorld(syncWorldId),
  cloudWorldSyncDownloadWorld: (payload: {
    syncWorldId: string;
    instanceId: string;
    worldId: string;
    overwriteExisting?: boolean;
  }) => cloudWorldSyncDownloadWorld(payload),
  profileGetSummary: () => profileGetSummary(),
  profileGetVisibility: () => profileGetVisibility(),
  profileSetVisibility: (publicEnabled: boolean) => profileSetVisibility(publicEnabled),
  profilePublishPublic: (payload: unknown) => profilePublishPublic(payload),
  playitExchangeSetupCode: (code: string) => invoke("playit_exchange_setup_code", { code }),
  modrinthPacksSearch: (query: string, limit?: number) => modrinthPacksSearch(query, limit),
  providerPacksSearch: (provider: "curseforge" | "technic" | "atlauncher" | "ftb", query: string, limit?: number) =>
    providerPacksSearch(provider, query, limit),
  capesListOfficial: (accountId: string, forceRefresh?: boolean) =>
    invoke("capes_list_official", { accountId, forceRefresh }),
  capesSetOfficialActive: (accountId: string, capeId: string | null) =>
    invoke("capes_set_official_active", { accountId, capeId }),
  skinsSetOfficialActive: (accountId: string, skinId: string) =>
    invoke("skins_set_official_active", { accountId, skinId }),
  skinsUploadOfficial: (accountId: string, imageDataUrl: string, variant?: "CLASSIC" | "SLIM") =>
    invoke("skins_upload_official", { accountId, imageDataUrl, variant })
};

export const apiBackend = new Proxy(explicitApiMethods as Record<string, unknown>, {
  get(target, prop) {
    if (typeof prop !== "string") return undefined;
    if (prop in target) return target[prop];
    return (...args: unknown[]) =>
      Promise.reject(new Error(`api backend mapping missing for method '${prop}' (args: ${JSON.stringify(args)})`));
  }
});
