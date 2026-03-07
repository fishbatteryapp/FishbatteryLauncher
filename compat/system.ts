import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type EventCallback<T> = (payload: T) => void;

let unlistenLaunchLog: UnlistenFn | null = null;
let unlistenUpdaterEvent: UnlistenFn | null = null;

async function attachSingleListener<T>(
  eventName: string,
  current: UnlistenFn | null,
  cb: EventCallback<T>
): Promise<UnlistenFn | null> {
  if (current) current();
  return listen<T>(eventName, (event) => cb(event.payload));
}

const events = {
  onLaunchLog: (cb: EventCallback<string>) => {
    void attachSingleListener<string>("launch:log", unlistenLaunchLog, cb).then((unlisten) => {
      unlistenLaunchLog = unlisten;
    });
  },
  onUpdaterEvent: (cb: EventCallback<unknown>) => {
    void attachSingleListener<unknown>("updater:event", unlistenUpdaterEvent, cb).then((unlisten) => {
      unlistenUpdaterEvent = unlisten;
    });
  }
} as Record<string, unknown>;

const phase1Commands: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  versionsList: () => invoke("versions_list"),
  windowMinimize: () => invoke("window_minimize"),
  windowToggleMaximize: () => invoke("window_toggle_maximize"),
  windowIsMaximized: () => invoke("window_is_maximized"),
  windowIsFullscreen: () => invoke("window_is_fullscreen"),
  windowDragRestore: (cursorX: number, cursorY: number, anchorRatio: number) =>
    invoke("window_drag_restore", { cursorX, cursorY, anchorRatio }),
  windowDragMove: (cursorX: number, cursorY: number, anchorRatio: number) =>
    invoke("window_drag_move", { cursorX, cursorY, anchorRatio }),
  windowDragEnd: (cursorY: number) => invoke("window_drag_end", { cursorY }),
  windowToggleFullscreen: () => invoke("window_toggle_fullscreen"),
  windowClose: () => invoke("window_close"),
  windowSetTitleBarTheme: (color: string, symbolColor: string) =>
    invoke("window_set_title_bar_theme", { color, symbolColor }),
  externalOpen: (url: string) => invoke("external_open", { url })
};

const phase2Commands: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  accountsList: () => invoke("accounts_list"),
  accountsGetAvatar: (id: string, refresh?: boolean) => invoke("accounts_get_avatar", { id, refresh }),
  accountsAdd: () => invoke("accounts_add"),
  accountsSetActive: (id: string | null) => invoke("accounts_set_active", { id }),
  accountsRemove: (id: string) => invoke("accounts_remove", { id }),
  capesListLocal: () => invoke("capes_list_local"),
  capesGetLocalSelection: (accountId: string) => invoke("capes_get_local_selection", { accountId }),
  capesSetLocalSelection: (accountId: string, capeId: string | null) =>
    invoke("capes_set_local_selection", { accountId, capeId })
};

