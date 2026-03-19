// FishbatteryLauncher
// Copyright (C) 2026 Fishbattery
// Licensed under GPL v3
//
// Renderer overview:
// - Main UI controller for the launcher window.
// - Wires DOM events, renders views (Library/Capes/Settings), and calls backend IPC via `backend`.
// - To trace behavior, start from element refs at top, then follow `.onclick` handlers and render/update functions.

import "./index.css";
import { backend } from "@/compat";
import { CATALOG } from "../shared/modrinthCatalog";
import { PACK_CATALOG } from "../shared/modrinthPackCatalog";
import * as skinview3d from "skinview3d";
import defaultSkinSteve from "./default-skins/steve.png";
import defaultSkinAlex from "./default-skins/alex.png";
import defaultSkinAri from "./default-skins/ari.png";
import defaultSkinEfe from "./default-skins/efe.png";
import defaultSkinKai from "./default-skins/kai.png";
import defaultSkinMakena from "./default-skins/makena.png";
import defaultSkinNoor from "./default-skins/noor.png";
import defaultSkinSunny from "./default-skins/sunny.png";
import defaultSkinZuri from "./default-skins/zuri.png";

const OCEAN_THEME_DEFAULT_BG = "/ocean-theme-default.jpg";

// Small DOM helper (keeps your current style)
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const pickEl = (...ids: string[]) => ids.map((id) => document.getElementById(id)).find(Boolean) as HTMLElement | null;

// --- Core UI refs (IDs must match index.html) ---
const logsEl = $("logs") as HTMLPreElement;
const statusText = $("statusText");
const winBtnMin = $("winBtnMin") as HTMLButtonElement;
const winBtnMax = $("winBtnMax") as HTMLButtonElement;
const winBtnClose = $("winBtnClose") as HTMLButtonElement;
const windowTopbar = $("windowTopbar");
const windowTopbarPill = $("windowTopbarPill");
const startupSplash = $("startupSplash");
const startupSplashTitle = $("startupSplashTitle");
const startupSplashDetail = $("startupSplashDetail");
const appShell = $("appShell");

const instancesGrid = $("instancesGrid") as HTMLDivElement;
const searchInstances = $("searchInstances") as HTMLInputElement;

const navLibrary = $("navLibrary");
const navCapes = $("navCapes");
const navPlayit = $("navPlayit");
const navSettings = $("navSettings");
const sidebarCapesPreview = $("sidebarCapesPreview");
const sidebarCapesPreviewHost = $("sidebarCapesPreviewHost");
const sidebarSponsored = $("sidebarSponsored");
const sidebarSponsoredBy = $("sidebarSponsoredBy");
const sidebarSponsoredMedia = $("sidebarSponsoredMedia");
const sidebarSponsoredFrame = $("sidebarSponsoredFrame") as HTMLIFrameElement;
const sidebarSponsoredMediaImg = $("sidebarSponsoredMediaImg") as HTMLImageElement;
const sidebarSponsoredTitle = $("sidebarSponsoredTitle");
const sidebarSponsoredBody = $("sidebarSponsoredBody");
const sidebarSponsoredMediaText = $("sidebarSponsoredMediaText");
const sidebarSponsoredNote = $("sidebarSponsoredNote");
const sidebarSponsoredCta = $("sidebarSponsoredCta") as HTMLButtonElement;
const sidebarSponsoredUpgrade = $("sidebarSponsoredUpgrade") as HTMLButtonElement;
const consentBanner = $("consentBanner");
const consentAccept = $("consentAccept") as HTMLButtonElement;
const consentReject = $("consentReject") as HTMLButtonElement;
const consentSettings = $("consentSettings") as HTMLButtonElement;

const viewLibrary = $("viewLibrary");
const viewCapes = $("viewCapes");
const viewPlayit = $("viewPlayit");
const viewSettings = $("viewSettings");
const capesPanelRoot = $("capesPanelRoot");
const playitPanelRoot = $("playitPanelRoot");

const accountBtn = $("accountBtn");
const accountDropdown = $("accountDropdown");
const accountItems = $("accountItems");
const accountAdd = $("accountAdd");

const accountName = $("accountName");
const accountSub = $("accountSub");
const accountAvatarImg = $("accountAvatarImg") as HTMLImageElement;

const btnQuickLaunchLatestVanilla = $("btnQuickLaunchLatestVanilla");
const btnCreate = $("btnCreate");
const btnImport = $("btnImport");
const btnJoinPreferred = document.getElementById("btnJoinPreferred") as HTMLButtonElement | null;
const btnClearLogs = $("btnClearLogs");
const btnAnalyzeLogs = $("btnAnalyzeLogs");
const btnApplyDiagnosisFix = $("btnApplyDiagnosisFix") as HTMLButtonElement;
const btnToggleDiagnosisDetails = $("btnToggleDiagnosisDetails") as HTMLButtonElement;
const btnToggleDebugLogs = $("btnToggleDebugLogs") as HTMLButtonElement;
const btnCopyDiagnosisReport = $("btnCopyDiagnosisReport") as HTMLButtonElement;
const launchDiagnosis = $("launchDiagnosis");
const launchDiagnosisDetails = $("launchDiagnosisDetails");

// Apply icon-first button labels while keeping text readable.
function setButtonIcon(btn: HTMLButtonElement | null, svgPath: string) {
  if (!btn) return;
  const label = String(btn.textContent || "").trim();
  if (!label) return;
  btn.innerHTML = `
    <svg class="btnIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="${svgPath}" fill="currentColor"></path>
    </svg>
    <span>${label}</span>
  `;
}

const TRASH_ICON_PATH =
  "M9.5 3.5c0-.83.67-1.5 1.5-1.5h2c.83 0 1.5.67 1.5 1.5V4h3.75C19.77 4 21 5.23 21 6.75S19.77 9.5 18.25 9.5H18l-1.02 9.2A4 4 0 0 1 13 22H11a4 4 0 0 1-3.98-3.3L6 9.5h-.25A2.75 2.75 0 0 1 3 6.75C3 5.23 4.23 4 5.75 4H9.5z";
const STARTUP_REVEAL_TIMEOUT_MS = 2500;

function applyActionButtonIcons() {
  setButtonIcon(btnQuickLaunchLatestVanilla, "M5 5h10a4 4 0 1 1 0 8h-1v3l-4-3H5zM7 19h10v2H7z");
  setButtonIcon(btnCreate, "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z");
  setButtonIcon(btnImport, "M12 3v10.17l3.59-3.58L17 11l-5 5-5-5 1.41-1.41L11 13.17V3zM5 19h14v2H5z");
  setButtonIcon(btnJoinPreferred, "M4 6h16v10H4zM2 4h20v14H2zM6 20h12v2H6z");
  setButtonIcon(btnAnalyzeLogs, "M9 17H7V7h2zm4 0h-2V3h2zm4 0h-2v-8h2z");
  setButtonIcon(btnToggleDiagnosisDetails, "M11 17h2v2h-2zm0-12h2v10h-2z");
  setButtonIcon(btnToggleDebugLogs, "M3 4h18v2H3zm0 7h12v2H3zm0 7h18v2H3z");
  setButtonIcon(btnCopyDiagnosisReport, "M16 1H4v14h2V3h10zM8 7h12v16H8z");
  setButtonIcon(btnClearLogs, TRASH_ICON_PATH);
}
applyActionButtonIcons();

// Settings nav + panels
const settingsTabGeneral = $("settingsTabGeneral");
const settingsTabTheme = $("settingsTabTheme");
const settingsTabInstall = $("settingsTabInstall");
const settingsTabWindow = $("settingsTabWindow");
const settingsTabJava = $("settingsTabJava");
const settingsTabHooks = $("settingsTabHooks");
const settingsTabProfile = $("settingsTabProfile");

const settingsPanelGeneral = $("settingsPanelGeneral");
const settingsPanelTheme = $("settingsPanelTheme");
const settingsPanelInstall = $("settingsPanelInstall");
const settingsPanelWindow = $("settingsPanelWindow");
const settingsPanelJava = $("settingsPanelJava");
const settingsPanelHooks = $("settingsPanelHooks");
const settingsPanelProfile = $("settingsPanelProfile");
const customBgImageLayer = $("customBgImageLayer") as HTMLImageElement;

// Modal
const modalBackdrop = $("modalBackdrop");
const modalTitle = $("modalTitle");
const modalClose = $("modalClose");
const modalCancel = $("modalCancel");
const modalCreate = $("modalCreate");
const modalBusyOverlay = $("modalBusyOverlay");
const modalBusyTitle = $("modalBusyTitle");
const modalBusyDetail = $("modalBusyDetail");
const actionBusyBanner = $("actionBusyBanner");
const actionBusyTitle = $("actionBusyTitle");
const actionBusyDetail = $("actionBusyDetail");

const newName = $("newName") as HTMLInputElement;
const newVersion = $("newVersion") as HTMLSelectElement;
const newMem = $("newMem") as HTMLInputElement;

const modalTabGeneral = pickEl("modalTabGeneral");
const modalTabInstalled = pickEl("modalTabInstalled", "modalTabMods");
const modalTabDiscover = pickEl("modalTabDiscover", "modalTabPacks", "modalTabImport");
const modalPanelGeneral = pickEl("modalPanelGeneral");
const modalPanelInstalled = pickEl("modalPanelInstalled", "modalPanelMods");
const modalPanelDiscover = pickEl("modalPanelDiscover", "modalPanelPacks", "modalPanelImport");

const modalUpdateMods = $("modalUpdateMods") as HTMLButtonElement;
const modalInstalledHint = pickEl("modalInstalledHint", "modalModsHint");
const modalCompatGuidance = $("modalCompatGuidance");

const modalUploadLocalMod = $("modalUploadLocalMod");
const modalOpenInstanceFolder = $("modalOpenInstanceFolder");
const modalInstalledModsSearch = $("modalInstalledModsSearch") as HTMLInputElement;
const modalLocalModsList = $("modalLocalModsList");

const btnUploadResourcepack = $("btnUploadResourcepack");
const btnUploadShaderpack = $("btnUploadShaderpack");
const btnOpenInstanceFolder2 = $("btnOpenInstanceFolder2");
const btnOpenInstanceFolder3 = $("btnOpenInstanceFolder3");
const btnImportInstanceArchiveIntoCurrent = $("btnImportInstanceArchiveIntoCurrent");
const btnImportPackArchiveIntoCurrent = $("btnImportPackArchiveIntoCurrent");
const resourcepacksList = $("resourcepacksList");
const shaderpacksList = $("shaderpacksList");

const instanceAccount = $("instanceAccount") as HTMLSelectElement;
const instanceSyncEnabled = $("instanceSyncEnabled");
const instancePreset = $("instancePreset") as HTMLSelectElement;
const optProfile = $("optProfile") as HTMLSelectElement;
const btnOptimizeInstance = $("btnOptimizeInstance");
const btnRestoreOptimization = $("btnRestoreOptimization");
const btnRunBenchmark = $("btnRunBenchmark");
const serverNameInput = $("serverNameInput") as HTMLInputElement;
const serverAddressInput = $("serverAddressInput") as HTMLInputElement;
const btnSaveServerEntry = $("btnSaveServerEntry");
const serverList = $("serverList");
const btnExportServerProfile = $("btnExportServerProfile");
const btnImportServerProfile = $("btnImportServerProfile");
const createSourceCustom = $("createSourceCustom");
const createSourceImport = $("createSourceImport");
const createSourceModrinth = $("createSourceModrinth");
const createSourceCurseForge = $("createSourceCurseForge");
const createSourceTechnic = $("createSourceTechnic");
const createSourceATLauncher = $("createSourceATLauncher");
const createSourceFTB = $("createSourceFTB");
const createSourceHint = $("createSourceHint");
const createProviderImport = $("createProviderImport");
const createProviderMarketplace = $("createProviderMarketplace");
const createProviderMarketplaceTitle = $("createProviderMarketplaceTitle");
const createProviderMarketplaceHelp = $("createProviderMarketplaceHelp");
const createModrinthPanel = $("createModrinthPanel");
const createCurseForgePanel = $("createCurseForgePanel");
const localModrinthProfilesHelp = $("localModrinthProfilesHelp");
const localModrinthProfilesSelect = $("localModrinthProfilesSelect") as HTMLSelectElement;
const btnRefreshLocalModrinthProfiles = $("btnRefreshLocalModrinthProfiles");
const btnImportLocalModrinthProfile = $("btnImportLocalModrinthProfile");
const localCurseForgeProfilesHelp = $("localCurseForgeProfilesHelp");
const localCurseForgeProfilesSelect = $("localCurseForgeProfilesSelect") as HTMLSelectElement;
const btnRefreshLocalCurseForgeProfiles = $("btnRefreshLocalCurseForgeProfiles");
const btnImportLocalCurseForgeProfile = $("btnImportLocalCurseForgeProfile");
const providerArchiveActions = $("providerArchiveActions");
const providerArchiveHelp = $("providerArchiveHelp");
const providerSearchInput = $("providerSearchInput") as HTMLInputElement;
const btnProviderSearch = $("btnProviderSearch");
const providerResultsLabel = $("providerResultsLabel");
const providerSearchResults = $("providerSearchResults");
const btnProviderImportArchive = $("btnProviderImportArchive");
const modrinthSearchInput = $("modrinthSearchInput") as HTMLInputElement;
const btnModrinthSearch = $("btnModrinthSearch");
const modrinthResultsLabel = $("modrinthResultsLabel");
const modrinthSearchResults = $("modrinthSearchResults");
const instanceContentSearchKind = $("instanceContentSearchKind") as HTMLSelectElement;
const instanceContentSearchInput = $("instanceContentSearchInput") as HTMLInputElement;
const instanceContentSearchBtn = $("instanceContentSearchBtn");
const instanceContentResultsLabel = $("instanceContentResultsLabel");
const instanceContentSearchResults = $("instanceContentSearchResults");
const instanceModrinthSearchInput = $("instanceModrinthSearchInput") as HTMLInputElement;
const instanceModrinthSearchBtn = $("instanceModrinthSearchBtn");
const instanceModrinthResultsLabel = $("instanceModrinthResultsLabel");
const instanceModrinthSearchResults = $("instanceModrinthSearchResults");
const btnPickInstanceIcon = $("btnPickInstanceIcon");
const btnClearInstanceIcon = $("btnClearInstanceIcon");
const btnResetInstanceIconTransform = $("btnResetInstanceIconTransform");
setButtonIcon(btnClearInstanceIcon as HTMLButtonElement | null, TRASH_ICON_PATH);
const instanceIconHint = $("instanceIconHint");
const instanceIconPreviewWrap = $("instanceIconPreviewWrap");
const instanceIconPreviewFrame = $("instanceIconPreviewFrame");
const instanceIconPreviewStatus = $("instanceIconPreviewStatus");
const instanceIconPreviewImage = $("instanceIconPreviewImage") as HTMLImageElement;
const instanceIconTransformControls = $("instanceIconTransformControls");
const instanceIconScale = $("instanceIconScale") as HTMLInputElement;
const instanceIconScaleValue = $("instanceIconScaleValue");
const instanceIconOffsetX = $("instanceIconOffsetX") as HTMLInputElement;
const instanceIconOffsetXValue = $("instanceIconOffsetXValue");
const instanceIconOffsetY = $("instanceIconOffsetY") as HTMLInputElement;
const instanceIconOffsetYValue = $("instanceIconOffsetYValue");
const btnCreateImportNow = $("btnCreateImportNow");
const createCustomFields = $("createCustomFields");
const createFilterReleases = $("createFilterReleases");
const createFilterSnapshots = $("createFilterSnapshots");
const createLoaderType = $("createLoaderType") as HTMLSelectElement;
const createLoaderVersion = $("createLoaderVersion") as HTMLInputElement;
const createLoaderHint = $("createLoaderHint");

let state: any = {
  versions: [],
  accounts: null,
  launcherAccount: null,
  launcherSubscription: null,
  instances: null
};
let renderInstancesGeneration = 0;

type ModalTabId = "general" | "installed" | "discover";
let activeModalTab: ModalTabId = "general";
let modalBusyDepth = 0;
let globalBusyDepth = 0;
let localModrinthProfilesCache: any[] = [];
let localCurseForgeProfilesCache: any[] = [];

function getInstanceDisplayLoader(inst: any): LoaderKind {
  const display = String(inst?.displayLoader || "").trim().toLowerCase();
  if (display === "vanilla" || display === "fabric" || display === "quilt" || display === "forge" || display === "neoforge") {
    return display as LoaderKind;
  }
  return String(inst?.loader || "fabric").trim().toLowerCase() as LoaderKind;
}

function getEffectiveRuntimeLoader(loaderChoice: string): LoaderKind {
  const normalized = String(loaderChoice || "fabric").trim().toLowerCase();
  if (normalized === "vanilla") return "fabric";
  if (normalized === "fabric" || normalized === "quilt" || normalized === "forge" || normalized === "neoforge") {
    return normalized as LoaderKind;
  }
  return "fabric";
}

function getPersistedDisplayLoader(loaderChoice: string): LoaderKind | null {
  return String(loaderChoice || "").trim().toLowerCase() === "vanilla" ? "vanilla" : null;
}

function formatErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (!err) return fallback;
  if (typeof err === "string") {
    const trimmed = err.trim();
    return trimmed || fallback;
  }
  if (err instanceof Error) {
    const trimmed = String(err.message || "").trim();
    return trimmed || fallback;
  }
  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    for (const key of ["message", "error", "details", "cause"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (value && typeof value === "object") {
        const nested = formatErrorMessage(value, "");
        if (nested) return nested;
      }
    }
    try {
      const serialized = JSON.stringify(err);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Ignore serialization failures.
    }
  }
  return String(err) || fallback;
}

let busy = false;
let modalMode: "create" | "edit" = "create";
let editInstanceId: string | null = null;
let editServerId: string | null = null;
let launchLogBuffer: string[] = [];
let startupReady = false;
let startupRevealStarted = false;
let startupEmergencyRevealTimer: number | null = null;
let latestDiagnosis: any = null;
let diagnosisDetailsOpen = false;
let debugLogsVisible = false;
let capesSkinViewer: any = null;
let capesSkinControls: any = null;

type UpdaterUiState = {
  status: "idle" | "checking" | "update-available" | "up-to-date" | "downloading" | "downloaded" | "error";
  currentVersion: string;
  latestVersion?: string;
  progressPercent?: number;
  message?: string;
  updatedAt: number;
};

type CloudSyncUiState = {
  lastSyncedAt: number | null;
  lastStatus: "idle" | "up-to-date" | "pushed" | "pulled" | "conflict" | "error";
  lastError: string | null;
  lastRemoteRevision: number | null;
};

type PlayitTunnelUi = {
  id: string;
  name: string | null;
  tunnelType: string | null;
  portType: string | null;
  portCount: number;
  active: boolean;
  createdAt: string | null;
  localIp: string | null;
  localPort: string | number | null;
  assignedDomain: string | null;
  publicPort: number | null;
  joinAddress: string | null;
  allocationStatus: string | null;
  allocated: boolean;
  region: string | null;
  disabledReason: string | null;
};

type PlayitUiState = {
  linked: boolean;
  agentType: string;
  linkedAt: number | null;
  preferredRegion: string | null;
  autoTunnelEnabled: boolean;
  agentRunning: boolean;
  activeTunnels: PlayitTunnelUi[];
  hasSecretKey: boolean;
  lastError: string | null;
};

let updaterState: UpdaterUiState = {
  status: "idle",
  currentVersion: "unknown",
  message: "Updates not checked yet.",
  updatedAt: Date.now()
};
let cloudSyncState: CloudSyncUiState = {
  lastSyncedAt: null,
  lastStatus: "idle",
  lastError: null,
  lastRemoteRevision: null
};
let playitState: PlayitUiState = {
  linked: false,
  agentType: "fishbattery-launcher",
  linkedAt: null,
  preferredRegion: null,
  autoTunnelEnabled: false,
  agentRunning: false,
  activeTunnels: [],
  hasSecretKey: false,
  lastError: null
};
let playitSetupCodeDraft = "";
let playitTunnelNameDraft = "";
let playitTunnelPortDraft = "25565";
let playitTunnelModeDraft: "custom-udp" | "minecraft-java" | "custom-tcp" = "custom-udp";
const PLAYIT_SERVER_NOTE_PREFIX = "[playit]";
const PLAYIT_LAN_PORT_PATTERNS = [
  /local game hosted on port (\d+)/i,
  /started serving on (?:(?:[\w.\-]+|\*):)?(\d+)/i,
  /hosting game on (?:(?:[\w.\-]+|\*):)?(\d+)/i,
  /lan server.*port (\d+)/i
] as const;
const PLAYIT_LAN_CLOSED_PATTERNS = [
  /\bstopping integrated server\b/i,
  /\bstopping server\b/i,
  /\[render thread\/info\]: stopping!/i,
  /\bdisconnecting from singleplayer server\b/i
] as const;
let playitAutoTunnelBusy = false;
let playitAutoTunnelAttemptKey = "";
let playitAutoTunnelDisableBusy = false;
let cloudSyncIntervalId: number | null = null;
let runningStatusPollId: number | null = null;
let lastRunningSignature = "";
let profileRenderToken = 0;
let launcherSignInPromptShown = false;
let preflightState: any = null;
let hasAutoCheckedUpdates = false;
let promptedUpdateVersion: string | null = null;
let promptedInstallVersion: string | null = null;
let accountAvatarWarmupInFlight = false;
let updaterBusyIntent: "download" | "install" | null = null;
let createSource: "custom" | "import" | "modrinth" | "curseforge" | "technic" | "atlauncher" | "ftb" = "custom";
let createIncludeReleases = true;
let createIncludeSnapshots = false;
let selectedModrinthPack: {
  projectId: string;
  title: string;
  latestVersionId: string | null;
  iconUrl: string | null;
} | null = null;
let selectedProviderPack: { id: string; name: string; iconUrl?: string | null } | null = null;
let selectedCreateIconPath: string | null = null;
let clearExistingIconOnSave = false;
let selectedIconScalePct = 100;
let selectedIconOffsetXPct = 0;
let selectedIconOffsetYPct = 0;
let iconPreviewDragging = false;
let iconPreviewDragStartX = 0;
let iconPreviewDragStartY = 0;
let iconPreviewDragOriginX = 0;
startupEmergencyRevealTimer = window.setTimeout(() => {
  forceRevealStartupShell("Emergency startup fallback triggered before normal reveal.");
}, 3500);
let iconPreviewDragOriginY = 0;
let iconPreviewNaturalW = 0;
let iconPreviewNaturalH = 0;
let iconPreviewDragMaxShiftX = 0;
let iconPreviewDragMaxShiftY = 0;
let modalInstanceSyncEnabled = true;
type SponsoredBanner = {
  id?: string;
  title: string;
  body: string;
  cta: string;
  media: string;
  partner?: string;
  imageUrl?: string | null;
  mediaBg?: string | null;
  embedUrl?: string | null;
  impressionUrl?: string | null;
  clickUrl?: string | null;
  link: string;
};
let sponsoredIndex = 0;
let sponsoredBanners: SponsoredBanner[] = [];
let sponsoredCurrentLink = "";
let sponsoredCurrentEntry: SponsoredBanner | null = null;
let sponsoredRotateTimer: number | null = null;
let sponsoredLastImpressionId: string | null = null;
const SPONSORED_ROTATE_MS = 180_000;
const SPONSORED_INDEX_KEY = "fishbattery.launcherSponsoredIndex";

type SponsoredFeedAd = {
  id?: string;
  active?: boolean;
  placements?: string[];
  partner?: string;
  title?: string;
  body?: string;
  cta?: string;
  media?: string;
  imageUrl?: string;
  mediaBg?: string;
  embedUrl?: string;
  impressionUrl?: string;
  clickUrl?: string;
  link?: string;
};

const ADS_API_BASE_PRIMARY = "https://fishbattery-auth-api-production.up.railway.app";
const ADS_API_BASES = ["http://localhost:3000", ADS_API_BASE_PRIMARY];
const LAUNCHER_AD_PLACEMENT = "launcher-sidebar";
const DISCORD_INVITE_URL = "https://discord.gg/yT5zRsRXsf";
const AD_PRIVACY_URL = "https://fishbattery.app/privacy";

type MojangDefaultSkin = {
  key: string;
  name: string;
  variant: "CLASSIC" | "SLIM";
  sourceUrl: string;
};

const MOJANG_DEFAULT_SKINS: MojangDefaultSkin[] = [
  { key: "steve", name: "Steve", variant: "CLASSIC", sourceUrl: defaultSkinSteve },
  { key: "alex", name: "Alex", variant: "SLIM", sourceUrl: defaultSkinAlex },
  { key: "zuri", name: "Zuri", variant: "CLASSIC", sourceUrl: defaultSkinZuri },
  { key: "sunny", name: "Sunny", variant: "SLIM", sourceUrl: defaultSkinSunny },
  { key: "noor", name: "Noor", variant: "CLASSIC", sourceUrl: defaultSkinNoor },
  { key: "makena", name: "Makena", variant: "SLIM", sourceUrl: defaultSkinMakena },
  { key: "kai", name: "Kai", variant: "CLASSIC", sourceUrl: defaultSkinKai },
  { key: "efe", name: "Efe", variant: "SLIM", sourceUrl: defaultSkinEfe },
  { key: "ari", name: "Ari", variant: "CLASSIC", sourceUrl: defaultSkinAri }
];

type SkinUiSelectionState = {
  mode: "saved" | "default";
  defaultKey?: string;
  defaultSkinIds?: Record<string, string>;
  activeSavedId?: string;
};

const SKIN_UI_SELECTION_KEY = "fishbattery.skin-ui-selection.v1";
const SAVED_SKINS_KEY = "fishbattery.saved-skins.v1";
const OFFICIAL_CAPE_STATE_CACHE_KEY = "fishbattery.official-capes-cache.v1";

type SavedSkinEntry = {
  id: string;
  name: string;
  variant: "CLASSIC" | "SLIM";
  dataUrl: string;
  createdAt: number;
};

function normalizeHttpsUrl(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function readSkinUiSelectionMap(): Record<string, SkinUiSelectionState> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SKIN_UI_SELECTION_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSkinUiSelectionMap(map: Record<string, SkinUiSelectionState>) {
  try {
    localStorage.setItem(SKIN_UI_SELECTION_KEY, JSON.stringify(map));
  } catch {}
}

function getSkinUiSelection(accountId: string): SkinUiSelectionState {
  const map = readSkinUiSelectionMap();
  const hit = map[accountId];
  if (!hit || typeof hit !== "object") return { mode: "saved", defaultSkinIds: {} };
  return {
    mode: hit.mode === "default" ? "default" : "saved",
    defaultKey: typeof hit.defaultKey === "string" ? hit.defaultKey : undefined,
    defaultSkinIds: hit.defaultSkinIds && typeof hit.defaultSkinIds === "object" ? hit.defaultSkinIds : {},
    activeSavedId: typeof hit.activeSavedId === "string" ? hit.activeSavedId : undefined
  };
}

function setSkinUiSelection(accountId: string, patch: Partial<SkinUiSelectionState>) {
  if (!accountId) return;
  const map = readSkinUiSelectionMap();
  const current = getSkinUiSelection(accountId);
  map[accountId] = {
    ...current,
    ...patch,
    defaultSkinIds: {
      ...(current.defaultSkinIds || {}),
      ...(patch.defaultSkinIds || {})
    }
  };
  writeSkinUiSelectionMap(map);
}

function readSavedSkinsMap(): Record<string, SavedSkinEntry[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_SKINS_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeSavedSkinsMap(map: Record<string, SavedSkinEntry[]>) {
  try {
    localStorage.setItem(SAVED_SKINS_KEY, JSON.stringify(map));
  } catch {}
}

function getSavedSkins(accountId: string): SavedSkinEntry[] {
  if (!accountId) return [];
  const map = readSavedSkinsMap();
  const arr = map[accountId];
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => ({
      id: String(x?.id || "").trim(),
      name: String(x?.name || "").trim() || "Skin",
      variant: String(x?.variant || "").toUpperCase() === "SLIM" ? "SLIM" : "CLASSIC",
      dataUrl: String(x?.dataUrl || "").trim(),
      createdAt: Number(x?.createdAt || 0)
    }))
    .filter((x) => !!x.id && /^data:image\/png;base64,/i.test(x.dataUrl));
}

function setSavedSkins(accountId: string, skins: SavedSkinEntry[]) {
  if (!accountId) return;
  const map = readSavedSkinsMap();
  map[accountId] = skins;
  writeSavedSkinsMap(map);
}

function readOfficialCapeStateCacheMap(): Record<string, any> {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFICIAL_CAPE_STATE_CACHE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOfficialCapeStateCacheMap(map: Record<string, any>) {
  try {
    localStorage.setItem(OFFICIAL_CAPE_STATE_CACHE_KEY, JSON.stringify(map));
  } catch {}
}

function getOfficialCapeStateCache(accountId: string): any | null {
  if (!accountId) return null;
  const map = readOfficialCapeStateCacheMap();
  const hit = map[accountId];
  return hit && typeof hit === "object" ? hit : null;
}

function setOfficialCapeStateCache(accountId: string, state: any) {
  if (!accountId || !state || typeof state !== "object") return;
  const map = readOfficialCapeStateCacheMap();
  map[accountId] = state;
  writeOfficialCapeStateCacheMap(map);
}

// Get selected icon transform payload.
function getSelectedIconTransformPayload() {
  return {
    scale: Math.max(0.2, Math.min(5, selectedIconScalePct / 100)),
    offsetXPct: Math.max(-100, Math.min(100, selectedIconOffsetXPct)),
    offsetYPct: Math.max(-100, Math.min(100, selectedIconOffsetYPct))
  };
}

// Render icon transform ui.
function renderIconTransformUi() {
  instanceIconScale.value = String(selectedIconScalePct);
  instanceIconScaleValue.textContent = `${selectedIconScalePct}%`;
  instanceIconOffsetX.value = String(selectedIconOffsetXPct);
  instanceIconOffsetXValue.textContent = `${selectedIconOffsetXPct}%`;
  instanceIconOffsetY.value = String(selectedIconOffsetYPct);
  instanceIconOffsetYValue.textContent = `${selectedIconOffsetYPct}%`;
  renderIconPreviewTransform();
}

// Reset selected icon transform.
function resetSelectedIconTransform() {
  selectedIconScalePct = 100;
  selectedIconOffsetXPct = 0;
  selectedIconOffsetYPct = 0;
  renderIconTransformUi();
}

// Set icon preview source.
function setIconPreviewSource(iconToken: string | null) {
  void setIconPreviewSourceAsync(iconToken);
}

// Set icon preview source async.
async function setIconPreviewSourceAsync(iconToken: string | null) {
  if (!iconToken) {
    instanceIconPreviewWrap.style.display = "none";
    instanceIconTransformControls.style.display = "none";
    instanceIconPreviewImage.removeAttribute("src");
    instanceIconPreviewStatus.textContent = "Drag image to reposition. Scroll to zoom.";
    iconPreviewNaturalW = 0;
    iconPreviewNaturalH = 0;
    return;
  }
  instanceIconPreviewWrap.style.display = "";
  instanceIconTransformControls.style.display = "";
  instanceIconPreviewStatus.textContent = "Loading preview...";
  instanceIconPreviewImage.onload = () => {
    iconPreviewNaturalW = Number(instanceIconPreviewImage.naturalWidth || 0);
    iconPreviewNaturalH = Number(instanceIconPreviewImage.naturalHeight || 0);
    instanceIconPreviewStatus.textContent = "Drag image to reposition. Scroll to zoom.";
    instanceIconTransformControls.style.display = "";
    renderIconPreviewTransform();
  };
  instanceIconPreviewImage.onerror = () => {
    instanceIconPreviewStatus.textContent = "Could not load preview for this file.";
    instanceIconTransformControls.style.display = "none";
    instanceIconPreviewImage.removeAttribute("src");
    iconPreviewNaturalW = 0;
    iconPreviewNaturalH = 0;
  };
  try {
    const previewDataUrl = await backend.instancesPreviewIconDataUrl(iconToken);
    instanceIconPreviewImage.src = previewDataUrl;
  } catch {
    instanceIconPreviewStatus.textContent = "Could not load preview for this file.";
    instanceIconTransformControls.style.display = "none";
    instanceIconPreviewImage.removeAttribute("src");
    iconPreviewNaturalW = 0;
    iconPreviewNaturalH = 0;
  }
  renderIconPreviewTransform();
}

// Get icon preview layout.
function getIconPreviewLayout() {
  const frame = instanceIconPreviewFrame as HTMLElement;
  const frameW = Math.max(1, frame.clientWidth || 240);
  const frameH = Math.max(1, frame.clientHeight || 240);
  const srcW = Math.max(1, iconPreviewNaturalW || 1);
  const srcH = Math.max(1, iconPreviewNaturalH || 1);
  const scale = Math.max(0.2, Math.min(5, selectedIconScalePct / 100));
  const coverScale = Math.max(frameW / srcW, frameH / srcH) * scale;
  const displayW = srcW * coverScale;
  const displayH = srcH * coverScale;
  const maxShiftX = Math.max(0, (displayW - frameW) / 2);
  const maxShiftY = Math.max(0, (displayH - frameH) / 2);
  const shiftX = (selectedIconOffsetXPct / 100) * maxShiftX;
  const shiftY = (selectedIconOffsetYPct / 100) * maxShiftY;
  const left = (frameW - displayW) / 2 + shiftX;
  const top = (frameH - displayH) / 2 + shiftY;
  return { left, top, width: displayW, height: displayH, maxShiftX, maxShiftY };
}

// Render icon preview transform.
function renderIconPreviewTransform() {
  if (!selectedCreateIconPath || !iconPreviewNaturalW || !iconPreviewNaturalH) return;
  const layout = getIconPreviewLayout();
  instanceIconPreviewImage.style.left = `${layout.left}px`;
  instanceIconPreviewImage.style.top = `${layout.top}px`;
  instanceIconPreviewImage.style.width = `${layout.width}px`;
  instanceIconPreviewImage.style.height = `${layout.height}px`;
}

// ---------------- Settings ----------------
type LoaderKind = "vanilla" | "fabric" | "quilt" | "forge" | "neoforge";
type InstancePresetId = "none" | "max-fps" | "shader-friendly" | "distant-horizons-worldgen" | "pvp";
type McPresetBucket = "legacy" | "classic" | "modern" | "latest";
type InstancePresetVariantBase = {
  memoryMb: number;
  enableMods: string[];
  enablePacks: string[];
};
type InstancePresetVariant = InstancePresetVariantBase & {
  byMcBucket?: Partial<Record<McPresetBucket, Partial<InstancePresetVariantBase>>>;
};

type InstancePreset = {
  id: Exclude<InstancePresetId, "none">;
  name: string;
  description: string;
  variants: Partial<Record<LoaderKind, InstancePresetVariant>>;
};

type ThemeId =
  | "ocean"
  | "dark"
  | "oled"
  | "system-default"
  | "windows-xp"
  | "end-dimension"
  | "nether-core"
  | "ice-frost"
  | "prism-style"
  | "creeper-mode"
  | "retro-2000s"
  | "rgb-gamer"
  | "glass-modern-w11"
  | "console-mode"
  | "dynamic-accent"
  | "time-of-day"
  | "biome-plains"
  | "biome-desert"
  | "biome-jungle"
  | "biome-snow"
  | "biome-cherry-grove"
  | "developer-mode"
  | "minimal-bw";

const THEME_OPTIONS: Array<{ value: ThemeId; label: string }> = [
  { value: "ocean", label: "Ocean" },
  { value: "dark", label: "Dark" },
  { value: "oled", label: "OLED" },
  { value: "system-default", label: "System Default" },
  { value: "windows-xp", label: "Windows XP" },
  { value: "end-dimension", label: "End Dimension" },
  { value: "nether-core", label: "Nether Core" },
  { value: "ice-frost", label: "Ice / Frost" },
  { value: "prism-style", label: "Prism Style (Minimal Flat)" },
  { value: "creeper-mode", label: "Creeper Mode" },
  { value: "retro-2000s", label: "Retro 2000s" },
  { value: "rgb-gamer", label: "RGB Gamer" },
  { value: "glass-modern-w11", label: "Glass (Modern Windows 11)" },
  { value: "console-mode", label: "Console Mode" },
  { value: "dynamic-accent", label: "Dynamic Accent Theme" },
  { value: "time-of-day", label: "Time-of-Day Theme" },
  { value: "biome-plains", label: "Biome: Plains" },
  { value: "biome-desert", label: "Biome: Desert" },
  { value: "biome-jungle", label: "Biome: Jungle" },
  { value: "biome-snow", label: "Biome: Snow" },
  { value: "biome-cherry-grove", label: "Biome: Cherry Grove" },
  { value: "developer-mode", label: "Developer Mode" },
  { value: "minimal-bw", label: "Minimal B&W" }
];

const THEME_BEHAVIOR_TEXT: Record<ThemeId, string> = {
  ocean: "Calm blue/teal look with soft depth and smooth contrast.",
  dark: "Neutral charcoal UI optimized for readability during long sessions.",
  oled: "True-black high-contrast UI tuned for OLED displays.",
  "system-default": "Follows your OS dark/light appearance and adapts accent behavior.",
  "windows-xp": "Retro glossy XP-style chrome with classic blue desktop feel.",
  "end-dimension": "Deep violet atmosphere with soft glow accents.",
  "nether-core": "Dark red/orange high-energy style inspired by the Nether.",
  "ice-frost": "Cool frosted blues with crisp contrast and calm visuals.",
  "prism-style": "Minimal flat surfaces with a clean productivity-first layout.",
  "creeper-mode": "Matte dark base with bright creeper-green accents.",
  "retro-2000s": "Early-2000s glossy UI vibe with modern spacing.",
  "rgb-gamer": "Dark base with subtle animated neon color energy.",
  "glass-modern-w11": "Modern acrylic-style translucent panels and layered depth.",
  "console-mode": "Larger controls and spacing for dashboard-like usability.",
  "dynamic-accent": "User-driven accent, radius and border customization.",
  "time-of-day": "Auto-switches style through morning/day/evening/night.",
  "biome-plains": "Soft green natural palette inspired by plains biomes.",
  "biome-desert": "Warm sandy palette with subdued earth tones.",
  "biome-jungle": "Dense green contrast with humid jungle mood.",
  "biome-snow": "Cold pale palette inspired by snowy biomes.",
  "biome-cherry-grove": "Gentle pink/cherry tones with soft contrast.",
  "developer-mode": "Terminal-inspired mono style with utilitarian emphasis.",
  "minimal-bw": "Monochrome grayscale style focused on structure and clarity."
};

const THEME_DEFAULT_ACCENT: Record<Exclude<ThemeId, "system-default" | "time-of-day">, string> = {
  ocean: "#3ddc84",
  dark: "#57d2ff",
  oled: "#6ef3b2",
  "windows-xp": "#2f7fde",
  "end-dimension": "#b983ff",
  "nether-core": "#ff6b4d",
  "ice-frost": "#87d6ff",
  "prism-style": "#5ea3ff",
  "creeper-mode": "#62e566",
  "retro-2000s": "#7ac3ff",
  "rgb-gamer": "#5b8bff",
  "glass-modern-w11": "#C5E4F2",
  "console-mode": "#6bd5ff",
  "dynamic-accent": "#3ddc84",
  "biome-plains": "#8bd16f",
  "biome-desert": "#e6be72",
  "biome-jungle": "#4fd184",
  "biome-snow": "#98d5ff",
  "biome-cherry-grove": "#f49cd0",
  "developer-mode": "#8ad4ff",
  "minimal-bw": "#d9d9d9"
};

const PREMIUM_THEMES = new Set<ThemeId>([
  "windows-xp",
  "end-dimension",
  "nether-core",
  "ice-frost",
  "retro-2000s",
  "rgb-gamer",
  "glass-modern-w11",
  "console-mode",
  "dynamic-accent",
  "biome-jungle",
  "biome-snow",
  "biome-cherry-grove",
  "developer-mode"
]);

// Get launcher tier.
function getLauncherTier(): "free" | "premium" | "founder" {
  const fromStatus = state.launcherSubscription?.tier;
  if (fromStatus === "premium" || fromStatus === "founder") return fromStatus;
  const fromAccount = String(state.launcherAccount?.activeAccount?.subscriptionTier || "").toLowerCase();
  if (fromAccount === "premium" || fromAccount === "founder") return fromAccount;
  return "free";
}

// Has premium.
function hasPremium(): boolean {
  const tier = getLauncherTier();
  return tier === "premium" || tier === "founder";
}

// Local cape tier label.
function localCapeTierLabel(tier: "free" | "premium" | "founder") {
  if (tier === "founder") return "Founder";
  if (tier === "premium") return "Premium";
  return "Free";
}

// Open upgrade flow.
async function openUpgradeFlow() {
  const opened = await backend.launcherAccountOpenUpgradePage();
  if (!opened) {
    alert("Upgrade page could not be opened. Check FISHBATTERY_UPGRADE_URL or BILLING_UPGRADE_URL.");
  }
}

type AppSettings = {
  theme: ThemeId;
  blur: boolean; // maps to :root[data-glass="1"]
  accentColor: string;
  surfaceAlpha: number;
  cornerRadius: number;
  borderThickness: number;
  pixelFont: boolean;
  customBackgroundDataUrl: string;
  updateChannel: "stable" | "beta";
  showSnapshots: boolean;
  autoUpdateMods: boolean;
  defaultMemoryMb: number;
  fullscreen: boolean;
  winW: number;
  winH: number;
  jvmArgs: string;
  preLaunch: string;
  postExit: string;
  settingsUpdatedAt: number;
  cloudSyncEnabled: boolean;
  cloudSyncAuto: boolean;
  cloudSyncConflictPolicy: "ask" | "newer-wins" | "prefer-local" | "prefer-cloud";
  adsConsent: "unknown" | "granted" | "denied";
};

const SETTINGS_KEY = "fishbattery.settings";

const defaultSettings: AppSettings = {
  theme: "ocean",
  blur: true,
  accentColor: "#3ddc84",
  surfaceAlpha: 88,
  cornerRadius: 12,
  borderThickness: 1,
  pixelFont: false,
  customBackgroundDataUrl: "",
  updateChannel: "stable",
  showSnapshots: false,
  autoUpdateMods: true,
  defaultMemoryMb: 4096,
  fullscreen: false,
  winW: 854,
  winH: 480,
  jvmArgs: "",
  preLaunch: "",
  postExit: "",
  settingsUpdatedAt: Date.now(),
  cloudSyncEnabled: true,
  cloudSyncAuto: true,
  cloudSyncConflictPolicy: "ask",
  adsConsent: "unknown"
};

const THEME_ID_SET = new Set<ThemeId>(THEME_OPTIONS.map((o) => o.value));
const CATALOG_ID_SET = new Set(CATALOG.map((m) => m.id));

const FABRIC_MAX_FPS_MODS = [
  "sodium",
  "lithium",
  "ferrite-core",
  "indium",
  "immediatelyfast",
  "entityculling",
  "modernfix",
  "noisium",
  "starlight",
  "sodium-extra",
  "reeses-sodium-options",
  "moreculling",
  "rrls",
  "badoptimizations",
  "fastquit",
  "better-block-entities",
  "dynamic-fps",
  "fabric-api"
];
const QUILT_MAX_FPS_MODS = [
  "sodium",
  "lithium",
  "ferrite-core",
  "immediatelyfast",
  "entityculling",
  "modernfix",
  "noisium",
  "moreculling",
  "rrls",
  "badoptimizations",
  "fastquit",
  "dynamic-fps",
  "distanthorizons",
  "mod-menu"
];
const FORGE_MAX_FPS_MODS = [
  "embeddium",
  "embeddium-extra",
  "canary",
  "ferrite-core",
  "modernfix",
  "memoryleakfix",
  "entityculling",
  "saturn",
  "badoptimizations",
  "rrls",
  "dynamic-fps",
  "clumps",
  "distanthorizons"
];
const NEOFORGE_MAX_FPS_MODS = [
  "embeddium",
  "embeddium-extra",
  "canary",
  "ferrite-core",
  "modernfix",
  "memoryleakfix",
  "entityculling",
  "saturn",
  "badoptimizations",
  "rrls",
  "moreculling",
  "scalablelux",
  "dynamic-fps",
  "clumps",
  "distanthorizons"
];

const FABRIC_SHADER_MODS = [
  "sodium",
  "lithium",
  "ferrite-core",
  "indium",
  "immediatelyfast",
  "entityculling",
  "iris",
  "sodium-extra",
  "reeses-sodium-options",
  "moreculling",
  "enhanced-block-entities",
  "cull-leaves",
  "lambdynamiclights",
  "rrls",
  "badoptimizations",
  "fastquit",
  "dynamic-fps",
  "fabric-api"
];
const QUILT_SHADER_MODS = [
  "sodium",
  "lithium",
  "ferrite-core",
  "immediatelyfast",
  "entityculling",
  "iris",
  "moreculling",
  "enhanced-block-entities",
  "cull-leaves",
  "lambdynamiclights",
  "rrls",
  "badoptimizations",
  "fastquit",
  "dynamic-fps",
  "distanthorizons",
  "mod-menu"
];
const FORGE_SHADER_MODS = [
  "embeddium",
  "embeddium-extra",
  "oculus",
  "canary",
  "ferrite-core",
  "modernfix",
  "memoryleakfix",
  "entityculling",
  "cull-leaves",
  "rrls",
  "badoptimizations",
  "saturn",
  "fastquit-forge",
  "dynamic-fps",
  "clumps",
  "distanthorizons"
];
const NEOFORGE_SHADER_MODS = [
  "embeddium",
  "embeddium-extra",
  "oculus",
  "canary",
  "ferrite-core",
  "modernfix",
  "memoryleakfix",
  "entityculling",
  "moreculling",
  "cull-leaves",
  "lambdynamiclights",
  "rrls",
  "badoptimizations",
  "saturn",
  "dynamic-fps",
  "clumps",
  "scalablelux",
  "distanthorizons"
];

const FABRIC_WORLDGEN_MODS = [
  "sodium",
  "lithium",
  "ferrite-core",
  "indium",
  "immediatelyfast",
  "entityculling",
  "modernfix",
  "noisium",
  "starlight",
  "sodium-extra",
  "reeses-sodium-options",
  "distanthorizons",
  "fabric-api"
];
const QUILT_WORLDGEN_MODS = [
  "sodium",
  "lithium",
  "ferrite-core",
  "immediatelyfast",
  "entityculling",
  "modernfix",
  "noisium",
  "distanthorizons",
  "dynamic-fps",
  "mod-menu"
];
const FORGE_WORLDGEN_MODS = [
  "embeddium",
  "canary",
  "ferrite-core",
  "modernfix",
  "memoryleakfix",
  "entityculling",
  "dynamic-fps",
  "clumps",
  "distanthorizons"
];
const NEOFORGE_WORLDGEN_MODS = [
  "embeddium",
  "canary",
  "ferrite-core",
  "modernfix",
  "memoryleakfix",
  "entityculling",
  "dynamic-fps",
  "clumps",
  "distanthorizons"
];

const FABRIC_PVP_MODS = [
  "sodium",
  "lithium",
  "ferrite-core",
  "immediatelyfast",
  "entityculling",
  "dynamic-fps",
  "sodium-extra",
  "reeses-sodium-options",
  "no-chat-reports",
  "totemcounter",
  "potioncounter",
  "wi-zoom",
  "zoomify",
  "status-effect-timer",
  "fast-ip-ping",
  "moreculling",
  "rrls",
  "sodium-dynamic-lights",
  "scalablelux",
  "rebind-quick-swap",
  "shulkerboxtooltip",
  "appleskin",
  "pvp-essentials-refined",
  "mod-menu",
  "fabric-api"
];
const QUILT_PVP_MODS = ["sodium", "lithium", "ferrite-core", "immediatelyfast", "entityculling", "dynamic-fps", "mod-menu"];
const FORGE_PVP_MODS = [
  "embeddium",
  "embeddium-extra",
  "canary",
  "ferrite-core",
  "modernfix",
  "memoryleakfix",
  "entityculling",
  "dynamic-fps",
  "clumps",
  "xaeros-minimap",
  "xaeros-world-map",
  "appleskin",
  "toggle-sprint",
  "no-chat-reports",
  "rrls"
];
const NEOFORGE_PVP_MODS = [
  "embeddium",
  "embeddium-extra",
  "canary",
  "ferrite-core",
  "modernfix",
  "memoryleakfix",
  "entityculling",
  "dynamic-fps",
  "clumps",
  "xaeros-minimap",
  "xaeros-world-map",
  "appleskin",
  "toggle-sprint",
  "no-chat-reports",
  "rrls",
  "moreculling",
  "scalablelux"
];

const INSTANCE_PRESETS: Record<Exclude<InstancePresetId, "none">, InstancePreset> = {
  "max-fps": {
    id: "max-fps",
    name: "Max FPS",
    description: "Prioritizes frame rate and frametime stability with low-overhead visual defaults.",
    variants: {
      fabric: {
        memoryMb: 4096,
        enableMods: FABRIC_MAX_FPS_MODS,
        enablePacks: ["fast-better-grass", "better-leaves"],
        byMcBucket: {
          legacy: { memoryMb: 3072, enableMods: [] },
          classic: {
            memoryMb: 4096,
            enableMods: [
              "sodium",
              "lithium",
              "ferrite-core",
              "indium",
              "immediatelyfast",
              "entityculling",
              "moreculling",
              "rrls",
              "badoptimizations",
              "fastquit",
              "better-block-entities",
              "dynamic-fps",
              "fabric-api"
            ]
          },
          latest: {
            memoryMb: 4608,
            enableMods: [
              "sodium",
              "lithium",
              "ferrite-core",
              "indium",
              "immediatelyfast",
              "entityculling",
              "modernfix",
              "noisium",
              "starlight",
              "sodium-extra",
              "reeses-sodium-options",
              "moreculling",
              "rrls",
              "badoptimizations",
              "fastquit",
              "better-block-entities",
              "dynamic-fps",
              "fabric-api"
            ]
          }
        }
      },
      vanilla: { memoryMb: 4096, enableMods: [], enablePacks: ["fast-better-grass", "better-leaves"] },
      quilt: {
        memoryMb: 4096,
        enableMods: QUILT_MAX_FPS_MODS,
        enablePacks: ["fast-better-grass", "better-leaves"],
        byMcBucket: {
          legacy: { memoryMb: 3072, enableMods: [] },
          classic: {
            memoryMb: 4096,
            enableMods: ["sodium", "lithium", "ferrite-core", "entityculling", "moreculling", "rrls", "badoptimizations", "fastquit", "dynamic-fps"]
          }
        }
      },
      forge: {
        memoryMb: 6144,
        enableMods: FORGE_MAX_FPS_MODS,
        enablePacks: ["fast-better-grass", "better-leaves"],
        byMcBucket: {
          legacy: { memoryMb: 4096, enableMods: ["ferrite-core", "modernfix", "entityculling", "dynamic-fps", "clumps"] },
          classic: {
            memoryMb: 5120,
            enableMods: ["ferrite-core", "entityculling", "saturn", "badoptimizations", "rrls", "dynamic-fps"]
          }
        }
      },
      neoforge: {
        memoryMb: 6144,
        enableMods: NEOFORGE_MAX_FPS_MODS,
        enablePacks: ["fast-better-grass", "better-leaves"],
        byMcBucket: {
          legacy: { memoryMb: 4096, enableMods: [] },
          classic: {
            memoryMb: 5120,
            enableMods: ["ferrite-core", "entityculling", "saturn", "badoptimizations", "rrls", "moreculling", "dynamic-fps"]
          }
        }
      }
    }
  },
  "shader-friendly": {
    id: "shader-friendly",
    name: "Shader Friendly",
    description: "Keeps shader compatibility/performance balance and enables a curated shader stack.",
    variants: {
      fabric: {
        memoryMb: 6144,
        enableMods: FABRIC_SHADER_MODS,
        enablePacks: ["complementary-reimagined", "dramatic-skys", "xalis-enchanted-books", "fresh-animations"],
        byMcBucket: {
          legacy: { memoryMb: 4096, enableMods: [] },
          classic: {
            memoryMb: 5120,
            enableMods: [
              "sodium",
              "lithium",
              "ferrite-core",
              "indium",
              "immediatelyfast",
              "entityculling",
              "cull-leaves",
              "rrls",
              "badoptimizations",
              "fastquit",
              "dynamic-fps",
              "fabric-api"
            ],
            enablePacks: ["dramatic-skys", "xalis-enchanted-books"]
          }
        }
      },
      vanilla: {
        memoryMb: 6144,
        enableMods: [],
        enablePacks: ["complementary-reimagined", "dramatic-skys", "xalis-enchanted-books", "fresh-animations"]
      },
      quilt: {
        memoryMb: 6144,
        enableMods: QUILT_SHADER_MODS,
        enablePacks: ["complementary-reimagined", "dramatic-skys", "xalis-enchanted-books", "fresh-animations"],
        byMcBucket: {
          legacy: { memoryMb: 4096, enableMods: [] },
          classic: {
            memoryMb: 5120,
            enableMods: ["sodium", "lithium", "ferrite-core", "entityculling", "cull-leaves", "rrls", "badoptimizations", "dynamic-fps"]
          }
        }
      },
      forge: {
        memoryMb: 7168,
        enableMods: FORGE_SHADER_MODS,
        enablePacks: ["complementary-reimagined", "dramatic-skys", "xalis-enchanted-books", "fresh-animations"],
        byMcBucket: {
          legacy: { memoryMb: 4096, enableMods: ["ferrite-core", "modernfix", "entityculling", "dynamic-fps", "clumps"] },
          classic: {
            memoryMb: 5632,
            enableMods: ["ferrite-core", "entityculling", "cull-leaves", "rrls", "badoptimizations", "dynamic-fps"]
          }
        }
      },
      neoforge: {
        memoryMb: 7168,
        enableMods: NEOFORGE_SHADER_MODS,
        enablePacks: ["complementary-reimagined", "dramatic-skys", "xalis-enchanted-books", "fresh-animations"],
        byMcBucket: {
          legacy: { memoryMb: 4096, enableMods: [] },
          classic: {
            memoryMb: 5632,
            enableMods: ["ferrite-core", "entityculling", "moreculling", "cull-leaves", "rrls", "badoptimizations", "dynamic-fps"]
          }
        }
      }
    }
  },
  "distant-horizons-worldgen": {
    id: "distant-horizons-worldgen",
    name: "Distant Horizons Worldgen Mode",
    description: "Optimized for long-distance terrain generation and traversal-heavy worlds.",
    variants: {
      fabric: {
        memoryMb: 8192,
        enableMods: FABRIC_WORLDGEN_MODS,
        enablePacks: ["fast-better-grass", "better-leaves"],
        byMcBucket: {
          legacy: { memoryMb: 4096, enableMods: [] },
          classic: {
            memoryMb: 6144,
            enableMods: [
              "sodium",
              "lithium",
              "ferrite-core",
              "indium",
              "immediatelyfast",
              "entityculling",
              "modernfix",
              "starlight",
              "dynamic-fps",
              "fabric-api"
            ]
          },
          latest: {
            memoryMb: 9216,
            enableMods: [
              "sodium",
              "lithium",
              "ferrite-core",
              "indium",
              "immediatelyfast",
              "entityculling",
              "modernfix",
              "noisium",
              "starlight",
              "distanthorizons",
              "sodium-extra",
              "reeses-sodium-options",
              "fabric-api"
            ]
          }
        }
      },
      vanilla: { memoryMb: 7168, enableMods: [], enablePacks: ["fast-better-grass", "better-leaves"] },
      quilt: {
        memoryMb: 7168,
        enableMods: QUILT_WORLDGEN_MODS,
        enablePacks: ["fast-better-grass", "better-leaves"],
        byMcBucket: {
          legacy: { memoryMb: 4096, enableMods: [] },
          classic: { memoryMb: 5632, enableMods: ["sodium", "lithium", "ferrite-core", "entityculling", "dynamic-fps"] }
        }
      },
      forge: {
        memoryMb: 8192,
        enableMods: FORGE_WORLDGEN_MODS,
        enablePacks: ["fast-better-grass", "better-leaves"],
        byMcBucket: {
          legacy: { memoryMb: 4096, enableMods: ["ferrite-core", "modernfix", "entityculling", "dynamic-fps", "clumps"] },
          classic: { memoryMb: 6144, enableMods: ["ferrite-core", "entityculling", "dynamic-fps"] },
          latest: { memoryMb: 9216 }
        }
      },
      neoforge: {
        memoryMb: 8192,
        enableMods: NEOFORGE_WORLDGEN_MODS,
        enablePacks: ["fast-better-grass", "better-leaves"],
        byMcBucket: {
          legacy: { memoryMb: 4096, enableMods: [] },
          classic: { memoryMb: 6144, enableMods: [] },
          latest: { memoryMb: 9216 }
        }
      }
    }
  },
  pvp: {
    id: "pvp",
    name: "PvP Ready",
    description: "Low-latency visual clarity profile for competitive play without cheat-style modifications.",
    variants: {
      fabric: {
        memoryMb: 4096,
        enableMods: FABRIC_PVP_MODS,
        enablePacks: ["xalis-enchanted-books", "f8thful"],
        byMcBucket: {
          legacy: { memoryMb: 3072, enableMods: [] },
          classic: {
            memoryMb: 4096,
            enableMods: [
              "sodium",
              "lithium",
              "ferrite-core",
              "immediatelyfast",
              "entityculling",
              "dynamic-fps",
              "zoomify",
              "status-effect-timer",
              "moreculling",
              "rrls",
              "mod-menu",
              "fabric-api"
            ]
          },
          latest: {
            memoryMb: 4608,
            enableMods: [
              "sodium",
              "lithium",
              "ferrite-core",
              "immediatelyfast",
              "entityculling",
              "modernfix",
              "noisium",
              "sodium-extra",
              "reeses-sodium-options",
              "dynamic-fps",
              "no-chat-reports",
              "totemcounter",
              "potioncounter",
              "wi-zoom",
              "zoomify",
              "status-effect-timer",
              "fast-ip-ping",
              "moreculling",
              "rrls",
              "sodium-dynamic-lights",
              "scalablelux",
              "rebind-quick-swap",
              "shulkerboxtooltip",
              "appleskin",
              "pvp-essentials-refined",
              "mod-menu",
              "fabric-api"
            ]
          }
        }
      },
      vanilla: { memoryMb: 4096, enableMods: [], enablePacks: ["xalis-enchanted-books", "f8thful"] },
      quilt: {
        memoryMb: 4096,
        enableMods: QUILT_PVP_MODS,
        enablePacks: ["xalis-enchanted-books", "f8thful"],
        byMcBucket: {
          legacy: { memoryMb: 3072, enableMods: [] },
          classic: { memoryMb: 4096, enableMods: ["sodium", "lithium", "ferrite-core", "entityculling", "dynamic-fps"] }
        }
      },
      forge: {
        memoryMb: 5120,
        enableMods: FORGE_PVP_MODS,
        enablePacks: ["xalis-enchanted-books", "f8thful"],
        byMcBucket: {
          legacy: {
            memoryMb: 3584,
            enableMods: [
              "polypatcher",
              "polysprint",
              "phosphor-legacy-forge",
              "hytils-reborn",
              "xaeros-minimap",
              "xaeros-world-map",
              "appleskin",
              "toggle-sprint",
              "fps-reducer",
              "entityculling",
              "dynamic-fps",
              "clumps"
            ]
          },
          classic: {
            memoryMb: 4608,
            enableMods: [
              "ferrite-core",
              "entityculling",
              "dynamic-fps",
              "xaeros-minimap",
              "xaeros-world-map",
              "appleskin",
              "toggle-sprint",
              "no-chat-reports",
              "rrls"
            ]
          },
          latest: {
            memoryMb: 5632,
            enableMods: [
              "embeddium",
              "embeddium-extra",
              "canary",
              "ferrite-core",
              "modernfix",
              "memoryleakfix",
              "entityculling",
              "dynamic-fps",
              "xaeros-minimap",
              "xaeros-world-map",
              "appleskin",
              "toggle-sprint",
              "no-chat-reports",
              "rrls"
            ]
          }
        }
      },
      neoforge: {
        memoryMb: 5120,
        enableMods: NEOFORGE_PVP_MODS,
        enablePacks: ["xalis-enchanted-books", "f8thful"],
        byMcBucket: {
          legacy: { memoryMb: 3584, enableMods: [] },
          classic: {
            memoryMb: 4608,
            enableMods: [
              "ferrite-core",
              "entityculling",
              "dynamic-fps",
              "xaeros-minimap",
              "xaeros-world-map",
              "appleskin",
              "toggle-sprint",
              "no-chat-reports",
              "rrls",
              "moreculling"
            ]
          },
          latest: {
            memoryMb: 5632,
            enableMods: [
              "embeddium",
              "embeddium-extra",
              "canary",
              "ferrite-core",
              "modernfix",
              "memoryleakfix",
              "entityculling",
              "dynamic-fps",
              "xaeros-minimap",
              "xaeros-world-map",
              "appleskin",
              "toggle-sprint",
              "no-chat-reports",
              "rrls",
              "moreculling",
              "scalablelux"
            ]
          }
        }
      }
    }
  }
};

const PRESET_MODRINTH_PACK_PROJECTS: Partial<Record<Exclude<InstancePresetId, "none">, string>> = {
  "max-fps": "fishbattery-fps",
  pvp: "fishbattery-pvp"
};

type PresetModFallbackChains = Partial<Record<Exclude<InstancePresetId, "none">, Record<string, string[]>>>;
const PRESET_MOD_FALLBACKS: PresetModFallbackChains = {
  "max-fps": {
    embeddium: ["sodium", "ferrite-core", "modernfix", "entityculling"],
    "embeddium-extra": ["dynamic-fps", "entityculling"],
    canary: ["lithium", "modernfix", "ferrite-core"],
    memoryleakfix: ["modernfix", "ferrite-core"],
    saturn: ["ferrite-core", "modernfix", "entityculling"],
    badoptimizations: ["modernfix", "entityculling", "dynamic-fps"],
    fastquit: ["dynamic-fps", "entityculling"],
    "better-block-entities": ["moreculling", "entityculling", "dynamic-fps"],
    moreculling: ["entityculling", "dynamic-fps", "ferrite-core"],
    rrls: ["dynamic-fps", "entityculling", "modernfix"],
    clumps: ["dynamic-fps", "entityculling"],
    c2me: ["noisium", "starlight", "modernfix"],
    starlight: ["noisium", "modernfix"],
    indium: ["sodium-extra", "reeses-sodium-options"]
  },
  "shader-friendly": {
    oculus: ["iris", "embeddium", "dynamic-fps"],
    embeddium: ["sodium", "ferrite-core", "modernfix", "entityculling"],
    "embeddium-extra": ["sodium-extra", "dynamic-fps", "entityculling"],
    canary: ["lithium", "modernfix", "ferrite-core"],
    iris: ["indium", "sodium-extra", "dynamic-fps"],
    indium: ["sodium-extra", "reeses-sodium-options"],
    lambdynamiclights: ["sodium-dynamic-lights", "dynamic-fps", "entityculling"],
    "enhanced-block-entities": ["better-block-entities", "moreculling", "entityculling"],
    "cull-leaves": ["moreculling", "entityculling", "dynamic-fps"],
    "fastquit-forge": ["fastquit", "dynamic-fps", "entityculling"],
    saturn: ["modernfix", "ferrite-core", "entityculling"],
    badoptimizations: ["modernfix", "entityculling", "dynamic-fps"],
    fastquit: ["dynamic-fps", "entityculling"]
  },
  "distant-horizons-worldgen": {
    embeddium: ["sodium", "ferrite-core", "modernfix", "entityculling"],
    canary: ["lithium", "modernfix", "ferrite-core"],
    memoryleakfix: ["modernfix", "ferrite-core"],
    distanthorizons: ["c2me", "noisium", "starlight"],
    c2me: ["noisium", "starlight", "modernfix"]
  },
  pvp: {
    embeddium: ["sodium", "dynamic-fps", "entityculling"],
    "embeddium-extra": ["sodium-extra", "dynamic-fps", "entityculling"],
    canary: ["lithium", "modernfix", "ferrite-core"],
    memoryleakfix: ["modernfix", "ferrite-core"],
    "pvp-essentials-refined": [
      "toggle-sprint",
      "xaeros-minimap",
      "xaeros-world-map",
      "appleskin",
      "totemcounter",
      "potioncounter",
      "wi-zoom",
      "zoomify",
      "no-chat-reports",
      "fps-reducer",
      "dynamic-fps",
      "entityculling",
      "sodium-extra",
      "mod-menu"
    ],
    "no-chat-reports": ["mod-menu", "dynamic-fps", "entityculling"],
    totemcounter: ["potioncounter", "appleskin", "dynamic-fps"],
    potioncounter: ["appleskin", "dynamic-fps", "entityculling"],
    "wi-zoom": ["sodium-extra", "dynamic-fps", "entityculling"],
    zoomify: ["wi-zoom", "sodium-extra", "dynamic-fps"],
    "status-effect-timer": ["potioncounter", "appleskin", "mod-menu"],
    "fast-ip-ping": ["mod-menu", "dynamic-fps", "entityculling"],
    moreculling: ["entityculling", "dynamic-fps", "ferrite-core"],
    rrls: ["dynamic-fps", "entityculling", "modernfix"],
    "sodium-dynamic-lights": ["sodium-extra", "dynamic-fps", "entityculling"],
    scalablelux: ["sodium-extra", "dynamic-fps", "entityculling"],
    polypatcher: ["phosphor-legacy-forge", "entityculling", "dynamic-fps"],
    polysprint: ["toggle-sprint", "dynamic-fps", "entityculling"],
    "phosphor-legacy-forge": ["entityculling", "dynamic-fps", "ferrite-core"],
    "hytils-reborn": ["xaeros-minimap", "toggle-sprint", "dynamic-fps"],
    "rebind-quick-swap": ["mod-menu", "dynamic-fps", "entityculling"],
    shulkerboxtooltip: ["mod-menu", "appleskin", "dynamic-fps"],
    "toggle-sprint": ["dynamic-fps", "entityculling", "sodium-extra"],
    "xaeros-world-map": ["xaeros-minimap", "dynamic-fps", "entityculling"],
    "appleskin": ["dynamic-fps", "entityculling"],
    "fps-reducer": ["dynamic-fps", "entityculling"],
    sodium: ["immediatelyfast", "entityculling", "dynamic-fps"]
  }
};

const PRESET_SHARED_FALLBACKS: Partial<Record<Exclude<InstancePresetId, "none">, string[]>> = {
  "max-fps": [
    "dynamic-fps",
    "entityculling",
    "immediatelyfast",
    "modernfix",
    "lithium",
    "ferrite-core",
    "moreculling",
    "rrls",
    "badoptimizations",
    "fastquit",
    "better-block-entities",
    "saturn",
    "embeddium",
    "canary",
    "memoryleakfix"
  ],
  "shader-friendly": [
    "dynamic-fps",
    "entityculling",
    "immediatelyfast",
    "lithium",
    "ferrite-core",
    "sodium-extra",
    "moreculling",
    "enhanced-block-entities",
    "cull-leaves",
    "lambdynamiclights",
    "rrls",
    "badoptimizations",
    "fastquit",
    "fastquit-forge",
    "saturn",
    "embeddium",
    "oculus",
    "canary"
  ],
  "distant-horizons-worldgen": ["noisium", "starlight", "c2me", "modernfix", "dynamic-fps", "entityculling", "embeddium", "canary", "memoryleakfix"],
  pvp: [
    "dynamic-fps",
    "entityculling",
    "immediatelyfast",
    "sodium-extra",
    "lithium",
    "ferrite-core",
    "mod-menu",
    "no-chat-reports",
    "totemcounter",
    "potioncounter",
    "wi-zoom",
    "zoomify",
    "status-effect-timer",
    "fast-ip-ping",
    "moreculling",
    "rrls",
    "sodium-dynamic-lights",
    "scalablelux",
    "polypatcher",
    "polysprint",
    "phosphor-legacy-forge",
    "hytils-reborn",
    "rebind-quick-swap",
    "shulkerboxtooltip",
    "embeddium",
    "canary",
    "toggle-sprint",
    "xaeros-minimap",
    "xaeros-world-map",
    "appleskin",
    "fps-reducer",
    "clumps"
  ]
};

const GLOBAL_SAFE_FALLBACKS = [
  "dynamic-fps",
  "entityculling",
  "immediatelyfast",
  "lithium",
  "ferrite-core",
  "modernfix",
  "memoryleakfix",
  "clumps",
  "embeddium",
  "canary",
  "toggle-sprint",
  "xaeros-minimap",
  "xaeros-world-map",
  "appleskin",
  "fps-reducer",
  "sodium-extra",
  "reeses-sodium-options",
  "moreculling",
  "rrls",
  "badoptimizations",
  "fastquit",
  "fastquit-forge",
  "better-block-entities",
  "enhanced-block-entities",
  "cull-leaves",
  "lambdynamiclights",
  "saturn",
  "mod-menu",
  "no-chat-reports",
  "totemcounter",
  "potioncounter",
  "wi-zoom",
  "zoomify",
  "status-effect-timer",
  "fast-ip-ping",
  "moreculling",
  "rrls",
  "sodium-dynamic-lights",
  "scalablelux",
  "polypatcher",
  "polysprint",
  "phosphor-legacy-forge",
  "hytils-reborn",
  "rebind-quick-swap",
  "shulkerboxtooltip"
];

function uniqueCatalogIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id) || !CATALOG_ID_SET.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function uniqueIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function resolvePresetMcBucket(mcVersion: string): McPresetBucket {
  const normalized = String(mcVersion || "").trim().toLowerCase();
  const m = normalized.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return "latest";
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return "latest";
  if (major < 1) return "legacy";
  if (major > 1) return "latest";
  if (minor <= 12) return "legacy";
  if (minor <= 16) return "classic";
  if (minor <= 20) return "modern";
  return "latest";
}

function materializePresetVariant(variant: InstancePresetVariant, mcVersion: string): { variant: InstancePresetVariantBase; bucket: McPresetBucket } {
  const bucket = resolvePresetMcBucket(mcVersion);
  const override = variant.byMcBucket?.[bucket] ?? {};
  return {
    bucket,
    variant: {
      memoryMb: Number(override.memoryMb ?? variant.memoryMb),
      enableMods: uniqueCatalogIds(Array.isArray(override.enableMods) ? override.enableMods : variant.enableMods),
      enablePacks: uniqueIds(Array.isArray(override.enablePacks) ? override.enablePacks : variant.enablePacks)
    }
  };
}

const MOD_ALTERNATIVES: Record<string, string[]> = {
  sodium: ["Try the Shader Friendly path (Iris + Sodium).", "Use Max FPS preset for a known-good baseline."],
  embeddium: ["Fallback to Sodium on Fabric/Quilt.", "Use FerriteCore + ModernFix when Embeddium build is unavailable."],
  oculus: ["Fallback to Iris on Fabric/Quilt.", "Use Embeddium + performance preset if shader bridge is unavailable."],
  canary: ["Fallback to Lithium (Fabric/Quilt).", "Use ModernFix + FerriteCore when Canary build is unavailable."],
  "toggle-sprint": ["Fallback to Dynamic FPS + Entity Culling for lightweight PvP UX."],
  "xaeros-minimap": ["Fallback to Xaero's World Map or keep PvP HUD packs enabled."],
  "xaeros-world-map": ["Fallback to Xaero's Minimap for match navigation awareness."],
  appleskin: ["Fallback to PvP HUD texture packs when AppleSkin is unavailable."],
  "fps-reducer": ["Fallback to Dynamic FPS for background/frame pacing optimization."],
  iris: ["Use Max FPS preset when shaders are not required.", "Try Complementary Unbound/Photon after refreshing packs."],
  c2me: ["Use Noisium + Starlight as fallback worldgen optimization.", "Use Distant Horizons preset without C2ME."],
  distanthorizons: ["Use Max FPS preset for stable vanilla-distance rendering.", "Try C2ME + Noisium workflow for worldgen speed."],
  "pvp-essentials-refined": [
    "Use Dynamic FPS + Entity Culling as a cross-version competitive fallback.",
    "Keep the PvP resource packs enabled for readability while mod fallback activates."
  ]
};

// Get settings.
function getSettings(): AppSettings {
  try {
    const raw = { ...defaultSettings, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}) };
    const theme = THEME_ID_SET.has(raw.theme as ThemeId) ? (raw.theme as ThemeId) : defaultSettings.theme;
    const accentColor =
      typeof raw.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.accentColor)
        ? raw.accentColor
        : defaultSettings.accentColor;
    const surfaceAlpha = Math.max(
      70,
      Math.min(98, Number.isFinite(Number(raw.surfaceAlpha)) ? Number(raw.surfaceAlpha) : defaultSettings.surfaceAlpha)
    );
    const customBackgroundDataUrl =
      typeof raw.customBackgroundDataUrl === "string" && /^data:image\//.test(raw.customBackgroundDataUrl)
        ? raw.customBackgroundDataUrl
        : "";
    const cornerRadius = Math.max(
      8,
      Math.min(22, Number.isFinite(Number(raw.cornerRadius)) ? Number(raw.cornerRadius) : defaultSettings.cornerRadius)
    );
    const borderThickness = Math.max(
      1,
      Math.min(3, Number.isFinite(Number(raw.borderThickness)) ? Number(raw.borderThickness) : defaultSettings.borderThickness)
    );
    const pixelFont = !!raw.pixelFont;
    const settingsUpdatedAt = Math.max(
      0,
      Number.isFinite(Number(raw.settingsUpdatedAt)) ? Number(raw.settingsUpdatedAt) : defaultSettings.settingsUpdatedAt
    );
    const cloudSyncEnabled = raw.cloudSyncEnabled !== false;
    const cloudSyncAuto = raw.cloudSyncAuto !== false;
    const cloudSyncConflictPolicy =
      raw.cloudSyncConflictPolicy === "newer-wins" ||
      raw.cloudSyncConflictPolicy === "prefer-local" ||
      raw.cloudSyncConflictPolicy === "prefer-cloud"
        ? raw.cloudSyncConflictPolicy
        : "ask";
    const adsConsent =
      raw.adsConsent === "granted" || raw.adsConsent === "denied" ? raw.adsConsent : "unknown";
    return {
      ...raw,
      theme,
      accentColor,
      surfaceAlpha,
      customBackgroundDataUrl,
      cornerRadius,
      borderThickness,
      pixelFont,
      settingsUpdatedAt,
      cloudSyncEnabled,
      cloudSyncAuto,
      cloudSyncConflictPolicy,
      adsConsent
    };
  } catch {
    return { ...defaultSettings };
  }
}

// Set settings.
function setSettings(patch: Partial<AppSettings>, opts?: { touchUpdatedAt?: boolean }) {
  const next = { ...getSettings(), ...patch };
  if (opts?.touchUpdatedAt !== false && !Object.prototype.hasOwnProperty.call(patch, "settingsUpdatedAt")) {
    next.settingsUpdatedAt = Date.now();
  }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch (err: any) {
    alert(`Could not save setting: ${String(err?.message ?? err)}`);
    return;
  }
  applySettingsToDom(next);
}

// Hex to rgb triplet.
function hexToRgbTriplet(hex: string) {
  const m = String(hex || "").trim().match(/^#?([a-fA-F0-9]{6})$/);
  if (!m) return "61,220,132";
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

// Get system accent color.
function getSystemAccentColor() {
  if (navigator.platform.toLowerCase().includes("win")) return "#4cc2ff";
  if (navigator.platform.toLowerCase().includes("mac")) return "#5ac8fa";
  return "#50d1b8";
}

// Css color to hex.
function cssColorToHex(input: string): string | null {
  const raw = String(input || "").trim();
  const hex6 = raw.match(/^#([0-9a-fA-F]{6})$/);
  if (hex6) return `#${hex6[1].toLowerCase()}`;
  const hex3 = raw.match(/^#([0-9a-fA-F]{3})$/);
  if (hex3) {
    const h = hex3[1];
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }

  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
  if (!rgb) return null;
  const nums = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((n) => Math.max(0, Math.min(255, n)));
  return `#${nums.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

// Ideal symbol color.
function idealSymbolColor(bgHex: string): string {
  const m = String(bgHex || "").trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return "#d9ebfb";
  const hex = m[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#101820" : "#d9ebfb";
}

// Resolve effective theme.
function resolveEffectiveTheme(theme: ThemeId): Exclude<ThemeId, "system-default" | "time-of-day"> {
  if (theme === "system-default") {
    const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return dark ? "dark" : "ice-frost";
  }
  if (theme === "time-of-day") {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) return "oled";
    if (hour >= 5 && hour < 12) return "ice-frost";
    if (hour >= 12 && hour < 18) return "prism-style";
    if (hour >= 18 && hour < 22) return "dark";
    return "oled";
  }
  return theme;
}

// Default accent for theme.
function defaultAccentForTheme(theme: ThemeId): string {
  if (theme === "system-default") return getSystemAccentColor();
  const effective = resolveEffectiveTheme(theme);
  return THEME_DEFAULT_ACCENT[effective] || "#3ddc84";
}

// Apply settings to dom.
function applySettingsToDom(s: AppSettings) {
  const effectiveTheme = resolveEffectiveTheme(s.theme);

  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.dataset.themeSource = s.theme;
  document.documentElement.dataset.font = s.pixelFont ? "pixel" : "default";
  document.documentElement.dataset.glass = s.blur ? "1" : "0";
  const hasCustomBackground = !!s.customBackgroundDataUrl;
  const hasOceanThemeBackground = !hasCustomBackground && effectiveTheme === "ocean";
  document.documentElement.dataset.customBg = hasCustomBackground ? "1" : "0";
  document.documentElement.dataset.themeBg = hasOceanThemeBackground ? "1" : "0";
  document.documentElement.style.setProperty("--r12", `${Math.max(8, Math.min(22, s.cornerRadius || 12))}px`);
  document.documentElement.style.setProperty("--r16", `${Math.max(12, Math.min(28, (s.cornerRadius || 12) + 4))}px`);
  document.documentElement.style.setProperty("--stroke-w", `${Math.max(1, Math.min(3, s.borderThickness || 1))}px`);
  const alpha = Math.max(70, Math.min(98, Number(s.surfaceAlpha || 88)));
  document.documentElement.style.setProperty("--surface-alpha", String(alpha / 100));
  const accent =
    s.theme === "system-default" && (!s.accentColor || s.accentColor === defaultSettings.accentColor)
      ? getSystemAccentColor()
      : s.theme === "glass-modern-w11" && (!s.accentColor || s.accentColor === defaultSettings.accentColor)
        ? "#C5E4F2"
        : s.accentColor || "#3ddc84";
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-rgb", hexToRgbTriplet(accent));

  const backgroundImage = hasCustomBackground ? s.customBackgroundDataUrl : hasOceanThemeBackground ? OCEAN_THEME_DEFAULT_BG : "";

  if (backgroundImage) {
    customBgImageLayer.src = backgroundImage;
    customBgImageLayer.style.display = "block";
  } else {
    customBgImageLayer.removeAttribute("src");
    customBgImageLayer.style.display = "none";
  }
}

// ---------------- Utilities ----------------
function appendLog(line: string) {
  const s = logsEl.textContent || "";
  logsEl.textContent = s + (s ? "\n" : "") + line;
  logsEl.scrollTop = logsEl.scrollHeight;
  launchLogBuffer.push(line);
  if (launchLogBuffer.length > 500) {
    launchLogBuffer = launchLogBuffer.slice(launchLogBuffer.length - 500);
  }
  const status = summarizeLogForStatus(line);
  if (status) setStatus(status);
}

function setStartupProgress(detail: string, title = "Launching launcher") {
  if (startupSplashTitle) startupSplashTitle.textContent = title;
  if (startupSplashDetail) startupSplashDetail.textContent = detail;
}

function forceRevealStartupShell(reason?: string) {
  if (startupRevealStarted) return;
  startupRevealStarted = true;
  startupReady = true;
  if (reason) {
    appendLog(`[startup] ${reason}`);
  }
  windowTopbar.classList.remove("appStartupHidden");
  windowTopbar.classList.add("appStartupReady");
  windowTopbar.setAttribute("aria-hidden", "false");
  appShell.classList.remove("appStartupHidden");
  appShell.classList.add("appStartupReady");
  appShell.setAttribute("aria-hidden", "false");
  startupSplash.classList.add("is-hidden");
  startupSplash.style.display = "none";
}

// Set status.
function setStatus(text: string) {
  statusText.textContent = text || "";
  if (!startupReady && text) {
    const detail = text === "Loading..." ? "Preparing your library and services..." : text;
    setStartupProgress(detail);
  }
}

async function revealStartupShell() {
  if (startupRevealStarted) return;
  startupRevealStarted = true;
  startupReady = true;
  if (startupEmergencyRevealTimer != null) {
    window.clearTimeout(startupEmergencyRevealTimer);
    startupEmergencyRevealTimer = null;
  }
  setStartupProgress("Your launcher is ready.");
  windowTopbar.classList.remove("appStartupHidden");
  windowTopbar.classList.add("appStartupReady");
  windowTopbar.setAttribute("aria-hidden", "false");
  appShell.classList.remove("appStartupHidden");
  appShell.classList.add("appStartupReady");
  appShell.setAttribute("aria-hidden", "false");
  startupSplash.classList.add("is-hidden");
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    await backend.windowShow();
  } catch (err: any) {
    appendLog(`[startup] windowShow failed: ${String(err?.message ?? err)}`);
  }
  window.setTimeout(() => {
    startupSplash.style.display = "none";
  }, 320);
}

function setGlobalActionBusy(visible: boolean, title = "Working...", detail = "Please wait while Fishbattery finishes this action.") {
  if (actionBusyTitle) actionBusyTitle.textContent = title;
  if (actionBusyDetail) actionBusyDetail.textContent = detail;
  if (actionBusyBanner) actionBusyBanner.style.display = visible ? "flex" : "none";
}

function setModalBusy(visible: boolean, title = "Working...", detail = "Please wait while Fishbattery finishes this action.") {
  if (modalBusyTitle) modalBusyTitle.textContent = title;
  if (modalBusyDetail) modalBusyDetail.textContent = detail;
  if (modalBusyOverlay) modalBusyOverlay.style.display = visible ? "grid" : "none";
  modalClose.toggleAttribute("disabled", visible);
  modalCancel.toggleAttribute("disabled", visible);
  modalCreate.toggleAttribute("disabled", visible);
}

function syncUpdaterBusyBanner() {
  if (!updaterBusyIntent) return;

  if (updaterBusyIntent === "download") {
    if (updaterState.status === "downloading") {
      const pct = Number(updaterState.progressPercent ?? 0);
      setGlobalActionBusy(true, "Downloading update", `Downloading update... ${pct.toFixed(1)}%`);
      return;
    }
    if (updaterState.status === "downloaded") {
      updaterBusyIntent = null;
      setGlobalActionBusy(false);
      return;
    }
    if (updaterState.status === "error") {
      updaterBusyIntent = null;
      setGlobalActionBusy(false);
      return;
    }
    setGlobalActionBusy(true, "Downloading update", "Preparing update download...");
    return;
  }

  if (updaterState.status === "error") {
    updaterBusyIntent = null;
    setGlobalActionBusy(false);
    return;
  }
  setGlobalActionBusy(true, "Installing update", "Restarting launcher to apply the update...");
}

async function withGlobalActionProgress<T>(
  title: string,
  detail: string,
  work: (update?: (nextDetail: string) => void) => Promise<T>
): Promise<T> {
  globalBusyDepth += 1;
  setGlobalActionBusy(true, title, detail);
  try {
    return await work((nextDetail) => setGlobalActionBusy(true, title, nextDetail));
  } finally {
    globalBusyDepth = Math.max(0, globalBusyDepth - 1);
    if (globalBusyDepth === 0) setGlobalActionBusy(false);
  }
}

async function withModalProgress<T>(
  title: string,
  detail: string,
  work: (update?: (nextDetail: string) => void) => Promise<T>
): Promise<T> {
  modalBusyDepth += 1;
  setModalBusy(true, title, detail);
  setGlobalActionBusy(true, title, detail);
  globalBusyDepth += 1;
  try {
    return await work((nextDetail) => {
      setModalBusy(true, title, nextDetail);
      setGlobalActionBusy(true, title, nextDetail);
    });
  } finally {
    modalBusyDepth = Math.max(0, modalBusyDepth - 1);
    if (modalBusyDepth === 0) setModalBusy(false);
    globalBusyDepth = Math.max(0, globalBusyDepth - 1);
    if (globalBusyDepth === 0) setGlobalActionBusy(false);
  }
}

async function showLauncherDialog(options: {
  mode: "alert" | "confirm" | "prompt";
  message: string;
  title?: string;
  defaultValue?: string;
  okLabel?: string;
  cancelLabel?: string;
}): Promise<void | boolean | string | null> {
  const {
    mode,
    message,
    title = "Fishbattery Launcher",
    defaultValue = "",
    okLabel = "OK",
    cancelLabel = "Cancel"
  } = options;
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "launcherDialogBackdrop";

    const panel = document.createElement("div");
    panel.className = "launcherDialog";

    const heading = document.createElement("h3");
    heading.className = "launcherDialogTitle";
    heading.textContent = title;

    const body = document.createElement("p");
    body.className = "launcherDialogBody";
    body.textContent = message;

    const input = document.createElement("input");
    input.className = "input launcherDialogInput";
    input.type = "text";
    input.value = defaultValue;
    input.style.display = mode === "prompt" ? "" : "none";

    const actions = document.createElement("div");
    actions.className = "row launcherDialogActions";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn";
    cancelBtn.textContent = cancelLabel;
    cancelBtn.style.display = mode === "alert" ? "none" : "";
    const okBtn = document.createElement("button");
    okBtn.className = "btn btnPrimary";
    okBtn.textContent = okLabel;
    actions.append(cancelBtn, okBtn);

    panel.append(heading, body, input, actions);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    const finish = (result: void | boolean | string | null) => {
      backdrop.remove();
      document.removeEventListener("keydown", onKeyDown);
      resolve(result);
    };
    const submit = () => {
      if (mode === "confirm") return finish(true);
      if (mode === "prompt") return finish(input.value);
      finish();
    };
    const cancel = () => {
      if (mode === "confirm") return finish(false);
      if (mode === "prompt") return finish(null);
      finish();
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        cancel();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        submit();
      }
    };

    okBtn.onclick = submit;
    cancelBtn.onclick = cancel;
    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) cancel();
    });
    document.addEventListener("keydown", onKeyDown);
    if (mode === "prompt") {
      input.focus();
      input.select();
    } else {
      okBtn.focus();
    }
  });
}

async function showLauncherAlert(message: string, title = "Fishbattery Launcher") {
  await showLauncherDialog({ mode: "alert", message, title });
}

async function showLauncherConfirm(
  message: string,
  title = "Fishbattery Launcher",
  okLabel = "OK",
  cancelLabel = "Cancel"
) {
  return Boolean(await showLauncherDialog({ mode: "confirm", message, title, okLabel, cancelLabel }));
}

async function showLauncherPrompt(message: string, defaultValue = "", title = "Fishbattery Launcher") {
  const out = await showLauncherDialog({ mode: "prompt", message, title, defaultValue });
  return typeof out === "string" ? out : null;
}

window.alert = (message?: any) => {
  void showLauncherAlert(String(message ?? ""));
};

async function runTrackedInstall<T>(
  title: string,
  work: (update: (stage: string) => void) => Promise<T>
): Promise<T> {
  return withGlobalActionProgress(title, "Starting...", async (showProgress) => {
    const startedAt = Date.now();
    let lastHeartbeatBucket = -1;
    let warnedSlow = false;
    let currentStage = "Starting";

    const update = (stage: string) => {
      currentStage = stage;
      const msg = `${title}: ${stage}`;
      setStatus(msg);
      showProgress?.(stage);
      appendLog(`[install] ${stage}`);
    };

    setStatus(`${title}...`);
    appendLog(`[install] ${title}`);

    const timer = window.setInterval(() => {
      const elapsedSec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      const heartbeatBucket = Math.floor(elapsedSec / 20);
      const slow = elapsedSec >= 90;
      const stageWithElapsed = `${currentStage} (${elapsedSec}s)`;
      setStatus(
        slow
          ? `${title}: ${stageWithElapsed} (taking longer than usual)`
          : `${title}: ${stageWithElapsed}`
      );
      showProgress?.(
        slow ? `${stageWithElapsed} • taking longer than usual` : stageWithElapsed
      );
      if (heartbeatBucket > lastHeartbeatBucket) {
        lastHeartbeatBucket = heartbeatBucket;
        appendLog(`[install] Still working... ${elapsedSec}s elapsed.`);
      }
      if (slow && !warnedSlow) {
        warnedSlow = true;
        appendLog(
          "[install] This is taking longer than usual. Check network/API availability if it stays on this step."
        );
      }
    }, 5000);

    try {
      const result = await work(update);
      const elapsedSec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      appendLog(`[install] Completed in ${elapsedSec}s.`);
      return result;
    } finally {
      window.clearInterval(timer);
      setStatus("");
    }
  });
}

// Summarize log for status.
function summarizeLogForStatus(line: string) {
  const raw = String(line || "").trim();
  if (!raw) return "";
  if (/^\s*at\s+\S+/.test(raw)) return "";
  const cleaned = raw.replace(/^\[[^\]]+\]\s*/, "").trim();
  if (!cleaned) return "";
  if (cleaned.length > 180) return "";
  return cleaned;
}

// Render debug logs visibility.
function renderDebugLogsVisibility() {
  logsEl.style.display = debugLogsVisible ? "" : "none";
  btnToggleDebugLogs.textContent = debugLogsVisible ? "Hide Debug Logs" : "Show Debug Logs";
}

// Find diagnosis evidence.
function findDiagnosisEvidence(diag: any, lines: string[]) {
  const recent = (lines || []).slice(-200);
  const patterns: Record<string, string[]> = {
    "missing-fabric-loader": ["fabric", "no such file", "install incomplete"],
    "duplicate-mods": ["duplicate", "duplicatemodsfoundexception"],
    "loader-profile-missing": [
      "installer completed but no launch profile was generated",
      "installer completed without profile",
      "profile generation failed"
    ],
    "wrong-java-version": ["unsupportedclassversionerror", "class file version", "requires java"],
    "mod-mismatch": ["modresolutionexception", "depends on", "requires minecraft", "incompatible"]
  };
  const want = patterns[String(diag?.code || "")] || [];
  if (!want.length) return null;

  for (const line of recent.reverse()) {
    const lower = String(line || "").toLowerCase();
    if (want.some((p) => lower.includes(p))) return line;
  }
  return null;
}

// Redact sensitive.
function redactSensitive(text: string) {
  return String(text || "")
    .replace(/\bgho_[A-Za-z0-9_]+\b/g, "gho_[REDACTED]")
    .replace(/\bghp_[A-Za-z0-9_]+\b/g, "ghp_[REDACTED]")
    .replace(/\baccess[_-]?token[\"'=: ]+[A-Za-z0-9._-]+/gi, "access_token=[REDACTED]")
    .replace(/\bbearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
}

// Render launch diagnosis.
function renderLaunchDiagnosis(diag: any | null) {
  latestDiagnosis = diag;
  if (!diag) {
    launchDiagnosis.style.display = "none";
    launchDiagnosis.textContent = "";
    launchDiagnosisDetails.style.display = "none";
    launchDiagnosisDetails.textContent = "";
    btnApplyDiagnosisFix.disabled = true;
    return;
  }

  const lines = [
    `Diagnosis: ${diag.summary}`,
    ...(diag.details ?? []).map((x: string) => `- ${x}`),
    ...(diag.recommendedActions ?? []).map((x: string) => `Action: ${x}`)
  ];
  launchDiagnosis.textContent = lines.join("\n");
  launchDiagnosis.style.display = "";
  btnApplyDiagnosisFix.disabled = !diag.canAutoFix || !diag.fixAction || diag.fixAction === "none";

  const evidence = findDiagnosisEvidence(diag, launchLogBuffer);
  const detailLines = [
    `Code: ${diag.code}`,
    `Severity: ${diag.severity}`,
    `Auto fix: ${diag.canAutoFix ? diag.fixAction : "none"}`,
    evidence ? `Evidence: ${evidence}` : "Evidence: no direct signature line captured"
  ];
  launchDiagnosisDetails.textContent = detailLines.join("\n");
  launchDiagnosisDetails.style.display = diagnosisDetailsOpen ? "" : "none";
  btnToggleDiagnosisDetails.textContent = diagnosisDetailsOpen ? "Hide details" : "Details";
}

// Run launch diagnosis.
async function runLaunchDiagnosis(instanceId: string | null) {
  if (!instanceId) return null;
  const diag = await backend.launchDiagnose(instanceId, launchLogBuffer);
  renderLaunchDiagnosis(diag);
  appendLog(`[diagnostics] ${diag.summary}`);
  return diag;
}

// Describe rollback reason.
function describeRollbackReason(reason: string) {
  if (reason === "instance-preset") return "instance preset apply";
  if (reason === "mods-refresh") return "mods refresh";
  if (reason === "packs-refresh") return "packs refresh";
  return "manual change";
}

// Maybe offer rollback.
async function maybeOfferRollback(instanceId: string, diag: any | null) {
  if (!diag || diag.severity !== "critical") return;
  const latest = await backend.rollbackGetLatest(instanceId);
  if (!latest) return;

  const stamp = new Date(Number(latest.createdAt || Date.now())).toLocaleString();
  const reason = describeRollbackReason(String(latest.reason || ""));
  const yes = await showLauncherConfirm(
    `A critical launch issue was detected.\n\nRollback to last-known-good snapshot from ${stamp} (${reason})?`
  );
  if (!yes) return;

  await backend.rollbackRestoreLatest(instanceId);
  state.instances = await backend.instancesList();
  await renderInstances();
  appendLog(`[rollback] Restored snapshot from ${stamp} (${reason}).`);
}

// Guarded.
async function guarded(fn: () => Promise<void>) {
  if (busy) return;
  busy = true;
  void renderSponsoredBannerState();
  renderConsentBannerState();
  try {
    await fn();
  } finally {
    busy = false;
    void renderSponsoredBannerState();
    renderConsentBannerState();
  }
}

// Has ads free subscription.
function hasAdsFreeSubscription(): boolean {
  if (hasPremium()) return true;
  return !!state.launcherSubscription?.features?.adsFree;
}

function getAdsConsent(): "unknown" | "granted" | "denied" {
  return getSettings().adsConsent || "unknown";
}

function hasAdMeasurementConsent(): boolean {
  return getAdsConsent() === "granted";
}

// Should hide sponsored banner.
async function shouldHideSponsoredBanner() {
  if (hasAdsFreeSubscription()) return true;
  if (busy) return true;
  if (latestDiagnosis?.severity === "critical") return true;
  const active = state.instances?.activeInstanceId ?? null;
  if (!active) return false;
  try {
    return !!(await backend.launchIsRunning(active));
  } catch {
    return false;
  }
}

// Load sponsored banners from feed.
async function loadSponsoredBannersFromFeed() {
  const previousId = String(sponsoredCurrentEntry?.id || "").trim();
  const resolved = String(localStorage.getItem("fishbattery.apiBaseResolved") || "").trim();
  const apiBases = [resolved, ...ADS_API_BASES].filter((v, i, a) => !!v && a.indexOf(v) === i);
  const seen = new Set<string>();
  for (const base of apiBases) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(
        `${base}/v1/ads/feed?placement=${LAUNCHER_AD_PLACEMENT}&limit=5&sessionId=${encodeURIComponent(getAdEventSessionId())}`,
        {
        signal: controller.signal,
        cache: "no-store"
      }
      );
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      const ads: SponsoredFeedAd[] = Array.isArray(json?.ads) ? json.ads : [];
      const launcherAds = ads.filter((ad) => {
        if (ad?.active === false) return false;
        if (!Array.isArray(ad?.placements)) return false;
        return ad.placements.includes(LAUNCHER_AD_PLACEMENT) || ad.placements.includes("launcher_sidebar");
      });
      const mapped = launcherAds
        .map((ad, idx) => ({
          id: String(ad.id || `ad-${idx}`).trim(),
          title: String(ad.title || "").trim(),
          body: String(ad.body || "").trim(),
          cta: String(ad.cta || "Learn more").trim(),
          media: String(ad.media || "Sponsor").trim(),
          partner: String(ad.partner || "Partner").trim(),
          imageUrl: String(ad.imageUrl || "").trim() || null,
          mediaBg: String(ad.mediaBg || "").trim() || null,
          embedUrl: normalizeHttpsUrl(String(ad.embedUrl || "")),
          impressionUrl: normalizeHttpsUrl(String(ad.impressionUrl || "")),
          clickUrl: normalizeHttpsUrl(String(ad.clickUrl || "")),
          link: normalizeHttpsUrl(String(ad.link || "")) || ""
        }))
        .filter((ad) => {
          const hasDirectAdEmbed = !!ad.embedUrl;
          const hasCardFallback = !!ad.title && !!ad.body && !!ad.link;
          if (!hasDirectAdEmbed && !hasCardFallback) return false;
          if (seen.has(ad.id || "")) return false;
          seen.add(ad.id || "");
          return true;
        });
      if (mapped.length) {
        localStorage.setItem("fishbattery.apiBaseResolved", base);
        sponsoredBanners = mapped;
        const preservedIndex = previousId ? mapped.findIndex((x) => String(x.id || "").trim() === previousId) : -1;
        sponsoredIndex = preservedIndex >= 0 ? preservedIndex : 0;
        sponsoredCurrentEntry = mapped[sponsoredIndex] || mapped[0] || null;
        sponsoredCurrentLink = sponsoredCurrentEntry?.link || mapped[0].link || "";
        localStorage.setItem(SPONSORED_INDEX_KEY, String(sponsoredIndex));
        return;
      }
    } catch {
      // try next api base
    }
  }
  sponsoredBanners = [];
  sponsoredCurrentEntry = null;
  sponsoredCurrentLink = "";
}

function getAdEventSessionId(): string {
  const key = "fishbattery.ads.sessionId";
  let value = String(localStorage.getItem(key) || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{8,128}$/.test(value)) {
    value = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(key, value);
  }
  return value;
}

async function postLauncherAdEvent(eventType: "impression" | "click", campaignId: string) {
  const id = String(campaignId || "").trim().toLowerCase();
  if (!id) return;
  const resolved = String(localStorage.getItem("fishbattery.apiBaseResolved") || "").trim();
  const apiBases = [resolved, ...ADS_API_BASES].filter((v, i, a) => !!v && a.indexOf(v) === i);
  const payload = {
    eventType,
    campaignId: id,
    placement: LAUNCHER_AD_PLACEMENT,
    pagePath: "/launcher",
    sessionId: getAdEventSessionId(),
    referrerHost: ""
  };
  for (const base of apiBases) {
    try {
      const response = await fetch(`${base}/v1/ads/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) continue;
      localStorage.setItem("fishbattery.apiBaseResolved", base);
      return;
    } catch {
      // try next base
    }
  }
}

function isSponsoredBannerActivelyRenderable() {
  if (!sidebarSponsored) return false;
  if (document.visibilityState !== "visible") return false;
  const style = window.getComputedStyle(sidebarSponsored);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") <= 0) {
    return false;
  }
  const rect = sidebarSponsored.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.bottom <= 0 || rect.right <= 0) return false;
  if (rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
  return true;
}

function maybeTrackSponsoredImpression(entry: SponsoredBanner | null) {
  if (!hasAdMeasurementConsent() || !entry?.id) return;
  if (!isSponsoredBannerActivelyRenderable()) return;
  if (sponsoredLastImpressionId === entry.id) return;
  sponsoredLastImpressionId = entry.id;
  appendLog(`[sponsored] Impression: ${entry.id}`);
  void postLauncherAdEvent("impression", entry.id);
}

// Render sponsored banner state.
async function renderSponsoredBannerState(advance = false) {
  if (!sidebarSponsored) return;
  if (
    !sidebarSponsoredTitle ||
    !sidebarSponsoredBody ||
    !sidebarSponsoredMediaText ||
    !sidebarSponsoredBy ||
    !sidebarSponsoredMedia ||
    !sidebarSponsoredFrame ||
    !sidebarSponsoredMediaImg ||
    !sidebarSponsoredCta ||
    !sidebarSponsoredNote
  ) {
    return;
  }
  if (hasAdsFreeSubscription()) {
    sidebarSponsored.style.display = "none";
    if (consentBanner) consentBanner.classList.add("hidden");
    return;
  }
  sidebarSponsored.style.display = "";
  sidebarSponsoredNote.style.display = "";
  sidebarSponsoredUpgrade.style.display = "";

  if (!sponsoredBanners.length) {
    sidebarSponsoredBy.textContent = "Sponsor";
    sidebarSponsoredTitle.textContent = "No sponsored content right now";
    sidebarSponsoredBody.textContent = "Ads help us maintain the launcher. Check back soon.";
    sidebarSponsoredMediaText.textContent = "Sponsor";
    sidebarSponsoredMedia.classList.remove("hasEmbed");
    sidebarSponsoredMedia.classList.remove("hasImage");
    sidebarSponsoredMedia.style.background = "";
    if (sidebarSponsoredFrame.src) sidebarSponsoredFrame.src = "about:blank";
    sidebarSponsoredMediaImg.removeAttribute("src");
    sidebarSponsoredCta.style.display = "none";
    return;
  }

  const hide = await shouldHideSponsoredBanner();
  sidebarSponsored.style.display = hide ? "none" : "";
  if (hide) return;

  const currentId = String(sponsoredCurrentEntry?.id || "").trim();
  const currentIndexById = currentId
    ? sponsoredBanners.findIndex((item) => String(item.id || "").trim() === currentId)
    : -1;
  if (currentIndexById >= 0) {
    sponsoredIndex = currentIndexById;
    sponsoredCurrentEntry = sponsoredBanners[currentIndexById];
  } else if (!sponsoredCurrentEntry) {
    sponsoredIndex = Math.max(0, Math.min(sponsoredIndex, sponsoredBanners.length - 1));
    sponsoredCurrentEntry = sponsoredBanners[sponsoredIndex];
  } else if (advance && sponsoredBanners.length > 1) {
    sponsoredIndex = (sponsoredIndex + 1) % sponsoredBanners.length;
    sponsoredCurrentEntry = sponsoredBanners[sponsoredIndex];
    localStorage.setItem(SPONSORED_INDEX_KEY, String(sponsoredIndex));
  }
  const entry = sponsoredCurrentEntry;
  if (!entry) return;
  const hasEmbed = hasAdMeasurementConsent() && !!entry.embedUrl;
  sidebarSponsoredTitle.textContent = entry.title || "Sponsored";
  sidebarSponsoredBody.textContent = entry.body || "Sponsored content";
  sidebarSponsoredMediaText.textContent = entry.media || "Sponsor";
  sidebarSponsoredBy.textContent = entry.partner || "Partner";
  if (hasEmbed && entry.embedUrl) {
    sidebarSponsoredMedia.classList.add("hasEmbed");
    if (sidebarSponsoredFrame.src !== entry.embedUrl) sidebarSponsoredFrame.src = entry.embedUrl;
  } else {
    sidebarSponsoredMedia.classList.remove("hasEmbed");
    if (sidebarSponsoredFrame.src) sidebarSponsoredFrame.src = "about:blank";
  }
  if (entry.imageUrl) {
    sidebarSponsoredMediaImg.src = entry.imageUrl;
    sidebarSponsoredMedia.classList.add("hasImage");
    if (entry.mediaBg) sidebarSponsoredMedia.style.background = entry.mediaBg;
  } else {
    sidebarSponsoredMediaImg.removeAttribute("src");
    sidebarSponsoredMedia.classList.remove("hasImage");
    sidebarSponsoredMedia.style.background = "";
  }
  const ctaText = entry.cta || "Learn more";
  const ctaTarget = String(entry.link || "").trim();
  sidebarSponsoredCta.style.display = ctaTarget ? "" : "none";
  sidebarSponsoredCta.textContent = ctaText;
  sponsoredCurrentLink = ctaTarget;
  maybeTrackSponsoredImpression(entry);
}

function renderConsentBannerState() {
  if (!consentBanner) return;
  const show = !hasAdsFreeSubscription() && getAdsConsent() === "unknown";
  consentBanner.classList.toggle("hidden", !show);
}

function ensureSponsoredRotation() {
  if (sponsoredRotateTimer != null) return;
  sponsoredRotateTimer = window.setInterval(() => {
    void (async () => {
      await loadSponsoredBannersFromFeed();
      await renderSponsoredBannerState();
    })();
  }, SPONSORED_ROTATE_MS);
}

// Set view.
function setView(which: "library" | "capes" | "playit" | "settings") {
  viewLibrary.style.display = which === "library" ? "" : "none";
  viewCapes.style.display = which === "capes" ? "" : "none";
  viewPlayit.style.display = which === "playit" ? "" : "none";
  viewSettings.style.display = which === "settings" ? "" : "none";
  navLibrary.classList.toggle("active", which === "library");
  navCapes.classList.toggle("active", which === "capes");
  navPlayit.classList.toggle("active", which === "playit");
  navSettings.classList.toggle("active", which === "settings");
  if (sidebarCapesPreview) sidebarCapesPreview.style.display = "";
  if (which === "capes") void renderCapesView();
  if (which === "playit") {
    renderPlayitPanel();
    void refreshPlayitState(true).then(() => renderPlayitPanel());
  }
}

async function renderSidebarCharacterPreview(
  skinSourceUrl: string | null,
  capeSourceUrl: string | null
) {
  if (!sidebarCapesPreview || !sidebarCapesPreviewHost) return;
  sidebarCapesPreview.style.display = "";
  await renderInteractiveCharacterPreview(sidebarCapesPreviewHost, skinSourceUrl, capeSourceUrl);
}

async function refreshSidebarCharacterPreview(forceRefreshOfficial = false) {
  if (!sidebarCapesPreview || !sidebarCapesPreviewHost) return;
  sidebarCapesPreview.style.display = "";

  const accounts = state.accounts?.accounts ?? [];
  const activeId = state.accounts?.activeId ?? null;
  const activeMc = accounts.find((a: any) => a.id === activeId) ?? accounts[0] ?? null;
  const activeMcId = String(activeMc?.id || "");

  let localCapeCatalog: { items?: Array<{ id: string; previewDataUrl?: string | null }> } | null = null;
  try {
    localCapeCatalog = await backend.capesListLocal();
  } catch {
    localCapeCatalog = null;
  }

  let selectedLocalCapeId = "";
  if (activeMcId) {
    try {
      const sel = await backend.capesGetLocalSelection(activeMcId);
      selectedLocalCapeId = String(sel?.capeId || "");
    } catch {
      selectedLocalCapeId = "";
    }
  }

  let capeState:
    | {
        skinUrl: string | null;
        skinDataUrl: string | null;
        activeCapeId: string | null;
        capes: Array<{
          id: string;
          url: string;
          previewDataUrl: string | null;
        }>;
      }
    | null = null;
  if (activeMcId) {
    try {
      capeState = await backend.capesListOfficial(activeMcId, forceRefreshOfficial);
      setOfficialCapeStateCache(activeMcId, capeState);
    } catch {
      capeState = getOfficialCapeStateCache(activeMcId);
    }
  }

  const activeLocalCape = (localCapeCatalog?.items || []).find((x: any) => x.id === selectedLocalCapeId) ?? null;
  const activeOfficialCape =
    capeState?.activeCapeId && capeState?.capes?.length
      ? capeState.capes.find((x) => x.id === capeState?.activeCapeId) ?? null
      : null;
  const capeSource =
    (activeLocalCape?.previewDataUrl || null) ?? (activeOfficialCape?.previewDataUrl || activeOfficialCape?.url || null);
  const skinSource = capeState?.skinDataUrl || capeState?.skinUrl || null;
  await renderSidebarCharacterPreview(skinSource, capeSource);
}

// Render capes view.
async function renderCapesView(forceRefresh = false, officialStateOverride: any | null = null) {
  const previousScrollTop = viewCapes.scrollTop || 0;
  capesPanelRoot.innerHTML = "";
  const shell = document.createElement("div");
  shell.className = "capeChooser";
  capesPanelRoot.appendChild(shell);

  const strip = document.createElement("div");
  strip.className = "capeStripLabel";
  strip.textContent = "Choose your cape";
  shell.appendChild(strip);

  const section = document.createElement("div");
  section.className = "capeSection";
  shell.appendChild(section);

  const heading = document.createElement("div");
  heading.className = "capeSectionHeading";
  heading.textContent = "Owned capes";
  section.appendChild(heading);

  const loadingRow = document.createElement("div");
  loadingRow.className = "setHelp";
  loadingRow.style.marginTop = "10px";
  loadingRow.textContent = "Loading cape and skin data...";
  section.appendChild(loadingRow);

  const accounts = state.accounts?.accounts ?? [];
  const activeId = state.accounts?.activeId ?? null;
  const activeMc = accounts.find((a: any) => a.id === activeId) ?? accounts[0] ?? null;
  const activeMcId = String(activeMc?.id || "");
  const localCapeCatalog = await backend.capesListLocal();
  let selectedLocalCapeId = "";
  if (activeMcId) {
    try {
      const sel = await backend.capesGetLocalSelection(activeMcId);
      selectedLocalCapeId = String(sel?.capeId || "");
    } catch {
      selectedLocalCapeId = "";
    }
  }

  section.innerHTML = "";

  const headingReady = document.createElement("div");
  headingReady.className = "capeSectionHeading";
  headingReady.textContent = "Owned capes";
  section.appendChild(headingReady);

  const sub = document.createElement("div");
  sub.className = "capeSectionSub";
  sub.textContent = activeMc
    ? `Official Minecraft capes for ${getAccountLabel(activeMc)}.`
    : "Add and select a Minecraft account to manage official capes.";
  section.appendChild(sub);

  if (activeMc) {
    const actions = document.createElement("div");
    actions.className = "row";
    actions.style.justifyContent = "flex-end";
    actions.style.marginTop = "8px";
    const btnRefresh = document.createElement("button");
    btnRefresh.className = "btn";
    btnRefresh.textContent = "Refresh";
    btnRefresh.onclick = () => guarded(async () => renderCapesView(true));
    actions.appendChild(btnRefresh);
    section.appendChild(actions);
  }

  if (!activeMc) {
    const note = document.createElement("div");
    note.className = "setHelp";
    note.style.marginTop = "12px";
    note.textContent = "Official capes are unavailable until a Minecraft account is selected.";
    section.appendChild(note);
  }

  let capeState:
    | {
        accountId: string;
        username: string;
        skinUrl: string | null;
        skinDataUrl: string | null;
        skins: Array<{
          id: string;
          url: string;
          variant: "CLASSIC" | "SLIM";
          alias: string | null;
          state: string;
          active: boolean;
          previewDataUrl: string | null;
        }>;
        activeSkinId: string | null;
        activeCapeId: string | null;
        capes: Array<{
          id: string;
          name: string;
          url: string;
          previewDataUrl: string | null;
          state: string;
          active: boolean;
        }>;
      }
    | null = null;
  let officialLoadError: string | null = null;
  if (activeMcId) {
    if (officialStateOverride) {
      capeState = officialStateOverride;
      setOfficialCapeStateCache(activeMcId, capeState);
    } else {
      try {
        capeState = await backend.capesListOfficial(activeMcId, forceRefresh);
        setOfficialCapeStateCache(activeMcId, capeState);
      } catch (err: any) {
        // One quick retry helps with transient Minecraft API hiccups.
        try {
          await new Promise((resolve) => setTimeout(resolve, 250));
          capeState = await backend.capesListOfficial(activeMcId, true);
          setOfficialCapeStateCache(activeMcId, capeState);
        } catch (retryErr: any) {
          officialLoadError = String(retryErr?.message || retryErr || err?.message || err || "Unknown error");
          const cached = getOfficialCapeStateCache(activeMcId);
          if (cached) {
            capeState = cached;
          }
        }
      }
    }
  }

  if (officialLoadError) {
    const row = document.createElement("div");
    row.className = "setRow";
    row.style.marginTop = "12px";
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    const title = document.createElement("div");
    title.className = "setLabel";
    title.textContent = capeState ? "Official skins/capes temporarily unavailable (showing cached data)" : "Could not load official capes";
    const help = document.createElement("div");
    help.className = "setHelp";
    help.textContent = officialLoadError;
    left.appendChild(title);
    left.appendChild(help);
    row.appendChild(left);
    section.appendChild(row);
  }

  // Current player preview (skin + cape), similar to Minecraft launcher.
  const activeLocalCape = (localCapeCatalog?.items || []).find((x: any) => x.id === selectedLocalCapeId) ?? null;
  const activeOfficialCape =
    capeState?.activeCapeId && capeState?.capes?.length
      ? capeState.capes.find((x) => x.id === capeState?.activeCapeId) ?? null
      : null;
  const mannequinCapeSource =
    (activeLocalCape?.previewDataUrl || null) ??
    (activeOfficialCape?.previewDataUrl || activeOfficialCape?.url || null);
  const mannequinSkinSource = capeState?.skinDataUrl || capeState?.skinUrl || null;
  await renderSidebarCharacterPreview(mannequinSkinSource, mannequinCapeSource);

  const syncSidebarCapePreview = async () => {
    await refreshSidebarCharacterPreview(false);
  };

  const buildTile = (cfg: {
    label: string;
    imageUrl: string | null;
    active: boolean;
    onSelect: () => Promise<void> | void;
    subLabel?: string;
  }) => {
    const tile = document.createElement("button");
    tile.className = `capeTile${cfg.active ? " active" : ""}`;
    tile.type = "button";
    let selecting = false;
    tile.onclick = async () => {
      if (selecting) return;
      selecting = true;
      try {
        await cfg.onSelect();
      } catch (err: any) {
        await showLauncherAlert(String(err?.message ?? err ?? "Could not select cape"));
      } finally {
        selecting = false;
      }
    };

    const preview = document.createElement("div");
    preview.className = "capeTilePreview";
    if (cfg.imageUrl) {
      const img = document.createElement("img");
      img.className = "capeTileImg";
      img.onerror = () => {
        img.remove();
        const ghost = document.createElement("div");
        ghost.className = "capeTileGhost";
        preview.appendChild(ghost);
      };
      void setCapePreviewImage(img, cfg.imageUrl);
      img.alt = `${cfg.label} cape`;
      preview.appendChild(img);
    } else {
      const ghost = document.createElement("div");
      ghost.className = "capeTileGhost";
      preview.appendChild(ghost);
    }

    const footer = document.createElement("div");
    footer.className = "capeTileFooter";
    const dot = document.createElement("span");
    dot.className = `capeTileDot${cfg.active ? " on" : ""}`;
    const text = document.createElement("span");
    text.className = "capeTileLabel";
    text.textContent = cfg.label;
    footer.appendChild(dot);
    footer.appendChild(text);
    if (cfg.subLabel) {
      const subText = document.createElement("small");
      subText.className = "capeTileSub";
      subText.textContent = cfg.subLabel;
      footer.appendChild(subText);
    }

    tile.appendChild(preview);
    tile.appendChild(footer);
    return {
      tile,
      setActive(active: boolean) {
        tile.classList.toggle("active", active);
        dot.classList.toggle("on", active);
      }
    };
  };

  if (capeState) {
    const grid = document.createElement("div");
    grid.className = "capeGrid";
    section.appendChild(grid);

    const officialTiles: Array<{ capeId: string | null; setActive: (active: boolean) => void }> = [];
    const setOfficialSelection = (activeCapeId: string | null) => {
      for (const entry of officialTiles) entry.setActive(entry.capeId === activeCapeId);
    };

    const noneTile = buildTile({
        label: "No Cape",
        imageUrl: null,
        active: !capeState.activeCapeId,
        onSelect: async () => {
          const nextState = await backend.capesSetOfficialActive(activeMcId, null);
          setOfficialCapeStateCache(activeMcId, nextState);
          capeState = nextState;
          setOfficialSelection(nextState.activeCapeId ?? null);
          await syncSidebarCapePreview();
        }
      });
    officialTiles.push({ capeId: null, setActive: noneTile.setActive });
    grid.appendChild(noneTile.tile);

    for (const item of capeState.capes) {
      const tile = buildTile({
          label: item.name,
          imageUrl: item.previewDataUrl || null,
          active: !!item.active,
          onSelect: async () => {
            const nextState = await backend.capesSetOfficialActive(activeMcId, item.id);
            setOfficialCapeStateCache(activeMcId, nextState);
            capeState = nextState;
            setOfficialSelection(nextState.activeCapeId ?? null);
            await syncSidebarCapePreview();
          }
        });
      officialTiles.push({ capeId: item.id, setActive: tile.setActive });
      grid.appendChild(tile.tile);
    }
  }

  const localSection = document.createElement("div");
  localSection.className = "capeSection";
  localSection.style.marginTop = "14px";
  shell.appendChild(localSection);

  const localHeading = document.createElement("div");
  localHeading.className = "capeSectionHeading";
  localHeading.textContent = "Fishbattery capes";
  localSection.appendChild(localHeading);

  const localSub = document.createElement("div");
  localSub.className = "capeSectionSub";
  localSub.textContent = "Launcher cape catalog from your Fishbattery cloud account.";
  localSection.appendChild(localSub);

  const localGrid = document.createElement("div");
  localGrid.className = "capeGrid";
  localSection.appendChild(localGrid);

  const sortedLocalItems = [...(localCapeCatalog?.items || [])].sort((a, b) => {
    const rank = (tier: "free" | "premium" | "founder") => (tier === "free" ? 0 : tier === "premium" ? 1 : 2);
    const tierOrder = rank(a.tier) - rank(b.tier);
    if (tierOrder !== 0) return tierOrder;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  if (!sortedLocalItems.length) {
    const localEmpty = document.createElement("div");
    localEmpty.className = "setHelp";
    localEmpty.style.marginTop = "12px";
    localEmpty.textContent = "No launcher capes are available for your account right now.";
    localSection.appendChild(localEmpty);
  } else {
    const localTiles: Array<{ capeId: string | null; setActive: (active: boolean) => void }> = [];
    const setLocalSelection = (activeCapeId: string | null) => {
      selectedLocalCapeId = activeCapeId ?? "";
      for (const entry of localTiles) entry.setActive(entry.capeId === activeCapeId);
    };

    const noLocalTile = buildTile({
        label: "No Fishbattery Cape",
        imageUrl: null,
        active: !selectedLocalCapeId,
        onSelect: async () => {
          if (activeMcId) await backend.capesSetLocalSelection(activeMcId, null);
          setLocalSelection(null);
          setStatus("Launcher cape selection cleared.");
          await syncSidebarCapePreview();
        }
      });
    localTiles.push({ capeId: null, setActive: noLocalTile.setActive });
    localGrid.appendChild(noLocalTile.tile);
    for (const localItem of sortedLocalItems) {
      const tile = buildTile({
          label: localItem.name,
          imageUrl: localItem.previewDataUrl || null,
          active: selectedLocalCapeId === localItem.id,
          subLabel: localCapeTierLabel(localItem.tier),
          onSelect: async () => {
            if (activeMcId) await backend.capesSetLocalSelection(activeMcId, localItem.id);
            setLocalSelection(localItem.id);
            setStatus(`Selected launcher ${localItem.tier} cape: ${localItem.name}`);
            await syncSidebarCapePreview();
          }
        });
      localTiles.push({ capeId: localItem.id, setActive: tile.setActive });
      localGrid.appendChild(tile.tile);
    }
  }

  if (capeState && activeMcId) {
    const skinSection = document.createElement("div");
    skinSection.className = "capeSection";
    skinSection.style.marginTop = "14px";
    shell.appendChild(skinSection);

    const skinHeading = document.createElement("div");
    skinHeading.className = "capeSectionHeading";
    skinHeading.textContent = "Skins";
    skinSection.appendChild(skinHeading);

    const skinSub = document.createElement("div");
    skinSub.className = "capeSectionSub";
    skinSub.textContent = "Pick one active source: your saved skins or Mojang default skins.";
    skinSection.appendChild(skinSub);

    const savedHeading = document.createElement("div");
    savedHeading.className = "capeSectionHeading";
    savedHeading.style.marginTop = "8px";
    savedHeading.textContent = "Saved skins";
    skinSection.appendChild(savedHeading);

    const savedSub = document.createElement("div");
    savedSub.className = "capeSectionSub";
    savedSub.textContent =
      "Upload one or more PNG files. Selecting a saved skin deactivates default mode. Rename with button or double-click.";
    skinSection.appendChild(savedSub);

    const savedSkinGrid = document.createElement("div");
    savedSkinGrid.className = "capeGrid skinGrid";
    skinSection.appendChild(savedSkinGrid);

    const defaultsHeading = document.createElement("div");
    defaultsHeading.className = "capeSectionHeading";
    defaultsHeading.style.marginTop = "14px";
    defaultsHeading.textContent = "Default Mojang skins";
    skinSection.appendChild(defaultsHeading);

    const defaultsSub = document.createElement("div");
    defaultsSub.className = "capeSectionSub";
    defaultsSub.textContent = "Selecting a default skin switches the active source to defaults.";
    skinSection.appendChild(defaultsSub);

    const defaultSkinGrid = document.createElement("div");
    defaultSkinGrid.className = "capeGrid skinGrid";
    skinSection.appendChild(defaultSkinGrid);

    const skinUiSelection = getSkinUiSelection(activeMcId);
    const selectionMode = skinUiSelection.mode === "default" ? "default" : "saved";

    const skinUploadInput = document.createElement("input");
    skinUploadInput.type = "file";
    skinUploadInput.accept = "image/png";
    skinUploadInput.multiple = true;
    skinUploadInput.style.display = "none";
    skinUploadInput.onchange = () =>
      guarded(async () => {
        const files = Array.from(skinUploadInput.files || []);
        if (!files.length) return;
        const saved = getSavedSkins(activeMcId);
        let uploaded = 0;
        const now = Date.now();
        for (const file of files) {
          const isPng = file.type === "image/png" || /\.png$/i.test(file.name || "");
          if (!isPng) continue;
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
            fr.onerror = () => reject(fr.error || new Error("Could not read skin file"));
            fr.readAsDataURL(file);
          });
          if (!/^data:image\/png;base64,/i.test(dataUrl)) continue;
          const variant: "CLASSIC" | "SLIM" = /(alex|slim)/i.test(file.name) ? "SLIM" : "CLASSIC";
          const baseName = String(file.name || "Skin")
            .replace(/\.png$/i, "")
            .replace(/[_-]+/g, " ")
            .trim();
          saved.push({
            id: `saved-${now}-${uploaded + 1}`,
            name: baseName || `Skin ${saved.length + 1}`,
            variant,
            dataUrl,
            createdAt: now + uploaded
          });
          uploaded += 1;
        }
        if (!uploaded) {
          alert("No PNG skin files were uploaded.");
          return;
        }
        setSavedSkins(activeMcId, saved);
        setStatus(uploaded === 1 ? "Saved 1 skin to launcher library." : `Saved ${uploaded} skins to launcher library.`);
        await renderCapesView(false, capeState);
      });
    skinSection.appendChild(skinUploadInput);

    const addSkinTile = document.createElement("button");
    addSkinTile.type = "button";
    addSkinTile.className = "capeTile skinAddTile";
    addSkinTile.innerHTML = `
      <div class="skinAddInner">
        <div class="skinAddPlus">+</div>
        <div class="skinAddLabel">Add skin(s)</div>
      </div>
    `;
    addSkinTile.onclick = () => skinUploadInput.click();
    savedSkinGrid.appendChild(addSkinTile);

    const officialSkins = Array.isArray(capeState.skins) ? capeState.skins : [];
    const savedSkins = getSavedSkins(activeMcId);
    savedSkins.forEach((skin, idx) => {
      const tile = document.createElement("button");
      const isActive = selectionMode === "saved" && skinUiSelection.activeSavedId === skin.id;
      tile.className = `capeTile skinTile${isActive ? " active" : ""}`;
      tile.type = "button";
      const runRename = async () => {
        const nextName = await showLauncherPrompt("Rename skin", skin.name || `Skin ${idx + 1}`);
        if (nextName == null) return;
        const trimmed = String(nextName).trim();
        if (!trimmed) return;
        const updated = savedSkins.map((s) => (s.id === skin.id ? { ...s, name: trimmed } : s));
        setSavedSkins(activeMcId, updated);
        void renderCapesView(false);
      };
      tile.onclick = async () => {
        try {
          const nextState = await backend.skinsUploadOfficial(activeMcId, skin.dataUrl, skin.variant);
          setOfficialCapeStateCache(activeMcId, nextState);
          setSkinUiSelection(activeMcId, { mode: "saved", defaultKey: undefined, activeSavedId: skin.id });
          setStatus(`Selected skin: ${skin.name || `Skin ${idx + 1}`}`);
          await renderCapesView(false, nextState);
        } catch (err: any) {
          await showLauncherAlert(String(err?.message ?? err ?? "Could not select skin"));
        }
      };
      tile.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        void runRename();
      };

      const preview = document.createElement("div");
      preview.className = "capeTilePreview skinTilePreview";
      const img = document.createElement("img");
      img.className = "skinTileImg";
      img.alt = skin.name || `Skin ${idx + 1}`;
      img.src = skin.dataUrl;
      void setSkinPreviewImage(img, skin.dataUrl, skin.variant === "SLIM" ? "SLIM" : "CLASSIC");
      preview.appendChild(img);

      const footer = document.createElement("div");
      footer.className = "capeTileFooter";
      const dot = document.createElement("span");
      dot.className = `capeTileDot${isActive ? " on" : ""}`;
      const text = document.createElement("span");
      text.className = "capeTileLabel";
      text.textContent = skin.name || `Skin ${idx + 1}`;
      const subText = document.createElement("small");
      subText.className = "capeTileSub";
      subText.textContent = skin.variant === "SLIM" ? "Slim" : "Classic";
      footer.append(dot, text, subText);

      const actions = document.createElement("div");
      actions.className = "row";
      actions.style.justifyContent = "flex-end";
      actions.style.gap = "6px";
      actions.style.padding = "0 8px 8px";

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "btn";
      renameBtn.textContent = "Rename";
      renameBtn.style.padding = "4px 8px";
      renameBtn.style.fontSize = "11px";
      renameBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        void runRename();
      };
      actions.appendChild(renameBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.style.padding = "4px 8px";
      deleteBtn.style.fontSize = "11px";
      deleteBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await showLauncherConfirm(`Delete saved skin "${skin.name || `Skin ${idx + 1}`}"?`);
        if (!ok) return;
        const updated = savedSkins.filter((s) => s.id !== skin.id);
        setSavedSkins(activeMcId, updated);
        if (skinUiSelection.activeSavedId === skin.id) {
          setSkinUiSelection(activeMcId, { activeSavedId: undefined });
        }
        void renderCapesView(false);
      };
      actions.appendChild(deleteBtn);

      tile.append(preview, footer, actions);
      savedSkinGrid.appendChild(tile);
    });

    MOJANG_DEFAULT_SKINS.forEach((def) => {
      const tile = document.createElement("button");
      const isActive = selectionMode === "default" && skinUiSelection.defaultKey === def.key;
      tile.className = `capeTile skinTile skinDefaultTile${isActive ? " active" : ""}`;
      tile.type = "button";
      tile.onclick = async () => {
        try {
          const currentMap = getSkinUiSelection(activeMcId);
          const knownSkinId = currentMap.defaultSkinIds?.[def.key];
          let nextState: any = null;
          if (knownSkinId && officialSkins.some((s) => s.id === knownSkinId)) {
            nextState = await backend.skinsSetOfficialActive(activeMcId, knownSkinId);
          } else {
            const dataUrl = await fetchImageAsDataUrl(def.sourceUrl);
            nextState = await backend.skinsUploadOfficial(activeMcId, dataUrl, def.variant);
            const activeSkinId = String(nextState?.activeSkinId || "").trim();
            if (activeSkinId) {
              setSkinUiSelection(activeMcId, {
                defaultSkinIds: { [def.key]: activeSkinId }
              });
            }
          }
          if (nextState) {
            setOfficialCapeStateCache(activeMcId, nextState);
          }
          setSkinUiSelection(activeMcId, { mode: "default", defaultKey: def.key, activeSavedId: undefined });
          setStatus(`Selected default skin: ${def.name}`);
          await renderCapesView(false, nextState);
        } catch (err: any) {
          await showLauncherAlert(String(err?.message ?? err ?? "Could not select default skin"));
        }
      };

      const preview = document.createElement("div");
      preview.className = "capeTilePreview skinTilePreview";
      const img = document.createElement("img");
      img.className = "skinTileImg";
      img.alt = `${def.name} default skin`;
      img.src = def.sourceUrl;
      void setSkinPreviewImage(img, def.sourceUrl, def.variant);
      preview.appendChild(img);

      const footer = document.createElement("div");
      footer.className = "capeTileFooter";
      const dot = document.createElement("span");
      dot.className = `capeTileDot${isActive ? " on" : ""}`;
      const text = document.createElement("span");
      text.className = "capeTileLabel";
      text.textContent = def.name;
      const subText = document.createElement("small");
      subText.className = "capeTileSub";
      subText.textContent = def.variant === "SLIM" ? "Slim" : "Classic";
      footer.append(dot, text, subText);

      tile.append(preview, footer);
      defaultSkinGrid.appendChild(tile);
    });
  }

  requestAnimationFrame(() => {
    viewCapes.scrollTo({ top: previousScrollTop });
  });

}

const capePreviewCache = new Map<string, string | null>();
const skinPreviewCache = new Map<string, string | null>();
const skinDefaultDataUrlCache = new Map<string, string>();

async function fetchImageAsDataUrl(sourceUrl: string): Promise<string> {
  const hit = skinDefaultDataUrlCache.get(sourceUrl);
  if (hit) return hit;
  const res = await fetch(sourceUrl, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Could not load default skin (${res.status})`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
    fr.onerror = () => reject(fr.error || new Error("Could not read default skin"));
    fr.readAsDataURL(blob);
  });
  if (!/^data:image\/png;base64,/i.test(dataUrl)) throw new Error("Default skin must be PNG.");
  skinDefaultDataUrlCache.set(sourceUrl, dataUrl);
  return dataUrl;
}

async function buildSkinPanelPreviewDataUrl(
  sourceUrl: string,
  variant: "CLASSIC" | "SLIM" = "CLASSIC"
): Promise<string | null> {
  const src = String(sourceUrl || "").trim();
  if (!src) return null;
  const cacheKey = `${variant}:${src}`;
  if (skinPreviewCache.has(cacheKey)) return skinPreviewCache.get(cacheKey) ?? null;
  // Avoid creating one WebGL context per tile preview (can exceed browser limits).
  // The interactive mannequin still uses skinview3d/WebGL; list tiles use 2D previews only.
  const preview = await buildSkinPanelPreviewDataUrlFallback2d(src, variant);
  skinPreviewCache.set(cacheKey, preview);
  return preview;
}

async function buildSkinPanelPreviewDataUrlFallback2d(
  sourceUrl: string,
  variant: "CLASSIC" | "SLIM"
): Promise<string | null> {
  const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = sourceUrl;
  });
  if (!loaded) return null;
  const w = Number(loaded.naturalWidth || 0);
  const h = Number(loaded.naturalHeight || 0);
  if (w <= 0 || h <= 0) return null;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = w;
  sourceCanvas.height = h;
  const sctx = sourceCanvas.getContext("2d");
  if (!sctx) return null;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(loaded, 0, 0);

  const unit = Math.max(1, Math.floor(w / 64));
  const outW = 120;
  const outH = 170;
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, outW, outH);

  const px = 5;
  const modelX = Math.round((outW - 16 * px) / 2);
  const modelY = Math.round((outH - 32 * px) / 2);
  // 2D thumbnail projection can mis-sample slim UV columns on some skins.
  // Use classic arm width in thumbnails to keep previews stable.
  const armWidth = 4;
  const draw = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) => {
    ctx.drawImage(
      sourceCanvas,
      sx * unit,
      sy * unit,
      sw * unit,
      sh * unit,
      modelX + dx * px,
      modelY + dy * px,
      sw * px,
      sh * px
    );
  };
  draw(8, 8, 8, 8, 4, 0);
  if (h >= 64) draw(40, 8, 8, 8, 4, 0);
  draw(20, 20, 8, 12, 4, 8);
  if (h >= 64) draw(20, 36, 8, 12, 4, 8);
  draw(44, 20, armWidth, 12, 0, 8);
  if (h >= 64) draw(44, 36, armWidth, 12, 0, 8);
  draw(h >= 64 ? 36 : 44, h >= 64 ? 52 : 20, armWidth, 12, 12, 8);
  if (h >= 64) draw(52, 52, armWidth, 12, 12, 8);
  draw(4, 20, 4, 12, 4, 20);
  draw(h >= 64 ? 20 : 4, h >= 64 ? 52 : 20, 4, 12, 8, 20);
  if (h >= 64) {
    draw(4, 36, 4, 12, 4, 20);
    draw(4, 52, 4, 12, 8, 20);
  }
  return out.toDataURL("image/png");
}

async function setSkinPreviewImage(
  imgEl: HTMLImageElement,
  sourceUrl: string,
  variant: "CLASSIC" | "SLIM" = "CLASSIC"
) {
  try {
    const preview = await buildSkinPanelPreviewDataUrl(sourceUrl, variant);
    imgEl.src = preview || sourceUrl;
  } catch {
    imgEl.src = sourceUrl;
  }
}

// Build cape panel preview data url.
async function buildCapePanelPreviewDataUrl(sourceUrl: string): Promise<string | null> {
  const src = String(sourceUrl || "").trim();
  if (!src) return null;
  if (capePreviewCache.has(src)) return capePreviewCache.get(src) ?? null;

  const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  if (!loaded) {
    capePreviewCache.set(src, null);
    return null;
  }

  const w = Number(loaded.naturalWidth || 0);
  const h = Number(loaded.naturalHeight || 0);
  if (w <= 0 || h <= 0) {
    capePreviewCache.set(src, null);
    return null;
  }

  // Minecraft cape back panel in the classic cape atlas (the visible outside on player back):
  // 64x32 logical texture: x=1..10, y=1..16 (10x16)
  // Many cape textures are exact scale multiples of this.
  const scale = Math.max(1, Math.floor(w / 64));
  const sx = 1 * scale;
  const sy = 1 * scale;
  const sw = 10 * scale;
  const sh = 16 * scale;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = w;
  sourceCanvas.height = h;
  const sctx = sourceCanvas.getContext("2d");
  if (!sctx) {
    capePreviewCache.set(src, null);
    return null;
  }
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(loaded, 0, 0);

  if (sx + sw > w || sy + sh > h) {
    capePreviewCache.set(src, null);
    return null;
  }

  let patch: Uint8ClampedArray;
  try {
    patch = sctx.getImageData(sx, sy, sw, sh).data;
  } catch {
    capePreviewCache.set(src, null);
    return null;
  }
  let hasPixels = false;
  for (let i = 3; i < patch.length; i += 4) {
    if (patch[i] > 8) {
      hasPixels = true;
      break;
    }
  }
  if (!hasPixels) {
    capePreviewCache.set(src, null);
    return null;
  }

  const outW = 80;
  const outH = 128;
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  if (!octx) {
    capePreviewCache.set(src, null);
    return null;
  }
  octx.imageSmoothingEnabled = false;
  octx.clearRect(0, 0, outW, outH);

  // Keep cape proportions and center in tile.
  const drawH = outH;
  const drawW = Math.round((sw / sh) * drawH);
  const dx = Math.round((outW - drawW) / 2);
  octx.drawImage(sourceCanvas, sx, sy, sw, sh, dx, 0, drawW, drawH);

  const preview = out.toDataURL("image/png");
  capePreviewCache.set(src, preview);
  return preview;
}

// Set cape preview image.
async function setCapePreviewImage(imgEl: HTMLImageElement, sourceUrl: string) {
  try {
    const preview = await buildCapePanelPreviewDataUrl(sourceUrl);
    imgEl.src = preview || sourceUrl;
  } catch {
    imgEl.src = sourceUrl;
  }
}

// Dispose capes character preview.
function disposeCapesCharacterPreview() {
  try {
    capesSkinControls?.dispose?.();
  } catch {}
  capesSkinControls = null;
  try {
    capesSkinViewer?.dispose?.();
  } catch {}
  capesSkinViewer = null;
}

// Render interactive character preview.
async function renderInteractiveCharacterPreview(
  hostEl: HTMLElement,
  skinSourceUrl: string | null,
  capeSourceUrl: string | null
) {
  disposeCapesCharacterPreview();
  hostEl.innerHTML = "";

  const skinSrc = String(skinSourceUrl || "").trim();
  if (!skinSrc) {
    const empty = document.createElement("div");
    empty.className = "capeMannequinEmpty";
    empty.textContent = "No skin";
    hostEl.appendChild(empty);
    return;
  }

  const capeSrc = String(capeSourceUrl || "").trim();
  const canvas = document.createElement("canvas");
  canvas.className = "capeMannequinCanvas";
  hostEl.appendChild(canvas);

  const width = Math.max(180, hostEl.clientWidth || 180);
  const height = Math.max(220, hostEl.clientHeight || 220);
  const viewer = new (skinview3d as any).SkinViewer({
    canvas,
    width,
    height
  });
  capesSkinViewer = viewer;

  try {
    await viewer.loadSkin(skinSrc);
    if (capeSrc) {
      try {
        await viewer.loadCape(capeSrc);
        if (viewer.playerObject?.cape) viewer.playerObject.cape.visible = true;
      } catch (err) {
        console.warn("Cape preview load failed, continuing without cape", err);
        if (viewer.playerObject?.cape) viewer.playerObject.cape.visible = false;
      }
    } else if (viewer.playerObject?.cape) {
      viewer.playerObject.cape.visible = false;
    }

    viewer.background = null;
    viewer.fov = 42;
    viewer.zoom = 0.58;
    viewer.playerObject.rotation.y = Math.PI;
    viewer.camera.position.set(26, 0, 48);

    const controls = viewer.controls;
    capesSkinControls = controls;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.rotateSpeed = 0.9;
    controls.target.set(0, 0, 0);
    controls.update();
  } catch (err) {
    console.error("Character preview failed", err);
    disposeCapesCharacterPreview();
    hostEl.innerHTML = "";
    const fail = document.createElement("div");
    fail.className = "capeMannequinEmpty";
    fail.textContent = "Preview unavailable";
    hostEl.appendChild(fail);
  }
}

// Open modal.
function openModal(which: ModalTabId = "general") {
  modalBackdrop.classList.add("open");
  setModalTab(which);
}

// Close modal.
function closeModal() {
  modalBackdrop.classList.remove("open");
}

function editedInstanceLoader(): LoaderKind {
  if (!editInstanceId) return "fabric";
  const inst = (state.instances?.instances ?? []).find((x: any) => String(x.id) === String(editInstanceId)) ?? null;
  return getInstanceDisplayLoader(inst);
}

// Set modal tab.
function setModalTab(which: ModalTabId) {
  if (!modalTabGeneral || !modalTabInstalled || !modalTabDiscover || !modalPanelGeneral || !modalPanelInstalled || !modalPanelDiscover) {
    return;
  }
  const canShowInstanceTabs = modalMode === "edit" && !!editInstanceId;
  const showInstalled = which === "installed" && canShowInstanceTabs;
  const showDiscover = which === "discover" && canShowInstanceTabs;
  const isCreateMode = modalMode === "create";
  activeModalTab = showInstalled || showDiscover ? which : "general";

  modalTabGeneral.textContent = isCreateMode ? "Create" : "Edit";

  modalTabGeneral.classList.toggle("active", !showInstalled && !showDiscover);
  modalTabInstalled.classList.toggle("active", showInstalled);
  modalTabDiscover.classList.toggle("active", showDiscover);
  modalTabGeneral.style.display = "";
  modalTabInstalled.style.display = isCreateMode ? "none" : "";
  modalTabDiscover.style.display = isCreateMode ? "none" : "";

  modalPanelGeneral.style.display = showInstalled || showDiscover ? "none" : "";
  modalPanelInstalled.style.display = showInstalled ? "" : "none";
  modalPanelDiscover.style.display = showDiscover ? "" : "none";

  modalTabInstalled.toggleAttribute("disabled", !canShowInstanceTabs);
  modalTabDiscover.toggleAttribute("disabled", !canShowInstanceTabs);
}

if (modalTabGeneral) modalTabGeneral.onclick = () => setModalTab("general");
if (modalTabInstalled)
  modalTabInstalled.onclick = async () => {
    setModalTab("installed");
    await renderLocalContent(editInstanceId);
    await renderInstanceMods(editInstanceId);
  };
if (modalTabDiscover)
  modalTabDiscover.onclick = async () => {
    setModalTab("discover");
    await renderLocalContent(editInstanceId);
    await renderInstanceMods(editInstanceId);
    await runInstanceModrinthContentSearch(editInstanceId);
  };

// Format bytes.
function formatBytes(n: number) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const rounded = i === 0 ? `${Math.round(v)}` : `${v.toFixed(1)}`;
  return `${rounded} ${units[i]}`;
}

// Format playtime.
function formatPlaytime(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(Number(ms || 0) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

// Format preset label.
function formatPresetLabel(presetId: string | null | undefined) {
  const id = String(presetId || "none");
  if (id === "none") return "None";
  const preset = (INSTANCE_PRESETS as Record<string, InstancePreset>)[id];
  return preset?.name || id;
}

// Render profile image.
function renderProfileImage(summary: Awaited<ReturnType<typeof backend.profileGetSummary>>, tierLabel: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#07131b");
  gradient.addColorStop(1, "#0d2434");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(40, 40, canvas.width - 80, canvas.height - 80);

  ctx.fillStyle = "#e8f6ff";
  ctx.font = "bold 46px 'Segoe UI', sans-serif";
  ctx.fillText("Fishbattery Profile Showcase", 70, 120);

  ctx.fillStyle = "#9fc2d8";
  ctx.font = "24px 'Segoe UI', sans-serif";
  ctx.fillText(`Tier: ${tierLabel}`, 70, 165);
  ctx.fillText(`Generated: ${new Date(summary.generatedAt).toLocaleString()}`, 70, 200);

  const cards = [
    `Playtime: ${formatPlaytime(summary.totals.totalPlaytimeMs)}`,
    `Installed mods: ${summary.totals.installedMods}`,
    `Instances: ${summary.totals.instances}`,
    `Active preset: ${formatPresetLabel(summary.activeInstance?.presetId)}`,
    summary.bestBenchmark
      ? `Best benchmark: ${summary.bestBenchmark.avgFps} FPS (${summary.bestBenchmark.instanceName})`
      : "Best benchmark: none",
    `Hardware (public): ${summary.hardwarePublic.cpuCores} cores, ${summary.hardwarePublic.ram} RAM`
  ];

  ctx.font = "bold 28px 'Segoe UI', sans-serif";
  let y = 270;
  for (const line of cards) {
    ctx.fillStyle = "#dff5ff";
    ctx.fillText(line, 80, y);
    y += 56;
  }

  return canvas;
}

// ---------------- Simple display names (catalog id__filename) ----------------
function getPrettyName(kind: "mods" | "resourcepacks" | "shaderpacks", fileName: string) {
  const clean = fileName.replace(/\.disabled$/, "");
  const parts = clean.split("__");

  if (parts.length > 1) {
    const id = parts[0];

    if (kind === "mods") {
      const found = CATALOG.find((m) => m.id === id);
      if (found) return found.name;
    } else {
      const found = PACK_CATALOG.find((p) => p.id === id);
      if (found) return found.name;
    }
  }

  // fallback: nicer filename
  return clean
    .replace(/\.jar$/, "")
    .replace(/\.zip$/, "")
    .replace(/_/g, " ");
}

function inferLocalModDescription(fileName: string) {
  const clean = fileName.replace(/\.disabled$/, "");
  const parts = clean.split("__");
  if (parts.length > 1) {
    const id = parts[0];
    const found = CATALOG.find((m) => m.id === id);
    if (found) {
      return `Managed mod (${id})`;
    }
  }
  return "Local .jar mod file";
}

// ---------------- Local file list (enable/disable + remove) ----------------
function renderFileList(
  el: HTMLElement,
  kind: "mods" | "resourcepacks" | "shaderpacks",
  items: Array<{ name: string; size: number }>,
  onRemove: (name: string) => void,
  onToggleEnabled?: (name: string, enable: boolean) => void,
  options?: {
    modMetadataByName?: Record<
      string,
      {
        title?: string;
        description?: string;
        iconUrl?: string | null;
        author?: string | null;
        source?: "modrinth" | "curseforge";
      }
    >;
    packMetadataByName?: Record<
      string,
      {
        title?: string;
        description?: string;
        iconUrl?: string | null;
        author?: string | null;
        source?: "modrinth";
      }
    >;
    searchQuery?: string;
  }
) {
  el.innerHTML = "";

  const query = String(options?.searchQuery || "").trim().toLowerCase();
  const sortedItems = [...(items || [])].sort((a, b) => {
    const getDisplayName = (item: { name: string }) => {
      if (kind === "mods") {
        const meta = options?.modMetadataByName?.[item.name.toLowerCase()];
        return String(meta?.title || getPrettyName("mods", item.name)).toLowerCase();
      }
      const meta = options?.packMetadataByName?.[`${kind}:${item.name.toLowerCase()}`];
      return String(meta?.title || getPrettyName(kind, item.name)).toLowerCase();
    };
    return getDisplayName(a).localeCompare(getDisplayName(b), undefined, { sensitivity: "base" });
  });
  const visibleItems = sortedItems.filter((item) => {
    if (!query) return true;
    if (kind === "mods") {
      const meta = options?.modMetadataByName?.[item.name.toLowerCase()];
      const haystack = [meta?.title, getPrettyName("mods", item.name), item.name, meta?.author, meta?.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    }
    const meta = options?.packMetadataByName?.[`${kind}:${item.name.toLowerCase()}`];
    const haystack = [meta?.title, getPrettyName(kind, item.name), item.name, meta?.author, meta?.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  if (!items?.length) {
    el.innerHTML = '<div class="muted" style="font-size:12px">Nothing installed.</div>';
    return;
  }
  if (!visibleItems.length) {
    el.innerHTML = '<div class="muted" style="font-size:12px">No installed mods match your search.</div>';
    return;
  }

  for (const it of visibleItems) {
    const isDisabled = it.name.endsWith(".disabled");

    if (kind === "mods") {
      const row = document.createElement("div");
      row.className = "modrinthResult";
      const meta = options?.modMetadataByName?.[it.name.toLowerCase()];

      const icon = document.createElement("img");
      const cleanName = getPrettyName("mods", it.name);
      icon.src = meta?.iconUrl || fallbackPackIconDataUrl(cleanName, "green");
      icon.alt = "";
      row.appendChild(icon);

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.flex = "1";

      const nameEl = document.createElement("div");
      nameEl.className = "setLabel";
      nameEl.textContent = meta?.title || cleanName;

      const desc = document.createElement("div");
      desc.className = "setHelp";
      desc.textContent = meta?.description || inferLocalModDescription(it.name);

      const sub = document.createElement("div");
      sub.className = "setHelp";
      const sourceLabel = meta?.source === "curseforge" ? "CurseForge" : meta?.source === "modrinth" ? "Modrinth" : null;
      const authorLabel = meta?.author ? `by ${meta.author}` : null;
      const metaBits = [authorLabel, sourceLabel].filter(Boolean).join(" | ");
      sub.textContent = `${formatBytes(it.size)}${isDisabled ? " | Disabled" : " | Enabled"}${metaBits ? ` | ${metaBits}` : ""}`;

      left.appendChild(nameEl);
      left.appendChild(desc);
      left.appendChild(sub);
      row.appendChild(left);

      const right = document.createElement("div");
      right.className = "row";
      right.style.justifyContent = "flex-end";
      right.style.gap = "8px";

      if (onToggleEnabled) {
        const toggle = document.createElement("button");
        toggle.className = "btn";
        toggle.textContent = isDisabled ? "Enable" : "Disable";
        toggle.onclick = () => onToggleEnabled(it.name, isDisabled);
        right.appendChild(toggle);
      }

      const remove = document.createElement("button");
      remove.className = "btn";
      remove.textContent = "Remove";
      remove.onclick = () => onRemove(it.name);
      right.appendChild(remove);

      row.appendChild(right);
      el.appendChild(row);
      continue;
    }

    const row = document.createElement("div");
    row.className = "modrinthResult";
    const packMetaKey = `${kind}:${it.name.toLowerCase()}`;
    const packMeta = options?.packMetadataByName?.[packMetaKey];

    const icon = document.createElement("img");
    const cleanPackName = getPrettyName(kind, it.name);
    icon.src = packMeta?.iconUrl || fallbackPackIconDataUrl(cleanPackName, "blue");
    icon.alt = "";
    row.appendChild(icon);

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.flex = "1";

    const nameEl = document.createElement("div");
    nameEl.className = "setLabel";
    nameEl.textContent = packMeta?.title || cleanPackName;

    const desc = document.createElement("div");
    desc.className = "setHelp";
    desc.textContent = packMeta?.description || (kind === "shaderpacks" ? "Local shader pack (.zip)" : "Local resource pack (.zip)");

    const sub = document.createElement("div");
    sub.className = "setHelp";
    const metaBits = [packMeta?.author ? `by ${packMeta.author}` : null, packMeta?.source ? "Modrinth" : null]
      .filter(Boolean)
      .join(" | ");
    sub.textContent = `${formatBytes(it.size)}${isDisabled ? " | Disabled" : " | Enabled"}${metaBits ? ` | ${metaBits}` : ""}`;

    left.appendChild(nameEl);
    left.appendChild(desc);
    left.appendChild(sub);

    const right = document.createElement("div");
    right.className = "row";
    right.style.justifyContent = "flex-end";
    right.style.gap = "8px";

    if (onToggleEnabled) {
      const toggle = document.createElement("button");
      toggle.className = "btn";
      toggle.textContent = isDisabled ? "Enable" : "Disable";
      toggle.onclick = () => onToggleEnabled(it.name, isDisabled);
      right.appendChild(toggle);
    }

    const remove = document.createElement("button");
    remove.className = "btn";
    remove.textContent = "Remove";
    remove.onclick = () => onRemove(it.name);
    right.appendChild(remove);

    row.appendChild(left);
    row.appendChild(right);
    el.appendChild(row);
  }
}

// ---------------- Settings UI ----------------
function clearPanel(el: HTMLElement) {
  el.innerHTML = "";
}

// Make h3.
function makeH3(text: string) {
  const h = document.createElement("h3");
  h.textContent = text;
  return h;
}

// Make row.
function makeRow(label: string, help?: string) {
  const row = document.createElement("div");
  row.className = "setRow";

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.flexDirection = "column";

  const l = document.createElement("div");
  l.className = "setLabel";
  l.textContent = label;

  left.appendChild(l);

  if (help) {
    const h = document.createElement("div");
    h.className = "setHelp";
    h.textContent = help;
    left.appendChild(h);
  }

  row.appendChild(left);
  return { row, left };
}

// Make switch.
function makeSwitch(checked: boolean, onChange: (v: boolean) => void) {
  const wrap = document.createElement("label");
  wrap.className = "switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;

  const slider = document.createElement("span");
  slider.className = "slider";
  slider.tabIndex = 0;
  slider.setAttribute("role", "switch");
  slider.setAttribute("aria-checked", checked ? "true" : "false");

  input.onchange = () => {
    slider.setAttribute("aria-checked", input.checked ? "true" : "false");
    onChange(input.checked);
  };
  slider.onclick = (e) => {
    e.preventDefault();
    input.click();
  };
  slider.onkeydown = (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      input.click();
    }
  };

  wrap.appendChild(input);
  wrap.appendChild(slider);
  return wrap;
}

// Make toggle alias for settings rows that use the shared switch styling.
function makeToggle(checked: boolean, onChange: (v: boolean) => void | Promise<void>) {
  return makeSwitch(checked, (value) => {
    void onChange(value);
  });
}

// Make select.
function makeSelect(options: Array<{ value: string; label: string }>, value: string, onChange: (v: string) => void) {
  const sel = document.createElement("select");
  sel.className = "setControl";
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
  sel.value = value;
  sel.onchange = () => onChange(sel.value);
  return sel;
}

// Make input.
function makeInput(value: string, placeholder: string, onChange: (v: string) => void) {
  const inp = document.createElement("input");
  inp.className = "setControl";
  inp.value = value;
  inp.placeholder = placeholder;
  inp.oninput = () => onChange(inp.value);
  return inp;
}

// Make textarea.
function makeTextarea(value: string, placeholder: string, onChange: (v: string) => void) {
  const ta = document.createElement("textarea");
  ta.className = "setControl";
  ta.style.minHeight = "92px";
  ta.value = value;
  ta.placeholder = placeholder;
  ta.oninput = () => onChange(ta.value);
  return ta;
}

// Pick image as data url.
async function pickImageAsDataUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept =
      ".png,.jpg,.jpeg,.jfif,.webp,.gif,.bmp,image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp";
    inp.style.position = "fixed";
    inp.style.left = "-99999px";
    inp.style.top = "0";
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      try {
        inp.remove();
      } catch {}
      resolve(value);
    };

    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      const name = String(file.name || "").toLowerCase();
      const looksLikeImage =
        (typeof file.type === "string" && file.type.startsWith("image/")) ||
        /\.(png|jpg|jpeg|jfif|webp|gif|bmp)$/i.test(name);
      if (!looksLikeImage) {
        alert("Unsupported image type. Please choose PNG, JPG, JPEG, GIF, WEBP, or BMP.");
        finish(null);
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        alert("Image is too large. Please choose one smaller than 4 MB.");
        finish(null);
        return;
      }
      void (async () => {
        const dataUrl = await normalizeBackgroundImageDataUrl(file);
        finish(dataUrl);
      })();
    };

    inp.addEventListener("cancel", () => finish(null));
    document.body.appendChild(inp);
    inp.click();
  });
}

async function normalizeBackgroundImageDataUrl(file: File): Promise<string | null> {
  const readAsDataUrl = (f: File) =>
    new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(f);
    });

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = objectUrl;
    });
    if (!img) return await readAsDataUrl(file);

    const maxSide = 1600;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w <= 0 || h <= 0) return await readAsDataUrl(file);

    const scale = Math.min(1, maxSide / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return await readAsDataUrl(file);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const tryFormats = [
      () => canvas.toDataURL("image/jpeg", 0.82),
      () => canvas.toDataURL("image/jpeg", 0.74),
      () => canvas.toDataURL("image/jpeg", 0.66),
      () => canvas.toDataURL("image/jpeg", 0.58)
    ];

    let chosen: string | null = null;
    for (const make of tryFormats) {
      const out = make();
      if (!out || !/^data:image\//.test(out)) continue;
      chosen = out;
      if (out.length <= 900_000) break;
    }

    if (!chosen) return await readAsDataUrl(file);
    if (chosen.length > 1_200_000) {
      alert("Image is too detailed for custom background. Try a smaller file.");
      return null;
    }
    return chosen;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Updater status text.
function updaterStatusText(s: UpdaterUiState) {
  const msg = s.message?.trim();
  if (msg) return msg;

  if (s.status === "idle") return "Updates not checked yet.";
  if (s.status === "checking") return "Checking for updates...";
  if (s.status === "update-available") return `Update available: v${s.latestVersion ?? "unknown"}`;
  if (s.status === "up-to-date") return "You are up to date.";
  if (s.status === "downloading") return `Downloading update... ${Number(s.progressPercent ?? 0).toFixed(1)}%`;
  if (s.status === "downloaded") return `Update downloaded: v${s.latestVersion ?? "unknown"}`;
  return "Updater error.";
}

async function refreshPlayitState(silent = false) {
  try {
    const next = (await backend.playitGetState()) as PlayitUiState;
    playitState = {
      ...playitState,
      ...next,
      activeTunnels: Array.isArray(next?.activeTunnels) ? next.activeTunnels : [],
      lastError: null
    };
  } catch (err: any) {
    playitState = {
      ...playitState,
      linked: false,
      hasSecretKey: false,
      activeTunnels: [],
      lastError: String(err?.message ?? err ?? "Could not load Playit state.")
    };
    if (!silent) appendLog(`[playit] ${playitState.lastError}`);
  }
}

function playitStatusText(s: PlayitUiState) {
  if (s.lastError) return s.lastError;
  if (s.linked) {
    const tunnelCount = Array.isArray(s.activeTunnels) ? s.activeTunnels.length : 0;
    if (!s.agentRunning) {
      return `Linked. Starting Playit runtime${tunnelCount ? ` with ${tunnelCount} tunnel${tunnelCount === 1 ? "" : "s"}` : ""}...`;
    }
    return `Linked. ${tunnelCount} tunnel${tunnelCount === 1 ? "" : "s"} available.`;
  }
  return "Not linked. Exchange a Playit setup code through your Fishbattery account, then manage tunnels here.";
}

function buildPlayitServerNotes(tunnel: { id?: string | null; localPort?: number | string | null }) {
  const parts = [PLAYIT_SERVER_NOTE_PREFIX, "Generated by Playit"];
  const tunnelId = String(tunnel.id || "").trim();
  if (tunnelId) parts.push(`tunnel=${tunnelId}`);
  const localPort = String(tunnel.localPort ?? "").trim();
  if (localPort) parts.push(`localPort=${localPort}`);
  return parts.join(" | ");
}

async function upsertPlayitServerEntry(
  instanceId: string,
  tunnel: {
    id?: string | null;
    name?: string | null;
    joinAddress?: string | null;
    assignedDomain?: string | null;
    localPort?: number | string | null;
    active?: boolean | null;
  },
  options?: { autoLan?: boolean; setPreferred?: boolean }
) {
  const safeInstanceId = String(instanceId || "").trim();
  if (!safeInstanceId) return null;
  const listed = await backend.serversList(safeInstanceId);
  const tunnelId = String(tunnel.id || "").trim();
  const joinAddress = String(tunnel.joinAddress || "").trim();
  const existing = (listed?.servers ?? []).find((entry: any) => {
    return (
      (tunnelId && String(entry?.playitTunnelId || "").trim() === tunnelId) ||
      (!!joinAddress && String(entry?.address || "").trim() === joinAddress)
    );
  });
  const resolvedAddress = joinAddress || String(existing?.address || "").trim();
  if (!resolvedAddress) return null;
  const saved = await backend.serversUpsert(safeInstanceId, {
    id: existing?.id,
    name: String(tunnel.name || "").trim() || "Playit Tunnel",
    address: resolvedAddress,
    notes: buildPlayitServerNotes(tunnel),
    source: "playit",
    playitTunnelId: tunnelId || null,
    playitHostname: String(tunnel.assignedDomain || "").trim() || null,
    playitLocalPort: Number(tunnel.localPort || 0) || null,
    playitActive: tunnel.active == null ? null : Boolean(tunnel.active),
    playitAutoLan: options?.autoLan == null ? existing?.playitAutoLan ?? null : Boolean(options.autoLan)
  });
  if (saved?.id && options?.setPreferred !== false) {
    await backend.serversSetPreferred(safeInstanceId, saved.id);
  }
  return saved;
}

async function removePlayitServerEntry(instanceId: string, tunnelId: string) {
  const safeInstanceId = String(instanceId || "").trim();
  const safeTunnelId = String(tunnelId || "").trim();
  if (!safeInstanceId || !safeTunnelId) return false;
  const listed = await backend.serversList(safeInstanceId);
  const existing = (listed?.servers ?? []).find((entry: any) =>
    String(entry?.playitTunnelId || "").trim() === safeTunnelId ||
    String(entry?.notes || "").includes(`tunnel=${safeTunnelId}`)
  );
  if (!existing?.id) return false;
  await backend.serversRemove(safeInstanceId, existing.id);
  return true;
}

function resetPlayitAutoTunnelState() {
  playitAutoTunnelBusy = false;
  playitAutoTunnelAttemptKey = "";
}

function findPlayitTunnelById(tunnelId: string) {
  const safeTunnelId = String(tunnelId || "").trim();
  if (!safeTunnelId) return null;
  return playitState.activeTunnels.find((tunnel) => String(tunnel?.id || "").trim() === safeTunnelId) ?? null;
}

function isPlayitLanWorldClosedLog(line: string) {
  const text = String(line || "");
  return PLAYIT_LAN_CLOSED_PATTERNS.some((pattern) => pattern.test(text));
}

async function resolveInstanceAutoLanServerEntry(instanceId: string) {
  const safeInstanceId = String(instanceId || "").trim();
  if (!safeInstanceId) return null;
  const listed = await backend.serversList(safeInstanceId);
  const servers = Array.isArray(listed?.servers) ? listed.servers : [];
  const preferredId = String(listed?.preferredServerId || "").trim();
  const autoLanEntries = servers.filter(
    (entry: any) =>
      String(entry?.source || "").trim() === "playit" &&
      !!String(entry?.playitTunnelId || "").trim() &&
      (entry?.playitAutoLan === true || entry?.playitAutoLan == null)
  );
  if (!autoLanEntries.length) return null;
  return (
    autoLanEntries.find((entry: any) => String(entry?.id || "").trim() === preferredId) ??
    autoLanEntries.sort((a: any, b: any) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0))[0] ??
    null
  );
}

async function finalizePlayitTunnelReady(
  tunnel: { id?: string | null; name?: string | null; joinAddress?: string | null; localPort?: number | string | null },
  instanceId: string | null,
  sourceLabel: string,
  options?: { alert?: boolean }
) {
  const joinAddress = String(tunnel?.joinAddress || "").trim();
  const safeInstanceId = String(instanceId || "").trim();
  if (safeInstanceId && joinAddress) {
    await upsertPlayitServerEntry(safeInstanceId, tunnel);
    appendLog(`[playit] Saved join address to servers for instance ${safeInstanceId}.`);
  } else if (!safeInstanceId && joinAddress) {
    appendLog("[playit] Tunnel created, but no active instance was selected for server-list save.");
  }
  if (joinAddress) {
    setStatus(`Playit tunnel ready: ${joinAddress}`);
    appendLog(`[playit] ${sourceLabel} ready: ${joinAddress}`);
    if (options?.alert !== false) {
      await showLauncherAlert(`Join address: ${joinAddress}`, "Playit tunnel ready");
    }
  } else {
    setStatus("Playit tunnel created. Join address is still pending.");
    appendLog(`[playit] ${sourceLabel} created. Join address pending.`);
  }
}

function findPlayitTunnelByLocalPort(localPort: number) {
  return playitState.activeTunnels.find((tunnel) => Number(tunnel?.localPort || 0) === Number(localPort)) ?? null;
}

function parsePlayitLanPortFromLog(line: string) {
  const text = String(line || "");
  for (const pattern of PLAYIT_LAN_PORT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const port = Number(match[1] || 0);
    if (Number.isFinite(port) && port > 0) return port;
  }
  return 0;
}

async function createPlayitMinecraftLanTunnel(localPort: number, reason: "manual" | "auto-lan") {
  const activeInstanceId = state.instances?.activeInstanceId ?? null;
  const activeInstance = (state.instances?.instances ?? []).find((x: any) => x.id === activeInstanceId) ?? null;
  const tunnelName =
    String(playitTunnelNameDraft || "").trim() ||
    `${String(activeInstance?.name || "Minecraft").trim() || "Minecraft"} LAN`;
  const created = await backend.playitCreateTunnel({
    name: tunnelName,
    tunnelType: "minecraft-java",
    tunnelDescription: "Minecraft Java server tunnel",
    portType: "tcp",
    portCount: 1,
    localIp: "127.0.0.1",
    localPort: Number(localPort || 25565),
    enabled: true
  });
  if (reason === "manual") {
    playitTunnelNameDraft = "";
  }
  await refreshPlayitState(true);
  const createdTunnel = created?.created ?? findPlayitTunnelByLocalPort(localPort);
  await finalizePlayitTunnelReady(createdTunnel || { localPort }, activeInstanceId, "Playit tunnel", {
    alert: reason === "manual"
  });
  if (viewPlayit.style.display !== "none") {
    renderPlayitPanel();
  }
  return createdTunnel;
}

async function disablePlayitAutoTunnelForInstance(instanceId: string, reason: string) {
  const safeInstanceId = String(instanceId || "").trim();
  if (!safeInstanceId || !playitState.linked) return false;
  if (playitAutoTunnelDisableBusy) return false;
  const serverEntry = await resolveInstanceAutoLanServerEntry(safeInstanceId);
  const tunnelId = String(serverEntry?.playitTunnelId || "").trim();
  if (!tunnelId) return false;
  const current = findPlayitTunnelById(tunnelId);
  if (current && current.active === false) {
    await upsertPlayitServerEntry(
      safeInstanceId,
      {
        ...current,
        joinAddress: current.joinAddress || serverEntry?.address || null,
        assignedDomain: current.assignedDomain || serverEntry?.playitHostname || null,
        localPort: current.localPort ?? serverEntry?.playitLocalPort ?? null,
        active: false
      },
      { autoLan: true, setPreferred: false }
    );
    return false;
  }

  playitAutoTunnelDisableBusy = true;
  try {
    appendLog(`[playit] Disabling auto-LAN tunnel for instance ${safeInstanceId} (${reason}).`);
    await backend.playitUpdateTunnel({
      tunnelId,
      localIp: "127.0.0.1",
      localPort: serverEntry?.playitLocalPort ?? current?.localPort ?? null,
      enabled: false
    });
    await refreshPlayitState(true);
    const updated = findPlayitTunnelById(tunnelId);
    await upsertPlayitServerEntry(
      safeInstanceId,
      {
        id: tunnelId,
        name: updated?.name || serverEntry?.name || "Playit Tunnel",
        joinAddress: updated?.joinAddress || serverEntry?.address || null,
        assignedDomain: updated?.assignedDomain || serverEntry?.playitHostname || null,
        localPort: updated?.localPort ?? serverEntry?.playitLocalPort ?? null,
        active: false
      },
      { autoLan: true, setPreferred: false }
    );
    if (viewPlayit.style.display !== "none") {
      renderPlayitPanel();
    }
    return true;
  } finally {
    playitAutoTunnelDisableBusy = false;
  }
}

async function handleDetectedLanPort(localPort: number) {
  const safePort = Number(localPort || 0);
  if (!Number.isFinite(safePort) || safePort <= 0) return;
  const activeInstanceId = String(state.instances?.activeInstanceId || "").trim();
  if (!activeInstanceId || !playitState.linked || !playitState.autoTunnelEnabled) return;

  const attemptKey = `${activeInstanceId}:${safePort}`;
  if (playitAutoTunnelBusy || playitAutoTunnelAttemptKey === attemptKey) return;

  const autoLanEntry = await resolveInstanceAutoLanServerEntry(activeInstanceId);
  const autoLanTunnelId = String(autoLanEntry?.playitTunnelId || "").trim();
  const autoLanTunnel = autoLanTunnelId ? findPlayitTunnelById(autoLanTunnelId) : null;

  if (autoLanTunnelId) {
    playitAutoTunnelAttemptKey = attemptKey;
    if (autoLanTunnel && Number(autoLanTunnel.localPort || 0) === safePort && autoLanTunnel.active) {
      await finalizePlayitTunnelReady(autoLanTunnel, activeInstanceId, "Existing Playit tunnel", { alert: false });
      return;
    }
  }

  playitAutoTunnelBusy = true;
  playitAutoTunnelAttemptKey = attemptKey;
  try {
    if (autoLanTunnelId) {
      appendLog(`[playit] Detected LAN world on port ${safePort}. Reusing Playit tunnel ${autoLanTunnelId}...`);
      setStatus(`Detected LAN world on ${safePort}. Updating Playit tunnel...`);
      await backend.playitUpdateTunnel({
        tunnelId: autoLanTunnelId,
        localIp: "127.0.0.1",
        localPort: safePort,
        enabled: true
      });
      await refreshPlayitState(true);
      const updated = findPlayitTunnelById(autoLanTunnelId) ?? {
        id: autoLanTunnelId,
        name: autoLanEntry?.name || "Playit Tunnel",
        joinAddress: autoLanEntry?.address || null,
        assignedDomain: autoLanEntry?.playitHostname || null,
        localPort: safePort,
        active: true
      };
      await finalizePlayitTunnelReady(updated, activeInstanceId, "Playit tunnel", { alert: false });
      await upsertPlayitServerEntry(
        activeInstanceId,
        {
          ...updated,
          localPort: safePort,
          active: true
        },
        { autoLan: true, setPreferred: true }
      );
      if (viewPlayit.style.display !== "none") {
        renderPlayitPanel();
      }
      return;
    }

    appendLog(`[playit] Detected LAN world on port ${safePort}. Creating Playit tunnel...`);
    setStatus(`Detected LAN world on ${safePort}. Creating Playit tunnel...`);
    const created = await createPlayitMinecraftLanTunnel(safePort, "auto-lan");
    await upsertPlayitServerEntry(
      activeInstanceId,
      {
        ...(created || { localPort: safePort, active: true }),
        active: true
      },
      { autoLan: true, setPreferred: true }
    );
  } catch (err: any) {
    playitAutoTunnelAttemptKey = "";
    const message = String(err?.message ?? err ?? "Could not create Playit tunnel for LAN world.");
    appendLog(`[playit] Auto-LAN tunnel failed: ${message}`);
    setStatus(message);
    await showLauncherAlert(message, "Playit auto-LAN failed");
  } finally {
    playitAutoTunnelBusy = false;
  }
}

// Preflight summary text.
function preflightSummaryText(p: any) {
  if (!p) return "No preflight run yet.";
  if (p.summary === "healthy") return "Preflight healthy.";
  if (p.summary === "warnings") return "Preflight completed with warnings.";
  return "Preflight detected critical issues.";
}

// Cloud sync status text.
function cloudSyncStatusText(state: CloudSyncUiState) {
  if (!state) return "Cloud sync has not run yet.";
  if (state.lastStatus === "up-to-date") return "Cloud sync is up to date.";
  if (state.lastStatus === "pushed") return "Local changes were pushed to cloud.";
  if (state.lastStatus === "pulled") return "Cloud changes were applied locally.";
  if (state.lastStatus === "conflict") return "Cloud conflict detected. Resolve manually.";
  if (state.lastStatus === "error") return state.lastError || "Cloud sync failed.";
  return "Cloud sync is idle.";
}

// Apply remote synced settings.
function applyRemoteSyncedSettings(patch: Record<string, unknown> | null | undefined) {
  if (!patch || typeof patch !== "object") return;
  setSettings(patch as Partial<AppSettings>, { touchUpdatedAt: false });
  ensureCloudSyncTimer();
}

// Run cloud sync.
async function runCloudSync(manual: boolean, forcedPolicy?: "prefer-local" | "prefer-cloud") {
  const s = getSettings();
  if (!s.cloudSyncEnabled) return;
  if (!state.launcherAccount?.activeAccountId) return;

  // "ask" delegates user decision only during manual sync; automated sync uses configured policy.
  const policy = forcedPolicy || s.cloudSyncConflictPolicy || "ask";
  const result = await backend.cloudSyncSyncNow({
    settings: getSettings() as unknown as Record<string, unknown>,
    policy,
    resolveConflict: !!forcedPolicy
  });

  cloudSyncState = {
    lastSyncedAt: result.lastSyncedAt ?? cloudSyncState.lastSyncedAt,
    lastStatus:
      result.status === "pushed" || result.status === "pulled" || result.status === "up-to-date"
        ? result.status
        : result.status === "conflict"
          ? "conflict"
          : "error",
    lastError: result.status === "error" ? result.message : result.status === "conflict" ? result.message : null,
    lastRemoteRevision: result.lastRemoteRevision ?? cloudSyncState.lastRemoteRevision
  };

  if (result.status === "pulled" && result.settingsPatch) {
    // Apply cloud-delivered settings immediately and refresh instance cards.
    applyRemoteSyncedSettings(result.settingsPatch);
    state.instances = await backend.instancesList();
    await renderInstances();
  }

  if (result.status === "error") {
    const syncErr = String(result.message || "").toLowerCase();
    if (
      syncErr.includes("invalid token") ||
      syncErr.includes("jwt") ||
      syncErr.includes("not signed in") ||
      syncErr.includes("session expired")
    ) {
      try {
        state.launcherAccount = await backend.launcherAccountGetState();
        await refreshLauncherSubscription();
        await renderAccounts();
      } catch {}
    }
  }

  if (result.status === "conflict" && manual && policy === "ask") {
    // Interactive conflict resolution for user-triggered sync runs.
    const useCloud = await showLauncherConfirm(
      "Cloud sync conflict detected.\n\nOK = use cloud state\nCancel = keep local state\n\nYou can change this behavior in:\nSettings > Install > Conflict policy"
    );
    await runCloudSync(true, useCloud ? "prefer-cloud" : "prefer-local");
    return;
  }

  if (manual) {
    const stamp = cloudSyncState.lastSyncedAt
      ? new Date(cloudSyncState.lastSyncedAt).toLocaleString()
      : "never";
    await showLauncherAlert(`Cloud sync: ${result.message}\nLast sync: ${stamp}`);
  }
}

// Ensure cloud sync timer.
function ensureCloudSyncTimer() {
  if (cloudSyncIntervalId != null) {
    window.clearInterval(cloudSyncIntervalId);
    cloudSyncIntervalId = null;
  }
  const s = getSettings();
  if (!s.cloudSyncEnabled || !s.cloudSyncAuto) return;
  // Periodic background sync (5 min cadence) keeps settings/instances fresh across devices.
  cloudSyncIntervalId = window.setInterval(() => {
    void guarded(async () => {
      await runCloudSync(false);
      renderSettingsPanels();
    });
  }, 5 * 60 * 1000);
}

// Ensure running status poll.
function ensureRunningStatusPoll() {
  if (runningStatusPollId != null) return;
  // Lightweight running-state refresh used by topbar pill + play/stop affordances.
  runningStatusPollId = window.setInterval(() => {
    void guarded(async () => {
      const allInstances = state.instances?.instances ?? [];
      if (!allInstances.length) {
        lastRunningSignature = "";
        updateTopbarRunningPill(0);
        return;
      }
      const runningSnapshot = await getRunningSnapshot(allInstances);
      updateTopbarRunningPill(runningSnapshot.count);
      const nextSignature = buildRunningSignature(allInstances, runningSnapshot);
      if (nextSignature !== lastRunningSignature) {
        lastRunningSignature = nextSignature;
        await renderInstances();
      }
    });
  }, 3000);
}

// All instance preset ids.
function allInstancePresetIds(): InstancePresetId[] {
  return ["none", ...Object.keys(INSTANCE_PRESETS)] as InstancePresetId[];
}

type ResolvedPresetVariant = {
  variant: InstancePresetVariantBase;
  sourceLoader: LoaderKind;
  mcBucket: McPresetBucket;
};

// Resolve a preset variant for any loader by preferring exact match and then safe fallbacks.
function resolvePresetVariantForLoader(
  preset: InstancePreset,
  loader: LoaderKind,
  mcVersion: string
): ResolvedPresetVariant | null {
  const exact = preset.variants?.[loader];
  if (exact) {
    const effective = materializePresetVariant(exact, mcVersion);
    return { variant: effective.variant, sourceLoader: loader, mcBucket: effective.bucket };
  }

  const fallbackOrder: LoaderKind[] = ["fabric", "vanilla", "quilt", "forge", "neoforge"];
  for (const candidate of fallbackOrder) {
    const v = preset.variants?.[candidate];
    if (v) {
      const effective = materializePresetVariant(v, mcVersion);
      return { variant: effective.variant, sourceLoader: candidate, mcBucket: effective.bucket };
    }
  }
  return null;
}

// Available preset ids for loader.
function availablePresetIdsForLoader(loader: LoaderKind): InstancePresetId[] {
  if (loader === "vanilla") return ["none"];
  return allInstancePresetIds();
}

const PRESET_AVAILABILITY_CACHE = new Map<string, boolean>();
let presetAvailabilityRequestToken = 0;

function getPresetAvailabilityCacheKey(projectId: string, loader: LoaderKind, mcVersion: string) {
  return `${projectId}|${loader}|${mcVersion}`;
}

async function hasCompatiblePresetPackUpload(projectId: string, loader: LoaderKind, mcVersion: string): Promise<boolean> {
  const gameVersion = String(mcVersion || "").trim();
  if (!gameVersion || loader === "vanilla") return false;
  const key = getPresetAvailabilityCacheKey(projectId, loader, gameVersion);
  const cached = PRESET_AVAILABILITY_CACHE.get(key);
  if (typeof cached === "boolean") return cached;

  const params = new URLSearchParams();
  params.set("game_versions", JSON.stringify([gameVersion]));
  params.set("loaders", JSON.stringify([loader]));
  const url = `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Modrinth lookup failed (${res.status})`);
  const versions = await res.json();
  const ok = Array.isArray(versions) && versions.length > 0;
  PRESET_AVAILABILITY_CACHE.set(key, ok);
  return ok;
}

// Fill instance preset dropdown.
function fillInstancePresetDropdown(
  selectedId: string | null,
  loader: LoaderKind = "fabric",
  mcVersion = "",
  availability: Partial<Record<Exclude<InstancePresetId, "none">, boolean | null>> = {}
) {
  instancePreset.innerHTML = "";

  const none = document.createElement("option");
  none.value = "none";
  none.textContent = "None (Custom)";
  instancePreset.appendChild(none);

  for (const id of Object.keys(INSTANCE_PRESETS) as Array<Exclude<InstancePresetId, "none">>) {
    const p = INSTANCE_PRESETS[id];
    const opt = document.createElement("option");
    opt.value = id;
    const mappedProject = PRESET_MODRINTH_PACK_PROJECTS[id];
    let disabled = loader === "vanilla";
    let label = p.name;

    if (loader === "vanilla") {
      label = `${p.name} (Not available on vanilla)`;
      disabled = true;
    } else if (!mappedProject) {
      label = `${p.name} (coming soon)`;
      disabled = true;
    } else if (mappedProject) {
      const status = availability[id];
      if (status === null) {
        label = `${p.name} (Checking upload availability...)`;
        disabled = true;
      } else if (status === false) {
        label = `${p.name} (Not uploaded for ${loader} ${mcVersion || "selected version"})`;
        disabled = true;
      }
    }

    opt.textContent = label;
    opt.disabled = disabled;
    instancePreset.appendChild(opt);
  }

  const wanted = (selectedId ?? "none") as InstancePresetId;
  const safe =
    wanted === "none"
      ? "none"
      : availablePresetIdsForLoader(loader).includes(wanted) &&
          !!instancePreset.querySelector(`option[value="${wanted}"]:not([disabled])`)
        ? wanted
        : "none";
  instancePreset.value = safe;
}

async function refreshPresetDropdownAvailability(
  selectedId: string | null,
  loader: LoaderKind = "fabric",
  mcVersion = ""
) {
  const token = ++presetAvailabilityRequestToken;
  const availability: Partial<Record<Exclude<InstancePresetId, "none">, boolean | null>> = {};
  for (const id of Object.keys(PRESET_MODRINTH_PACK_PROJECTS) as Array<Exclude<InstancePresetId, "none">>) {
    availability[id] = null;
  }
  fillInstancePresetDropdown(selectedId, loader, mcVersion, availability);

  if (loader === "vanilla") return;
  const gameVersion = String(mcVersion || "").trim();
  if (!gameVersion) {
    for (const id of Object.keys(PRESET_MODRINTH_PACK_PROJECTS) as Array<Exclude<InstancePresetId, "none">>) {
      availability[id] = false;
    }
    fillInstancePresetDropdown(selectedId, loader, mcVersion, availability);
    return;
  }

  const checks = await Promise.all(
    (Object.keys(PRESET_MODRINTH_PACK_PROJECTS) as Array<Exclude<InstancePresetId, "none">>).map(async (id) => {
      const projectId = PRESET_MODRINTH_PACK_PROJECTS[id];
      if (!projectId) return [id, true] as const;
      try {
        const ok = await hasCompatiblePresetPackUpload(projectId, loader, gameVersion);
        return [id, ok] as const;
      } catch {
        // Keep presets selectable if availability check fails due to transient network/API issues.
        return [id, true] as const;
      }
    })
  );

  if (token !== presetAvailabilityRequestToken) return;
  for (const [id, ok] of checks) availability[id] = ok;
  fillInstancePresetDropdown(selectedId, loader, mcVersion, availability);
}

// Apply instance preset.
async function applyInstancePreset(instanceId: string, mcVersion: string, loader: LoaderKind, presetId: InstancePresetId) {
  if (presetId === "none") return;
  if (loader === "vanilla") {
    appendLog(`[preset] "${presetId}" is not available on vanilla instances.`);
    return;
  }
  const preset = INSTANCE_PRESETS[presetId];
  if (!preset) return;
  const presetModrinthPackProject = PRESET_MODRINTH_PACK_PROJECTS[presetId as Exclude<InstancePresetId, "none">];
  if (presetModrinthPackProject) {
    const inst =
      (state.instances?.instances ?? []).find((x: any) => String(x.id) === instanceId) ?? null;
    setStatus(`Applying instance preset "${preset.name}"...`);
    try {
      appendLog(`[preset] Selecting "${preset.name}" for instance ${instanceId}.`);
      appendLog(
        `[preset] Applying pack-backed preset "${preset.name}" from Modrinth project "${presetModrinthPackProject}".`
      );
      try {
        await backend.rollbackCreateSnapshot(
          instanceId,
          "instance-preset",
          `Before applying preset ${preset.name}`
        );
      } catch (err: any) {
        appendLog(`[rollback] Snapshot skipped: ${String(err?.message ?? err)}`);
      }

      const applied = await backend.modrinthPacksApplyToInstance(instanceId, {
        projectId: presetModrinthPackProject,
        mcVersion,
        loader,
        requireCompatibility: true,
        memoryMb: Number(inst?.memoryMb ?? 4096)
      });

      await backend.instancesUpdate(instanceId, { instancePreset: presetId });
      appendLog(
        `[preset] Applied "${preset.name}" from Modrinth project "${presetModrinthPackProject}" (${applied.version?.versionNumber ?? "latest"}).`
      );
      await refreshEditedInstanceWorkspace(activeModalTab);
      return;
    } finally {
      setStatus("");
    }
  }
  const resolved = resolvePresetVariantForLoader(preset, loader, mcVersion);
  if (!resolved) {
    appendLog(`[preset] "${preset.name}" has no usable variant definition.`);
    return;
  }
  const variant = resolved.variant;
  const usesFallback = resolved.sourceLoader !== loader;

  setStatus(`Applying instance preset "${preset.name}"...`);

  try {
    appendLog(`[preset] Selecting "${preset.name}" for instance ${instanceId}.`);
    appendLog(`[preset] Resolved profile bucket: ${resolved.mcBucket} (mc=${mcVersion}, loader=${loader}).`);
    if (usesFallback) {
      appendLog(
        `[preset] Using ${resolved.sourceLoader} preset profile as fallback for loader ${loader}.`
      );
    }
    try {
      await backend.rollbackCreateSnapshot(
        instanceId,
        "instance-preset",
        `Before applying preset ${preset.name}`
      );
    } catch (err: any) {
      appendLog(`[rollback] Snapshot skipped: ${String(err?.message ?? err)}`);
    }

    if (loader !== "vanilla") {
      for (const mod of CATALOG) {
        const requiredForLoader = !!mod.required && (loader === "fabric" || loader === "quilt");
        const shouldEnable = (loader === "fabric" && mod.id === "fabric-api") || requiredForLoader || variant.enableMods.includes(mod.id);
        try {
          await backend.modsSetEnabled(instanceId, mod.id, shouldEnable);
        } catch (err: any) {
          appendLog(`[preset] Failed toggling mod ${mod.id}: ${String(err?.message ?? err)}`);
        }
      }
    }

    for (const pack of PACK_CATALOG) {
      const shouldEnable = !!pack.required || variant.enablePacks.includes(pack.id);
      try {
        await backend.packsSetEnabled(instanceId, pack.id, shouldEnable);
      } catch (err: any) {
        appendLog(`[preset] Failed toggling pack ${pack.id}: ${String(err?.message ?? err)}`);
      }
    }

    await backend.instancesUpdate(instanceId, { memoryMb: variant.memoryMb, instancePreset: presetId });

    // Resolve and install only enabled entries.
    if (loader !== "vanilla") {
      await backend.modsRefresh(instanceId, mcVersion);

      // Preset-specific fallback chain:
      // If a target preset mod is unavailable for this MC version, attempt alternatives.
      const typedPresetId = presetId as Exclude<InstancePresetId, "none">;
      const fallbackChains = PRESET_MOD_FALLBACKS[typedPresetId] ?? {};
      const sharedPool = PRESET_SHARED_FALLBACKS[typedPresetId] ?? [];
      const desiredMods = variant.enableMods.filter((id) => CATALOG_ID_SET.has(id));
      const modsAfterInitialRefresh = await backend.modsList(instanceId);
      const statusById = new Map<string, any>((modsAfterInitialRefresh?.mods || []).map((m: any) => [String(m.id), m]));

      for (const wantedId of desiredMods) {
        const wanted = statusById.get(wantedId);
        if (wanted?.status === "ok") continue;

        const chain = uniqueCatalogIds([
          ...(fallbackChains[wantedId] || []),
          ...sharedPool,
          ...GLOBAL_SAFE_FALLBACKS
        ]).filter((id) => id !== wantedId);
        if (!chain.length) continue;

        appendLog(
          `[preset] ${wantedId} unavailable for ${mcVersion}; trying fallbacks: ${chain.join(", ")}`
        );

        let resolvedFallback: string | null = null;
        for (const candidateId of chain) {
          const known = statusById.get(candidateId);
          // Fast path: already resolved/installed from earlier preset toggles.
          if (known?.status === "ok") {
            resolvedFallback = candidateId;
            break;
          }

          try {
            await backend.modsSetEnabled(instanceId, candidateId, true);
            await backend.modsRefreshSelected(instanceId, mcVersion, [candidateId]);
            const afterCandidate = await backend.modsList(instanceId);
            const candidate = (afterCandidate?.mods || []).find((m: any) => String(m.id) === candidateId);
            if (candidate) statusById.set(candidateId, candidate);
            if (candidate?.status === "ok") {
              resolvedFallback = candidateId;
              break;
            }
          } catch (err: any) {
            appendLog(
              `[preset] Fallback candidate ${candidateId} failed: ${String(err?.message ?? err)}`
            );
          }
        }

        if (resolvedFallback) {
          try {
            await backend.modsSetEnabled(instanceId, wantedId, false);
          } catch {}
          appendLog(`[preset] Replaced ${wantedId} with fallback ${resolvedFallback}.`);
        } else {
          appendLog(`[preset] No compatible fallback found for ${wantedId} on ${mcVersion} (${loader}).`);
        }
      }
    }
    await backend.packsRefresh(instanceId, mcVersion);

    const afterMods = loader !== "vanilla" ? await backend.modsList(instanceId) : { mods: [] as any[] };
    const afterPacks = await backend.packsList(instanceId);

    for (const mod of afterMods?.mods ?? []) {
      const requiredForLoader = !!mod.required && (loader === "fabric" || loader === "quilt");
      const shouldEnable = (loader === "fabric" && mod.id === "fabric-api") || requiredForLoader || variant.enableMods.includes(mod.id);
      if (shouldEnable && mod.status !== "ok") {
        appendLog(`[preset] Mod unavailable for ${mcVersion}: ${mod.name ?? mod.id} (${mod.status})`);
      }
    }
    for (const pack of afterPacks?.items ?? []) {
      const shouldEnable = !!pack.required || variant.enablePacks.includes(pack.id);
      if (shouldEnable && pack.status !== "ok") {
        appendLog(`[preset] Pack unavailable for ${mcVersion}: ${pack.name ?? pack.id} (${pack.status})`);
      }
    }

    appendLog(`[preset] Applied instance preset "${preset.name}" to ${mcVersion}.`);
  } finally {
    setStatus("");
  }
}

// Optimize active modal instance.
async function optimizeActiveModalInstance() {
  const id = editInstanceId;
  if (!id) {
    alert("Select an instance first.");
    return;
  }
  const profile = (optProfile.value || "balanced") as "conservative" | "balanced" | "aggressive";
  const preview = await backend.optimizerPreview(profile);
  const yes = await showLauncherConfirm(
    [
      `Optimize instance with profile "${profile}"?`,
      "",
      `Hardware: ${preview.hardware.cpuModel} (${preview.hardware.cpuCores} cores)`,
      `RAM: ${preview.hardware.totalRamMb} MB`,
      preview.hardware.gpuModel ? `GPU: ${preview.hardware.gpuModel}` : "GPU: unknown",
      "",
      `Will set memory: ${preview.memoryMb} MB`,
      `GC: ${preview.gc}`,
      `Will enable mods: ${preview.modsToEnable.join(", ")}`
    ].join("\n")
  );
  if (!yes) return;

  await backend.optimizerApply(id, profile);
  state.instances = await backend.instancesList();
  await renderInstances();
  appendLog(`[optimizer] Applied ${profile} optimization.`);
}

// Restore active modal optimization.
async function restoreActiveModalOptimization() {
  const id = editInstanceId;
  if (!id) {
    alert("Select an instance first.");
    return;
  }
  const yes = await showLauncherConfirm("Restore optimizer defaults for this instance?");
  if (!yes) return;
  await backend.optimizerRestore(id);
  state.instances = await backend.instancesList();
  await renderInstances();
  appendLog("[optimizer] Restored optimization defaults.");
}

// Run active modal benchmark.
async function runActiveModalBenchmark() {
  const id = editInstanceId;
  if (!id) {
    alert("Select an instance first.");
    return;
  }
  const profile = (optProfile.value || "balanced") as "conservative" | "balanced" | "aggressive";
  const run = await backend.benchmarkRun(id, profile);
  const all = await backend.benchmarkList(id);
  const prev = all[1] ?? null;
  const compare = prev
    ? `\nCompared to previous: avgFPS ${run.avgFps - prev.avgFps >= 0 ? "+" : ""}${run.avgFps - prev.avgFps}`
    : "";
  alert(
    `Benchmark estimate complete (${run.profile})\n` +
      `Estimated Avg FPS: ${run.avgFps}\n` +
      `Estimated 1% Low FPS: ${run.low1Fps}\n` +
      `Estimated Max Memory: ${run.maxMemoryMb} MB\n` +
      `Duration: ${run.durationMs} ms${compare}`
  );
  appendLog(`[benchmark] ${run.avgFps} avg / ${run.low1Fps} low1 / ${run.maxMemoryMb}MB max`);
}

// Render settings panels.
function renderSettingsPanels() {
  const s = getSettings();
  const premium = hasPremium();
  const activeInstanceId = state.instances?.activeInstanceId ?? null;
  const activeInstance = (state.instances?.instances ?? []).find((x: any) => x.id === activeInstanceId) ?? null;

  if (!premium && PREMIUM_THEMES.has(s.theme)) {
    setSettings({ theme: defaultSettings.theme });
  }

  // General
  clearPanel(settingsPanelGeneral);
  settingsPanelGeneral.appendChild(makeH3("General"));

  {
    const { row } = makeRow("Show snapshots", "Include snapshot versions in the version dropdown.");
    const sw = makeSwitch(s.showSnapshots, (v) =>
      guarded(async () => {
        setSettings({ showSnapshots: v });
        await refreshAll();
      })
    );
    row.appendChild(sw);
    settingsPanelGeneral.appendChild(row);
  }

  {
    const { row } = makeRow("Auto update mods", "When enabled, you can choose to refresh mods after version changes.");
    const sw = makeSwitch(s.autoUpdateMods, (v) => setSettings({ autoUpdateMods: v }));
    row.appendChild(sw);
    settingsPanelGeneral.appendChild(row);
  }

  {
    const { row } = makeRow("Default memory (MB)", "Used when creating new instances.");
    const inp = makeInput(String(s.defaultMemoryMb), "4096", (v) => {
      const n = Math.max(256, Math.min(65536, Number(v || 0)));
      if (!Number.isFinite(n)) return;
      setSettings({ defaultMemoryMb: n });
    });
    (inp as any).type = "number";
    (inp as any).step = "256";
    row.appendChild(inp);
    settingsPanelGeneral.appendChild(row);
  }

  // Theme
  clearPanel(settingsPanelTheme);
  settingsPanelTheme.appendChild(makeH3("Theme"));

  {
    const { row } = makeRow("Base style", "Changes the overall look.");
    const sel = document.createElement("select");
    sel.className = "setControl";

    const freeGroup = document.createElement("optgroup");
    freeGroup.label = "Free themes";
    const premiumGroup = document.createElement("optgroup");
    premiumGroup.label = "Premium themes";

    for (const option of THEME_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      if (PREMIUM_THEMES.has(option.value)) {
        premiumGroup.appendChild(opt);
      } else {
        freeGroup.appendChild(opt);
      }
    }

    sel.appendChild(freeGroup);
    sel.appendChild(premiumGroup);
    sel.value = s.theme;
    sel.onchange = async () => {
      const next = sel.value as AppSettings["theme"];
      if (!premium && PREMIUM_THEMES.has(next)) {
        const label = THEME_OPTIONS.find((x) => x.value === next)?.label || "This theme";
        const goUpgrade = await showLauncherConfirm(`${label} is a Premium theme.\n\nOpen upgrade page now?`);
        if (goUpgrade) await openUpgradeFlow();
        sel.value = s.theme;
        return;
      }
      setSettings({ theme: next, accentColor: defaultAccentForTheme(next) });
      renderSettingsPanels();
    };
    row.appendChild(sel);
    settingsPanelTheme.appendChild(row);
  }

  {
    const { row } = makeRow("Theme behavior", THEME_BEHAVIOR_TEXT[s.theme]);
    settingsPanelTheme.appendChild(row);
  }

  if (!premium) {
    const { row } = makeRow(
      "Premium themes",
      "Theme list is split into Free and Premium groups. Upgrade in the account menu to unlock Premium themes."
    );
    settingsPanelTheme.appendChild(row);
  }

  {
    const { row } = makeRow("Accent color", "Applies to interactive accents and highlights.");
    const inp = document.createElement("input");
    inp.type = "color";
    inp.className = "setControl";
    inp.style.width = "140px";
    inp.value = /^#[0-9a-fA-F]{6}$/.test(s.accentColor) ? s.accentColor : "#3ddc84";
    inp.oninput = () => setSettings({ accentColor: inp.value });
    row.appendChild(inp);
    settingsPanelTheme.appendChild(row);
  }

  {
    const { row } = makeRow("Corner radius", "Adjusts overall roundness.");
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.style.justifyContent = "flex-end";
    wrap.style.minWidth = "280px";

    const range = document.createElement("input");
    range.type = "range";
    range.min = "8";
    range.max = "22";
    range.step = "1";
    range.value = String(s.cornerRadius ?? 12);
    range.style.width = "220px";

    const value = document.createElement("span");
    value.className = "muted";
    value.style.fontSize = "12px";
    value.style.minWidth = "48px";
    value.textContent = `${range.value}px`;

    range.oninput = () => {
      const n = Math.max(8, Math.min(22, Number(range.value || 12)));
      value.textContent = `${n}px`;
      setSettings({ cornerRadius: n });
    };

    wrap.appendChild(range);
    wrap.appendChild(value);
    row.appendChild(wrap);
    settingsPanelTheme.appendChild(row);
  }

  {
    const { row } = makeRow("Border thickness", "Controls border weight.");
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.style.justifyContent = "flex-end";
    wrap.style.minWidth = "280px";

    const range = document.createElement("input");
    range.type = "range";
    range.min = "1";
    range.max = "3";
    range.step = "1";
    range.value = String(s.borderThickness ?? 1);
    range.style.width = "220px";

    const value = document.createElement("span");
    value.className = "muted";
    value.style.fontSize = "12px";
    value.style.minWidth = "48px";
    value.textContent = `${range.value}px`;

    range.oninput = () => {
      const n = Math.max(1, Math.min(3, Number(range.value || 1)));
      value.textContent = `${n}px`;
      setSettings({ borderThickness: n });
    };

    wrap.appendChild(range);
    wrap.appendChild(value);
    row.appendChild(wrap);
    settingsPanelTheme.appendChild(row);
  }

  {
    const { row } = makeRow("Pixel font", "Optional retro pixel-style UI font.");
    const sw = makeSwitch(s.pixelFont, (v) => setSettings({ pixelFont: v }));
    row.appendChild(sw);
    settingsPanelTheme.appendChild(row);
  }

  {
    const { row } = makeRow("Panel transparency", "Controls panel opacity without reducing readability.");
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.style.justifyContent = "flex-end";
    wrap.style.minWidth = "280px";

    const range = document.createElement("input");
    range.type = "range";
    range.min = "70";
    range.max = "98";
    range.step = "1";
    range.value = String(s.surfaceAlpha ?? 88);
    range.style.width = "220px";

    const value = document.createElement("span");
    value.className = "muted";
    value.style.fontSize = "12px";
    value.style.minWidth = "48px";
    value.textContent = `${range.value}%`;

    range.oninput = () => {
      const n = Math.max(70, Math.min(98, Number(range.value || 88)));
      value.textContent = `${n}%`;
      setSettings({ surfaceAlpha: n });
    };

    wrap.appendChild(range);
    wrap.appendChild(value);
    row.appendChild(wrap);
    settingsPanelTheme.appendChild(row);
  }

  {
    const { row } = makeRow("Background blur", "Enable or disable blur on cards and dialogs.");
    const sw = makeSwitch(s.blur, (v) => setSettings({ blur: v }));
    row.appendChild(sw);
    settingsPanelTheme.appendChild(row);
  }

  {
    const { row } = makeRow("Custom background", "Use your own background image behind the launcher.");
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.style.justifyContent = "flex-end";

    const pick = document.createElement("button");
    pick.className = "btn";
    pick.textContent = s.customBackgroundDataUrl ? "Replace image" : "Choose image";
    pick.onclick = () =>
      guarded(async () => {
        const dataUrl = await pickImageAsDataUrl();
        if (!dataUrl) return;
        setSettings({ customBackgroundDataUrl: dataUrl });
      });

    const clear = document.createElement("button");
    clear.className = "btn";
    clear.textContent = "Clear";
    clear.disabled = !s.customBackgroundDataUrl;
    clear.onclick = () => setSettings({ customBackgroundDataUrl: "" });

    wrap.appendChild(pick);
    wrap.appendChild(clear);
    row.appendChild(wrap);
    settingsPanelTheme.appendChild(row);
  }

  {
    const { row } = makeRow("Reset theme", "Restore theme settings to defaults.");
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Reset to defaults";
    btn.onclick = () =>
      setSettings({
        theme: defaultSettings.theme,
        blur: defaultSettings.blur,
        accentColor: defaultSettings.accentColor,
        surfaceAlpha: defaultSettings.surfaceAlpha,
        cornerRadius: defaultSettings.cornerRadius,
        borderThickness: defaultSettings.borderThickness,
        pixelFont: defaultSettings.pixelFont,
        customBackgroundDataUrl: defaultSettings.customBackgroundDataUrl
      });
    row.appendChild(btn);
    settingsPanelTheme.appendChild(row);
  }

  // Install (updater)
  clearPanel(settingsPanelInstall);
  settingsPanelInstall.appendChild(makeH3("Install"));
  {
    const { row: channelRow } = makeRow(
      "Update channel",
      "Stable is recommended. Beta only for testers and pre-release updates."
    );
    const channelSelect = makeSelect(
      [
        { value: "stable", label: "Stable (Recommended)" },
        { value: "beta", label: "Beta (Pre-release)" }
      ],
      s.updateChannel,
      (v) =>
        guarded(async () => {
          const channel = v === "beta" ? "beta" : "stable";
          setSettings({ updateChannel: channel });
          await backend.updaterSetChannel(channel);
          renderSettingsPanels();
        })
    );
    channelRow.appendChild(channelSelect);
    settingsPanelInstall.appendChild(channelRow);

    const { row: syncEnableRow } = makeRow(
      "Cloud sync",
      "Sync instance metadata, mod lists, packs, JVM options, presets, and theme to your Fishbattery account."
    );
    const syncEnableWrap = document.createElement("div");
    syncEnableWrap.className = "row";
    syncEnableWrap.style.justifyContent = "flex-end";
    syncEnableWrap.style.gap = "8px";
    const syncEnableLabel = document.createElement("span");
    syncEnableLabel.className = "muted";
    syncEnableLabel.style.fontSize = "12px";
    syncEnableLabel.textContent = s.cloudSyncEnabled ? "Enabled" : "Disabled";
    const syncEnableSwitch = makeSwitch(s.cloudSyncEnabled, (v) => {
      setSettings({ cloudSyncEnabled: v });
      ensureCloudSyncTimer();
      renderSettingsPanels();
    });
    syncEnableWrap.appendChild(syncEnableLabel);
    syncEnableWrap.appendChild(syncEnableSwitch);
    syncEnableRow.appendChild(syncEnableWrap);
    settingsPanelInstall.appendChild(syncEnableRow);

    const { row: syncAutoRow } = makeRow(
      "Background sync",
      "Automatically sync every 5 minutes while the launcher is open."
    );
    const syncAutoWrap = document.createElement("div");
    syncAutoWrap.className = "row";
    syncAutoWrap.style.justifyContent = "flex-end";
    syncAutoWrap.style.gap = "8px";
    const syncAutoLabel = document.createElement("span");
    syncAutoLabel.className = "muted";
    syncAutoLabel.style.fontSize = "12px";
    syncAutoLabel.textContent = s.cloudSyncAuto ? "On" : "Off";
    const syncAutoSwitch = makeSwitch(s.cloudSyncAuto, (v) => {
      setSettings({ cloudSyncAuto: v });
      ensureCloudSyncTimer();
      renderSettingsPanels();
    });
    syncAutoWrap.appendChild(syncAutoLabel);
    syncAutoWrap.appendChild(syncAutoSwitch);
    syncAutoRow.appendChild(syncAutoWrap);
    settingsPanelInstall.appendChild(syncAutoRow);

    const { row: policyRow } = makeRow(
      "Conflict policy",
      "Ask lets you choose local/cloud. Newer wins compares latest edit timestamps."
    );
    policyRow.style.flexDirection = "column";
    policyRow.style.alignItems = "stretch";
    const policySelect = makeSelect(
      [
        { value: "ask", label: "Ask every time" },
        { value: "newer-wins", label: "Newer wins" },
        { value: "prefer-local", label: "Always prefer local" },
        { value: "prefer-cloud", label: "Always prefer cloud" }
      ],
      s.cloudSyncConflictPolicy,
      (v) => {
        setSettings({
          cloudSyncConflictPolicy:
            v === "newer-wins" || v === "prefer-local" || v === "prefer-cloud" ? v : "ask"
        });
      }
    );
    policyRow.appendChild(policySelect);
    const policyHint = document.createElement("div");
    policyHint.className = "setHelp";
    policyHint.style.marginTop = "6px";
    policyHint.textContent =
      "When a conflict popup appears, you can change this default here: Settings > Install > Conflict policy.";
    policyRow.appendChild(policyHint);
    if (!state.launcherAccount?.activeAccountId) {
      const signInHint = document.createElement("div");
      signInHint.className = "setHelp";
      signInHint.style.marginTop = "6px";
      signInHint.textContent = "Sign in to your Fishbattery account from the top-right account menu to enable cloud sync.";
      policyRow.appendChild(signInHint);
    }
    settingsPanelInstall.appendChild(policyRow);

    const v = document.createElement("div");
    v.className = "muted";
    v.style.fontSize = "13px";
    v.style.marginBottom = "10px";
    v.textContent = `Current version: v${updaterState.currentVersion}`;
    settingsPanelInstall.appendChild(v);

    const status = document.createElement("div");
    status.className = "muted";
    status.style.fontSize = "13px";
    status.style.marginBottom = "12px";
    status.style.whiteSpace = "pre-line";
    status.textContent = `${updaterStatusText(updaterState)}\n${cloudSyncStatusText(cloudSyncState)}`;
    settingsPanelInstall.appendChild(status);

    const syncMeta = document.createElement("div");
    syncMeta.className = "muted";
    syncMeta.style.fontSize = "12px";
    syncMeta.style.marginBottom = "10px";
    const lastSyncText = cloudSyncState.lastSyncedAt
      ? new Date(cloudSyncState.lastSyncedAt).toLocaleString()
      : "never";
    syncMeta.textContent = `Last synced: ${lastSyncText}`;
    settingsPanelInstall.appendChild(syncMeta);

    const syncPriorityMeta = document.createElement("div");
    syncPriorityMeta.className = "muted";
    syncPriorityMeta.style.fontSize = "12px";
    syncPriorityMeta.style.marginBottom = "10px";
    syncPriorityMeta.textContent = hasPremium()
      ? "Cloud sync priority: Premium"
      : "Cloud sync priority: Standard (Premium includes priority syncing)";
    settingsPanelInstall.appendChild(syncPriorityMeta);

    const actions = document.createElement("div");
    actions.className = "row";
    actions.style.justifyContent = "flex-start";
    actions.style.gap = "8px";

    const btnCheck = document.createElement("button");
    btnCheck.className = "btn";
    btnCheck.textContent = "Check for updates";
    btnCheck.disabled = updaterState.status === "checking" || updaterState.status === "downloading";
    btnCheck.onclick = () =>
      guarded(async () => {
        await backend.updaterSetChannel(s.updateChannel);
        await backend.updaterCheck();
      });

    const btnDownload = document.createElement("button");
    btnDownload.className = "btn";
    btnDownload.textContent =
      updaterState.status === "downloading" ? "Downloading..." : "Download update";
    btnDownload.disabled = updaterState.status !== "update-available";
    btnDownload.onclick = () =>
      guarded(async () => {
        updaterBusyIntent = "download";
        setGlobalActionBusy(
          true,
          "Downloading update",
          `Preparing update v${updaterState.latestVersion ?? "unknown"}...`
        );
        await backend.updaterDownload();
      });

    const btnInstall = document.createElement("button");
    btnInstall.className = "btn btnPrimary";
    btnInstall.textContent = "Restart and install";
    btnInstall.disabled = updaterState.status !== "downloaded";
    btnInstall.onclick = () => {
      updaterBusyIntent = "install";
      setGlobalActionBusy(
        true,
        "Installing update",
        `Restarting to install v${updaterState.latestVersion ?? "unknown"}...`
      );
      void backend.updaterInstall();
    };

    actions.appendChild(btnCheck);
    actions.appendChild(btnDownload);
    actions.appendChild(btnInstall);
    const btnSyncNow = document.createElement("button");
    btnSyncNow.className = "btn";
    btnSyncNow.textContent = "Sync now";
    btnSyncNow.disabled = !s.cloudSyncEnabled || !state.launcherAccount?.activeAccountId;
    btnSyncNow.onclick = () =>
      guarded(async () => {
        await runCloudSync(true);
        renderSettingsPanels();
      });
    actions.appendChild(btnSyncNow);
    settingsPanelInstall.appendChild(actions);

    const preflightCard = document.createElement("div");
    preflightCard.className = "setRow";
    preflightCard.style.marginTop = "10px";

    const preLeft = document.createElement("div");
    preLeft.style.display = "flex";
    preLeft.style.flexDirection = "column";

    const preTitle = document.createElement("div");
    preTitle.className = "setLabel";
    preTitle.textContent = "Startup health check";

    const preSub = document.createElement("div");
    preSub.className = "setHelp";
    preSub.textContent = preflightSummaryText(preflightState);

    const preMeta = document.createElement("div");
    preMeta.className = "setHelp";
    preMeta.textContent = preflightState?.ranAt
      ? `Last run: ${new Date(preflightState.ranAt).toLocaleString()}`
      : "Runs on first launch and can be executed on demand.";

    preLeft.appendChild(preTitle);
    preLeft.appendChild(preSub);
    preLeft.appendChild(preMeta);

    const preActions = document.createElement("div");
    preActions.className = "row";
    preActions.style.justifyContent = "flex-end";

    const btnRunPreflight = document.createElement("button");
    btnRunPreflight.className = "btn";
    btnRunPreflight.textContent = "Run health check";
    btnRunPreflight.onclick = () =>
      guarded(async () => {
        preflightState = await backend.preflightRun();
        appendLog(`[preflight] ${preflightSummaryText(preflightState)}`);
        renderSettingsPanels();
      });

    preActions.appendChild(btnRunPreflight);
    preflightCard.appendChild(preLeft);
    preflightCard.appendChild(preActions);
    settingsPanelInstall.appendChild(preflightCard);

    if (preflightState?.checks?.length) {
      for (const c of preflightState.checks) {
        if (c.severity === "ok") continue;
        const row = document.createElement("div");
        row.className = "setRow";

        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.flexDirection = "column";

        const t = document.createElement("div");
        t.className = "setLabel";
        t.textContent = `${c.title} (${c.severity})`;

        const d = document.createElement("div");
        d.className = "setHelp";
        d.textContent = c.detail;

        left.appendChild(t);
        left.appendChild(d);
        if (c.remediation) {
          const r = document.createElement("div");
          r.className = "setHelp";
          r.textContent = `Suggested fix: ${c.remediation}`;
          left.appendChild(r);
        }

        row.appendChild(left);
        settingsPanelInstall.appendChild(row);
      }
    }

    const diagWrap = document.createElement("div");
    diagWrap.className = "row";
    diagWrap.style.justifyContent = "flex-start";
    diagWrap.style.gap = "8px";
    diagWrap.style.marginTop = "10px";

    const btnDiagnostics = document.createElement("button");
    btnDiagnostics.className = "btn";
    btnDiagnostics.textContent = "Export diagnostics";
    btnDiagnostics.onclick = () =>
      guarded(async () => {
        const res = await backend.diagnosticsExport();
        if (!res.ok || res.canceled) return;
        appendLog(`[diagnostics] Exported: ${res.path}`);
        alert(`Diagnostics exported:\n${res.path}`);
      });

    diagWrap.appendChild(btnDiagnostics);
    settingsPanelInstall.appendChild(diagWrap);

    const lockWrap = document.createElement("div");
    lockWrap.className = "row";
    lockWrap.style.justifyContent = "flex-start";
    lockWrap.style.gap = "8px";
    lockWrap.style.marginTop = "8px";

    const btnGenLock = document.createElement("button");
    btnGenLock.className = "btn";
    btnGenLock.textContent = "Refresh lockfile";
    btnGenLock.disabled = !activeInstance;
    btnGenLock.onclick = () =>
      guarded(async () => {
        const latest = await backend.instancesList();
        state.instances = latest;
        const latestActiveId = latest?.activeInstanceId ?? null;
        const latestActive = (latest?.instances ?? []).find((x: any) => x.id === latestActiveId) ?? null;
        if (!latestActive) {
          alert("No active instance selected.");
          renderSettingsPanels();
          return;
        }
        const res = await backend.lockfileGenerate(latestActive.id);
        appendLog(`[lockfile] Generated for ${latestActive.name}: ${res.artifacts} artifacts @ ${res.generatedAt}`);
      });

    const btnCheckLock = document.createElement("button");
    btnCheckLock.className = "btn";
    btnCheckLock.textContent = "Check lock drift";
    btnCheckLock.disabled = !activeInstance;
    btnCheckLock.onclick = () =>
      guarded(async () => {
        const latest = await backend.instancesList();
        state.instances = latest;
        const latestActiveId = latest?.activeInstanceId ?? null;
        const latestActive = (latest?.instances ?? []).find((x: any) => x.id === latestActiveId) ?? null;
        if (!latestActive) {
          alert("No active instance selected.");
          renderSettingsPanels();
          return;
        }
        const drift = await backend.lockfileDrift(latestActive.id);
        if (drift.clean) {
          appendLog("[lockfile] Drift check: clean.");
          alert("Lockfile drift check: clean.");
          return;
        }
        const summary = drift.issues.map((x) => `${x.id}: ${x.message}`).join("\n");
        appendLog(`[lockfile] Drift check found ${drift.issues.length} issue(s).`);
        alert(`Lockfile drift detected (${drift.issues.length}):\n${summary}`);
      });

    lockWrap.appendChild(btnGenLock);
    lockWrap.appendChild(btnCheckLock);
    settingsPanelInstall.appendChild(lockWrap);
  }

  // Window
  clearPanel(settingsPanelWindow);
  settingsPanelWindow.appendChild(makeH3("Window"));
  {
    const { row } = makeRow("Fullscreen", "Start launcher in fullscreen mode (if you implement it on the main process).");
    const sw = makeSwitch(s.fullscreen, (v) => setSettings({ fullscreen: v }));
    row.appendChild(sw);
    settingsPanelWindow.appendChild(row);
  }
  {
    const { row } = makeRow("Window size (WxH)", "Stored locally; apply in main process if desired.");
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.style.justifyContent = "flex-end";

    const w = makeInput(String(s.winW), "854", (v) => {
      const n = Math.max(480, Math.min(3840, Number(v || 0)));
      if (!Number.isFinite(n)) return;
      setSettings({ winW: n });
    });
    (w as any).type = "number";

    const h = makeInput(String(s.winH), "480", (v) => {
      const n = Math.max(360, Math.min(2160, Number(v || 0)));
      if (!Number.isFinite(n)) return;
      setSettings({ winH: n });
    });
    (h as any).type = "number";

    w.style.width = "120px";
    h.style.width = "120px";

    wrap.appendChild(w);
    wrap.appendChild(h);
    row.appendChild(wrap);
    settingsPanelWindow.appendChild(row);
  }

  // Java
  clearPanel(settingsPanelJava);
  settingsPanelJava.appendChild(makeH3("Java"));
  {
    const { row } = makeRow("JVM arguments", "Example: -XX:+UseG1GC -XX:MaxGCPauseMillis=50");
    const ta = makeTextarea(s.jvmArgs, "-XX:+UseG1GC", (v) => setSettings({ jvmArgs: v }));
    row.appendChild(ta);
    settingsPanelJava.appendChild(row);
  }

  // Hooks
  clearPanel(settingsPanelHooks);
  settingsPanelHooks.appendChild(makeH3("Hooks"));
  {
    const { row } = makeRow("Pre-launch", "Command to run before launching Minecraft.");
    const ta = makeTextarea(s.preLaunch, "echo prelaunch", (v) => setSettings({ preLaunch: v }));
    row.appendChild(ta);
    settingsPanelHooks.appendChild(row);
  }
  {
    const { row } = makeRow("Post-exit", "Command to run after Minecraft exits.");
    const ta = makeTextarea(s.postExit, "echo postexit", (v) => setSettings({ postExit: v }));
    row.appendChild(ta);
    settingsPanelHooks.appendChild(row);
  }

  // Profile
  clearPanel(settingsPanelProfile);
  settingsPanelProfile.appendChild(makeH3("Profile Showcase"));
  const loading = document.createElement("div");
  loading.className = "setHelp";
  loading.textContent = "Loading profile summary...";
  settingsPanelProfile.appendChild(loading);
}

// Render profile settings panel.
async function renderProfileSettingsPanel() {
  const token = ++profileRenderToken;
  clearPanel(settingsPanelProfile);
  settingsPanelProfile.appendChild(makeH3("Profile Showcase"));

  const loading = document.createElement("div");
  loading.className = "setHelp";
  loading.textContent = "Collecting aggregated stats...";
  settingsPanelProfile.appendChild(loading);

  try {
    const [summary, visibility] = await Promise.all([backend.profileGetSummary(), backend.profileGetVisibility()]);
    if (token !== profileRenderToken) return;

    clearPanel(settingsPanelProfile);
    settingsPanelProfile.appendChild(makeH3("Profile Showcase"));

    const tierLabel = getLauncherTier();
    const cards = document.createElement("div");
    cards.className = "grid";

    const cardData = [
      { title: "Total playtime", value: formatPlaytime(summary.totals.totalPlaytimeMs) },
      { title: "Installed mods", value: String(summary.totals.installedMods) },
      { title: "Active preset", value: formatPresetLabel(summary.activeInstance?.presetId) },
      { title: "Subscription", value: tierLabel },
      {
        title: "Hardware",
        value: `${summary.hardware.cpuCores} cores / ${summary.hardwarePublic.ram} RAM / GPU ${summary.hardwarePublic.gpu}`
      },
      {
        title: "Benchmark",
        value: summary.bestBenchmark
          ? `${summary.bestBenchmark.avgFps} FPS best (${summary.bestBenchmark.instanceName})`
          : "No benchmark runs yet"
      }
    ];

    for (const item of cardData) {
      const card = document.createElement("div");
      card.className = "setRow";
      card.style.marginBottom = "0";
      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      const t = document.createElement("div");
      t.className = "setLabel";
      t.textContent = item.title;
      const v = document.createElement("div");
      v.className = "setHelp";
      v.style.fontSize = "13px";
      v.style.color = "var(--text)";
      v.textContent = item.value;
      left.appendChild(t);
      left.appendChild(v);
      card.appendChild(left);
      cards.appendChild(card);
    }

    settingsPanelProfile.appendChild(cards);

    const hardwareLocal = document.createElement("div");
    hardwareLocal.className = "setHelp";
    hardwareLocal.style.marginTop = "10px";
    hardwareLocal.textContent =
      `Local hardware detail: ${summary.hardware.cpuModel}` +
      `${summary.hardware.gpuModel ? ` | ${summary.hardware.gpuModel}` : " | GPU unknown"}`;
    settingsPanelProfile.appendChild(hardwareLocal);

    const visibilityRow = makeRow(
      "Public profile",
      "When enabled, share uses a public profile link and only public-safe hardware details."
    );
    const visibilityWrap = document.createElement("div");
    visibilityWrap.className = "row";
    visibilityWrap.style.justifyContent = "flex-end";
    visibilityWrap.style.gap = "8px";
    const visibilityLabel = document.createElement("span");
    visibilityLabel.className = "muted";
    visibilityLabel.style.fontSize = "12px";
    visibilityLabel.textContent = visibility.publicEnabled ? "Public" : "Private";
    const visibilitySwitch = makeSwitch(visibility.publicEnabled, (next) => {
      void guarded(async () => {
        await backend.profileSetVisibility(next);
        await renderProfileSettingsPanel();
      });
    });
    visibilityWrap.appendChild(visibilityLabel);
    visibilityWrap.appendChild(visibilitySwitch);
    visibilityRow.row.appendChild(visibilityWrap);
    settingsPanelProfile.appendChild(visibilityRow.row);

    const shareRow = document.createElement("div");
    shareRow.className = "row";
    shareRow.style.justifyContent = "flex-start";
    shareRow.style.gap = "8px";
    shareRow.style.marginTop = "10px";

    const btnShare = document.createElement("button");
    btnShare.className = "btn btnPrimary";
    btnShare.textContent = "Share Profile";
    btnShare.onclick = async () => {
      try {
        const publicPayload = {
          generatedAt: summary.generatedAt,
          player: {
            displayName: String(
              state.launcherAccount?.activeAccount?.displayName ||
                accountName.textContent ||
                "Fishbattery Player"
            ),
            tier: tierLabel,
            avatarUrl: state.launcherAccount?.activeAccount?.avatarUrl || null
          },
          totals: {
            playtime: formatPlaytime(summary.totals.totalPlaytimeMs),
            installedMods: summary.totals.installedMods,
            instances: summary.totals.instances,
            sessions: summary.totals.sessions
          },
          activePreset: formatPresetLabel(summary.activeInstance?.presetId),
          hardware: summary.hardwarePublic,
          benchmark: summary.bestBenchmark
            ? {
                avgFps: summary.bestBenchmark.avgFps,
                low1Fps: summary.bestBenchmark.low1Fps,
                profile: summary.bestBenchmark.profile,
                instanceName: summary.bestBenchmark.instanceName
              }
            : null,
          setups: summary.setups.slice(0, 8).map((setup) => ({
            name: setup.name,
            version: setup.mcVersion,
            loader: setup.loader,
            installedMods: setup.installedMods,
            playtime: formatPlaytime(setup.playtimeMs),
            preset: formatPresetLabel(setup.presetId),
            benchmarkFps: setup.latestBenchmark?.avgFps ?? null
          }))
        };
        let profileUrl = "";
        if (visibility.publicEnabled) {
          const published = await backend.profilePublishPublic(publicPayload);
          profileUrl = String(published?.shareUrl || "").trim();
        }
        const publicSnippet =
          `Fishbattery profile: ${formatPlaytime(summary.totals.totalPlaytimeMs)} playtime, ` +
          `${summary.totals.installedMods} installed mods, ` +
          `${summary.bestBenchmark ? `${summary.bestBenchmark.avgFps} FPS best` : "no benchmark yet"}, ` +
          `${summary.hardwarePublic.cpuCores} cores / ${summary.hardwarePublic.ram} RAM.`;
        const payload = visibility.publicEnabled && profileUrl ? `${publicSnippet}\n${profileUrl}` : publicSnippet;
        await navigator.clipboard.writeText(payload);
        appendLog("[profile] Copied share payload to clipboard.");
        alert(visibility.publicEnabled && profileUrl ? "Profile link copied." : "Profile summary copied.");
      } catch (err: any) {
        alert(`Could not share profile right now: ${String(err?.message ?? err)}`);
      }
    };

    const btnExport = document.createElement("button");
    btnExport.className = "btn";
    btnExport.textContent = "Export Image";
    btnExport.onclick = () => {
      const canvas = renderProfileImage(summary, tierLabel);
      if (!canvas) {
        alert("Could not render profile image.");
        return;
      }
      const href = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = href;
      a.download = "fishbattery-profile-summary.png";
      a.click();
      appendLog("[profile] Exported profile summary image.");
    };

    const btnDiscord = document.createElement("button");
    btnDiscord.className = "btn";
    btnDiscord.textContent = "Join Discord";
    btnDiscord.onclick = () => {
      void guarded(async () => {
        const ok = await backend.externalOpen(DISCORD_INVITE_URL);
        if (!ok) {
          setStatus("Could not open Discord invite right now.");
          return;
        }
        appendLog(`[community] Opened Discord invite: ${DISCORD_INVITE_URL}`);
      });
    };

    shareRow.appendChild(btnShare);
    shareRow.appendChild(btnExport);
    shareRow.appendChild(btnDiscord);
    settingsPanelProfile.appendChild(shareRow);

    const setupsTitle = document.createElement("div");
    setupsTitle.className = "setLabel";
    setupsTitle.style.marginTop = "12px";
    setupsTitle.textContent = "Installed mod setups";
    settingsPanelProfile.appendChild(setupsTitle);

    const setupsHelp = document.createElement("div");
    setupsHelp.className = "setHelp";
    setupsHelp.textContent = "Per-instance setup summary (mods, preset, playtime, latest benchmark).";
    settingsPanelProfile.appendChild(setupsHelp);

    const setupRows = summary.setups.slice(0, 12);
    if (!setupRows.length) {
      const empty = document.createElement("div");
      empty.className = "setHelp";
      empty.style.marginTop = "8px";
      empty.textContent = "No instances created yet.";
      settingsPanelProfile.appendChild(empty);
    } else {
      for (const setup of setupRows) {
        const row = document.createElement("div");
        row.className = "setRow";
        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.flexDirection = "column";
        const label = document.createElement("div");
        label.className = "setLabel";
        label.textContent = `${setup.name} (${setup.mcVersion} ${setup.loader})`;
        const meta = document.createElement("div");
        meta.className = "setHelp";
        meta.textContent =
          `${setup.installedMods} mods | ${formatPresetLabel(setup.presetId)} | ` +
          `${formatPlaytime(setup.playtimeMs)} playtime` +
          (setup.latestBenchmark ? ` | ${setup.latestBenchmark.avgFps} FPS` : " | no benchmark");
        left.appendChild(label);
        left.appendChild(meta);
        row.appendChild(left);
        settingsPanelProfile.appendChild(row);
      }
    }
  } catch (err: any) {
    if (token !== profileRenderToken) return;
    clearPanel(settingsPanelProfile);
    settingsPanelProfile.appendChild(makeH3("Profile Showcase"));
    const failed = document.createElement("div");
    failed.className = "setHelp";
    failed.textContent = `Profile summary failed to load: ${String(err?.message ?? err)}`;
    settingsPanelProfile.appendChild(failed);
  }
}

// Set settings tab.
function setSettingsTab(tab: "general" | "theme" | "install" | "window" | "java" | "hooks" | "profile") {
  const btns: Record<string, HTMLElement> = {
    general: settingsTabGeneral,
    theme: settingsTabTheme,
    install: settingsTabInstall,
    window: settingsTabWindow,
    java: settingsTabJava,
    hooks: settingsTabHooks,
    profile: settingsTabProfile
  };

  const panels: Record<string, HTMLElement> = {
    general: settingsPanelGeneral,
    theme: settingsPanelTheme,
    install: settingsPanelInstall,
    window: settingsPanelWindow,
    java: settingsPanelJava,
    hooks: settingsPanelHooks,
    profile: settingsPanelProfile
  };

  for (const k of Object.keys(btns)) btns[k].classList.toggle("active", k === tab);
  for (const k of Object.keys(panels)) panels[k].style.display = k === tab ? "" : "none";

  renderSettingsPanels();
  if (tab === "install") {
    void refreshPlayitState(true).then(() => {
      if (settingsTabInstall.classList.contains("active")) renderSettingsPanels();
    });
  }
  if (tab === "profile") {
    void renderProfileSettingsPanel();
  }
}

function renderPlayitPanel() {
  if (!playitPanelRoot) {
    appendLog("[playit] renderPlayitPanel failed: playitPanelRoot missing");
    return;
  }
  try {
    clearPanel(playitPanelRoot);

    const openPlayitUrl = async (url: string, label: string) => {
      const ok = await backend.externalOpen(url);
      if (!ok) {
        throw new Error(`Could not open ${label}.`);
      }
      appendLog(`[playit] Opened ${label}: ${url}`);
    };

    const shell = document.createElement("div");
    shell.className = "settingsPanel";
    shell.style.maxHeight = "none";

  const title = makeH3("Playit Account");
  shell.appendChild(title);

  const statusCard = document.createElement("div");
  statusCard.className = "setRow";
  statusCard.style.flexDirection = "column";
  statusCard.style.alignItems = "stretch";
  statusCard.style.gap = "10px";

  const help = document.createElement("div");
  help.className = "setHelp";
  help.textContent =
    "Fishbattery stores only your user Playit secret locally. Setup-code exchange is routed through the Fishbattery backend.";
  statusCard.appendChild(help);

  const disclaimer = document.createElement("div");
  disclaimer.className = "setHelp";
  disclaimer.textContent =
    "Fishbattery Launcher is not owned by or affiliated with Playit. It integrates with Playit's network for tunneling only.";
  statusCard.appendChild(disclaimer);

  const accountAccess = document.createElement("div");
  accountAccess.className = "setHelp";
  accountAccess.textContent =
    "You can manage your Playit account, upgrade to Premium, and buy domains directly on playit.gg.";
  statusCard.appendChild(accountAccess);

  const linkActions = document.createElement("div");
  linkActions.className = "row";
  linkActions.style.justifyContent = "flex-start";
  linkActions.style.gap = "8px";
  linkActions.style.flexWrap = "wrap";

  const btnGetSetupCode = document.createElement("button");
  btnGetSetupCode.className = "btn";
  btnGetSetupCode.textContent = "Get setup code";
  btnGetSetupCode.onclick = () =>
    guarded(async () => {
      await openPlayitUrl("https://playit.gg/l/setup-third-party", "Playit setup page");
    });

  const btnOpenPlayitAccount = document.createElement("button");
  btnOpenPlayitAccount.className = "btn";
  btnOpenPlayitAccount.textContent = "Manage Playit account";
  btnOpenPlayitAccount.onclick = () =>
    guarded(async () => {
      await openPlayitUrl("https://playit.gg/account/agents", "Playit account page");
    });

  linkActions.appendChild(btnGetSetupCode);
  linkActions.appendChild(btnOpenPlayitAccount);
  statusCard.appendChild(linkActions);

  const status = document.createElement("div");
  status.className = "muted";
  status.style.fontSize = "12px";
  status.textContent = playitStatusText(playitState);
  statusCard.appendChild(status);

  if (!state.launcherAccount?.activeAccountId) {
    const hint = document.createElement("div");
    hint.className = "setHelp";
    hint.textContent =
      "Sign in to your Fishbattery account first. The launcher uses your signed-in session to exchange Playit setup codes safely.";
    statusCard.appendChild(hint);
  } else if (playitState.linked && playitState.linkedAt) {
    const linkedAt = document.createElement("div");
    linkedAt.className = "setHelp";
    linkedAt.textContent = `Linked on ${new Date(playitState.linkedAt).toLocaleString()}.`;
    statusCard.appendChild(linkedAt);
  }

  const codeRow = makeRow(
    "Setup code",
    "Get a setup code from playit.gg, then click Exchange and link. The code is sent to Fishbattery backend, not stored locally. Playit may keep the setup page open after linking; you can close it and use Manage Playit account."
  );
  codeRow.row.style.flexDirection = "column";
  codeRow.row.style.alignItems = "stretch";
  const codeInput = makeInput(playitSetupCodeDraft, "Paste Playit setup code", (v) => {
    playitSetupCodeDraft = v;
  });
  codeInput.autocomplete = "off";
  codeInput.spellcheck = false;
  codeRow.row.appendChild(codeInput);
  const codeActions = document.createElement("div");
  codeActions.className = "row";
  codeActions.style.justifyContent = "flex-start";
  codeActions.style.gap = "8px";
  codeActions.style.marginTop = "8px";

  const btnExchange = document.createElement("button");
  btnExchange.className = "btn";
  btnExchange.textContent = playitState.linked ? "Relink account" : "Exchange and link";
  btnExchange.disabled = !state.launcherAccount?.activeAccountId || !playitSetupCodeDraft.trim();
  btnExchange.onclick = () =>
    guarded(async () => {
      try {
        setStatus("Exchanging Playit setup code...");
        const exchanged = await backend.playitExchangeSetupCode(playitSetupCodeDraft.trim());
        setStatus("Validating Playit secret...");
        await backend.playitLinkSecret(exchanged.secretKey);
        playitSetupCodeDraft = "";
        await refreshPlayitState();
        appendLog("[playit] Account linked through Fishbattery backend.");
        setStatus("Playit account linked. You can close the Playit setup page.");
        renderPlayitPanel();
      } catch (err: any) {
        const message = String(err?.message ?? err ?? "Could not link Playit account.");
        appendLog(`[playit] Link failed: ${message}`);
        setStatus(message);
        await showLauncherAlert(message, "Playit link failed");
      }
    });

  const btnUnlink = document.createElement("button");
  btnUnlink.className = "btn";
  btnUnlink.textContent = "Unlink";
  btnUnlink.disabled = !playitState.linked;
  btnUnlink.onclick = () =>
    guarded(async () => {
      await backend.playitUnlink();
      await refreshPlayitState(true);
      appendLog("[playit] Account unlinked.");
      renderPlayitPanel();
    });

  codeInput.oninput = () => {
    playitSetupCodeDraft = codeInput.value;
    btnExchange.disabled = !state.launcherAccount?.activeAccountId || !playitSetupCodeDraft.trim();
  };

  codeActions.appendChild(btnExchange);
  codeActions.appendChild(btnUnlink);
  codeRow.row.appendChild(codeActions);
  statusCard.appendChild(codeRow.row);
  shell.appendChild(statusCard);

  const activeInstanceId = state.instances?.activeInstanceId ?? null;
  const activeInstance = (state.instances?.instances ?? []).find((x: any) => x.id === activeInstanceId) ?? null;
  const suggestedTunnelName = playitTunnelNameDraft.trim() || `${activeInstance?.name || "Minecraft"} LAN`;

  const tunnelCard = document.createElement("div");
  tunnelCard.className = "setRow";
  tunnelCard.style.flexDirection = "column";
  tunnelCard.style.alignItems = "stretch";
  tunnelCard.style.gap = "10px";

  const tunnelIntro = document.createElement("div");
  tunnelIntro.className = "setHelp";
  tunnelIntro.textContent =
    "Free Playit accounts support custom UDP tunnels. Minecraft Java has its own preset. Custom TCP requires Playit Premium.";
  tunnelCard.appendChild(tunnelIntro);

  const tunnelLimits = document.createElement("div");
  tunnelLimits.className = "setHelp";
  tunnelLimits.textContent =
    "Playit account limits, upgrades, and domains still belong to your own Playit account and are managed on playit.gg.";
  tunnelCard.appendChild(tunnelLimits);

  const autoTunnelRow = makeRow(
    "Auto-create LAN tunnel",
    "When Minecraft logs an Open to LAN port, Fishbattery can create a Playit Minecraft Java tunnel automatically."
  );
  const autoTunnelToggle = makeToggle(playitState.autoTunnelEnabled, async (enabled) => {
    try {
      playitState = {
        ...playitState,
        ...((await backend.playitSetAutoTunnelEnabled(enabled)) as PlayitUiState),
        lastError: null
      };
      appendLog(`[playit] Auto-LAN tunnel ${enabled ? "enabled" : "disabled"}.`);
      renderPlayitPanel();
    } catch (err: any) {
      const message = String(err?.message ?? err ?? "Could not update Playit auto-LAN setting.");
      appendLog(`[playit] Auto-LAN setting failed: ${message}`);
      setStatus(message);
      await showLauncherAlert(message, "Playit setting failed");
      renderPlayitPanel();
    }
  });
  autoTunnelRow.row.appendChild(autoTunnelToggle);
  tunnelCard.appendChild(autoTunnelRow.row);

  const tunnelControls = document.createElement("div");
  tunnelControls.className = "row";
  tunnelControls.style.justifyContent = "flex-start";
  tunnelControls.style.gap = "8px";
  tunnelControls.style.flexWrap = "wrap";

  const tunnelNameInput = makeInput(playitTunnelNameDraft, "Tunnel name", (v) => {
    playitTunnelNameDraft = v;
  });
  tunnelNameInput.style.maxWidth = "260px";
  const tunnelModeSelect = makeSelect(
    [
      { value: "custom-udp", label: "Custom UDP (Free)" },
      { value: "minecraft-java", label: "Minecraft Java" },
      { value: "custom-tcp", label: "Custom TCP (Premium)" }
    ],
    playitTunnelModeDraft,
    (v) => {
      if (v === "minecraft-java" || v === "custom-tcp" || v === "custom-udp") {
        playitTunnelModeDraft = v;
      }
    }
  );
  tunnelModeSelect.style.maxWidth = "220px";
  const tunnelPortInput = makeInput(playitTunnelPortDraft, "Local port", (v) => {
    playitTunnelPortDraft = v.replace(/[^\d]/g, "");
  });
  tunnelPortInput.style.maxWidth = "140px";
  const btnCreateTunnel = document.createElement("button");
  btnCreateTunnel.className = "btn btnPrimary";
  btnCreateTunnel.textContent = "Create tunnel";
  btnCreateTunnel.disabled = !playitState.linked || !String(playitTunnelPortDraft || "").trim();
  btnCreateTunnel.onclick = () =>
    guarded(async () => {
      try {
        const mode = playitTunnelModeDraft;
        if (mode === "minecraft-java") {
          await createPlayitMinecraftLanTunnel(Number(playitTunnelPortDraft || 25565), "manual");
          return;
        }
        const created = await backend.playitCreateTunnel({
          name: suggestedTunnelName,
          tunnelDescription: mode === "custom-tcp" ? "Custom TCP tunnel" : "Custom UDP tunnel",
          portType: mode === "custom-tcp" ? ("tcp" as const) : ("udp" as const),
          portCount: 1,
          localIp: "127.0.0.1",
          localPort: Number(playitTunnelPortDraft || 25565),
          enabled: true
        });
        playitTunnelNameDraft = "";
        await refreshPlayitState(true);
        await finalizePlayitTunnelReady(
          created?.created ?? null,
          String(activeInstance?.id || "").trim(),
          "Playit tunnel"
        );
        renderPlayitPanel();
      } catch (err: any) {
        const message = String(err?.message ?? err ?? "Could not create Playit tunnel.");
        appendLog(`[playit] Tunnel create failed: ${message}`);
        setStatus(message);
        await showLauncherAlert(message, "Playit tunnel failed");
      }
    });

  tunnelPortInput.oninput = () => {
    playitTunnelPortDraft = tunnelPortInput.value.replace(/[^\d]/g, "");
    tunnelPortInput.value = playitTunnelPortDraft;
    btnCreateTunnel.disabled = !playitState.linked || !String(playitTunnelPortDraft || "").trim();
  };

  tunnelControls.appendChild(tunnelModeSelect);
  tunnelControls.appendChild(tunnelNameInput);
  tunnelControls.appendChild(tunnelPortInput);
  tunnelControls.appendChild(btnCreateTunnel);
  tunnelCard.appendChild(tunnelControls);
  shell.appendChild(tunnelCard);

  const tunnelsTitle = makeH3("Tunnels");
  shell.appendChild(tunnelsTitle);

  if (!playitState.activeTunnels.length) {
    const empty = document.createElement("div");
    empty.className = "setRow";
    const emptyText = document.createElement("div");
    emptyText.className = "setHelp";
    emptyText.textContent = playitState.linked
      ? "No tunnels yet. Create one above to get a shareable join address."
      : "No linked Playit account yet.";
    empty.appendChild(emptyText);
    shell.appendChild(empty);
  } else {
    for (const tunnel of playitState.activeTunnels) {
      const row = document.createElement("div");
      row.className = "setRow";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";

      const tunnelTitle = document.createElement("div");
      tunnelTitle.className = "setLabel";
      tunnelTitle.textContent = tunnel.name || tunnel.joinAddress || tunnel.assignedDomain || tunnel.id;
      const meta = document.createElement("div");
      meta.className = "setHelp";
      meta.textContent = tunnel.joinAddress
        ? `Join: ${tunnel.joinAddress}`
        : `Allocation: ${tunnel.allocationStatus || "pending"}`;
      const sub = document.createElement("div");
      sub.className = "setHelp";
      sub.textContent = `Local ${tunnel.localIp || "127.0.0.1"}:${tunnel.localPort || "?"} • ${tunnel.active ? "Active" : "Inactive"}`;

      left.appendChild(tunnelTitle);
      left.appendChild(meta);
      left.appendChild(sub);
      row.appendChild(left);

      const actions = document.createElement("div");
      actions.className = "row";
      actions.style.justifyContent = "flex-end";
      actions.style.gap = "8px";

      const btnCopy = document.createElement("button");
      btnCopy.className = "btn";
      btnCopy.textContent = "Copy";
      btnCopy.disabled = !tunnel.joinAddress;
      btnCopy.onclick = () =>
        guarded(async () => {
          await navigator.clipboard.writeText(String(tunnel.joinAddress || ""));
          appendLog(`[playit] Copied join address: ${tunnel.joinAddress}`);
        });

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn";
      btnDelete.textContent = "Delete";
      btnDelete.onclick = () =>
        guarded(async () => {
          await backend.playitDeleteTunnel(tunnel.id);
          const currentInstanceId = String(activeInstance?.id || "").trim();
          if (currentInstanceId) {
            await removePlayitServerEntry(currentInstanceId, tunnel.id);
          }
          await refreshPlayitState(true);
          appendLog(`[playit] Deleted tunnel ${tunnel.id}.`);
          renderPlayitPanel();
        });

      actions.appendChild(btnCopy);
      actions.appendChild(btnDelete);
      row.appendChild(actions);
      shell.appendChild(row);
    }
  }

    playitPanelRoot.appendChild(shell);
  } catch (err: any) {
    const message = String(err?.message ?? err ?? "Playit panel failed to render.");
    clearPanel(playitPanelRoot);
    const row = document.createElement("div");
    row.className = "setRow";
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    const title = document.createElement("div");
    title.className = "setLabel";
    title.textContent = "Playit panel failed to render";
    const help = document.createElement("div");
    help.className = "setHelp";
    help.textContent = message;
    left.appendChild(title);
    left.appendChild(help);
    row.appendChild(left);
    playitPanelRoot.appendChild(row);
    appendLog(`[playit] renderPlayitPanel error: ${message}`);
  }
}

settingsTabGeneral.onclick = () => setSettingsTab("general");
settingsTabTheme.onclick = () => setSettingsTab("theme");
settingsTabInstall.onclick = () => setSettingsTab("install");
settingsTabWindow.onclick = () => setSettingsTab("window");
settingsTabJava.onclick = () => setSettingsTab("java");
settingsTabHooks.onclick = () => setSettingsTab("hooks");
settingsTabProfile.onclick = () => setSettingsTab("profile");

// Render server entries.
async function renderServerEntries(instanceId: string | null) {
  serverList.innerHTML = "";
  editServerId = null;
  serverNameInput.value = "";
  serverAddressInput.value = "";

  if (!instanceId || modalMode !== "edit") {
    serverList.innerHTML = '<div class="muted" style="font-size:12px">Create/save instance first to manage servers.</div>';
    return;
  }

  const data = await backend.serversList(instanceId);
  const entries = data?.servers ?? [];

  if (!entries.length) {
    serverList.innerHTML = '<div class="muted" style="font-size:12px">No servers saved yet.</div>';
    return;
  }

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "setRow";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";

    const title = document.createElement("div");
    title.className = "setLabel";
    title.textContent = entry.name + (data.preferredServerId === entry.id ? " (preferred)" : "");

    const sub = document.createElement("div");
    sub.className = "setHelp";
    sub.textContent = `${entry.address}${entry.notes ? ` - ${entry.notes}` : ""}`;

    left.appendChild(title);
    left.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "row";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "8px";

    const btnPrefer = document.createElement("button");
    btnPrefer.className = "btn";
    btnPrefer.textContent = data.preferredServerId === entry.id ? "Preferred" : "Set preferred";
    btnPrefer.onclick = async () => {
      await backend.serversSetPreferred(instanceId, entry.id);
      await renderServerEntries(instanceId);
    };

    const btnEdit = document.createElement("button");
    btnEdit.className = "btn";
    btnEdit.textContent = "Edit";
    btnEdit.onclick = () => {
      editServerId = entry.id;
      serverNameInput.value = entry.name;
      serverAddressInput.value = entry.address;
    };

    const btnRemove = document.createElement("button");
    btnRemove.className = "btn btnDanger";
    btnRemove.textContent = "Remove";
    btnRemove.onclick = async () => {
      await backend.serversRemove(instanceId, entry.id);
      await renderServerEntries(instanceId);
    };

    actions.appendChild(btnPrefer);
    actions.appendChild(btnEdit);
    actions.appendChild(btnRemove);

    row.appendChild(left);
    row.appendChild(actions);
    serverList.appendChild(row);
  }
}

// Ensure fabric api for fabric instance.
async function ensureFabricApiForFabricInstance(instanceId: string, mcVersion: string, loader: LoaderKind) {
  if (loader !== "fabric") return;
  const hasFabricApi = CATALOG.some((m) => m.id === "fabric-api");
  if (!hasFabricApi) return;
  try {
    await backend.modsSetEnabled(instanceId, "fabric-api", true);
    await backend.modsRefresh(instanceId, mcVersion);
    appendLog(`[mods] Ensured Fabric API is installed for Fabric instance ${instanceId}.`);
  } catch (err: any) {
    appendLog(`[mods] Failed ensuring Fabric API: ${String(err?.message ?? err)}`);
  }
}

// Find preferred server target.
async function findPreferredServerTarget() {
  const instances = state.instances?.instances ?? [];
  if (!instances.length) return null;

  const activeId = state.instances?.activeInstanceId ?? null;
  const activeInst = instances.find((x: any) => x.id === activeId) ?? null;
  if (activeInst) {
    const s = await backend.serversList(activeInst.id);
    const preferred = (s?.servers ?? []).find((x: any) => x.id === s.preferredServerId) ?? null;
    if (preferred) return { instance: activeInst, server: preferred };
  }

  for (const inst of instances) {
    const s = await backend.serversList(inst.id);
    const preferred = (s?.servers ?? []).find((x: any) => x.id === s.preferredServerId) ?? null;
    if (preferred) return { instance: inst, server: preferred };
  }

  return null;
}

async function findPreferredServerForInstance(inst: any) {
  const instanceId = String(inst?.id || "").trim();
  if (!instanceId) return null;
  const data = await backend.serversList(instanceId);
  return (data?.servers ?? []).find((x: any) => x.id === data.preferredServerId) ?? null;
}

function syncModalFieldsFromInstance(i: any) {
  newName.value = i.name ?? "";
  newMem.value = String(i.memoryMb ?? 4096);
  newVersion.value = i.mcVersion ?? "";
  const runtimeLoader = String(i.loader || "fabric").trim().toLowerCase();
  createLoaderType.value = getInstanceDisplayLoader(i);
  createLoaderVersion.value =
    runtimeLoader === "fabric"
      ? i.fabricLoaderVersion ?? ""
      : runtimeLoader === "quilt"
        ? i.quiltLoaderVersion ?? ""
        : runtimeLoader === "forge"
          ? i.forgeVersion ?? ""
          : runtimeLoader === "neoforge"
            ? i.neoforgeVersion ?? ""
            : "";
  updateCreateLoaderUi();
  modalInstanceSyncEnabled = i.syncEnabled !== false;
  renderModalInstanceSyncToggle();
}

async function refreshEditedInstanceWorkspace(targetTab: ModalTabId = activeModalTab) {
  if (modalMode !== "edit" || !editInstanceId) return null;
  state.instances = await backend.instancesList();
  await renderInstances();
  const inst = (state.instances?.instances ?? []).find((x: any) => String(x.id) === String(editInstanceId)) ?? null;
  if (!inst) return null;

  syncModalFieldsFromInstance(inst);
  await refreshPresetDropdownAvailability(
    inst.instancePreset ?? "none",
    getInstanceDisplayLoader(inst),
    String(inst.mcVersion || "")
  );
  await fillInstanceAccountDropdown(inst.accountId ?? null);
  await renderServerEntries(inst.id);

  if (targetTab === "installed" || targetTab === "discover") {
    await renderLocalContent(inst.id);
  }
  if (targetTab === "installed" || targetTab === "discover") {
    await renderInstanceMods(inst.id);
  }
  if (targetTab === "discover") {
    await runInstanceModrinthContentSearch(inst.id);
  }

  return inst;
}

// Launch for instance.
async function launchForInstance(inst: any, serverAddress?: string) {
  const accounts = state.accounts?.accounts ?? [];
  const accountId = inst.accountId || state.accounts?.activeId || (accounts[0]?.id ?? null);
  if (!accountId) {
    appendLog("[ui] No account selected.");
    return;
  }

  const s = getSettings();
  const validation = await backend.modsValidate(inst.id);
  const allIssues = validation.issues || [];
  const blockingIssues = allIssues.filter(isBlockingValidationIssue);
  const advisoryIssues = allIssues.filter((issue) => !isBlockingValidationIssue(issue));
  if (blockingIssues.length) {
    const detail = blockingIssues
      .slice(0, 8)
      .map((x) => `- ${x.title}`)
      .join("\n");
    const launchAnyway = await showLauncherConfirm(
      `Critical mod conflicts detected:\n${detail}\n\nUse "Update Mods" or fix duplicates first.\nLaunch anyway?`
    );
    if (!launchAnyway) return;
  } else if ((validation.issues || []).length) {
    appendLog("[validation] Advisory issues detected. Open Mods tab for details.");
  }

  appendLog(
    serverAddress
      ? `[server] Launching ${inst.name} for ${serverAddress}...`
      : `[ui] Launching ${inst.name}...`
  );
  renderLaunchDiagnosis(null);
  const launchRes = await backend.launch(inst.id, accountId, {
    jvmArgs: inst.jvmArgsOverride || s.jvmArgs,
    preLaunch: s.preLaunch,
    postExit: s.postExit,
    serverAddress
  });
  if (!launchRes?.ok) {
    const errText = String(launchRes?.error || "Unknown launch failure");
    appendLog(`[launcher] ${errText}`);
    setStatus(errText);
    const diag = await runLaunchDiagnosis(inst.id);
    await maybeOfferRollback(inst.id, diag);
  }
}

// ---------------- Local content (mods/resourcepacks/shaderpacks uploads) ----------------
async function renderLocalContent(instanceId: string | null) {
  const can = modalMode === "edit" && !!instanceId;
  if (!can) {
    if (modalLocalModsList) modalLocalModsList.innerHTML = '<div class="muted" style="font-size:12px">Select an instance first.</div>';
    if (resourcepacksList) resourcepacksList.innerHTML = '<div class="muted" style="font-size:12px">Select an instance first.</div>';
    if (shaderpacksList) shaderpacksList.innerHTML = '<div class="muted" style="font-size:12px">Select an instance first.</div>';
    return;
  }

  const [modsRes, rpsRes, spsRes] = await Promise.allSettled([
    backend.contentList(instanceId, "mods"),
    backend.contentList(instanceId, "resourcepacks"),
    backend.contentList(instanceId, "shaderpacks")
  ]);
  const toList = (res: PromiseSettledResult<any>) => {
    if (res.status !== "fulfilled") return [] as Array<{ name: string; size: number; modifiedMs?: number }>;
    const value = res.value;
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    return [] as Array<{ name: string; size: number; modifiedMs?: number }>;
  };
  const mods = toList(modsRes);
  const rps = toList(rpsRes);
  const sps = toList(spsRes);
  let modMetadataByName: Record<
    string,
    {
      title?: string;
      description?: string;
      iconUrl?: string | null;
      author?: string | null;
      source?: "modrinth" | "curseforge";
    }
  > = {};
  let packMetadataByName: Record<
    string,
    {
      title?: string;
      description?: string;
      iconUrl?: string | null;
      author?: string | null;
      source?: "modrinth";
    }
  > = {};
  if (modsRes.status === "rejected") appendLog(`[content] Failed loading mods folder: ${String(modsRes.reason)}`);
  if (rpsRes.status === "rejected") appendLog(`[content] Failed loading resourcepacks folder: ${String(rpsRes.reason)}`);
  if (spsRes.status === "rejected") appendLog(`[content] Failed loading shaderpacks folder: ${String(spsRes.reason)}`);
  if (mods.length) {
    try {
      const metaRes = await backend.localModsMetadata(instanceId, mods.map((m: any) => String(m?.name || "")));
      const rows = Array.isArray(metaRes?.items) ? metaRes.items : [];
      modMetadataByName = rows.reduce(
        (acc: Record<string, any>, row: any) => {
          const key = String(row?.fileName || "").toLowerCase();
          if (!key) return acc;
          acc[key] = {
            title: row?.title || undefined,
            description: row?.description || undefined,
            iconUrl: row?.iconUrl || null,
            author: row?.author || null,
            source: row?.source === "curseforge" ? "curseforge" : row?.source === "modrinth" ? "modrinth" : undefined
          };
          return acc;
        },
        {}
      );
    } catch (err: any) {
      appendLog(`[mods-metadata] Failed fetching metadata: ${String(err?.message ?? err)}`);
    }
  }
  const loadPackMetadata = async (kind: "resourcepacks" | "shaderpacks", rows: Array<{ name: string }>) => {
    if (!rows.length) return;
    try {
      const res = await backend.localPacksMetadata(instanceId, kind, rows.map((r: any) => String(r?.name || "")));
      const items = Array.isArray(res?.items) ? res.items : [];
      for (const item of items) {
        const key = `${kind}:${String(item?.fileName || "").toLowerCase()}`;
        if (!key.endsWith(":")) {
          packMetadataByName[key] = {
            title: item?.title || undefined,
            description: item?.description || undefined,
            iconUrl: item?.iconUrl || null,
            author: item?.author || null,
            source: item?.source === "modrinth" ? "modrinth" : undefined
          };
        }
      }
    } catch (err: any) {
      appendLog(`[packs-metadata] Failed fetching ${kind} metadata: ${String(err?.message ?? err)}`);
    }
  };
  await Promise.all([loadPackMetadata("resourcepacks", rps as any), loadPackMetadata("shaderpacks", sps as any)]);

  const removeFn = async (kind: "resourcepacks" | "shaderpacks", name: string) => {
    await backend.contentRemove(instanceId, kind, name);
    await renderLocalContent(instanceId);
  };

  renderFileList(
    modalLocalModsList,
    "mods",
    mods,
    async (name) => {
      await backend.contentRemove(instanceId, "mods", name);
      await renderLocalContent(instanceId);
    },
    async (name, shouldEnable) => {
      await backend.contentToggleEnabled(instanceId, "mods", name, shouldEnable);
      await renderLocalContent(instanceId);
      await renderInstanceMods(instanceId);
    },
    {
      modMetadataByName,
      searchQuery: modalInstalledModsSearch?.value || ""
    }
  );

  renderFileList(
    resourcepacksList,
    "resourcepacks",
    rps,
    async (name) => removeFn("resourcepacks", name),
    async (name, shouldEnable) => {
      await backend.contentToggleEnabled(instanceId, "resourcepacks", name, shouldEnable);
      await renderLocalContent(instanceId);
    },
    { packMetadataByName }
  );

  renderFileList(
    shaderpacksList,
    "shaderpacks",
    sps,
    async (name) => removeFn("shaderpacks", name),
    async (name, shouldEnable) => {
      await backend.contentToggleEnabled(instanceId, "shaderpacks", name, shouldEnable);
      await renderLocalContent(instanceId);
    },
    { packMetadataByName }
  );
}

// Pick and add.
async function pickAndAdd(kind: "mods" | "resourcepacks" | "shaderpacks") {
  if (!editInstanceId) return;
  const files = await backend.contentPickFiles(kind);
  if (!files?.length) return;

  const res = await backend.contentAdd(editInstanceId, kind, files);
  const failed = (res ?? []).filter((x: any) => !x.ok);
  if (failed.length) {
    appendLog(`[content] Some files failed: ${failed.map((f: any) => `${f.name}: ${f.error}`).join(" | ")}`);
  }

  await refreshEditedInstanceWorkspace(activeModalTab);
  if (kind === "mods") {
    const v = await backend.modsValidate(editInstanceId);
    appendLog(`[validation] After add: ${v.summary} (${v.issues.length} issues)`);
  }
}

if (modalInstalledModsSearch) {
  modalInstalledModsSearch.oninput = () => {
    if (activeModalTab !== "installed" || !editInstanceId) return;
    void renderLocalContent(editInstanceId);
  };
}

// Run Modrinth search for instance packs tab.
async function runInstanceModrinthContentSearch(instanceId: string | null) {
  instanceContentSearchResults.innerHTML = "";
  if (!instanceId) {
    instanceContentResultsLabel.textContent = "Select an instance first";
    instanceContentSearchResults.innerHTML = '<div class="muted" style="font-size:12px">Select an instance first.</div>';
    return;
  }

  const inst = (state.instances?.instances ?? []).find((x: any) => x.id === instanceId) ?? null;
  if (!inst) {
    instanceContentResultsLabel.textContent = "Select an instance first";
    instanceContentSearchResults.innerHTML = '<div class="muted" style="font-size:12px">Select an instance first.</div>';
    return;
  }

  const kind = String(instanceContentSearchKind.value || "resourcepack") === "shaderpack" ? "shaderpack" : "resourcepack";
  const q = String(instanceContentSearchInput.value || "").trim();
  const kindLabel = kind === "shaderpack" ? "shader packs" : "resource packs";
  instanceContentResultsLabel.textContent = q ? `Search results for "${q}"` : `Popular ${kindLabel}`;
  instanceContentSearchResults.innerHTML = '<div class="muted" style="font-size:12px">Searching...</div>';

  const data = await backend.modrinthContentSearch(instanceId, kind, q, String(inst.mcVersion || ""), 20);
  const hits = data?.hits ?? [];
  if (!hits.length) {
    instanceContentSearchResults.innerHTML = '<div class="muted" style="font-size:12px">No packs found.</div>';
    return;
  }

  instanceContentSearchResults.innerHTML = "";
  for (const h of hits) {
    const row = document.createElement("div");
    row.className = "modrinthResult";

    const img = document.createElement("img");
    const fallback = fallbackPackIconDataUrl(h.title, "blue");
    img.src = h.iconUrl || fallback;
    img.onerror = () => {
      if (img.src !== fallback) img.src = fallback;
    };
    row.appendChild(img);

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.flex = "1";

    const title = document.createElement("div");
    title.className = "setLabel";
    title.textContent = h.title || "Unknown pack";
    left.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "setHelp";
    desc.textContent = h.description || "No description.";
    left.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "setHelp";
    const downloads = Number(h.downloads || 0).toLocaleString();
    const follows = Number(h.follows || 0).toLocaleString();
    meta.textContent = `${h.kind === "shaderpack" ? "Shaderpack" : "Resource pack"} | by ${h.author || "unknown"} | ${downloads} downloads | ${follows} follows`;
    left.appendChild(meta);

    row.appendChild(left);

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = h.installed ? "Installed" : "Install";
    if (h.installed) {
      btn.disabled = true;
    }
    btn.onclick = () =>
      guarded(async () => {
        btn.disabled = true;
        btn.textContent = "Installing...";
        try {
          const res = await backend.modrinthContentInstall(instanceId, kind, h.projectId, h.latestVersionId || undefined);
          appendLog(`[modrinth-${res.kind}] Installed ${h.title} (${res.versionName || "latest"})`);
          await refreshEditedInstanceWorkspace("discover");
        } catch (err: any) {
          btn.disabled = false;
          btn.textContent = "Install";
          alert(String(err?.message ?? err ?? "Could not install pack"));
        }
      });
    row.appendChild(btn);

    instanceContentSearchResults.appendChild(row);
  }
}

// Get mod compatibility reason.
function getModCompatibilityReason(mod: any, mcVersion: string, loader: LoaderKind) {
  if (mod?.status === "ok") return null;
  if (mod?.status === "unavailable") {
    const loaderLabel = loader === "vanilla" ? "loader-neutral" : loader;
    return `No compatible ${loaderLabel} build for Minecraft ${mcVersion} on Modrinth.`;
  }
  const err = String(mod?.resolved?.error ?? "").trim();
  if (err) return err;
  return `Compatibility check failed for Minecraft ${mcVersion}.`;
}

// Validation issue suggestions.
function validationIssueSuggestions(issue: any) {
  const code = String(issue?.code || "");
  const mods = Array.isArray(issue?.modIds) ? issue.modIds : [];
  if (code === "duplicate-mod-id") {
    return ["Use \"Fix duplicates\" to remove older duplicate jars."];
  }
  if (code === "missing-dependency") {
    const dep = mods[1];
    return [
      dep ? `Install/resolve dependency: ${dep}.` : "Resolve missing dependencies with mod refresh.",
      "Click \"Refresh mods\" to pull compatible dependency versions."
    ];
  }
  if (code === "incompatible-minecraft") {
    return [
      "Switch to a compatible Minecraft version or refresh to compatible builds.",
      "Try an instance preset combo known for this version."
    ];
  }
  if (code === "known-conflict") {
    return [
      "Disable one side of the conflict pair.",
      "Use suggested preset combo to avoid conflicting stacks."
    ];
  }
  if (code === "loader-mismatch") {
    return ["Remove non-Fabric jars from the mods folder."];
  }
  return [];
}

// Is blocking validation issue.
function isBlockingValidationIssue(issue: any) {
  const code = String(issue?.code || "");
  const severity = String(issue?.severity || "");
  if (severity !== "critical") return false;
  if (code === "duplicate-mod-id" || code === "missing-dependency") return false;
  return true;
}

// Build mod update summary.
function buildModUpdateSummary(plan: any) {
  const lines: string[] = [];
  lines.push(`Smart update analysis (${new Date(plan?.checkedAt || Date.now()).toLocaleString()})`);
  lines.push(
    `Updates: ${plan?.updates?.length || 0}  [Safe: ${plan?.counts?.safe || 0}, Caution: ${plan?.counts?.caution || 0}, Breaking: ${plan?.counts?.breaking || 0}]`
  );
  if (plan?.blocked?.length) lines.push(`Blocked: ${plan.blocked.length}`);
  lines.push("");
  for (const u of (plan?.updates || []).slice(0, 12)) {
    const sev = String(u?.severity || "safe").toUpperCase();
    lines.push(`[${sev}] ${u?.id}: ${u?.fromVersion || "none"} -> ${u?.toVersion || "unknown"}`);
    if (u?.reason) lines.push(`  reason: ${u.reason}`);
    if (u?.dependencyAdded?.length) lines.push(`  deps+: ${u.dependencyAdded.join(", ")}`);
    if (u?.dependencyRemoved?.length) lines.push(`  deps-: ${u.dependencyRemoved.join(", ")}`);
    if (u?.changelog) lines.push(`  changelog: ${String(u.changelog).slice(0, 180)}`);
  }
  if ((plan?.updates?.length || 0) > 12) lines.push(`...and ${plan.updates.length - 12} more`);
  if (plan?.blocked?.length) {
    lines.push("");
    lines.push("Blocked mods:");
    for (const b of plan.blocked.slice(0, 8)) lines.push(`- ${b.id}: ${b.reason}`);
  }
  return lines.join("\n");
}

// Render compatibility guidance.
async function renderCompatibilityGuidance(instanceId: string | null) {
  modalCompatGuidance.innerHTML = "";
  if (!instanceId) return;

  const inst = (state.instances?.instances ?? []).find((x: any) => x.id === instanceId) ?? null;
  if (!inst) return;
  const loaderKind = String(inst.loader || "vanilla") as LoaderKind;
  const isCatalogLoader = loaderKind !== "vanilla";
  const isFabricLikeLoader = loaderKind === "fabric" || loaderKind === "quilt";

  const res = await backend.modsList(instanceId);
  const mods = res?.mods ?? [];
  const byId = new Map<string, any>(mods.map((m: any) => [m.id, m]));

  const heading = document.createElement("div");
  heading.className = "muted";
  heading.style.fontSize = "12px";
  heading.style.marginBottom = "8px";
  heading.textContent = `Compatibility assistant (${inst.loader}, ${inst.mcVersion})`;
  modalCompatGuidance.appendChild(heading);

  if (!isFabricLikeLoader) {
    const note = document.createElement("div");
    note.className = "setHelp";
    note.style.marginBottom = "8px";
    note.textContent = "Detailed dependency validation is currently Fabric/Quilt focused. Presets still apply loader-aware mod + pack profiles.";
    modalCompatGuidance.appendChild(note);
  }

  const validation = isFabricLikeLoader
    ? await backend.modsValidate(instanceId)
    : { summary: "no-issues", issues: [] as any[] };
  const allIssues = validation.issues || [];
  const blockingIssues = allIssues.filter(isBlockingValidationIssue);
  const advisoryIssues = allIssues.filter((issue) => !isBlockingValidationIssue(issue));
  const hasBlockingIssues = blockingIssues.length > 0;
  const valCard = document.createElement("div");
  valCard.className = "setRow";
  valCard.style.marginBottom = "8px";

  const valLeft = document.createElement("div");
  valLeft.style.display = "flex";
  valLeft.style.flexDirection = "column";

  const valTitle = document.createElement("div");
  valTitle.className = "setLabel";
  valTitle.textContent =
    hasBlockingIssues
      ? "Validation: blocking conflicts"
      : allIssues.length === 0
      ? "Validation: no issues"
      : "Validation: advisory notes";

  const valSub = document.createElement("div");
  valSub.className = "setHelp";
  if (hasBlockingIssues) {
    valSub.textContent = blockingIssues.slice(0, 3).map((x) => x.title).join(" � ");
  } else if (advisoryIssues.length) {
    valSub.textContent = `${advisoryIssues.length} non-blocking advisory note(s). Minecraft can still launch normally.`;
  } else {
    valSub.textContent = "All clear.";
  }
  valLeft.appendChild(valTitle);
  valLeft.appendChild(valSub);

  const valActions = document.createElement("div");
  valActions.className = "row";
  valActions.style.justifyContent = "flex-end";
  valActions.style.gap = "8px";

  const btnRecheck = document.createElement("button");
  btnRecheck.className = "btn";
  btnRecheck.textContent = "Re-check";
  btnRecheck.onclick = () =>
    guarded(async () => {
      await renderCompatibilityGuidance(instanceId);
    });
  valActions.appendChild(btnRecheck);

  if (isCatalogLoader) {
    const btnFixDup = document.createElement("button");
    btnFixDup.className = "btn";
    btnFixDup.textContent = "Fix duplicates";
    btnFixDup.onclick = () =>
      guarded(async () => {
        const res = await backend.modsFixDuplicates(instanceId);
        appendLog(`[validation] Removed duplicate jars: ${res.removed.join(", ") || "none"}`);
        await renderCompatibilityGuidance(instanceId);
        await renderInstanceMods(instanceId);
        await renderLocalContent(instanceId);
      });
    valActions.appendChild(btnFixDup);
  }

  valCard.appendChild(valLeft);
  valCard.appendChild(valActions);
  modalCompatGuidance.appendChild(valCard);

  const issuesToRender = hasBlockingIssues ? blockingIssues : [];
  if (issuesToRender.length) {
    for (const issue of issuesToRender) {
      const row = document.createElement("div");
      row.className = "setRow";
      row.style.marginBottom = "8px";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";

      const title = document.createElement("div");
      title.className = "setLabel";
      title.textContent = `${issue.severity === "critical" ? "Critical" : "Warning"}: ${issue.title}`;

      const detail = document.createElement("div");
      detail.className = "setHelp";
      detail.textContent = issue.detail || "";

      left.appendChild(title);
      left.appendChild(detail);

      if (Array.isArray(issue.modIds) && issue.modIds.length) {
        const rel = document.createElement("div");
        rel.className = "setHelp";
        rel.textContent =
          issue.code === "missing-dependency" && issue.modIds.length >= 2
            ? `Dependency path: ${issue.modIds[0]} -> ${issue.modIds[1]}`
            : issue.code === "known-conflict" && issue.modIds.length >= 2
              ? `Conflict path: ${issue.modIds[0]} x ${issue.modIds[1]}`
              : `Affected mods: ${issue.modIds.join(", ")}`;
        left.appendChild(rel);
      }

      const suggestions = validationIssueSuggestions(issue);
      if (suggestions.length) {
        const sug = document.createElement("div");
        sug.className = "setHelp";
        sug.textContent = `Suggested: ${suggestions.join(" ")}`;
        left.appendChild(sug);
      }

      if (Array.isArray(issue.modIds) && issue.modIds.length) {
        const alt = MOD_ALTERNATIVES[issue.modIds[0]];
        if (alt?.length) {
          const altLine = document.createElement("div");
          altLine.className = "setHelp";
          altLine.textContent = `Alternatives: ${alt.join(" | ")}`;
          left.appendChild(altLine);
        }
      }

      const right = document.createElement("div");
      right.className = "row";
      right.style.justifyContent = "flex-end";
      right.style.gap = "8px";

      if (issue.code === "duplicate-mod-id") {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = "Fix duplicates";
        btn.onclick = () =>
          guarded(async () => {
            const r = await backend.modsFixDuplicates(instanceId);
            appendLog(`[validation] Removed duplicate jars: ${r.removed.join(", ") || "none"}`);
            await renderCompatibilityGuidance(instanceId);
            await renderInstanceMods(instanceId);
            await renderLocalContent(instanceId);
          });
        right.appendChild(btn);
      } else if (
        isCatalogLoader &&
        (issue.code === "missing-dependency" ||
          issue.code === "incompatible-minecraft" ||
          issue.code === "loader-mismatch")
      ) {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = "Refresh mods";
        btn.onclick = () =>
          guarded(async () => {
            await backend.modsRefresh(instanceId, inst.mcVersion);
            await renderCompatibilityGuidance(instanceId);
            await renderInstanceMods(instanceId);
            await renderLocalContent(instanceId);
          });
        right.appendChild(btn);
      }

      row.appendChild(left);
      row.appendChild(right);
      modalCompatGuidance.appendChild(row);
    }
  }

  for (const id of Object.keys(INSTANCE_PRESETS) as Array<Exclude<InstancePresetId, "none">>) {
    const preset = INSTANCE_PRESETS[id];
    const resolved = resolvePresetVariantForLoader(preset, inst.loader as LoaderKind, inst.mcVersion);
    if (!resolved) continue;
    const variant = resolved.variant;
    const needed = isCatalogLoader ? variant.enableMods.filter((m) => byId.has(m)) : [];
    const missing = isCatalogLoader ? needed.filter((m) => byId.get(m)?.status !== "ok") : [];

    const card = document.createElement("div");
    card.className = "setRow";
    card.style.marginBottom = "8px";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";

    const title = document.createElement("div");
    title.className = "setLabel";
    title.textContent = `${preset.name} combo`;

    const sub = document.createElement("div");
    sub.className = "setHelp";
    sub.textContent =
      loaderKind === "vanilla"
        ? "Not available on vanilla loader."
        : !isCatalogLoader
        ? resolved.sourceLoader === (inst.loader as LoaderKind)
          ? "Ready for this loader profile."
          : `Uses ${resolved.sourceLoader} profile fallback for this loader.`
        : missing.length === 0
        ? "Ready for this version."
        : `Missing compatibility: ${missing.join(", ")}`;

    left.appendChild(title);
    left.appendChild(sub);

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = loaderKind === "vanilla" ? "Unavailable on vanilla" : "Apply combo";
    btn.disabled = loaderKind === "vanilla";
    btn.onclick = () =>
      guarded(async () => {
        await applyInstancePreset(instanceId, inst.mcVersion, inst.loader as LoaderKind, id);
        await renderCompatibilityGuidance(instanceId);
        await renderInstanceMods(instanceId);
        await renderLocalContent(instanceId);
      });

    card.appendChild(left);
    card.appendChild(btn);
    modalCompatGuidance.appendChild(card);
  }
}

// ---------------- Mods list (catalog toggles) ----------------
async function renderInstanceMods(instanceId: string | null) {
  modalCompatGuidance.innerHTML = "";

  if (!instanceId) {
    if (modalInstalledHint) modalInstalledHint.textContent = "Select an instance first.";
    instanceModrinthResultsLabel.textContent = "Select an instance first";
    instanceModrinthSearchResults.innerHTML = '<div class="muted" style="font-size:12px">Select an instance first.</div>';
    return;
  }

  const inst = (state.instances?.instances ?? []).find((x: any) => x.id === instanceId) ?? null;
  const mcVersion = inst?.mcVersion ?? "unknown";
  const loader = String(inst?.loader || "vanilla") as LoaderKind;
  if (modalInstalledHint) modalInstalledHint.textContent = `Installed content for this instance (${mcVersion}):`;
  await renderCompatibilityGuidance(instanceId);
  await runInstanceModrinthModsSearch(instanceId);
}

// ---------------- Accounts ----------------
function getAccountLabel(a: any) {
  return a?.name ?? a?.username ?? a?.profileName ?? a?.id ?? "Account";
}

// Get launcher display name.
function getLauncherDisplayName(a: any) {
  return a?.displayName ?? a?.email ?? a?.id ?? "Launcher account";
}

// Run launcher account action.
async function runLauncherAccountAction(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err: unknown) {
    const message =
      (err && typeof err === "object" && "message" in err && String((err as { message?: unknown }).message)) ||
      "Launcher account request failed.";
    alert(message);
  }
}

async function promptLauncherSignInOnStartup() {
  if (launcherSignInPromptShown) return;
  launcherSignInPromptShown = true;
  if (!state.launcherAccount?.configured) return;
  if (state.launcherAccount?.activeAccountId) return;

  const accountError = String(state.launcherAccount?.error || "").toLowerCase();
  if (accountError.includes("could not reach") || accountError.includes("network")) return;

  try {
    const values = await openLauncherAuthDialog("login");
    if (!values) return;
    if (values.action === "google") {
      await showLauncherAlert("A browser window will open for Google sign-in. Complete it, then return to the launcher.");
      state.launcherAccount = await backend.launcherAccountGoogleLogin();
    } else if (values.mode === "register") {
      state.launcherAccount = await backend.launcherAccountRegister(values.email, values.password, values.displayName);
    } else {
      const loginResult = await backend.launcherAccountLogin(values.email, values.password);
      if (loginResult?.requiresTwoFactor) {
        const code = await openLauncherTwoFactorDialog();
        if (!code) return;
        state.launcherAccount = await backend.launcherAccountLogin2fa(loginResult.challengeToken, code);
      } else {
        state.launcherAccount = loginResult.state;
      }
    }
    await refreshLauncherSubscription();
    await renderAccounts();
  } catch (err: unknown) {
    const message =
      (err && typeof err === "object" && "message" in err && String((err as { message?: unknown }).message)) ||
      "Launcher account request failed.";
    await showLauncherAlert(message);
  }
}

// Refresh launcher subscription.
async function refreshLauncherSubscription() {
  if (!state.launcherAccount?.activeAccountId) {
    state.launcherSubscription = null;
    return;
  }
  try {
    state.launcherSubscription = await backend.launcherAccountGetSubscriptionStatus();
  } catch {
    state.launcherSubscription = null;
  }
}

type LauncherAuthFormResult =
  | {
      action: "credentials";
      mode: "login" | "register";
      email: string;
      password: string;
      displayName?: string;
    }
  | {
      action: "google";
    }
  | null;

type LauncherProfileFormResult = {
  displayName: string;
  avatarUrl: string | null;
} | null;

// Open launcher two factor dialog.
async function openLauncherTwoFactorDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.inset = "0";
    backdrop.style.background = "rgba(5, 12, 22, 0.72)";
    backdrop.style.display = "grid";
    backdrop.style.placeItems = "center";
    backdrop.style.zIndex = "100000";

    const panel = document.createElement("div");
    panel.style.width = "min(420px, calc(100vw - 24px))";
    panel.style.padding = "14px";
    panel.style.borderRadius = "14px";
    panel.style.border = "1px solid var(--line)";
    panel.style.background = "var(--panel)";
    panel.style.boxShadow = "0 16px 50px rgba(0,0,0,.45)";

    const title = document.createElement("h3");
    title.textContent = "Authenticator code required";
    title.style.margin = "0 0 8px";

    const hint = document.createElement("p");
    hint.className = "muted";
    hint.style.margin = "0 0 10px";
    hint.textContent = "Enter the 6-digit code from your authenticator app.";

    const field = document.createElement("label");
    field.style.display = "grid";
    field.style.gap = "6px";
    field.style.marginBottom = "10px";
    const fieldLabel = document.createElement("span");
    fieldLabel.className = "muted";
    fieldLabel.style.fontSize = "12px";
    fieldLabel.textContent = "Code";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "input";
    input.inputMode = "numeric";
    input.maxLength = 6;
    input.placeholder = "123456";
    field.append(fieldLabel, input);

    const status = document.createElement("p");
    status.className = "muted";
    status.style.margin = "6px 0 0";
    status.style.fontSize = "13px";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn";
    cancelBtn.textContent = "Cancel";
    const verifyBtn = document.createElement("button");
    verifyBtn.className = "btn ok";
    verifyBtn.textContent = "Verify code";
    actions.append(cancelBtn, verifyBtn);

    panel.append(title, hint, field, actions, status);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    const cleanup = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onEsc);
    };
    const finish = (value: string | null) => {
      cleanup();
      resolve(value);
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") finish(null);
    };
    document.addEventListener("keydown", onEsc);
    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) finish(null);
    });
    cancelBtn.onclick = () => finish(null);

    const submit = () => {
      const code = input.value.replace(/\s+/g, "");
      if (!/^\d{6}$/.test(code)) {
        status.textContent = "Enter a valid 6-digit code.";
        return;
      }
      finish(code);
    };
    verifyBtn.onclick = submit;
    input.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      submit();
    });
    input.focus();
  });
}

// Open launcher auth dialog.
async function openLauncherAuthDialog(mode: "login" | "register"): Promise<LauncherAuthFormResult> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.inset = "0";
    backdrop.style.background = "rgba(5, 12, 22, 0.72)";
    backdrop.style.display = "grid";
    backdrop.style.placeItems = "center";
    backdrop.style.zIndex = "99999";

    const panel = document.createElement("div");
    panel.style.width = "min(520px, calc(100vw - 24px))";
    panel.style.padding = "14px";
    panel.style.borderRadius = "14px";
    panel.style.border = "1px solid var(--line)";
    panel.style.background = "var(--panel)";
    panel.style.boxShadow = "0 16px 50px rgba(0,0,0,.45)";

    const kicker = document.createElement("p");
    kicker.textContent = "FISHBATTERY ACCOUNT";
    kicker.style.margin = "0 0 4px";
    kicker.style.fontSize = "12px";
    kicker.style.letterSpacing = "1px";
    kicker.style.color = "var(--accent)";

    const title = document.createElement("h3");
    title.style.margin = "0 0 10px";

    const makeInput = (labelText: string, type = "text", placeholder = "") => {
      const wrap = document.createElement("label");
      wrap.style.display = "grid";
      wrap.style.gap = "6px";
      wrap.style.marginBottom = "10px";
      const label = document.createElement("span");
      label.textContent = labelText;
      label.style.fontSize = "12px";
      label.className = "muted";
      const input = document.createElement("input");
      input.type = type;
      input.placeholder = placeholder;
      input.className = "input";
      wrap.append(label, input);
      return { wrap, input };
    };

    const modeRow = document.createElement("div");
    modeRow.style.display = "flex";
    modeRow.style.gap = "8px";
    modeRow.style.margin = "0 0 12px";

    const loginModeBtn = document.createElement("button");
    loginModeBtn.type = "button";
    loginModeBtn.className = "btn";
    loginModeBtn.textContent = "Sign in";

    const registerModeBtn = document.createElement("button");
    registerModeBtn.type = "button";
    registerModeBtn.className = "btn";
    registerModeBtn.textContent = "Create account";
    modeRow.append(loginModeBtn, registerModeBtn);

    const providerTitle = document.createElement("h4");
    providerTitle.textContent = "Continue with";
    providerTitle.style.margin = "0 0 8px";
    providerTitle.style.fontSize = "22px";

    const providerGrid = document.createElement("div");
    providerGrid.style.display = "grid";
    providerGrid.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    providerGrid.style.gap = "8px";
    providerGrid.style.marginBottom = "10px";

    const makeProviderBtn = (label: string, enabled = false) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = label;
      btn.style.width = "100%";
      if (!enabled) {
        btn.disabled = true;
        btn.style.opacity = "0.6";
        btn.style.cursor = "not-allowed";
      }
      return btn;
    };

    providerGrid.append(
      makeProviderBtn("Discord"),
      makeProviderBtn("GitHub"),
      makeProviderBtn("Microsoft"),
      makeProviderBtn("Google", true),
      makeProviderBtn("Steam"),
      makeProviderBtn("GitLab")
    );

    const passwordSubtitle = document.createElement("h4");
    passwordSubtitle.style.margin = "0 0 8px";
    passwordSubtitle.style.fontSize = "22px";

    const emailField = makeInput("Email", "email", "you@example.com");
    const displayNameField = makeInput("Username (unique)", "text", "Choose a unique username");
    displayNameField.input.maxLength = 32;
    const passwordField = makeInput("Password", "password", "Password");
    const confirmPasswordField = makeInput("Confirm password", "password", "Confirm password");

    const statusText = document.createElement("p");
    statusText.className = "muted";
    statusText.style.margin = "6px 0 0";
    statusText.style.fontSize = "13px";

    panel.appendChild(kicker);
    panel.appendChild(title);
    panel.appendChild(modeRow);
    panel.appendChild(providerTitle);
    panel.appendChild(providerGrid);
    panel.appendChild(passwordSubtitle);
    panel.appendChild(emailField.wrap);
    panel.appendChild(displayNameField.wrap);
    panel.appendChild(passwordField.wrap);
    panel.appendChild(confirmPasswordField.wrap);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "space-between";
    actions.style.alignItems = "center";
    actions.style.gap = "8px";
    actions.style.marginTop = "4px";

    const leftActions = document.createElement("div");
    leftActions.style.display = "flex";
    leftActions.style.gap = "8px";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn";
    cancelBtn.textContent = "Back";

    const submitBtn = document.createElement("button");
    submitBtn.className = "btn ok";
    submitBtn.textContent = "Sign in";

    leftActions.append(cancelBtn, submitBtn);
    actions.append(leftActions);
    panel.appendChild(actions);
    panel.appendChild(statusText);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    let currentMode: "login" | "register" = mode;

    const cleanup = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onEsc);
    };

    const finish = (value: LauncherAuthFormResult) => {
      cleanup();
      resolve(value);
    };

    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") finish(null);
    };
    document.addEventListener("keydown", onEsc);

    const setStatus = (text: string) => {
      statusText.textContent = text;
    };

    const setMode = (nextMode: "login" | "register") => {
      currentMode = nextMode;
      const isRegister = currentMode === "register";
      title.textContent = isRegister ? "Create account" : "Sign in";
      passwordSubtitle.textContent = isRegister ? "Or create an account yourself" : "Or use a password";
      submitBtn.textContent = isRegister ? "Create account" : "Sign in";
      loginModeBtn.className = isRegister ? "btn" : "btn ok";
      registerModeBtn.className = isRegister ? "btn ok" : "btn";
      displayNameField.wrap.style.display = isRegister ? "grid" : "none";
      confirmPasswordField.wrap.style.display = isRegister ? "grid" : "none";
      setStatus(isRegister ? "Create your account to get started." : "Sign in with your account.");
    };

    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) finish(null);
    });

    loginModeBtn.onclick = () => setMode("login");
    registerModeBtn.onclick = () => setMode("register");

    const googleBtn = Array.from(providerGrid.querySelectorAll("button")).find((b) => b.textContent === "Google");
    if (googleBtn) {
      googleBtn.onclick = () => finish({ action: "google" });
    }

    cancelBtn.onclick = () => finish(null);
    const submitAuth = () => {
      const email = emailField.input.value.trim();
      const password = passwordField.input.value;
      const displayName = displayNameField.input.value.trim();
      if (!email || !password) {
        setStatus("Please enter your email and password.");
        return;
      }
      if (currentMode === "register" && !displayName) {
        setStatus("Please choose a unique username.");
        return;
      }
      if (currentMode === "register" && password !== confirmPasswordField.input.value) {
        setStatus("Passwords do not match.");
        return;
      }
      finish(
        currentMode === "register"
          ? { action: "credentials", mode: "register", email, password, displayName }
          : { action: "credentials", mode: "login", email, password }
      );
    };
    submitBtn.onclick = submitAuth;

    passwordField.input.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      if (currentMode !== "login") return;
      ev.preventDefault();
      submitAuth();
    });
    confirmPasswordField.input.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      if (currentMode !== "register") return;
      ev.preventDefault();
      submitAuth();
    });

    setMode(mode);
    if (mode === "register") {
      displayNameField.input.focus();
    } else {
      emailField.input.focus();
    };
  });
}

// Open launcher profile dialog.
async function openLauncherProfileDialog(current: {
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<LauncherProfileFormResult> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.inset = "0";
    backdrop.style.background = "rgba(5, 12, 22, 0.72)";
    backdrop.style.display = "grid";
    backdrop.style.placeItems = "center";
    backdrop.style.zIndex = "99999";

    const panel = document.createElement("div");
    panel.style.width = "min(500px, calc(100vw - 24px))";
    panel.style.padding = "14px";
    panel.style.borderRadius = "14px";
    panel.style.border = "1px solid var(--line)";
    panel.style.background = "var(--panel)";
    panel.style.boxShadow = "0 16px 50px rgba(0,0,0,.45)";

    const title = document.createElement("h3");
    title.textContent = "Launcher account settings";
    title.style.margin = "0 0 10px";

    const makeInput = (labelText: string, type = "text", placeholder = "") => {
      const wrap = document.createElement("label");
      wrap.style.display = "grid";
      wrap.style.gap = "6px";
      wrap.style.marginBottom = "10px";
      const label = document.createElement("span");
      label.textContent = labelText;
      label.style.fontSize = "12px";
      label.className = "muted";
      const input = document.createElement("input");
      input.type = type;
      input.placeholder = placeholder;
      input.className = "input";
      wrap.append(label, input);
      return { wrap, input };
    };

    const displayNameField = makeInput("Username (unique)", "text", "Your unique username");
    const avatarField = makeInput("Profile picture", "text", "");
    displayNameField.input.value = String(current.displayName || "").trim();
    avatarField.input.readOnly = true;
    avatarField.input.placeholder = "No file selected";
    avatarField.input.value = "";

    let avatarValue: string | null = String(current.avatarUrl || "").trim() || null;
    const filePicker = document.createElement("input");
    filePicker.type = "file";
    filePicker.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp";
    filePicker.style.display = "none";

    const previewWrap = document.createElement("div");
    previewWrap.style.width = "76px";
    previewWrap.style.height = "76px";
    previewWrap.style.borderRadius = "12px";
    previewWrap.style.border = "1px solid var(--line)";
    previewWrap.style.overflow = "hidden";
    previewWrap.style.background = "var(--panel2)";
    previewWrap.style.display = "grid";
    previewWrap.style.placeItems = "center";
    previewWrap.style.marginBottom = "8px";

    const previewImg = document.createElement("img");
    previewImg.style.width = "100%";
    previewImg.style.height = "100%";
    previewImg.style.objectFit = "cover";
    previewImg.style.display = avatarValue ? "" : "none";
    if (avatarValue) previewImg.src = avatarValue;

    const previewFallback = document.createElement("span");
    previewFallback.className = "muted";
    previewFallback.style.fontSize = "11px";
    previewFallback.textContent = "No picture";
    previewFallback.style.display = avatarValue ? "none" : "";

    previewWrap.append(previewImg, previewFallback);

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.style.fontSize = "12px";
    hint.style.marginBottom = "8px";
    hint.textContent = "Upload an image (PNG, JPG, WEBP, GIF, BMP).";

    panel.append(title, displayNameField.wrap, avatarField.wrap, previewWrap, hint, filePicker);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "8px";
    actions.style.marginTop = "4px";

    const clearAvatarBtn = document.createElement("button");
    clearAvatarBtn.className = "btn";
    clearAvatarBtn.textContent = "Clear picture";

    const pickAvatarBtn = document.createElement("button");
    pickAvatarBtn.className = "btn";
    pickAvatarBtn.textContent = "Upload picture";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn";
    cancelBtn.textContent = "Cancel";

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn ok";
    saveBtn.textContent = "Save";

    actions.append(pickAvatarBtn, clearAvatarBtn, cancelBtn, saveBtn);
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    const cleanup = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onEsc);
    };
    const finish = (value: LauncherProfileFormResult) => {
      cleanup();
      resolve(value);
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") finish(null);
    };
    document.addEventListener("keydown", onEsc);

    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) finish(null);
    });

    const renderAvatarState = () => {
      if (avatarValue) {
        previewImg.src = avatarValue;
        previewImg.style.display = "";
        previewFallback.style.display = "none";
        avatarField.input.value = "Image selected";
      } else {
        previewImg.src = "";
        previewImg.style.display = "none";
        previewFallback.style.display = "";
        avatarField.input.value = "";
      }
    };

    pickAvatarBtn.onclick = () => filePicker.click();
    filePicker.onchange = () => {
      const file = filePicker.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file.");
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => alert("Could not read image file.");
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (!result.startsWith("data:image/")) {
          alert("Unsupported image format.");
          return;
        }
        avatarValue = result;
        renderAvatarState();
      };
      reader.readAsDataURL(file);
    };
    clearAvatarBtn.onclick = () => {
      avatarValue = null;
      filePicker.value = "";
      renderAvatarState();
    };
    cancelBtn.onclick = () => finish(null);
    saveBtn.onclick = () => {
      const displayName = displayNameField.input.value.trim();
      if (!displayName) {
        alert("Unique username is required.");
        return;
      }
      finish({ displayName, avatarUrl: avatarValue });
    };

    renderAvatarState();
    displayNameField.input.focus();
  });
}

// Fallback avatar data url.
function fallbackAvatarDataUrl(label: string) {
  const txt =
    String(label || "?")
      .trim()
      .slice(0, 1)
      .toUpperCase() || "?";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#124e3a"/><stop offset="100%" stop-color="#1d8d67"/></linearGradient></defs>` +
    `<rect width="96" height="96" rx="18" fill="url(#g)"/>` +
    `<text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial" font-size="46" font-weight="700" fill="#e6fff5">${txt}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Render accounts.
async function renderAccounts() {
  const launcherState = state.launcherAccount;
  const launcherSubscription = state.launcherSubscription;
  const launcherActive = launcherState?.activeAccount ?? null;
  const accounts = state.accounts?.accounts ?? [];
  const activeId = state.accounts?.activeId ?? null;
  const avatarById = new Map<string, string | null>();

  accountItems.innerHTML = "";

  await Promise.all(
    accounts.map(async (a: any) => {
      try {
        const cached = await backend.accountsGetAvatar(a.id, false);
        avatarById.set(a.id, cached || fallbackAvatarDataUrl(getAccountLabel(a)));
      } catch {
        avatarById.set(a.id, fallbackAvatarDataUrl(getAccountLabel(a)));
      }
    })
  );

  const activeMc = accounts.find((a: any) => a.id === activeId) ?? accounts[0] ?? null;
  if (activeMc) {
    accountName.textContent = getAccountLabel(activeMc);
    accountSub.textContent = activeMc?.type ?? activeMc?.provider ?? "Microsoft";
    accountAvatarImg.classList.remove("loaded");
    accountAvatarImg.onload = () => accountAvatarImg.classList.add("loaded");
    accountAvatarImg.src = avatarById.get(activeMc.id) || fallbackAvatarDataUrl(getAccountLabel(activeMc));
  } else {
    accountName.textContent = "No Minecraft account";
    accountSub.textContent = "Add an account";
    accountAvatarImg.classList.add("loaded");
    accountAvatarImg.src = fallbackAvatarDataUrl("?");
  }
  accountAvatarImg.onerror = () => {
    accountAvatarImg.classList.add("loaded");
    accountAvatarImg.src = fallbackAvatarDataUrl(accountName.textContent || "?");
  };

  const mcHeader = document.createElement("div");
  mcHeader.className = "dropdownHeader";
  mcHeader.textContent = "Minecraft accounts";
  accountItems.appendChild(mcHeader);

  for (const a of accounts) {
    const item = document.createElement("div");
    item.className = "dropdownItem";
    if (a.id === activeId) item.classList.add("active");
    item.tabIndex = 0;

    const left = document.createElement("div");
    left.className = "left";

    const av = document.createElement("span");
    av.className = "avatar";
    const img = document.createElement("img");
    img.classList.remove("loaded");
    img.onload = () => img.classList.add("loaded");
    img.src = avatarById.get(a.id) || fallbackAvatarDataUrl(getAccountLabel(a));
    img.onerror = () => {
      img.classList.add("loaded");
      img.src = fallbackAvatarDataUrl(getAccountLabel(a));
    };
    av.appendChild(img);

    const meta = document.createElement("div");
    meta.style.display = "flex";
    meta.style.flexDirection = "column";
    meta.style.lineHeight = "1.1";

    const title = document.createElement("strong");
    title.style.fontSize = "13px";
    title.textContent = getAccountLabel(a) + (a.id === activeId ? " (active)" : "");

    const sub = document.createElement("small");
    sub.className = "muted";
    sub.style.fontSize = "11px";
    sub.textContent = a?.type ?? a?.provider ?? "Microsoft";

    meta.appendChild(title);
    meta.appendChild(sub);

    left.appendChild(av);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "right";

    const btnRemoveAccount = document.createElement("button");
    btnRemoveAccount.className = "accountTrashBtn";
    btnRemoveAccount.title = "Remove account";
    btnRemoveAccount.setAttribute("aria-label", "Remove account");
    btnRemoveAccount.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9z"/>' +
      '<path fill="currentColor" d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7z"/>' +
      "</svg>";
    btnRemoveAccount.onclick = (e) => {
      e.stopPropagation();
      void guarded(async () => {
        const ok = await showLauncherConfirm(`Remove account "${getAccountLabel(a)}"?`);
        if (!ok) return;
        await backend.accountsRemove(a.id);
        state.accounts = await backend.accountsList();
        await renderAccounts();
        void renderCapesView(false);
      });
    };
    right.appendChild(btnRemoveAccount);

    item.appendChild(left);
    item.appendChild(right);

    const selectAccount = async () => {
      await backend.accountsSetActive(a.id);
      state.accounts = await backend.accountsList();
      await renderAccounts();
      void renderCapesView(false);
      accountDropdown.classList.remove("open");
    };

    item.onclick = async () => {
      await selectAccount();
    };
    item.onkeydown = async (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      await selectAccount();
    };

    accountItems.appendChild(item);
  }

  accountAdd.textContent = "+ Add Minecraft account";

  const popSep = document.createElement("div");
  popSep.className = "popSep";
  accountItems.appendChild(popSep);

  const launcherHeader = document.createElement("div");
  launcherHeader.className = "dropdownHeader";
  launcherHeader.textContent = "Fishbattery account";
  accountItems.appendChild(launcherHeader);

  const launcherActionRow = document.createElement("div");
  launcherActionRow.style.padding = "10px 12px";
  launcherActionRow.style.display = "flex";
  launcherActionRow.style.gap = "8px";
  launcherActionRow.style.flexWrap = "wrap";
  const launcherPlanTier = getLauncherTier();
  const launcherPlanLabel =
    launcherPlanTier === "founder" ? "Founder" : launcherPlanTier === "premium" ? "Premium" : "Free";

  const btnLauncherSignIn = document.createElement("button");
  btnLauncherSignIn.className = "btn";
  btnLauncherSignIn.textContent = "Sign in";
  const openLauncherAuthFlow = (initialMode: "login" | "register") => {
    void runLauncherAccountAction(async () => {
      const values = await openLauncherAuthDialog(initialMode);
      if (!values) return;
      if (values.action === "google") {
        alert("A browser window will open for Google sign-in. Complete it, then return to the launcher.");
        state.launcherAccount = await backend.launcherAccountGoogleLogin();
      } else if (values.mode === "register") {
        state.launcherAccount = await backend.launcherAccountRegister(values.email, values.password, values.displayName);
      } else {
        const loginResult = await backend.launcherAccountLogin(values.email, values.password);
        if (loginResult?.requiresTwoFactor) {
          const code = await openLauncherTwoFactorDialog();
          if (!code) return;
          state.launcherAccount = await backend.launcherAccountLogin2fa(loginResult.challengeToken, code);
        } else {
          state.launcherAccount = loginResult.state;
        }
      }
      await refreshLauncherSubscription();
      await renderAccounts();
      accountDropdown.classList.remove("open");
    });
  };
  btnLauncherSignIn.onclick = () => openLauncherAuthFlow("login");

  const btnLauncherRegister = document.createElement("button");
  btnLauncherRegister.className = "btn";
  btnLauncherRegister.textContent = "Create account";
  btnLauncherRegister.onclick = () => openLauncherAuthFlow("register");

  const btnLauncherLogout = document.createElement("button");
  btnLauncherLogout.className = "btn";
  btnLauncherLogout.textContent = "Sign out";
  btnLauncherLogout.onclick = () => {
    void runLauncherAccountAction(async () => {
      state.launcherAccount = await backend.launcherAccountLogout();
      state.launcherSubscription = null;
      await renderAccounts();
      accountDropdown.classList.remove("open");
    });
  };

  const btnLauncherSettings = document.createElement("button");
  btnLauncherSettings.className = "btn";
  btnLauncherSettings.textContent = "Account settings";
  btnLauncherSettings.onclick = () => {
    void runLauncherAccountAction(async () => {
      const values = await openLauncherProfileDialog({
        displayName: launcherState?.activeAccount?.displayName,
        avatarUrl: launcherState?.activeAccount?.avatarUrl ?? null
      });
      if (!values) return;
      state.launcherAccount = await backend.launcherAccountUpdateProfile({
        displayName: values.displayName,
        avatarUrl: values.avatarUrl
      });
      await refreshLauncherSubscription();
      await renderAccounts();
      accountDropdown.classList.remove("open");
    });
  };

  const btnUpgradePremium = document.createElement("button");
  btnUpgradePremium.className = "btn";
  btnUpgradePremium.textContent = "Upgrade to Premium";
  btnUpgradePremium.onclick = () => {
    void runLauncherAccountAction(async () => {
      await openUpgradeFlow();
    });
  };

  const btnOpenFishbatteryWeb = document.createElement("button");
  btnOpenFishbatteryWeb.className = "btn";
  btnOpenFishbatteryWeb.textContent = "Open Fishbattery web";
  btnOpenFishbatteryWeb.onclick = () => {
    void runLauncherAccountAction(async () => {
      const target = "https://fishbattery.app";
      const ok = await backend.externalOpen(target);
      if (!ok) {
        throw new Error("Could not open Fishbattery website.");
      }
      appendLog(`[account] Opened website: ${target}`);
      accountDropdown.classList.remove("open");
    });
  };

  if (launcherState?.configured === false) {
    const warn = document.createElement("div");
    warn.style.padding = "2px 12px 10px";
    warn.className = "muted";
    warn.style.fontSize = "12px";
    warn.textContent = "Launcher sign-in unavailable.";
    accountItems.appendChild(warn);
  } else if (!launcherActive) {
    launcherActionRow.appendChild(btnLauncherSignIn);
    launcherActionRow.appendChild(btnLauncherRegister);
    accountItems.appendChild(launcherActionRow);
  } else {
    launcherActionRow.appendChild(btnLauncherSettings);
    launcherActionRow.appendChild(btnOpenFishbatteryWeb);
    launcherActionRow.appendChild(btnLauncherLogout);
    accountItems.appendChild(launcherActionRow);

    const launcherAccounts = Array.isArray(launcherState?.accounts) ? launcherState.accounts : [launcherActive];
    for (const a of launcherAccounts) {
      const item = document.createElement("div");
      item.className = "dropdownItem";
      if (a.id === launcherState?.activeAccountId) item.classList.add("active");
      item.tabIndex = 0;

      const left = document.createElement("div");
      left.className = "left";

      const av = document.createElement("span");
      av.className = "avatar";
      const img = document.createElement("img");
      img.classList.add("loaded");
      img.src = a.avatarUrl || fallbackAvatarDataUrl(getLauncherDisplayName(a));
      img.onerror = () => {
        img.classList.add("loaded");
        img.src = fallbackAvatarDataUrl(getLauncherDisplayName(a));
      };
      av.appendChild(img);

      const meta = document.createElement("div");
      meta.style.display = "flex";
      meta.style.flexDirection = "column";
      meta.style.lineHeight = "1.1";

      const title = document.createElement("strong");
      title.style.fontSize = "13px";
      title.textContent = getLauncherDisplayName(a) + (a.id === launcherState?.activeAccountId ? " (active)" : "");

      const sub = document.createElement("small");
      sub.className = "muted";
      sub.style.fontSize = "11px";
      const tier = String(a.subscriptionTier || launcherPlanTier || "free").toLowerCase();
      const tierLabel = tier === "founder" ? "Founder" : tier === "premium" ? "Premium" : "Free";
      sub.textContent = `Fishbattery - ${tierLabel}`;

      meta.appendChild(title);
      meta.appendChild(sub);
      left.appendChild(av);
      left.appendChild(meta);
      item.appendChild(left);

      item.onclick = () => {
        void runLauncherAccountAction(async () => {
          state.launcherAccount = await backend.launcherAccountSwitch(a.id);
          await refreshLauncherSubscription();
          await renderAccounts();
          accountDropdown.classList.remove("open");
        });
      };

      accountItems.appendChild(item);
    }
    if (launcherPlanTier !== "premium" && launcherPlanTier !== "founder") {
      launcherActionRow.appendChild(btnUpgradePremium);
    }
    accountItems.appendChild(launcherActionRow);

    const planHint = document.createElement("div");
    planHint.style.padding = "0 12px 10px";
    planHint.className = "muted";
    planHint.style.fontSize = "12px";
    const priorityLabel = launcherSubscription?.features?.cloudSyncPriority ? "Priority" : "Standard";
    planHint.textContent = `Plan: ${launcherPlanLabel} - Cloud sync: ${priorityLabel}`;
    accountItems.appendChild(planHint);
  }

  if (accounts.length && !accountAvatarWarmupInFlight) {
    accountAvatarWarmupInFlight = true;
    void (async () => {
      let updated = false;
      for (const a of accounts) {
        try {
          const cached = await backend.accountsGetAvatar(a.id, false);
          if (cached) continue;
          const fresh = await backend.accountsGetAvatar(a.id, true);
          if (fresh) updated = true;
        } catch {
          // keep fallback
        }
      }
      accountAvatarWarmupInFlight = false;
      if (updated) await renderAccounts();
    })();
  }
  void refreshSidebarCharacterPreview(false);
  void renderSponsoredBannerState();
  ensureCloudSyncTimer();
}
// ---------------- Instances (card layout) ----------------
function filteredInstances() {
  const q = (searchInstances.value || "").trim().toLowerCase();
  const items = state.instances?.instances ?? [];
  if (!q) return items;
  return items.filter((i: any) => {
    const name = (i.name || "").toLowerCase();
    const v = (i.mcVersion || "").toLowerCase();
    return name.includes(q) || v.includes(q);
  });
}

type RunningSnapshot = {
  count: number;
  byId: Map<string, boolean>;
};

function buildRunningSignature(instances: any[], snapshot: RunningSnapshot): string {
  if (!instances.length) return "";
  return instances
    .map((inst) => {
      const id = String(inst?.id || "").trim();
      if (!id) return "";
      return `${id}:${snapshot.byId.get(id) ? "1" : "0"}`;
    })
    .filter(Boolean)
    .join("|");
}

// Update topbar running pill.
function updateTopbarRunningPill(runningCount: number) {
  if (!windowTopbarPill) return;
  if (runningCount <= 0) {
    windowTopbarPill.textContent = "No instances running";
    return;
  }
  windowTopbarPill.textContent = runningCount === 1 ? "1 instance running" : `${runningCount} instances running`;
}

// Get running snapshot.
async function getRunningSnapshot(instances: any[]): Promise<RunningSnapshot> {
  const byId = new Map<string, boolean>();
  if (!instances.length) return { count: 0, byId };

  const checks = await Promise.all(
    instances.map(async (inst) => {
      const id = String(inst?.id || "").trim();
      if (!id) return { id, running: false };
      try {
        return { id, running: !!(await backend.launchIsRunning(id)) };
      } catch {
        return { id, running: false };
      }
    })
  );

  let count = 0;
  for (const check of checks) {
    if (!check.id) continue;
    byId.set(check.id, check.running);
    if (check.running) count += 1;
  }
  return { count, byId };
}

// Open instance editor/workspace with a selected tab.
async function openInstanceWorkspace(
  i: any,
  initialTab: ModalTabId = "general"
) {
  modalMode = "edit";
  editInstanceId = i.id;
  modalTitle.textContent = "Edit instance";
  createIncludeReleases = true;
  createIncludeSnapshots = true;
  renderCreateFilterButtons();
  fillCreateVersionOptions();
  syncModalFieldsFromInstance(i);
  setCreateSource("custom");
  createSourceCustom.toggleAttribute("disabled", true);
  createSourceImport.toggleAttribute("disabled", true);
  createSourceModrinth.toggleAttribute("disabled", true);
  createSourceCurseForge.toggleAttribute("disabled", true);
  createSourceTechnic.toggleAttribute("disabled", true);
  createSourceATLauncher.toggleAttribute("disabled", true);
  createSourceFTB.toggleAttribute("disabled", true);
  selectedCreateIconPath = null;
  clearExistingIconOnSave = false;
  instanceIconHint.textContent = "Keep existing icon unless you pick a new one.";
  setIconPreviewSource(null);
  resetSelectedIconTransform();
  await refreshPresetDropdownAvailability(
    i.instancePreset ?? "none",
    (i.loader ?? "fabric") as LoaderKind,
    String(i.mcVersion || "")
  );
  await fillInstanceAccountDropdown(i.accountId ?? null);
  await renderServerEntries(i.id);

  const resolvedInitialTab: ModalTabId = initialTab;

  openModal(resolvedInitialTab);
  if (resolvedInitialTab === "installed" || resolvedInitialTab === "discover") {
    await renderInstanceMods(i.id);
    await renderLocalContent(i.id);
  }
  if (resolvedInitialTab === "discover") {
    await runInstanceModrinthContentSearch(i.id);
  }
}

// Render instances.
async function renderInstances() {
  const generation = ++renderInstancesGeneration;
  const items = filteredInstances();
  const active = state.instances?.activeInstanceId ?? null;
  const allInstances = state.instances?.instances ?? [];
  const runningSnapshot = await getRunningSnapshot(allInstances);
  if (generation !== renderInstancesGeneration) return;
  lastRunningSignature = buildRunningSignature(allInstances, runningSnapshot);
  updateTopbarRunningPill(runningSnapshot.count);

  if (!items.length) {
    if (generation !== renderInstancesGeneration) return;
    instancesGrid.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "emptyInstances";
    empty.innerHTML = `
      <strong>No instances yet</strong>
      <p>Create your first instance or import a modpack to get started.</p>
      <div class="emptyInstancesActions">
        <button id="emptyCreateInstance" class="btn btnPrimary" type="button">Create Instance</button>
        <button id="emptyImportInstance" class="btn" type="button">Import Modpack</button>
      </div>
    `;
    instancesGrid.appendChild(empty);
    const emptyCreateInstance = empty.querySelector("#emptyCreateInstance") as HTMLButtonElement | null;
    const emptyImportInstance = empty.querySelector("#emptyImportInstance") as HTMLButtonElement | null;
    if (emptyCreateInstance) emptyCreateInstance.onclick = () => btnCreate.click();
    if (emptyImportInstance) emptyImportInstance.onclick = () => btnImport.click();
    return;
  }

  const icons = new Map<string, string | null>();
  const preferredServers = new Map<string, any | null>();
  await Promise.all(
    items.map(async (i: any) => {
      try {
        icons.set(i.id, await backend.instancesGetIcon(i.id));
      } catch {
        icons.set(i.id, null);
      }
      try {
        preferredServers.set(String(i.id), await findPreferredServerForInstance(i));
      } catch {
        preferredServers.set(String(i.id), null);
      }
    })
  );
  if (generation !== renderInstancesGeneration) return;

  const createInstanceCard = (i: any) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.cursor = "pointer";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open ${i.name ?? "instance"} workspace`);
    card.onclick = () => {
      void openInstanceWorkspace(i, "installed");
    };
    card.onkeydown = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      void openInstanceWorkspace(i, "installed");
    };
    if (i.id === active) {
      card.style.boxShadow = "0 0 0 2px rgba(61,220,132,.18)";
    }

    const inner = document.createElement("div");
    inner.className = "cardInner";

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const iconData = icons.get(i.id) || null;
    if (iconData) {
      const icon = document.createElement("img");
      icon.src = iconData;
      icon.alt = `${i.name ?? "Instance"} icon`;
      icon.style.width = "100%";
      icon.style.height = "100%";
      icon.style.objectFit = "cover";
      icon.style.borderRadius = "14px";
      thumb.appendChild(icon);
    }

    const meta = document.createElement("div");
    meta.className = "cardMeta";

    const title = document.createElement("strong");
    title.textContent = i.name ?? "Instance";

    const badges = document.createElement("div");
    badges.className = "badges";

    const displayLoader = getInstanceDisplayLoader(i);

    const b1 = document.createElement("div");
    b1.className = "badge";
    b1.textContent = `${displayLoader}`;

    const b2 = document.createElement("div");
    b2.className = "badge";
    b2.textContent = `${i.mcVersion ?? ""}`;

    badges.appendChild(b1);
    badges.appendChild(b2);

    const subtext = document.createElement("small");
    subtext.className = "instanceSubtext";
    subtext.textContent = `${displayLoader} | Minecraft ${i.mcVersion ?? "unknown"}`;

    meta.appendChild(title);
    meta.appendChild(subtext);
    meta.appendChild(badges);

    const actions = document.createElement("div");
    actions.className = "cardActions";

    const btnEdit = document.createElement("button");
    btnEdit.className = "iconBtn instanceEditBtn";
    btnEdit.type = "button";
    btnEdit.title = "Edit instance";
    btnEdit.setAttribute("aria-label", `Edit ${i.name ?? "instance"}`);
    btnEdit.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19.14 12.94a7.9 7.9 0 0 0 .06-.94c0-.32-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.4 7.4 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.85a.5.5 0 0 0 .12.63l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.63l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.51.4 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63zM12 15.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4z" fill="currentColor"/></svg>';
    btnEdit.onclick = async (ev) => {
      ev.stopPropagation();
      await openInstanceWorkspace(i, "general");
    };

    const btnDeleteIcon = document.createElement("button");
    btnDeleteIcon.className = "iconBtn instanceEditBtn instanceDeleteBtn danger";
    btnDeleteIcon.type = "button";
    btnDeleteIcon.title = "Delete instance";
    btnDeleteIcon.setAttribute("aria-label", `Delete ${i.name ?? "instance"}`);
    btnDeleteIcon.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3.75h6a1 1 0 0 1 .9.56l.47.94H20a.75.75 0 0 1 0 1.5h-1.06l-.78 10.13A2.25 2.25 0 0 1 15.92 19H8.08a2.25 2.25 0 0 1-2.24-2.12L5.06 6.75H4a.75.75 0 0 1 0-1.5h3.16l.47-.94a1 1 0 0 1 .9-.56Zm-.12 2.5H15.13l-.25-.5h-5.76l-.25.5Zm-2.3.5.77 10.02a.75.75 0 0 0 .74.73h7.84a.75.75 0 0 0 .74-.73l.77-10.02H6.57ZM10 9a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 9Zm4 .75a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0v-4.5Z" fill="currentColor"/></svg>';
    btnDeleteIcon.onclick = async (ev) => {
      ev.stopPropagation();
      const ok = await showLauncherConfirm(`Delete "${i.name ?? "Instance"}"? This will remove the entire instance folder.`);
      if (!ok) return;
      await backend.instancesRemove(i.id);
      state.instances = await backend.instancesList();
      await renderInstances();
    };

    const btnPlay = document.createElement("button");
    btnPlay.className = "btn btnPrimary";
    const isRunning = !!runningSnapshot.byId.get(String(i.id || ""));
    btnPlay.textContent = isRunning ? "Stop" : "Play";
    btnPlay.onclick = async (ev) => {
      ev.stopPropagation();
      if (isRunning) {
        await backend.launchStop(i.id);
        return;
      }
      if (state.instances?.activeInstanceId !== i.id) {
        await backend.instancesSetActive(i.id);
        state.instances = await backend.instancesList();
        await renderInstances();
      }
      await launchForInstance(i);
    };

    const preferredServer = preferredServers.get(String(i.id || "")) ?? null;
    const btnJoin = document.createElement("button");
    btnJoin.className = "btn";
    btnJoin.textContent = "Join Server";
    btnJoin.disabled = !preferredServer;
    btnJoin.title = preferredServer
      ? `Join ${String(preferredServer.name || preferredServer.address || "preferred server")}`
      : "No preferred server set for this instance";
    btnJoin.onclick = async (ev) => {
      ev.stopPropagation();
      if (!preferredServer) return;
      if (state.instances?.activeInstanceId !== i.id) {
        await backend.instancesSetActive(i.id);
        state.instances = await backend.instancesList();
        await renderInstances();
      }
      await launchForInstance(i, String(preferredServer.address || "").trim());
    };

    const btnExport = document.createElement("button");
    btnExport.className = "btn";
    btnExport.textContent = "Export";
    btnExport.onclick = async (ev) => {
      ev.stopPropagation();
      const res = await backend.instancesExport(i.id);
      if (!res.ok || res.canceled) return;
      appendLog(`[instance] Exported "${i.name}" -> ${res.path}`);
      alert(`Instance exported:\n${res.path}`);
    };

    actions.appendChild(btnPlay);
    actions.appendChild(btnJoin);
    actions.appendChild(btnExport);

    card.appendChild(btnEdit);
    card.appendChild(btnDeleteIcon);
    inner.appendChild(thumb);
    inner.appendChild(meta);
    inner.appendChild(actions);

    card.appendChild(inner);
    return card;
  };

  const vanillaInstances = items.filter((i: any) => getInstanceDisplayLoader(i) === "vanilla");
  const moddedInstances = items.filter((i: any) => getInstanceDisplayLoader(i) !== "vanilla");
  const nextContent = document.createDocumentFragment();

  const appendGroup = (label: string, groupItems: any[]) => {
    const group = document.createElement("section");
    group.className = "instanceGroup";

    const header = document.createElement("div");
    header.className = "instanceGroupHeader";
    const title = document.createElement("strong");
    title.textContent = label;
    const line = document.createElement("div");
    line.className = "instanceGroupLine";
    header.append(title, line);

    const grid = document.createElement("div");
    grid.className = "grid instanceGroupGrid";
    if (!groupItems.length) {
      const empty = document.createElement("div");
      empty.className = "instanceGroupEmpty";
      empty.textContent = label === "Default instances" ? "No default instances yet." : "No modded instances yet.";
      grid.appendChild(empty);
    } else {
      for (const instance of groupItems) {
        grid.appendChild(createInstanceCard(instance));
      }
    }

    group.append(header, grid);
    nextContent.appendChild(group);
  };

  appendGroup("Default instances", vanillaInstances);
  appendGroup("Modded instances", moddedInstances);
  if (generation !== renderInstancesGeneration) return;
  instancesGrid.innerHTML = "";
  instancesGrid.appendChild(nextContent);
}

// Fill instance account dropdown.
async function fillInstanceAccountDropdown(selectedId: string | null) {
  const accounts = state.accounts?.accounts ?? [];
  instanceAccount.innerHTML = "";

  const optAuto = document.createElement("option");
  optAuto.value = "";
  optAuto.textContent = "Use active account";
  instanceAccount.appendChild(optAuto);

  for (const a of accounts) {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = getAccountLabel(a);
    instanceAccount.appendChild(opt);
  }

  instanceAccount.value = selectedId ?? "";
}

// Fill create version options.
function fillCreateVersionOptions() {
  const includeReleases = createIncludeReleases;
  const includeSnapshots = createIncludeSnapshots;
  const current = newVersion.value;

  newVersion.innerHTML = "";
  const versions = (state.versions ?? []).filter((v: any) => {
    if (v?.type === "release") return includeReleases;
    return includeSnapshots;
  });

  for (const v of versions) {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = `${v.id}${v.type === "release" ? "" : ` (${v.type})`}`;
    newVersion.appendChild(opt);
  }

  if (current && versions.some((v: any) => v.id === current)) {
    newVersion.value = current;
  }
}

// Render create filter buttons.
function renderCreateFilterButtons() {
  createFilterReleases.classList.toggle("active", createIncludeReleases);
  createFilterSnapshots.classList.toggle("active", createIncludeSnapshots);
}

// Update create loader ui.
function updateCreateLoaderUi() {
  const loader = String(createLoaderType.value || "fabric");
  if (loader === "fabric" || loader === "quilt" || loader === "forge" || loader === "neoforge") {
    createLoaderVersion.disabled = false;
    createLoaderVersion.placeholder = "Auto (recommended)";
    createLoaderHint.textContent = `Auto-picked for ${loader} from official metadata.`;
    return;
  }

  createLoaderVersion.value = "";
  createLoaderVersion.disabled = true;
  if (loader === "vanilla") {
    createLoaderHint.textContent =
      "Shown as vanilla, but uses Fishbattery's Fabric compatibility layer so cape features still work. Fabric may report more internal mods than the Installed list.";
    return;
  }
  createLoaderHint.textContent = "Select a supported loader.";
}

function getLatestReleaseVersionId() {
  const latestListedRelease = (state.versions ?? []).find((v: any) => v?.type === "release" && String(v?.id || "").trim());
  return String(latestListedRelease?.id || "").trim();
}

function getUniqueInstanceName(baseName: string) {
  const normalizedBase = String(baseName || "New Instance").trim() || "New Instance";
  const existing = new Set(
    (state.instances?.instances ?? [])
      .map((inst: any) => String(inst?.name || "").trim().toLowerCase())
      .filter((name: string) => !!name)
  );
  if (!existing.has(normalizedBase.toLowerCase())) return normalizedBase;
  let suffix = 2;
  while (existing.has(`${normalizedBase} ${suffix}`.toLowerCase())) suffix += 1;
  return `${normalizedBase} ${suffix}`;
}

async function quickLaunchLatestVanillaClient() {
  await withGlobalActionProgress("Launching latest vanilla", "Resolving latest release...", async (update) => {
    let mcVersion = getLatestReleaseVersionId();
    if (!mcVersion) {
      const manifest = await backend.versionsList();
      state.versions = manifest?.versions ?? state.versions ?? [];
      mcVersion = String(manifest?.latest?.release || getLatestReleaseVersionId() || "").trim();
    }
    if (!mcVersion) {
      throw new Error("Could not determine the latest Minecraft release.");
    }

    const id = crypto.randomUUID();
    const name = getUniqueInstanceName(`Vanilla ${mcVersion}`);
    const memoryMb = Number(getSettings().defaultMemoryMb ?? 4096);

    update?.("Resolving Fabric compatibility runtime...");
    const fabricLoaderVersion = ((await backend.loaderPickVersion("fabric", mcVersion)) || "").trim();

    update?.("Creating instance...");
    await backend.instancesCreate({
      id,
      name,
      mcVersion,
      loader: "fabric",
      displayLoader: "vanilla",
      fabricLoaderVersion,
      memoryMb,
      accountId: null,
      instancePreset: "none",
      syncEnabled: true
    });

    update?.("Preparing runtime...");
    await backend.loaderInstall(id, mcVersion, "fabric", fabricLoaderVersion || undefined);
    await ensureFabricApiForFabricInstance(id, mcVersion, "fabric");
    await backend.instancesSetIconFallback(id, name, "green");

    update?.("Refreshing library...");
    state.instances = await backend.instancesList();
    await renderInstances();

    const created =
      (state.instances?.instances ?? []).find((inst: any) => String(inst?.id || "") === id) ??
      ({
        id,
        name,
        mcVersion,
        loader: "fabric",
        displayLoader: "vanilla",
        memoryMb,
        accountId: null
      } as any);

    appendLog(
      `[quick-launch] Created ${name} on Minecraft ${mcVersion}. Vanilla instances still run through Fishbattery's Fabric compatibility layer, so Fabric's in-game mod count can be higher than the Installed list.`
    );

    update?.("Launching Minecraft...");
    await launchForInstance(created);
  });
}

// Render modal instance sync toggle.
function renderModalInstanceSyncToggle() {
  instanceSyncEnabled.classList.toggle("active", modalInstanceSyncEnabled);
  instanceSyncEnabled.textContent = modalInstanceSyncEnabled ? "Enabled" : "Disabled";
}

function renderExternalProfileOptions(
  selectEl: HTMLSelectElement,
  helpEl: HTMLElement,
  sourceLabel: string,
  profiles: any[],
  root: string | null,
  found: boolean
) {
  selectEl.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  if (!found) {
    placeholder.textContent = root ? `No ${sourceLabel} folder found at ${root}` : `No ${sourceLabel} folder found`;
  } else if (!profiles.length) {
    placeholder.textContent = `No ${sourceLabel} profiles found`;
  } else {
    placeholder.textContent = `Select a ${sourceLabel} profile...`;
  }
  selectEl.appendChild(placeholder);

  for (const profile of profiles) {
    const opt = document.createElement("option");
    opt.value = String(profile.id || "");
    const loader = String(profile.loader || "vanilla");
    const mc = String(profile.mcVersion || "unknown");
    opt.textContent = `${profile.name || profile.id} (${mc} | ${loader})`;
    selectEl.appendChild(opt);
  }

  selectEl.disabled = !profiles.length;
  helpEl.textContent = found
    ? root
      ? `Looking in ${root}`
      : `Detected local ${sourceLabel} profiles.`
    : root
      ? `Folder not found: ${root}`
      : `Could not resolve the default ${sourceLabel} folder.`;
}

async function refreshExternalProfiles(source: "modrinth" | "curseforge") {
  const result = await backend.externalProfilesList(source);
  const profiles = Array.isArray(result?.profiles) ? result.profiles : [];
  if (source === "modrinth") {
    localModrinthProfilesCache = profiles;
    renderExternalProfileOptions(
      localModrinthProfilesSelect,
      localModrinthProfilesHelp,
      "Modrinth",
      profiles,
      result?.root ?? null,
      !!result?.found
    );
    btnImportLocalModrinthProfile.toggleAttribute("disabled", !profiles.length);
    return;
  }
  localCurseForgeProfilesCache = profiles;
  renderExternalProfileOptions(
    localCurseForgeProfilesSelect,
    localCurseForgeProfilesHelp,
    "CurseForge",
    profiles,
    result?.root ?? null,
    !!result?.found
  );
  btnImportLocalCurseForgeProfile.toggleAttribute("disabled", !profiles.length);
}

// Set create source.
function setCreateSource(next: "custom" | "import" | "modrinth" | "curseforge" | "technic" | "atlauncher" | "ftb") {
  createSource = next;
  const isCustom = next === "custom";
  const isImport = next === "import";
  const isMarket = next === "modrinth" || next === "curseforge" || next === "technic" || next === "atlauncher" || next === "ftb";
  const isTechnicArchiveOnly = next === "technic";

  createSourceCustom.classList.toggle("btnPrimary", next === "custom");
  createSourceImport.classList.toggle("btnPrimary", next === "import");
  createSourceModrinth.classList.toggle("btnPrimary", next === "modrinth");
  createSourceCurseForge.classList.toggle("btnPrimary", next === "curseforge");
  createSourceTechnic.classList.toggle("btnPrimary", next === "technic");
  createSourceATLauncher.classList.toggle("btnPrimary", next === "atlauncher");
  createSourceFTB.classList.toggle("btnPrimary", next === "ftb");

  createSourceCustom.classList.toggle("btn", true);
  createSourceImport.classList.toggle("btn", true);
  createSourceModrinth.classList.toggle("btn", true);
  createSourceCurseForge.classList.toggle("btn", true);
  createSourceTechnic.classList.toggle("btn", true);
  createSourceATLauncher.classList.toggle("btn", true);
  createSourceFTB.classList.toggle("btn", true);

  createCustomFields.style.display = isCustom ? "" : "none";
  createProviderImport.style.display = isImport ? "" : "none";
  createProviderMarketplace.style.display = isMarket ? "" : "none";
  const isArchiveProvider = next === "curseforge" || next === "technic";
  createModrinthPanel.style.display = next === "modrinth" ? "" : "none";
  createCurseForgePanel.style.display = next === "modrinth" ? "none" : "";
  providerSearchInput.parentElement!.style.display = isTechnicArchiveOnly ? "none" : "";
  providerResultsLabel.style.display = isTechnicArchiveOnly ? "none" : "";
  providerSearchResults.style.display = isTechnicArchiveOnly ? "none" : "";
  if (modalMode === "edit") modalCreate.textContent = "Save";
  else modalCreate.textContent = isCustom ? "Create" : isImport ? "Import" : "Install";

  if (isCustom) {
    createSourceHint.textContent = "Build a custom instance with manual version + loader selection.";
    return;
  }
  if (isImport) {
    createSourceHint.textContent = "Import an existing instance/pack archive.";
    void guarded(async () => {
      await Promise.all([refreshExternalProfiles("modrinth"), refreshExternalProfiles("curseforge")]);
    });
    return;
  }
  createProviderMarketplaceTitle.textContent =
    next === "modrinth"
      ? "Modrinth modpack browser"
      : next === "curseforge"
        ? "CurseForge pack browser"
        : next === "technic"
          ? "Technic pack browser"
          : next === "atlauncher"
            ? "ATLauncher pack browser"
            : "FTB pack browser";
  createProviderMarketplaceHelp.textContent =
    next === "modrinth"
      ? "Browse and install Modrinth modpacks into a new isolated instance."
      : isTechnicArchiveOnly
        ? "Technic packs can only be imported from a local archive in this build."
      : isArchiveProvider
        ? "Search and import provider pack archives into a new isolated instance."
        : "Search and install directly from provider catalog.";
  createSourceHint.textContent =
    next === "modrinth"
      ? "Search Modrinth and install directly to a new instance."
      : isTechnicArchiveOnly
        ? "Import a local Technic export/archive into a new instance."
      : isArchiveProvider
        ? "Select a provider archive (.zip/.mrpack) and import it into a new instance."
        : "Search and install directly from provider catalog.";
  if (isArchiveProvider) {
    providerArchiveHelp.textContent = `Import ${next.toUpperCase()} archive and create a new instance.`;
  }
  providerArchiveActions.style.display = isArchiveProvider ? "" : "none";
  if (isTechnicArchiveOnly) {
    selectedProviderPack = null;
    providerSearchResults.innerHTML =
      '<div class="muted" style="font-size:12px">Technic browse is not available. Use "Import pack archive" below.</div>';
    return;
  }
  if (next === "atlauncher" || next === "ftb" || isArchiveProvider) {
    void guarded(async () => {
      await runProviderSearch();
    });
  }
  if (next === "modrinth") {
    void guarded(async () => {
      await runModrinthSearch();
    });
  }
  if (next === "curseforge") {
    void guarded(async () => {
      await runProviderSearch();
    });
  }
}

// Fallback pack icon data url.
function fallbackPackIconDataUrl(label: string, theme: "blue" | "green" = "blue") {
  const text = String(label || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "?";
  const colors =
    theme === "green"
      ? { a: "#0e3f2d", b: "#1d7d58", c: "#86efac" }
      : { a: "#102a43", b: "#1f4f7a", c: "#bfdbfe" };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${colors.a}"/><stop offset="100%" stop-color="${colors.b}"/></linearGradient></defs>` +
    `<rect width="96" height="96" rx="18" fill="url(#g)"/>` +
    `<text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-family="Segoe UI, Arial" font-size="32" font-weight="700" fill="${colors.c}">${text}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Run modrinth search.
async function runModrinthSearch() {
  const q = String(modrinthSearchInput.value || "").trim();
  const isPopular = !q;
  modrinthResultsLabel.textContent = isPopular ? "Popular modpacks" : `Search results for "${q}"`;
  modrinthSearchResults.innerHTML = '<div class="muted" style="font-size:12px">Searching...</div>';
  const data = await backend.modrinthPacksSearch(q, 24);
  const hits = data?.hits ?? [];
  if (!hits.length) {
    modrinthSearchResults.innerHTML = '<div class="muted" style="font-size:12px">No packs found.</div>';
    return;
  }

  modrinthSearchResults.innerHTML = "";
  for (const h of hits) {
    const row = document.createElement("div");
    row.className = "modrinthResult";

    const img = document.createElement("img");
    const fallback = fallbackPackIconDataUrl(h.title, "blue");
    img.src = h.iconUrl || fallback;
    img.onerror = () => {
      if (img.src !== fallback) img.src = fallback;
    };
    row.appendChild(img);

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.flex = "1";

    const title = document.createElement("div");
    title.className = "setLabel";
    title.textContent = h.title;
    left.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "setHelp";
    desc.textContent = h.description || "No description.";
    left.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "setHelp";
    const mc = h.mcVersion || "unknown MC";
    const loader = h.loader || "unknown loader";
    meta.textContent = `MC ${mc} | ${loader}`;
    left.appendChild(meta);

    row.appendChild(left);

    const btn = document.createElement("button");
    btn.className = "btn";
    const selected = selectedModrinthPack?.projectId === h.projectId;
    btn.textContent = selected ? "Active" : "Choose";
    btn.onclick = () => {
      selectedModrinthPack = {
        projectId: h.projectId,
        title: h.title,
        latestVersionId: h.latestVersionId,
        iconUrl: h.iconUrl
      };
      void runModrinthSearch();
    };
    row.appendChild(btn);

    modrinthSearchResults.appendChild(row);
  }
}

// Run Modrinth search for instance mods tab.
async function runInstanceModrinthModsSearch(instanceId: string | null) {
  instanceModrinthSearchResults.innerHTML = "";
  if (!instanceId) {
    instanceModrinthResultsLabel.textContent = "Select an instance first";
    instanceModrinthSearchResults.innerHTML = '<div class="muted" style="font-size:12px">Select an instance first.</div>';
    return;
  }

  const inst = (state.instances?.instances ?? []).find((x: any) => x.id === instanceId) ?? null;
  if (!inst) {
    instanceModrinthResultsLabel.textContent = "Select an instance first";
    instanceModrinthSearchResults.innerHTML = '<div class="muted" style="font-size:12px">Select an instance first.</div>';
    return;
  }

  const q = String(instanceModrinthSearchInput.value || "").trim();
  const isPopular = !q;
  instanceModrinthResultsLabel.textContent = isPopular ? "Popular mods" : `Search results for "${q}"`;
  instanceModrinthSearchResults.innerHTML = '<div class="muted" style="font-size:12px">Searching...</div>';

  const data = await backend.modrinthModsSearch(
    instanceId,
    q,
    String(inst.mcVersion || ""),
    String(inst.loader || "fabric") as any,
    20
  );
  const hits = data?.hits ?? [];
  if (!hits.length) {
    instanceModrinthSearchResults.innerHTML = '<div class="muted" style="font-size:12px">No mods found.</div>';
    return;
  }

  instanceModrinthSearchResults.innerHTML = "";
  for (const h of hits) {
    const row = document.createElement("div");
    row.className = "modrinthResult";

    const img = document.createElement("img");
    const fallback = fallbackPackIconDataUrl(h.title, "blue");
    img.src = h.iconUrl || fallback;
    img.onerror = () => {
      if (img.src !== fallback) img.src = fallback;
    };
    row.appendChild(img);

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.flex = "1";

    const title = document.createElement("div");
    title.className = "setLabel";
    title.textContent = h.title || "Unknown mod";
    left.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "setHelp";
    desc.textContent = h.description || "No description.";
    left.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "setHelp";
    const downloads = Number(h.downloads || 0).toLocaleString();
    const follows = Number(h.follows || 0).toLocaleString();
    meta.textContent = `by ${h.author || "unknown"} | ${downloads} downloads | ${follows} follows`;
    left.appendChild(meta);

    row.appendChild(left);

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = h.installed ? "Installed" : "Install";
    if (h.installed) {
      btn.disabled = true;
    }
    btn.onclick = () =>
      guarded(async () => {
        btn.disabled = true;
        btn.textContent = "Installing...";
        try {
          const res = await backend.modrinthModsInstall(instanceId, h.projectId, h.latestVersionId || undefined);
          appendLog(`[modrinth-mod] Installed ${h.title} (${res.versionName || "latest"})`);
          await refreshEditedInstanceWorkspace("discover");
          await runInstanceModrinthModsSearch(instanceId);
        } catch (err: any) {
          btn.disabled = false;
          btn.textContent = "Install";
          alert(String(err?.message ?? err ?? "Could not install mod"));
        }
      });
    row.appendChild(btn);

    instanceModrinthSearchResults.appendChild(row);
  }
}

// Run provider search.
async function runProviderSearch() {
  const provider =
    createSource === "curseforge" || createSource === "technic" || createSource === "atlauncher" || createSource === "ftb"
      ? createSource
      : "curseforge";
  const q = String(providerSearchInput.value || "").trim();
  const isPopular = !q;
  providerResultsLabel.textContent = isPopular ? "Popular packs" : `Search results for "${q}"`;
  providerSearchResults.innerHTML = '<div class="muted" style="font-size:12px">Searching...</div>';

  let data: { hits?: Array<any> } = { hits: [] };
  try {
    data = await backend.providerPacksSearch(provider, q, 24);
  } catch (err: any) {
    providerSearchResults.innerHTML = "";
    const msg = document.createElement("div");
    msg.className = "muted";
    msg.style.fontSize = "12px";
    const rawError = String(err?.message ?? err ?? "Provider search failed.");
    const missingCfKey =
      provider === "curseforge" &&
      rawError.toLowerCase().includes("missing curseforge api key");
    msg.textContent = missingCfKey
      ? "CurseForge browse is not configured in this build. Set FISHBATTERY_CURSEFORGE_API_KEY or add secrets/curseforge-api-key.txt."
      : rawError;
    providerSearchResults.appendChild(msg);
    appendLog(`[provider-search] ${rawError}`);
    return;
  }

  const hits = data?.hits ?? [];
  if (!hits.length) {
    providerSearchResults.innerHTML = '<div class="muted" style="font-size:12px">No packs found.</div>';
    return;
  }

  providerSearchResults.innerHTML = "";
  for (const h of hits) {
    const row = document.createElement("div");
    row.className = "modrinthResult";

    const img = document.createElement("img");
    const fallback = fallbackPackIconDataUrl(h.name, "blue");
    img.src = h.iconUrl || fallback;
    img.onerror = () => {
      if (img.src !== fallback) img.src = fallback;
    };
    row.appendChild(img);

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.flex = "1";

    const title = document.createElement("div");
    title.className = "setLabel";
    title.textContent = h.name;
    left.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "setHelp";
    desc.textContent = h.description || "No description.";
    left.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "setHelp";
    meta.textContent = `MC ${h.mcVersion} | ${h.loader}`;
    left.appendChild(meta);

    if (Array.isArray(h.tags) && h.tags.length) {
      const tags = document.createElement("div");
      tags.className = "setHelp";
      tags.textContent = `Tags: ${h.tags.slice(0, 4).join(" | ")}`;
      left.appendChild(tags);
    }

    row.appendChild(left);

    const btn = document.createElement("button");
    btn.className = "btn";
    const selected = selectedProviderPack?.id === h.id;
    btn.textContent = selected ? "Active" : "Choose";
    btn.onclick = () => {
      selectedProviderPack = { id: h.id, name: h.name, iconUrl: h.iconUrl || null };
      void runProviderSearch();
    };
    row.appendChild(btn);

    providerSearchResults.appendChild(row);
  }
}

// ---------------- Data refresh ----------------
async function refreshAll() {
  setStatus("Loading...");
  setStartupProgress("Checking versions, accounts, and services...");

  // 1) Pull immutable/version metadata first (used by create modal and compatibility UI).
  try {
    const manifest = await backend.versionsList();
    state.versions = manifest?.versions ?? [];
  } catch (err: any) {
    state.versions = [];
    appendLog(`[startup] versionsList failed: ${String(err?.message ?? err)}`);
  }

  // 2) Hydrate account/session-facing state before rendering top-level panels.
  const s = getSettings();
  try {
    await backend.updaterSetChannel(s.updateChannel);
  } catch (err: any) {
    appendLog(`[startup] updaterSetChannel failed: ${String(err?.message ?? err)}`);
  }
  try {
    state.accounts = await backend.accountsList();
  } catch (err: any) {
    state.accounts = { activeId: null, accounts: [] };
    appendLog(`[startup] accountsList failed: ${String(err?.message ?? err)}`);
  }
  try {
    state.launcherAccount = await backend.launcherAccountGetState();
  } catch (err: any) {
    state.launcherAccount = {
      configured: false,
      signedIn: false,
      activeAccountId: null,
      activeAccount: null,
      accounts: [],
      updatedAt: null,
      error: String(err?.message ?? err ?? "Failed to load launcher account state")
    };
  }
  await refreshLauncherSubscription();
  try {
    // Keep a local snapshot of sync status so settings panel can render without waiting on manual sync.
    const remoteSyncState = await backend.cloudSyncGetState();
    cloudSyncState = {
      lastSyncedAt: remoteSyncState?.lastSyncedAt ?? null,
      lastStatus: remoteSyncState?.lastStatus ?? "idle",
      lastError: remoteSyncState?.lastError ?? null,
      lastRemoteRevision: remoteSyncState?.lastRemoteRevision ?? null
    };
  } catch {
    cloudSyncState = {
      lastSyncedAt: null,
      lastStatus: "error",
      lastError: "Could not load cloud sync state.",
      lastRemoteRevision: null
    };
  }
  await refreshPlayitState(true);
  try {
    state.instances = await backend.instancesList();
  } catch (err: any) {
    state.instances = { activeInstanceId: null, instances: [] };
    appendLog(`[startup] instancesList failed: ${String(err?.message ?? err)}`);
  }
  try {
    updaterState = await backend.updaterGetState();
  } catch (err: any) {
    appendLog(`[startup] updaterGetState failed: ${String(err?.message ?? err)}`);
  }
  try {
    preflightState = await backend.preflightGetLast();
  } catch (err: any) {
    preflightState = null;
    appendLog(`[startup] preflightGetLast failed: ${String(err?.message ?? err)}`);
  }

  // 3) Render all visible top-level sections from freshly loaded state.
  setStartupProgress("Rendering your library...");
  await renderAccounts();
  try {
    await refreshSidebarCharacterPreview(false);
  } catch (err: any) {
    appendLog(`[startup] sidebar preview failed: ${String(err?.message ?? err)}`);
  }
  await renderInstances();
  try {
    await renderCapesView(false);
  } catch (err: any) {
    appendLog(`[startup] capes preview failed: ${String(err?.message ?? err)}`);
  }
  await loadSponsoredBannersFromFeed();
  await renderSponsoredBannerState();
  renderConsentBannerState();
  ensureSponsoredRotation();
  ensureCloudSyncTimer();
  setStatus("");

  if (!preflightState) {
    try {
      // Run preflight once when no cached result exists.
      preflightState = await backend.preflightRun();
      appendLog(`[preflight] ${preflightSummaryText(preflightState)}`);
    } catch (err: any) {
      appendLog(`[preflight] Failed: ${String(err?.message ?? err)}`);
    }
  }

  if (!hasAutoCheckedUpdates) {
    hasAutoCheckedUpdates = true;
    try {
      // Non-blocking startup update check.
      await backend.updaterCheck();
    } catch {
      // Keep startup silent if update check fails.
    }
  }

  if (getSettings().cloudSyncEnabled && state.launcherAccount?.activeAccountId) {
    void guarded(async () => {
      try {
        // Best-effort initial cloud sync keeps local launcher state aligned after startup.
        await runCloudSync(false);
        renderSettingsPanels();
      } catch (err: any) {
        appendLog(`[cloud-sync] ${String(err?.message ?? err)}`);
      }
    });
  }

  const syncTitleBar = () => {
    const computed = getComputedStyle(document.documentElement);
    const bgRaw = computed.getPropertyValue("--bg");
    const bgHex = cssColorToHex(bgRaw) || "#071525";
    const symbols = idealSymbolColor(bgHex);
    void backend.windowSetTitleBarTheme(bgHex, symbols);
  };

  syncTitleBar();
  // Re-sync after style recalculation so native caption area always matches active theme.
  requestAnimationFrame(syncTitleBar);
}

async function bootLauncher() {
  let timedOut = false;
  const refreshPromise = refreshAll().catch((err: any) => {
    appendLog(`[startup] refreshAll failed: ${String(err?.message ?? err)}`);
  });
  try {
    await Promise.race([
      refreshPromise,
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          timedOut = true;
          resolve();
        }, STARTUP_REVEAL_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timedOut) {
      appendLog(`[startup] Revealing shell after ${STARTUP_REVEAL_TIMEOUT_MS}ms timeout`);
    }
    await revealStartupShell();
  }
  await refreshPromise;
  void promptLauncherSignInOnStartup();
}

sidebarSponsoredCta.onclick = () => {
  const target = String(sponsoredCurrentLink || "").trim();
  if (!target) return;
  void guarded(async () => {
    const ok = await backend.externalOpen(target);
    if (!ok) {
      setStatus("Could not open sponsor link right now.");
      return;
    }
    appendLog(`[sponsored] Opened: ${target}`);
    if (hasAdMeasurementConsent() && sponsoredCurrentEntry?.id) {
      void postLauncherAdEvent("click", sponsoredCurrentEntry.id);
    }
  });
};

sidebarSponsoredUpgrade.onclick = () => {
  const upgradeUrl = "https://fishbattery.app/upgrade";
  void guarded(async () => {
    const ok = await backend.externalOpen(upgradeUrl);
    if (!ok) {
      setStatus("Could not open upgrade page right now.");
      return;
    }
    appendLog(`[sponsored] Opened upgrade page: ${upgradeUrl}`);
  });
};

consentAccept.onclick = () => {
  setSettings({ adsConsent: "granted" });
  renderConsentBannerState();
  void guarded(async () => {
    await loadSponsoredBannersFromFeed();
    await renderSponsoredBannerState();
  });
};

consentReject.onclick = () => {
  setSettings({ adsConsent: "denied" });
  renderConsentBannerState();
};

consentSettings.onclick = () => {
  void guarded(async () => {
    const ok = await backend.externalOpen(AD_PRIVACY_URL);
    if (!ok) {
      setStatus("Could not open privacy policy right now.");
      return;
    }
    appendLog(`[sponsored] Opened privacy policy: ${AD_PRIVACY_URL}`);
  });
};

// ---------------- Event wiring ----------------
// Primary nav and account interactions.
navLibrary.onclick = () => setView("library");
navCapes.onclick = () => setView("capes");
navPlayit.onclick = () => setView("playit");
navSettings.onclick = () => setView("settings");

accountBtn.onclick = () => accountDropdown.classList.toggle("open");
accountAdd.onclick = () =>
  guarded(async () => {
    try {
      await backend.accountsAdd();
      state.accounts = await backend.accountsList();
      await renderAccounts();
    } catch (err: any) {
      const message = formatErrorMessage(err, "Could not add account.");
      setStatus(message);
      alert(message);
    }
  });

searchInstances.oninput = () => renderInstances();
// Create modal filters never allow both release/snapshot toggles to be off.
createFilterReleases.onclick = () => {
  createIncludeReleases = !createIncludeReleases;
  if (!createIncludeReleases && !createIncludeSnapshots) createIncludeSnapshots = true;
  renderCreateFilterButtons();
  fillCreateVersionOptions();
  void refreshPresetDropdownAvailability(
    instancePreset.value || "none",
    (createLoaderType.value || "fabric") as LoaderKind,
    newVersion.value || ""
  );
};
createFilterSnapshots.onclick = () => {
  createIncludeSnapshots = !createIncludeSnapshots;
  if (!createIncludeReleases && !createIncludeSnapshots) createIncludeReleases = true;
  renderCreateFilterButtons();
  fillCreateVersionOptions();
  void refreshPresetDropdownAvailability(
    instancePreset.value || "none",
    (createLoaderType.value || "fabric") as LoaderKind,
    newVersion.value || ""
  );
};
createLoaderType.onchange = () => {
  // Loader selection drives both loader-version input affordance and preset availability.
  updateCreateLoaderUi();
  void refreshPresetDropdownAvailability(
    instancePreset.value || "none",
    (createLoaderType.value || "fabric") as LoaderKind,
    newVersion.value || ""
  );
};
newVersion.onchange = () => {
  void refreshPresetDropdownAvailability(
    instancePreset.value || "none",
    (createLoaderType.value || "fabric") as LoaderKind,
    newVersion.value || ""
  );
};
instanceSyncEnabled.onclick = () => {
  modalInstanceSyncEnabled = !modalInstanceSyncEnabled;
  renderModalInstanceSyncToggle();
};
createSourceCustom.onclick = () => setCreateSource("custom");
createSourceImport.onclick = () => setCreateSource("import");
createSourceModrinth.onclick = () => setCreateSource("modrinth");
createSourceCurseForge.onclick = () => setCreateSource("curseforge");
createSourceTechnic.onclick = () => setCreateSource("technic");
createSourceATLauncher.onclick = () => setCreateSource("atlauncher");
createSourceFTB.onclick = () => setCreateSource("ftb");
btnModrinthSearch.onclick = () =>
  guarded(async () => {
    await runModrinthSearch();
  });
modrinthSearchInput.onkeydown = (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  void guarded(async () => runModrinthSearch());
};
instanceModrinthSearchBtn.onclick = () =>
  guarded(async () => {
    await runInstanceModrinthModsSearch(editInstanceId);
  });
instanceModrinthSearchInput.onkeydown = (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  void guarded(async () => runInstanceModrinthModsSearch(editInstanceId));
};
instanceContentSearchBtn.onclick = () =>
  guarded(async () => {
    await runInstanceModrinthContentSearch(editInstanceId);
  });
instanceContentSearchInput.onkeydown = (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  void guarded(async () => runInstanceModrinthContentSearch(editInstanceId));
};
instanceContentSearchKind.onchange = () =>
  void guarded(async () => {
    await runInstanceModrinthContentSearch(editInstanceId);
  });
btnProviderSearch.onclick = () =>
  guarded(async () => {
    await runProviderSearch();
  });
providerSearchInput.onkeydown = (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  void guarded(async () => runProviderSearch());
};
btnCreateImportNow.onclick = () =>
  guarded(async () => {
    await withModalProgress("Importing modpack", "Selecting archive...", async (update) => {
      // Fast-path import button in create modal.
      const res = await backend.instancesImport();
      if (!res.ok || res.canceled) return;
      if (res.instance?.id && res.instance?.mcVersion && res.instance?.loader) {
        update?.("Preparing loader/runtime...");
        await ensureFabricApiForFabricInstance(res.instance.id, res.instance.mcVersion, res.instance.loader as LoaderKind);
      }
      if (selectedCreateIconPath && res.instance?.id) {
        update?.("Applying icon...");
        try {
          await backend.instancesSetIconFromFile(res.instance.id, selectedCreateIconPath, getSelectedIconTransformPayload());
        } catch (err: any) {
          appendLog(`[icon] Failed applying selected icon: ${String(err?.message ?? err)}`);
        }
      }
      update?.("Refreshing library...");
      state.instances = await backend.instancesList();
      await renderInstances();
      appendLog(`[instance] Imported "${res.instance?.name ?? "instance"}"`);
      closeModal();
    });
  });
btnProviderImportArchive.onclick = () =>
  guarded(async () => {
    // Provider archive import path (CurseForge/Technic/ATLauncher/FTB).
    const provider =
      createSource === "curseforge" || createSource === "technic" || createSource === "atlauncher" || createSource === "ftb"
        ? createSource
        : "auto";
    const res = await backend.packArchiveImport({
      provider,
      defaults: {
        name: newName.value?.trim() || undefined,
        mcVersion: newVersion.value || undefined,
        accountId: instanceAccount.value || null,
        memoryMb: Number(newMem.value || 6144)
      }
    });
    if (!res.ok || res.canceled) return;
    if (res.result?.instance?.id) {
      // Prefer user-selected icon override; fallback to provider icon/fallback badge.
      if (selectedCreateIconPath) {
        try {
          await backend.instancesSetIconFromFile(
            res.result.instance.id,
            selectedCreateIconPath,
            getSelectedIconTransformPayload()
          );
        } catch (err: any) {
          appendLog(`[icon] Failed applying selected icon: ${String(err?.message ?? err)}`);
        }
      } else if (selectedProviderPack?.iconUrl) {
        try {
          await backend.instancesSetIconFromUrl(res.result.instance.id, selectedProviderPack.iconUrl);
        } catch {
          await backend.instancesSetIconFallback(res.result.instance.id, selectedProviderPack.name || "Pack", "blue");
        }
      } else {
        await backend.instancesSetIconFallback(
          res.result.instance.id,
          selectedProviderPack?.name || res.result.instance?.name || "Pack",
          "blue"
        );
      }
    }
    state.instances = await backend.instancesList();
    await renderInstances();
    appendLog(
      `[pack-import] ${provider} -> ${res.result.detectedFormat}: "${res.result.instance?.name}" (${(res.result.notes || []).join(" | ")})`
    );
    closeModal();
  });

async function importSelectedExternalProfile(source: "modrinth" | "curseforge") {
  const selectEl = source === "modrinth" ? localModrinthProfilesSelect : localCurseForgeProfilesSelect;
  const profileId = String(selectEl.value || "").trim();
  if (!profileId) {
    alert(`Select a ${source === "modrinth" ? "Modrinth" : "CurseForge"} profile first.`);
    return;
  }
  await withModalProgress(
    `Importing ${source === "modrinth" ? "Modrinth" : "CurseForge"} profile`,
    "Copying profile files...",
    async (update) => {
      const res = await backend.externalProfileImport(source, profileId, {
        name: newName.value?.trim() || undefined,
        accountId: instanceAccount.value || null,
        memoryMb: Number(newMem.value || 4096)
      });
      if (!res?.ok) return;
      if (res.instance?.id && res.instance?.mcVersion && res.instance?.loader) {
        update?.("Preparing loader/runtime...");
        await ensureFabricApiForFabricInstance(res.instance.id, res.instance.mcVersion, res.instance.loader as LoaderKind);
      }
      if (selectedCreateIconPath && res.instance?.id) {
        update?.("Applying icon...");
        try {
          await backend.instancesSetIconFromFile(
            res.instance.id,
            selectedCreateIconPath,
            getSelectedIconTransformPayload()
          );
        } catch (err: any) {
          appendLog(`[icon] Failed applying selected icon: ${String(err?.message ?? err)}`);
        }
      }
      update?.("Refreshing library...");
      state.instances = await backend.instancesList();
      await renderInstances();
      appendLog(
        `[external-import] Imported ${source} profile "${res.profile?.name ?? profileId}" as "${res.instance?.name ?? "instance"}".`
      );
      closeModal();
    }
  );
}

btnRefreshLocalModrinthProfiles.onclick = () =>
  guarded(async () => {
    await refreshExternalProfiles("modrinth");
  });

btnRefreshLocalCurseForgeProfiles.onclick = () =>
  guarded(async () => {
    await refreshExternalProfiles("curseforge");
  });

btnImportLocalModrinthProfile.onclick = () =>
  guarded(async () => {
    await importSelectedExternalProfile("modrinth");
  });

btnImportLocalCurseForgeProfile.onclick = () =>
  guarded(async () => {
    await importSelectedExternalProfile("curseforge");
  });
btnImportInstanceArchiveIntoCurrent.onclick = () =>
  guarded(async () => {
    if (!editInstanceId) return;
    await withModalProgress("Importing into instance", "Selecting archive...", async (update) => {
      const res = await backend.instancesImportInto(editInstanceId);
      if (!res.ok || res.canceled) return;
      update?.("Refreshing current instance...");
      await refreshEditedInstanceWorkspace("installed");
      appendLog(`[instance-import] Merged "${res.instance?.name ?? "instance export"}" into current instance.`);
      if (res.lockfileApplied) {
        appendLog(
          `[lockfile] Applied during merge: ${res.lockfileResult?.appliedMods ?? 0} mods, ${res.lockfileResult?.appliedPacks ?? 0} packs.`
        );
      }
    });
  });
btnImportPackArchiveIntoCurrent.onclick = () =>
  guarded(async () => {
    if (!editInstanceId) return;
    await withModalProgress("Applying pack archive", "Selecting archive...", async (update) => {
      const res = await backend.packArchiveApplyToInstance(editInstanceId, { provider: "auto" });
      if (!res.ok || res.canceled) return;
      update?.("Refreshing current instance...");
      await refreshEditedInstanceWorkspace("installed");
      appendLog(
        `[pack-import] Applied ${res.result.detectedFormat} archive into "${res.result.instance?.name ?? "instance"}" (${(res.result.notes || []).join(" | ")})`
      );
    });
  });
btnPickInstanceIcon.onclick = () =>
  guarded(async () => {
    const picked = await backend.instancesPickIcon();
    if (!picked) return;
    selectedCreateIconPath = picked;
    clearExistingIconOnSave = false;
    instanceIconHint.textContent = "Custom icon selected.";
    setIconPreviewSource(selectedCreateIconPath);
  });
btnClearInstanceIcon.onclick = () => {
  selectedCreateIconPath = null;
  clearExistingIconOnSave = true;
  instanceIconHint.textContent = "Icon will be cleared on save.";
  setIconPreviewSource(null);
};
btnResetInstanceIconTransform.onclick = () => {
  resetSelectedIconTransform();
};
instanceIconScale.oninput = () => {
  selectedIconScalePct = Number(instanceIconScale.value || 100);
  renderIconTransformUi();
};
instanceIconOffsetX.oninput = () => {
  selectedIconOffsetXPct = Number(instanceIconOffsetX.value || 0);
  renderIconTransformUi();
};
instanceIconOffsetY.oninput = () => {
  selectedIconOffsetYPct = Number(instanceIconOffsetY.value || 0);
  renderIconTransformUi();
};
instanceIconPreviewFrame.onmousedown = (ev: MouseEvent) => {
  if (!selectedCreateIconPath || ev.button !== 0) return;
  iconPreviewDragging = true;
  iconPreviewDragStartX = ev.clientX;
  iconPreviewDragStartY = ev.clientY;
  iconPreviewDragOriginX = selectedIconOffsetXPct;
  iconPreviewDragOriginY = selectedIconOffsetYPct;
  const layout = getIconPreviewLayout();
  iconPreviewDragMaxShiftX = layout.maxShiftX;
  iconPreviewDragMaxShiftY = layout.maxShiftY;
  (instanceIconPreviewFrame as HTMLElement).style.cursor = "grabbing";
  ev.preventDefault();
};
window.addEventListener("mousemove", (ev) => {
  if (!iconPreviewDragging) return;
  // Convert drag delta into percentage offsets so transform is resolution-independent.
  const dx = ev.clientX - iconPreviewDragStartX;
  const dy = ev.clientY - iconPreviewDragStartY;
  const nextX =
    iconPreviewDragMaxShiftX > 0
      ? iconPreviewDragOriginX + (dx / iconPreviewDragMaxShiftX) * 100
      : iconPreviewDragOriginX;
  const nextY =
    iconPreviewDragMaxShiftY > 0
      ? iconPreviewDragOriginY + (dy / iconPreviewDragMaxShiftY) * 100
      : iconPreviewDragOriginY;
  selectedIconOffsetXPct = Math.max(-100, Math.min(100, Math.round(nextX)));
  selectedIconOffsetYPct = Math.max(-100, Math.min(100, Math.round(nextY)));
  renderIconTransformUi();
});
window.addEventListener("mouseup", () => {
  if (!iconPreviewDragging) return;
  iconPreviewDragging = false;
  (instanceIconPreviewFrame as HTMLElement).style.cursor = "grab";
});
instanceIconPreviewFrame.onwheel = (ev: WheelEvent) => {
  if (!selectedCreateIconPath) return;
  // Zoom in/out preview to compose icon crop before save.
  ev.preventDefault();
  const delta = ev.deltaY < 0 ? 4 : -4;
  selectedIconScalePct = Math.max(50, Math.min(250, selectedIconScalePct + delta));
  renderIconTransformUi();
};

btnCreate.onclick = async () => {
  modalMode = "create";
  editInstanceId = null;
  editServerId = null;
  modalTitle.textContent = "Create an instance";
  newName.value = "";
  newMem.value = String(getSettings().defaultMemoryMb ?? 4096);
  fillInstancePresetDropdown("none", "fabric", "");
  createIncludeReleases = true;
  createIncludeSnapshots = false;
  renderCreateFilterButtons();
  fillCreateVersionOptions();
  createLoaderType.value = "fabric";
  createLoaderVersion.value = "";
  updateCreateLoaderUi();
  await refreshPresetDropdownAvailability("none", "fabric", newVersion.value || "");
  setCreateSource("custom");
  selectedModrinthPack = null;
  selectedProviderPack = null;
  modalInstanceSyncEnabled = true;
  renderModalInstanceSyncToggle();
  selectedCreateIconPath = null;
  clearExistingIconOnSave = false;
  resetSelectedIconTransform();
  instanceIconHint.textContent = "No custom icon selected.";
  setIconPreviewSource(null);
  modrinthSearchInput.value = "";
  modrinthSearchResults.innerHTML = "";
  providerSearchInput.value = "";
  providerSearchResults.innerHTML = "";
  createSourceCustom.removeAttribute("disabled");
  createSourceImport.removeAttribute("disabled");
  createSourceModrinth.removeAttribute("disabled");
  createSourceCurseForge.removeAttribute("disabled");
  createSourceTechnic.removeAttribute("disabled");
  createSourceATLauncher.removeAttribute("disabled");
  createSourceFTB.removeAttribute("disabled");

  await fillInstanceAccountDropdown(null);
  await renderServerEntries(null);
  openModal();
};

btnImport.onclick = () =>
  guarded(async () => {
    await withGlobalActionProgress("Importing modpack", "Selecting archive...", async (update) => {
      const res = await backend.instancesImport();
      if (!res.ok || res.canceled) return;
      update?.("Refreshing library...");
      state.instances = await backend.instancesList();
      await renderInstances();
      appendLog(`[instance] Imported "${res.instance?.name ?? "instance"}"`);
      if (res.lockfileApplied) {
        appendLog(
          `[lockfile] Applied during import: ${res.lockfileResult?.appliedMods ?? 0} mods, ${res.lockfileResult?.appliedPacks ?? 0} packs.`
        );
        if (res.lockfileResult?.issues?.length) {
          appendLog(`[lockfile] Apply issues: ${res.lockfileResult.issues.join(" | ")}`);
        }
        if (res.lockfileResult?.drift && !res.lockfileResult.drift.clean) {
          appendLog(`[lockfile] Drift after import: ${res.lockfileResult.drift.issues.map((x) => `${x.id}: ${x.message}`).join(" | ")}`);
        }
      }
    });
  });

btnQuickLaunchLatestVanilla.onclick = () =>
  guarded(async () => {
    await quickLaunchLatestVanillaClient();
  });

modalClose.onclick = closeModal;
modalCancel.onclick = closeModal;

modalCreate.onclick = () =>
  guarded(async () => {
    if (modalMode === "create") {
      // Source-specific create flow.
      if (createSource === "import") {
        await withModalProgress("Importing modpack", "Selecting archive...", async (update) => {
          const res = await backend.instancesImport();
          if (!res.ok || res.canceled) return;
          if (res.instance?.id && res.instance?.mcVersion && res.instance?.loader) {
            update?.("Preparing loader/runtime...");
            await ensureFabricApiForFabricInstance(res.instance.id, res.instance.mcVersion, res.instance.loader as LoaderKind);
          }
          if (selectedCreateIconPath && res.instance?.id) {
            update?.("Applying icon...");
            try {
              await backend.instancesSetIconFromFile(
                res.instance.id,
                selectedCreateIconPath,
                getSelectedIconTransformPayload()
              );
            } catch (err: any) {
              appendLog(`[icon] Failed applying selected icon: ${String(err?.message ?? err)}`);
            }
          }
          update?.("Refreshing library...");
          state.instances = await backend.instancesList();
          await renderInstances();
          appendLog(`[instance] Imported "${res.instance?.name ?? "instance"}"`);
          closeModal();
        });
        return;
      }

      if (
        createSource === "modrinth" ||
        createSource === "curseforge" ||
        createSource === "technic" ||
        createSource === "atlauncher" ||
        createSource === "ftb"
      ) {
        if (createSource !== "modrinth") {
          if (!selectedProviderPack?.id) {
            alert("Select a pack from search results first.");
            return;
          }
          if (createSource === "technic") {
            alert(
              `${createSource.toUpperCase()} direct install is not available in this build.\nUse "Import pack archive" below to install from a local provider export.`
            );
            return;
          }
          closeModal();
          const installed = await runTrackedInstall(
            `Installing ${selectedProviderPack.name}`,
            async (update) => {
              update("Creating instance");
              const installed = await backend.providerPacksInstall(createSource, selectedProviderPack.id, {
                name: newName.value?.trim() || undefined,
                accountId: instanceAccount.value || null,
                memoryMb: Number(newMem.value || 6144)
              });
              if (installed?.instance?.id && installed.instance?.mcVersion && installed.instance?.loader) {
                update("Preparing loader/runtime");
                await ensureFabricApiForFabricInstance(
                  installed.instance.id,
                  installed.instance.mcVersion,
                  installed.instance.loader as LoaderKind
                );
              }
              if (installed?.instance?.id) {
                update("Applying icon");
                if (selectedCreateIconPath) {
                  try {
                    await backend.instancesSetIconFromFile(
                      installed.instance.id,
                      selectedCreateIconPath,
                      getSelectedIconTransformPayload()
                    );
                  } catch (err: any) {
                    appendLog(`[icon] Failed applying selected icon: ${String(err?.message ?? err)}`);
                  }
                } else if (selectedProviderPack?.iconUrl) {
                  try {
                    await backend.instancesSetIconFromUrl(installed.instance.id, selectedProviderPack.iconUrl);
                  } catch {
                    await backend.instancesSetIconFallback(installed.instance.id, selectedProviderPack.name || "Pack", "blue");
                  }
                } else {
                  await backend.instancesSetIconFallback(installed.instance.id, selectedProviderPack.name || "Pack", "blue");
                }
              }
              update("Refreshing library");
              return installed;
            }
          );
          state.instances = await backend.instancesList();
          await renderInstances();
          appendLog(`[provider] Installed ${createSource} pack "${installed.instance?.name}" (${(installed.notes || []).join(" | ")})`);
          return;
        }
        // Modrinth catalog install flow.
        if (!selectedModrinthPack) {
          alert("Select a Modrinth pack first.");
          return;
        }
        closeModal();
        const res = await runTrackedInstall(
          `Installing ${selectedModrinthPack.title}`,
          async (update) => {
            update("Creating instance");
            const res = await backend.modrinthPacksInstall({
              projectId: selectedModrinthPack.projectId,
              versionId: selectedModrinthPack.latestVersionId || undefined,
              nameOverride: newName.value?.trim() || selectedModrinthPack.title,
              accountId: instanceAccount.value || null,
              memoryMb: Number(newMem.value || 6144)
            });
            if (res.instance?.id && res.instance?.mcVersion && res.instance?.loader) {
              update("Preparing loader/runtime");
              await ensureFabricApiForFabricInstance(res.instance.id, res.instance.mcVersion, res.instance.loader as LoaderKind);
            }
            if (res.instance?.id) {
              update("Applying icon");
              if (selectedCreateIconPath) {
                try {
                  await backend.instancesSetIconFromFile(
                    res.instance.id,
                    selectedCreateIconPath,
                    getSelectedIconTransformPayload()
                  );
                } catch (err: any) {
                  appendLog(`[icon] Failed applying selected icon: ${String(err?.message ?? err)}`);
                }
              } else if (selectedModrinthPack.iconUrl) {
                try {
                  await backend.instancesSetIconFromUrl(res.instance.id, selectedModrinthPack.iconUrl);
                } catch (err: any) {
                  appendLog(`[icon] Failed downloading pack icon: ${String(err?.message ?? err)}`);
                  await backend.instancesSetIconFallback(res.instance.id, selectedModrinthPack.title, "blue");
                }
              } else {
                await backend.instancesSetIconFallback(res.instance.id, selectedModrinthPack.title, "blue");
              }
            }
            update("Refreshing library");
            return res;
          }
        );
        state.instances = await backend.instancesList();
        await renderInstances();
        appendLog(
          `[modrinth] Installed "${selectedModrinthPack.title}" as "${res.instance?.name}" (${res.version?.versionNumber ?? "latest"}).`
        );
        return;
      }

      await withModalProgress("Creating instance", "Preparing configuration...", async (update) => {
        const id = crypto.randomUUID();
        const mcVersion = newVersion.value;
        const loaderChoice = String(createLoaderType.value || "fabric");
        const loader = getEffectiveRuntimeLoader(loaderChoice);
        const displayLoader = getPersistedDisplayLoader(loaderChoice);
        const selectedPreset = (instancePreset.value || "none") as InstancePresetId;
        const presetModrinthPackProject =
          selectedPreset !== "none"
            ? PRESET_MODRINTH_PACK_PROJECTS[selectedPreset as Exclude<InstancePresetId, "none">]
            : undefined;

        if (!mcVersion) {
          alert("Select a Minecraft version first.");
          return;
        }
        if (!["vanilla", "fabric", "quilt", "forge", "neoforge"].includes(loaderChoice)) {
          alert(`Unsupported loader: ${loaderChoice}`);
          return;
        }
        if (presetModrinthPackProject) {
          closeModal();
          const presetMeta = selectedPreset !== "none" ? INSTANCE_PRESETS[selectedPreset as Exclude<InstancePresetId, "none">] : null;
          const presetLabel = presetMeta?.name || selectedPreset;
          const res = await runTrackedInstall(
            `Installing ${presetLabel}`,
            async (update) => {
              update("Creating instance from Modrinth preset pack");
              const created = await backend.modrinthPacksInstall({
                projectId: presetModrinthPackProject,
                mcVersion,
                loader: loader as "vanilla" | "fabric" | "quilt" | "forge" | "neoforge",
                requireCompatibility: true,
                nameOverride: newName.value?.trim() || presetLabel,
                accountId: instanceAccount.value || null,
                memoryMb: Number(newMem.value || 4096)
              });
              if (created.instance?.id) {
                await backend.instancesUpdate(created.instance.id, {
                  accountId: instanceAccount.value || null,
                  memoryMb: Number(newMem.value || 4096),
                  instancePreset: selectedPreset,
                  syncEnabled: modalInstanceSyncEnabled,
                  displayLoader: displayLoader
                });
              }
              if (created.instance?.id && created.instance?.mcVersion && created.instance?.loader) {
                update("Preparing loader/runtime");
                await ensureFabricApiForFabricInstance(
                  created.instance.id,
                  created.instance.mcVersion,
                  created.instance.loader as LoaderKind
                );
              }
              if (created.instance?.id) {
                update("Applying icon");
                if (selectedCreateIconPath) {
                  try {
                    await backend.instancesSetIconFromFile(
                      created.instance.id,
                      selectedCreateIconPath,
                      getSelectedIconTransformPayload()
                    );
                  } catch (err: any) {
                    appendLog(`[icon] Failed applying selected icon: ${String(err?.message ?? err)}`);
                  }
                } else {
                  await backend.instancesSetIconFallback(created.instance.id, presetLabel, "green");
                }
              }
              update("Refreshing library");
              return created;
            }
          );
          state.instances = await backend.instancesList();
          await renderInstances();
          appendLog(
            `[preset] Installed "${presetLabel}" from Modrinth project "${presetModrinthPackProject}" as "${res.instance?.name ?? "instance"}".`
          );
          return;
        }

        const cfg = {
          id,
          name: newName.value?.trim() || "New Instance",
          mcVersion,
          loader: loader as "vanilla" | "fabric" | "quilt" | "forge" | "neoforge",
          displayLoader: displayLoader,
          fabricLoaderVersion: undefined as string | undefined,
          quiltLoaderVersion: undefined as string | undefined,
          forgeVersion: undefined as string | undefined,
          neoforgeVersion: undefined as string | undefined,
          memoryMb: Number(newMem.value || 4096),
          accountId: instanceAccount.value || null,
          instancePreset: selectedPreset,
          syncEnabled: modalInstanceSyncEnabled
        };

        if (loader !== "vanilla") {
          update?.(`Resolving ${loader} loader...`);
          setStatus(`Resolving ${loader} loader...`);
          const resolved = (createLoaderVersion.value || "").trim() || (await backend.loaderPickVersion(loader as any, mcVersion)) || "";
          if (loader === "fabric") cfg.fabricLoaderVersion = resolved;
          if (loader === "quilt") cfg.quiltLoaderVersion = resolved;
          if (loader === "forge") cfg.forgeVersion = resolved;
          if (loader === "neoforge") cfg.neoforgeVersion = resolved;
        }

        update?.("Creating instance files...");
        setStatus("Creating instance...");
        await backend.instancesCreate(cfg);

        if (selectedCreateIconPath) {
          update?.("Applying icon...");
          try {
            await backend.instancesSetIconFromFile(id, selectedCreateIconPath, getSelectedIconTransformPayload());
          } catch (err: any) {
            appendLog(`[icon] Failed applying selected icon: ${String(err?.message ?? err)}`);
          }
        } else {
          await backend.instancesSetIconFallback(id, cfg.name || "Instance", "green");
        }

        update?.(`Preparing ${loader} runtime...`);
        setStatus(`Preparing ${loader}...`);
        await backend.loaderInstall(
          id,
          mcVersion,
          loader as any,
          loader === "fabric"
            ? cfg.fabricLoaderVersion
            : loader === "quilt"
              ? cfg.quiltLoaderVersion
              : loader === "forge"
                ? cfg.forgeVersion
                : loader === "neoforge"
                  ? cfg.neoforgeVersion
                  : undefined
        );
        await ensureFabricApiForFabricInstance(id, mcVersion, loader as LoaderKind);

        if (selectedPreset !== "none") {
          update?.("Applying preset...");
          await applyInstancePreset(id, mcVersion, loader as LoaderKind, selectedPreset);
        }

        update?.("Refreshing library...");
        setStatus("");
        state.instances = await backend.instancesList();
        await renderInstances();
        closeModal();
      });
      return;
    }

    if (modalMode === "edit" && editInstanceId) {
      // Existing instance edit flow.
      await withModalProgress("Saving instance", "Writing instance settings...", async (update) => {
        const selectedPreset = (instancePreset.value || "none") as InstancePresetId;
        const inst = (state.instances?.instances ?? []).find((x: any) => x.id === editInstanceId) ?? null;
        const nextLoaderChoice = String(createLoaderType.value || getInstanceDisplayLoader(inst) || "fabric");
        if (!["vanilla", "fabric", "quilt", "forge", "neoforge"].includes(nextLoaderChoice)) {
          alert(`Unsupported loader: ${nextLoaderChoice}`);
          return;
        }
        const nextLoader = getEffectiveRuntimeLoader(nextLoaderChoice);
        const nextDisplayLoader = getPersistedDisplayLoader(nextLoaderChoice);
        const nextVersion = newVersion.value || inst?.mcVersion;
        if (!nextVersion) {
          alert("Select a Minecraft version first.");
          return;
        }

        let nextFabricLoaderVersion: string | undefined = undefined;
        let nextQuiltLoaderVersion: string | undefined = undefined;
        let nextForgeVersion: string | undefined = undefined;
        let nextNeoForgeVersion: string | undefined = undefined;
        if (nextLoader !== "vanilla") {
          update?.(`Resolving ${nextLoader} loader...`);
          const resolved = (createLoaderVersion.value || "").trim() || (await backend.loaderPickVersion(nextLoader as any, nextVersion)) || "";
          if (nextLoader === "fabric") nextFabricLoaderVersion = resolved;
          if (nextLoader === "quilt") nextQuiltLoaderVersion = resolved;
          if (nextLoader === "forge") nextForgeVersion = resolved;
          if (nextLoader === "neoforge") nextNeoForgeVersion = resolved;
        }

        await backend.instancesUpdate(editInstanceId, {
          name: newName.value?.trim() || "Instance",
          mcVersion: nextVersion,
          loader: nextLoader,
          displayLoader: nextDisplayLoader,
          fabricLoaderVersion: nextFabricLoaderVersion,
          quiltLoaderVersion: nextQuiltLoaderVersion,
          forgeVersion: nextForgeVersion,
          neoforgeVersion: nextNeoForgeVersion,
          memoryMb: Number(newMem.value || 4096),
          accountId: instanceAccount.value || null,
          instancePreset: selectedPreset,
          syncEnabled: modalInstanceSyncEnabled
        });

        if (selectedCreateIconPath) {
          update?.("Applying icon...");
          try {
            await backend.instancesSetIconFromFile(
              editInstanceId,
              selectedCreateIconPath,
              getSelectedIconTransformPayload()
            );
          } catch (err: any) {
            appendLog(`[icon] Failed applying selected icon: ${String(err?.message ?? err)}`);
          }
        } else if (clearExistingIconOnSave) {
          await backend.instancesClearIcon(editInstanceId);
        }

        update?.(`Preparing ${nextLoader} runtime...`);
        setStatus(`Preparing ${nextLoader}...`);
        await backend.loaderInstall(
          editInstanceId,
          nextVersion,
          nextLoader as any,
          nextLoader === "fabric"
            ? nextFabricLoaderVersion
            : nextLoader === "quilt"
              ? nextQuiltLoaderVersion
              : nextLoader === "forge"
                ? nextForgeVersion
                : nextLoader === "neoforge"
                  ? nextNeoForgeVersion
                  : undefined
        );
        await ensureFabricApiForFabricInstance(editInstanceId, nextVersion, nextLoader as LoaderKind);

        if (inst && selectedPreset !== "none") {
          update?.("Applying preset...");
          await applyInstancePreset(editInstanceId, nextVersion, nextLoader as LoaderKind, selectedPreset);
        }
        update?.("Refreshing library...");
        setStatus("");
        state.instances = await backend.instancesList();
        await renderInstances();
        closeModal();
      });
    }
  });

btnJoinPreferred?.addEventListener("click", () =>
  guarded(async () => {
    const target = await findPreferredServerTarget();
    if (!target) {
      alert("No preferred server configured on any instance yet.");
      return;
    }

    if (state.instances?.activeInstanceId !== target.instance.id) {
      await backend.instancesSetActive(target.instance.id);
      state.instances = await backend.instancesList();
      await renderInstances();
    }

    await launchForInstance(target.instance, String(target.server.address || "").trim());
  })
);

btnClearLogs.onclick = () => {
  logsEl.textContent = "";
  launchLogBuffer = [];
  renderLaunchDiagnosis(null);
  setStatus("");
};
btnToggleDebugLogs.onclick = () => {
  debugLogsVisible = !debugLogsVisible;
  renderDebugLogsVisibility();
};
btnAnalyzeLogs.onclick = () =>
  guarded(async () => {
    const active = state.instances?.activeInstanceId ?? null;
    await runLaunchDiagnosis(active);
  });

btnApplyDiagnosisFix.onclick = () =>
  guarded(async () => {
    const active = state.instances?.activeInstanceId ?? null;
    if (!active || !latestDiagnosis?.fixAction || latestDiagnosis.fixAction === "none") return;
    const result = await backend.launchApplyFix(active, latestDiagnosis.fixAction);
    appendLog(`[diagnostics] ${result.message}`);
    await runLaunchDiagnosis(active);
  });

btnToggleDiagnosisDetails.onclick = () => {
  diagnosisDetailsOpen = !diagnosisDetailsOpen;
  if (!latestDiagnosis) {
    launchDiagnosisDetails.style.display = "none";
    return;
  }
  renderLaunchDiagnosis(latestDiagnosis);
};

btnCopyDiagnosisReport.onclick = () =>
  guarded(async () => {
    const active = state.instances?.activeInstanceId ?? null;
    const diag = latestDiagnosis;
    const lines = launchLogBuffer.slice(-120);
    const report = [
      "# Fishbattery Diagnostic Report",
      `Generated: ${new Date().toISOString()}`,
      `Instance: ${String(active || "none")}`,
      `Diagnosis code: ${String(diag?.code || "none")}`,
      `Severity: ${String(diag?.severity || "unknown")}`,
      `Summary: ${String(diag?.summary || "No diagnosis available")}`,
      `Fix action: ${String(diag?.fixAction || "none")}`,
      "",
      "## Details",
      ...((diag?.details || []).map((x: string) => `- ${x}`) || []),
      "",
      "## Recommended Actions",
      ...((diag?.recommendedActions || []).map((x: string) => `- ${x}`) || []),
      "",
      "## Recent Logs",
      "```text",
      ...lines,
      "```"
    ].join("\n");

    const safe = redactSensitive(report);
    try {
      await navigator.clipboard.writeText(safe);
      appendLog("[diagnostics] Copied redacted diagnostic report to clipboard.");
    } catch (err: any) {
      appendLog(`[diagnostics] Copy failed: ${String(err?.message ?? err)}`);
    }
  });

btnOptimizeInstance.onclick = () => guarded(async () => optimizeActiveModalInstance());
btnRestoreOptimization.onclick = () => guarded(async () => restoreActiveModalOptimization());
btnRunBenchmark.onclick = () => guarded(async () => runActiveModalBenchmark());
btnSaveServerEntry.onclick = () =>
  guarded(async () => {
    if (!editInstanceId || modalMode !== "edit") {
      alert("Save the instance first, then add servers.");
      return;
    }

    const name = serverNameInput.value.trim();
    const address = serverAddressInput.value.trim();
    if (!name || !address) {
      alert("Server name and address are required.");
      return;
    }

    await backend.serversUpsert(editInstanceId, {
      id: editServerId ?? undefined,
      name,
      address
    });

    editServerId = null;
    serverNameInput.value = "";
    serverAddressInput.value = "";
    await renderServerEntries(editInstanceId);
  });

btnExportServerProfile.onclick = () =>
  guarded(async () => {
    if (!editInstanceId || modalMode !== "edit") {
      alert("Open an existing instance first.");
      return;
    }
    const data = await backend.serversList(editInstanceId);
    const selected = data.servers.find((x: any) => x.id === data.preferredServerId) ?? data.servers[0];
    if (!selected) {
      alert("Add at least one server first.");
      return;
    }

    const res = await backend.serversExportProfile(editInstanceId, selected.id);
    if (!res.ok || res.canceled) return;
    appendLog(`[server-profile] Exported ${selected.name}: ${res.path}`);
  });

btnImportServerProfile.onclick = () =>
  guarded(async () => {
    if (!editInstanceId || modalMode !== "edit") {
      alert("Open an existing instance first.");
      return;
    }
    const res = await backend.serversImportProfile(editInstanceId);
    if (!res.ok || res.canceled) return;
    state.instances = await backend.instancesList();
    await renderInstances();
    await renderServerEntries(editInstanceId);
    appendLog(`[server-profile] Imported profile for ${res.result?.server?.name ?? "server"}.`);
    if (res.result?.lockfile) {
      appendLog(
        `[lockfile] Applied from server profile: ${res.result.lockfile.appliedMods} mods, ${res.result.lockfile.appliedPacks} packs.`
      );
      if (res.result.lockfile.issues?.length) {
        appendLog(`[lockfile] Server profile lock issues: ${res.result.lockfile.issues.join(" | ")}`);
      }
    }
  });

modalUpdateMods.onclick = () =>
  guarded(async () => {
    if (!editInstanceId) return;
    const inst = (state.instances?.instances ?? []).find((x: any) => x.id === editInstanceId) ?? null;
    if (!inst) return;
    let bridgeUpdated = false;
    try {
      const bridgeRes = await backend.modsSyncBridge(inst.id, inst.mcVersion);
      bridgeUpdated = !!bridgeRes?.installed;
      if (bridgeUpdated) {
        appendLog(`[mods] Updated cape bridge to latest (${bridgeRes.assetName ?? "bridge asset"}).`);
      }
    } catch (err: any) {
      appendLog(`[mods] Cape bridge sync skipped: ${String(err?.message ?? err)}`);
    }
    setStatus("Analyzing mod updates...");
    const plan = await backend.modsPlanRefresh(inst.id, inst.mcVersion);
    if (!plan?.updates?.length) {
      setStatus("");
      if (bridgeUpdated) {
        appendLog("[mods] Smart update: bridge updated; no catalog mod updates found.");
        await renderInstanceMods(inst.id);
        const v = await backend.modsValidate(inst.id);
        renderCompatibilityState(v);
        alert("Cape bridge updated to latest. No other mod updates available.");
        return;
      }
      appendLog("[mods] Smart update: no compatible updates found.");
      if (plan?.blocked?.length) {
        alert(`No applicable updates.\nBlocked mods: ${plan.blocked.map((x: any) => x.id).join(", ")}`);
      } else {
        alert("No mod updates available.");
      }
      return;
    }

    const summary = buildModUpdateSummary(plan);
    const choiceRaw = await showLauncherPrompt(
      `${summary}\n\nChoose action:\n- all\n- individual\n- skip`,
      "all"
    );
    const choice = String(choiceRaw || "skip").trim().toLowerCase();
    if (choice === "skip") {
      setStatus("");
      appendLog("[mods] Smart update skipped by user.");
      return;
    }

    let selectedIds: string[] = [];
    if (choice === "individual") {
      const suggested = plan.updates.map((u: any) => u.id).slice(0, 5).join(",");
      const rawIds = await showLauncherPrompt("Enter mod IDs to update (comma-separated).", suggested);
      selectedIds = String(rawIds || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const valid = new Set(plan.updates.map((u: any) => String(u.id)));
      selectedIds = selectedIds.filter((x) => valid.has(x));
      if (!selectedIds.length) {
        setStatus("");
        alert("No valid mod IDs selected.");
        return;
      }
    }

    setStatus("Applying mod updates...");
    try {
      await backend.rollbackCreateSnapshot(inst.id, "mods-refresh", "Before manual mods refresh");
    } catch (err: any) {
      appendLog(`[rollback] Snapshot skipped: ${String(err?.message ?? err)}`);
    }
    try {
      if (choice === "individual") {
        await backend.modsRefreshSelected(inst.id, inst.mcVersion, selectedIds);
        appendLog(`[mods] Updated selected mods: ${selectedIds.join(", ")}`);
      } else {
        await backend.modsRefresh(inst.id, inst.mcVersion);
        appendLog("[mods] Updated all eligible mods.");
      }
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const doRollback = await showLauncherConfirm(`Mod update failed:\n${msg}\n\nRestore latest snapshot now?`);
      if (doRollback) {
        await backend.rollbackRestoreLatest(inst.id);
        appendLog("[rollback] Restored latest snapshot after update failure.");
      }
      throw err;
    }
    await renderInstanceMods(inst.id);
    await renderLocalContent(inst.id);
    const v = await backend.modsValidate(inst.id);
    appendLog(`[validation] After refresh: ${v.summary} (${v.issues.length} issues)`);
    if (v.summary === "critical") {
      const dup = v.issues.filter((x: any) => x.code === "duplicate-mod-id").length;
      if (dup > 0) {
        const fix = await showLauncherConfirm(`Detected ${dup} duplicate mod conflict(s). Auto-fix duplicates now?`);
        if (fix) {
          const r = await backend.modsFixDuplicates(inst.id);
          appendLog(`[validation] Removed duplicates: ${r.removed.join(", ") || "none"}`);
        }
      }
    }
    setStatus("");
  });

modalUploadLocalMod.onclick = () => guarded(async () => pickAndAdd("mods"));

modalOpenInstanceFolder.onclick = () =>
  guarded(async () => {
    if (!editInstanceId) return;
    await backend.instancesOpenFolder(editInstanceId);
  });

btnUploadResourcepack.onclick = () => guarded(async () => pickAndAdd("resourcepacks"));
btnUploadShaderpack.onclick = () => guarded(async () => pickAndAdd("shaderpacks"));

btnOpenInstanceFolder2.onclick = () =>
  guarded(async () => {
    if (!editInstanceId) return;
    await backend.instancesOpenFolder(editInstanceId);
  });

btnOpenInstanceFolder3.onclick = () =>
  guarded(async () => {
    if (!editInstanceId) return;
    await backend.instancesOpenFolder(editInstanceId);
  });

backend.onLaunchLog((line) => {
  appendLog(line);
  const active = state.instances?.activeInstanceId ?? null;
  const lower = String(line || "").toLowerCase();
  const detectedPort = parsePlayitLanPortFromLog(line);
  if (detectedPort > 0) {
    void handleDetectedLanPort(detectedPort);
  }
  if (active && isPlayitLanWorldClosedLog(line)) {
    void disablePlayitAutoTunnelForInstance(String(active), "world closed");
  }
  if (lower.includes("[launcher] launch command:") || lower.includes("[launcher] launching")) {
    resetPlayitAutoTunnelState();
  }
  if (lower.includes("[launcher] game exited")) {
    if (active) {
      void disablePlayitAutoTunnelForInstance(String(active), "game exited");
    }
    resetPlayitAutoTunnelState();
  }
  if (
    active &&
    (lower.includes("launch failed") ||
      lower.includes("launch preparation failed") ||
      lower.includes("installer failed") ||
      lower.includes("completed without profile") ||
      lower.includes("modresolutionexception") ||
      lower.includes("duplicate") ||
      lower.includes("unsupportedclassversionerror"))
  ) {
    // Run diagnostics automatically when common failure signatures appear in logs.
    void runLaunchDiagnosis(active);
  }
});
backend.onUpdaterEvent(async (evt) => {
  updaterState = evt;
  syncUpdaterBusyBanner();
  if (settingsTabInstall.classList.contains("active")) {
    renderSettingsPanels();
  }
  const msg = String(evt?.message ?? "");
  const isDevNoopMsg =
    msg === "Update checks are disabled in development builds." ||
    msg === "Update downloads are disabled in development builds.";
  if (msg && !isDevNoopMsg) appendLog(`[updater] ${msg}`);

  if (evt?.status === "update-available") {
    // Prompt at most once per version during a renderer session.
    const v = String(evt.latestVersion ?? "");
    if (v && promptedUpdateVersion !== v) {
      promptedUpdateVersion = v;
      const yes = await showLauncherConfirm(`Update v${v} is available. Download now?`);
      if (yes) {
        updaterBusyIntent = "download";
        setGlobalActionBusy(true, "Downloading update", `Preparing update v${v}...`);
        void backend.updaterDownload();
      }
    }
  }

  if (evt?.status === "downloaded") {
    const v = String(evt.latestVersion ?? "");
    if (v && promptedInstallVersion !== v) {
      promptedInstallVersion = v;
      const yes = await showLauncherConfirm(`Update v${v} downloaded. Restart now to install?`);
      if (yes) {
        updaterBusyIntent = "install";
        setGlobalActionBusy(true, "Installing update", `Restarting to install v${v}...`);
        void backend.updaterInstall();
      }
    }
  }
});

// Close account dropdown when clicking outside
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (!t) return;
  if (!accountDropdown.classList.contains("open")) return;
  if (accountDropdown.contains(t)) return;
  if (accountBtn.contains(t)) return;
  accountDropdown.classList.remove("open");
});

winBtnMin.onclick = () => {
  void backend.windowMinimize();
};

let topbarDragActive = false;
let topbarDragPointerId: number | null = null;
let topbarDragAnchorRatio = 0.5;
let topbarDragNeedsRestore = false;
let topbarDragMoveQueued: { cursorX: number; cursorY: number } | null = null;
let topbarDragMoveInFlight = false;

// Queue topbar drag move.
function queueTopbarDragMove(cursorX: number, cursorY: number) {
  topbarDragMoveQueued = { cursorX, cursorY };
  if (topbarDragMoveInFlight) return;
  topbarDragMoveInFlight = true;

  void (async () => {
    // Collapse high-frequency pointer moves into one async drain loop.
    while (topbarDragMoveQueued && topbarDragActive) {
      const next = topbarDragMoveQueued;
      topbarDragMoveQueued = null;
      if (!next) break;

      if (topbarDragNeedsRestore) {
        // Restore from maximized first so drag can continue with a normal window frame.
        const restored = await backend.windowDragRestore(next.cursorX, next.cursorY, topbarDragAnchorRatio);
        if (restored) {
          topbarDragNeedsRestore = false;
          await syncWindowMaxButtonState();
          continue;
        }
      }

      await backend.windowDragMove(next.cursorX, next.cursorY, topbarDragAnchorRatio);
    }
    topbarDragMoveInFlight = false;
  })();
}

// Stop topbar drag.
async function stopTopbarDrag(cursorY?: number) {
  if (!topbarDragActive) return;
  topbarDragActive = false;
  topbarDragMoveQueued = null;

  if (cursorY != null) {
    // Delegates snap/maximize behavior (drag-to-top / edges) to native window handling.
    await backend.windowDragEnd(cursorY);
  }
  await syncWindowMaxButtonState();
}

// Sync window max button state.
async function syncWindowMaxButtonState() {
  const maximized = await backend.windowIsMaximized();
  winBtnMax.classList.toggle("is-maximized", !!maximized);

  let fullscreen = false;
  try {
    fullscreen = !!(await backend.windowIsFullscreen());
  } catch {
    fullscreen = false;
  }
  document.documentElement.dataset.windowFullscreen = fullscreen ? "1" : "0";
}

winBtnMax.onclick = async () => {
  await backend.windowToggleMaximize();
  await syncWindowMaxButtonState();
};

winBtnClose.onclick = () => {
  void backend.windowClose();
};

windowTopbar.addEventListener("dblclick", (ev) => {
  const t = ev.target as HTMLElement | null;
  if (t?.closest(".windowTopbarBtn")) return;
  void (async () => {
    await backend.windowToggleMaximize();
    await syncWindowMaxButtonState();
  })();
});

windowTopbar.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0) return;
  const t = ev.target as HTMLElement | null;
  if (t?.closest(".windowTopbarBtn")) return;

  const rect = windowTopbar.getBoundingClientRect();
  if (rect.width <= 0) return;

  topbarDragActive = true;
  topbarDragPointerId = ev.pointerId;
  topbarDragNeedsRestore = winBtnMax.classList.contains("is-maximized");
  topbarDragAnchorRatio = Math.max(0.05, Math.min(0.95, (ev.clientX - rect.left) / rect.width));
  topbarDragMoveQueued = null;
  ev.preventDefault();
});

window.addEventListener("pointermove", (ev) => {
  if (!topbarDragActive) return;
  if (topbarDragPointerId != null && ev.pointerId !== topbarDragPointerId) return;
  if (ev.buttons === 0) {
    topbarDragPointerId = null;
    void stopTopbarDrag(ev.clientY);
    return;
  }
  queueTopbarDragMove(ev.clientX, ev.clientY);
});

window.addEventListener("pointerup", (ev) => {
  if (!topbarDragActive) return;
  if (topbarDragPointerId != null && ev.pointerId !== topbarDragPointerId) return;
  topbarDragPointerId = null;
  void stopTopbarDrag(ev.clientY);
});

window.addEventListener("pointercancel", () => {
  if (!topbarDragActive) return;
  topbarDragPointerId = null;
  void stopTopbarDrag();
});

window.addEventListener("blur", () => {
  if (!topbarDragActive) return;
  topbarDragPointerId = null;
  void stopTopbarDrag();
});

window.addEventListener("resize", () => {
  void syncWindowMaxButtonState();
});
window.addEventListener("focus", () => {
  void syncWindowMaxButtonState();
  maybeTrackSponsoredImpression(sponsoredCurrentEntry);
});
document.addEventListener("visibilitychange", () => {
  maybeTrackSponsoredImpression(sponsoredCurrentEntry);
});
void syncWindowMaxButtonState();

// Initial
startupEmergencyRevealTimer = window.setTimeout(() => {
  forceRevealStartupShell("Emergency startup fallback triggered before normal reveal.");
}, 3500);

window.addEventListener("error", (event) => {
  const message = String(event.error?.message || event.message || "Unknown startup error");
  setStartupProgress(message, "Startup error");
  forceRevealStartupShell(`Renderer error: ${message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message =
    typeof reason === "string"
      ? reason
      : String(reason?.message || reason || "Unhandled startup rejection");
  setStartupProgress(message, "Startup error");
  forceRevealStartupShell(`Unhandled rejection: ${message}`);
});

applySettingsToDom(getSettings());
setSettingsTab("general");
renderModalInstanceSyncToggle();
renderIconTransformUi();
setIconPreviewSource(null);
renderDebugLogsVisibility();
void bootLauncher();
ensureRunningStatusPoll();

if (window.matchMedia) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const rerenderThemeFromSystem = () => {
    const s = getSettings();
    if (s.theme === "system-default" || s.theme === "time-of-day") {
      applySettingsToDom(s);
    }
  };
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", rerenderThemeFromSystem);
  } else if (typeof media.addListener === "function") {
    media.addListener(rerenderThemeFromSystem);
  }
}