const phase4Commands: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  loaderPickVersion: (loader: "vanilla" | "fabric" | "quilt" | "forge" | "neoforge", mcVersion: string) =>
    invoke("loader_pick_version", { loader, mcVersion }),
  loaderInstall: (
    instanceId: string,
    mcVersion: string,
    loader: "vanilla" | "fabric" | "quilt" | "forge" | "neoforge",
    loaderVersion?: string
  ) => invoke("loader_install", { instanceId, mcVersion, loader, loaderVersion }),
  modsValidate: (instanceId: string) => invoke("mods_validate", { instanceId }),
  modsSetEnabled: (instanceId: string, modId: string, enabled: boolean) =>
    invoke("mods_set_enabled", { instanceId, modId, enabled }),
  modsRefresh: (instanceId: string, mcVersion?: string) => invoke("mods_refresh", { instanceId, mcVersion }),
  modsPlanRefresh: (instanceId: string, mcVersion?: string) => invoke("mods_plan_refresh", { instanceId, mcVersion }),
  modsRefreshSelected: (instanceId: string, mcVersion: string, selectedIds: string[]) =>
    invoke("mods_refresh_selected", { instanceId, mcVersion, selectedIds }),
  modsSyncBridge: (instanceId: string, mcVersion?: string) => invoke("mods_sync_bridge", { instanceId, mcVersion }),
  modsFixDuplicates: (instanceId: string) => invoke("mods_fix_duplicates", { instanceId }),
  instancesList: () => invoke("instances_list"),
  instancesCreate: (cfg: unknown) => invoke("instances_create", { cfg }),
  instancesSetActive: (id: string | null) => invoke("instances_set_active", { id }),
  instancesUpdate: (id: string, patch: unknown) => invoke("instances_update", { id, patch }),
  instancesRemove: (id: string) => invoke("instances_remove", { id }),
  instancesDuplicate: (id: string) => invoke("instances_duplicate", { id }),
  instancesOpenFolder: (id: string) => invoke("instances_open_folder", { id }),
  instancesExport: (id: string) => invoke("instances_export", { id }),
  instancesImport: () => invoke("instances_import"),
  instancesPickIcon: () => invoke("instances_pick_icon"),
  instancesPreviewIconDataUrl: (iconToken: string) => invoke("instances_preview_icon_data_url", { iconToken }),
  instancesSetIconFromFile: (instanceId: string, iconToken: string, transform?: unknown) =>
    invoke("instances_set_icon_from_file", { instanceId, iconToken, transform }),
  instancesSetIconFromUrl: (instanceId: string, url: string) =>
    invoke("instances_set_icon_from_url", { instanceId, url }),
  instancesSetIconFallback: (instanceId: string, label: string, theme?: string) =>
    invoke("instances_set_icon_fallback", { instanceId, label, theme }),
  instancesGetIcon: (instanceId: string) => invoke("instances_get_icon", { instanceId }),
  instancesClearIcon: (instanceId: string) => invoke("instances_clear_icon", { instanceId }),
  contentPickFiles: (kind: "mods" | "resourcepacks" | "shaderpacks") => invoke("content_pick_files", { kind }),
  contentAdd: (instanceId: string, kind: "mods" | "resourcepacks" | "shaderpacks", filePaths: string[]) =>
    invoke("content_add", { instanceId, kind, filePaths }),
  contentList: (instanceId: string, kind: "mods" | "resourcepacks" | "shaderpacks") =>
    invoke("content_list", { instanceId, kind }),
  contentRemove: (instanceId: string, kind: "mods" | "resourcepacks" | "shaderpacks", name: string) =>
    invoke("content_remove", { instanceId, kind, name }),
  contentToggleEnabled: (
    instanceId: string,
    kind: "mods" | "resourcepacks" | "shaderpacks",
    name: string,
    enabled: boolean
  ) => invoke("content_toggle_enabled", { instanceId, kind, name, enabled }),
  lockfileGenerate: (instanceId: string) => invoke("lockfile_generate", { instanceId }),
  lockfileDrift: (instanceId: string) => invoke("lockfile_drift", { instanceId }),
  serversList: (instanceId: string) => invoke("servers_list", { instanceId }),
  serversUpsert: (instanceId: string, entry: unknown) => invoke("servers_upsert", { instanceId, entry }),
  serversRemove: (instanceId: string, serverId: string) => invoke("servers_remove", { instanceId, serverId }),
  serversSetPreferred: (instanceId: string, serverId: string | null) =>
    invoke("servers_set_preferred", { instanceId, serverId }),
  serversExportProfile: (instanceId: string, serverId: string) =>
    invoke("servers_export_profile", { instanceId, serverId }),
  serversImportProfile: (instanceId: string) => invoke("servers_import_profile", { instanceId }),
  modrinthPacksInstall: (payload: unknown) => invoke("modrinth_packs_install", { payload }),
  modrinthModsSearch: (
    instanceId: string,
    query: string,
    mcVersion?: string,
    loader?: "vanilla" | "fabric" | "quilt" | "forge" | "neoforge",
    limit?: number
  ) => invoke("modrinth_mods_search", { instanceId, query, mcVersion, loader, limit }),
  modrinthModsInstall: (instanceId: string, projectId: string, versionId?: string) =>
    invoke("modrinth_mods_install", { instanceId, projectId, versionId }),
  modrinthContentSearch: (
    instanceId: string,
    kind: "resourcepack" | "shaderpack",
    query: string,
    mcVersion?: string,
    limit?: number
  ) => invoke("modrinth_content_search", { instanceId, kind, query, mcVersion, limit }),
  modrinthContentInstall: (
    instanceId: string,
    kind: "resourcepack" | "shaderpack",
    projectId: string,
    versionId?: string
  ) => invoke("modrinth_content_install", { instanceId, kind, projectId, versionId }),
  providerPacksInstall: (
    provider: "curseforge" | "technic" | "atlauncher" | "ftb",
    packId: string,
    defaults?: { name?: string; accountId?: string | null; memoryMb?: number }
  ) => invoke("provider_packs_install", { provider, packId, defaults }),
  modsList: (instanceId: string) => invoke("mods_list", { instanceId }),
  packsList: (instanceId: string) => invoke("packs_list", { instanceId }),
  packsRefresh: (instanceId: string, mcVersion?: string) => invoke("packs_refresh", { instanceId, mcVersion }),
  packsSetEnabled: (instanceId: string, packId: string, enabled: boolean) =>
    invoke("packs_set_enabled", { instanceId, packId, enabled }),
  packArchiveImport: (payload: unknown) => invoke("pack_archive_import", { payload }),
  vanillaInstall: (mcVersion: string) => invoke("vanilla_install", { mcVersion }),
  fabricPickLoader: (mcVersion: string) => invoke("fabric_pick_loader", { mcVersion }),
  fabricInstall: (instanceId: string, mcVersion: string, loaderVersion: string) =>
    invoke("fabric_install", { instanceId, mcVersion, loaderVersion })
};

const phase7Commands: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  launch: (
    instanceId: string,
    accountId: string,
    runtimePrefs?: { jvmArgs?: string; preLaunch?: string; postExit?: string; serverAddress?: string }
  ) => invoke("launch", { instanceId, accountId, runtimePrefs }),
  launchIsRunning: (instanceId: string) => invoke("launch_is_running", { instanceId }),
  launchStop: (instanceId: string) => invoke("launch_stop", { instanceId }),
  launchDiagnose: (instanceId: string, lines: string[]) => invoke("launch_diagnose", { instanceId, lines }),
  launchApplyFix: (
    instanceId: string,
    action: "install-fabric-loader" | "refresh-mods" | "fix-duplicate-mods" | "none"
  ) => invoke("launch_apply_fix", { instanceId, action }),
  rollbackCreateSnapshot: (
    instanceId: string,
    reason: "instance-preset" | "mods-refresh" | "packs-refresh" | "manual",
    note?: string
  ) => invoke("rollback_create_snapshot", { instanceId, reason, note }),
  rollbackGetLatest: (instanceId: string) => invoke("rollback_get_latest", { instanceId }),
  rollbackRestoreLatest: (instanceId: string) => invoke("rollback_restore_latest", { instanceId })
};

const phase8Commands: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  optimizerPreview: (profile: "conservative" | "balanced" | "aggressive") =>
    invoke("optimizer_preview", { profile }),
  optimizerApply: (instanceId: string, profile: "conservative" | "balanced" | "aggressive") =>
    invoke("optimizer_apply", { instanceId, profile }),
  optimizerRestore: (instanceId: string) => invoke("optimizer_restore", { instanceId }),
  benchmarkRun: (instanceId: string, profile?: "conservative" | "balanced" | "aggressive") =>
    invoke("benchmark_run", { instanceId, profile }),
  benchmarkList: (instanceId: string) => invoke("benchmark_list", { instanceId }),
  updaterGetState: () => invoke("updater_get_state"),
  updaterGetChannel: () => invoke("updater_get_channel"),
  updaterSetChannel: (channel: "stable" | "beta") => invoke("updater_set_channel", { channel }),
  updaterCheck: () => invoke("updater_check"),
  updaterDownload: () => invoke("updater_download"),
  updaterInstall: () => invoke("updater_install"),
  diagnosticsExport: () => invoke("diagnostics_export"),
  preflightRun: () => invoke("preflight_run"),
  preflightGetLast: () => invoke("preflight_get_last")
};

export const systemBackend = new Proxy(events, {
  get(target, prop) {
    if (typeof prop !== "string") return undefined;
    if (prop in target) return target[prop];
    if (prop in phase1Commands) return phase1Commands[prop];
    if (prop in phase2Commands) return phase2Commands[prop];
    if (prop in phase4Commands) return phase4Commands[prop];
    if (prop in phase7Commands) return phase7Commands[prop];
    if (prop in phase8Commands) return phase8Commands[prop];
    return (...args: unknown[]) =>
      Promise.reject(new Error(`system backend mapping missing for method '${prop}' (args: ${JSON.stringify(args)})`));
  }
});
