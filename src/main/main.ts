import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { registerIpc } from "./ipc";
import { CANONICAL_FOLDER } from "./paths";
import { initUpdater } from "./updater";

const userDataSuffix = String(process.env.FISHBATTERY_USERDATA_SUFFIX || "").trim();
const userDataFolder = userDataSuffix ? `${CANONICAL_FOLDER}-${userDataSuffix}` : CANONICAL_FOLDER;
app.setPath("userData", path.join(app.getPath("appData"), userDataFolder));
const localAppDataRoot = process.env.LOCALAPPDATA || app.getPath("appData");

function canWriteDir(dirPath: string): boolean {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const probe = path.join(dirPath, `.write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

const preferredSessionData = path.join(localAppDataRoot, userDataFolder, "session");
const fallbackSessionData = path.join(app.getPath("temp"), userDataFolder, "session");
const sessionDataPath = canWriteDir(preferredSessionData) ? preferredSessionData : fallbackSessionData;
app.setPath("sessionData", sessionDataPath);

const allowMultiInstance =
  String(process.env.FISHBATTERY_ALLOW_MULTI_INSTANCE || "").trim() === "1";
if (!allowMultiInstance) {
  const singleInstanceLock = app.requestSingleInstanceLock();
  if (!singleInstanceLock) {
    app.quit();
  }
}

let win: BrowserWindow | null = null;

function buildRoundedWindowShape(width: number, height: number, radius: number) {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const r = Math.max(0, Math.min(Math.floor(radius), Math.floor(Math.min(safeW, safeH) / 2)));
  if (r === 0) {
    return [{ x: 0, y: 0, width: safeW, height: safeH }];
  }

  const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
  rects.push({ x: 0, y: r, width: safeW, height: safeH - r * 2 });

  for (let y = 0; y < r; y += 1) {
    const dy = r - y - 1;
    const inset = Math.ceil(r - Math.sqrt(r * r - dy * dy));
    const rowWidth = Math.max(1, safeW - inset * 2);
    rects.push({ x: inset, y, width: rowWidth, height: 1 });
    rects.push({ x: inset, y: safeH - y - 1, width: rowWidth, height: 1 });
  }

  return rects;
}

function applyRoundedShape(target: BrowserWindow) {
  if (process.platform !== "win32") return;
  const bounds = target.getBounds();
  const radius = 14;
  if (target.isMaximized() || target.isFullScreen()) {
    target.setShape([{ x: 0, y: 0, width: bounds.width, height: bounds.height }]);
    return;
  }
  target.setShape(buildRoundedWindowShape(bounds.width, bounds.height, radius));
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true
    }
  });

  win.setMenuBarVisibility(false);
  applyRoundedShape(win);
  win.on("resize", () => applyRoundedShape(win!));
  win.on("maximize", () => applyRoundedShape(win!));
  win.on("unmaximize", () => applyRoundedShape(win!));
  win.on("enter-full-screen", () => applyRoundedShape(win!));
  win.on("leave-full-screen", () => applyRoundedShape(win!));

  const devUrl =
    process.env.VITE_DEV_SERVER_URL ||
    process.env.ELECTRON_RENDERER_URL ||
    "http://localhost:5173/";

  if (
    process.env.NODE_ENV === "development" ||
    process.env.VITE_DEV_SERVER_URL ||
    process.env.ELECTRON_RENDERER_URL
  ) {
    try {
      await win.loadURL(devUrl);
    } catch (err) {
      const msg = String((err as any)?.message || err || "unknown error");
      console.error(`[main] Failed to load dev URL ${devUrl}: ${msg}`);
      await win.loadURL(`data:text/plain,Failed to load dev server at ${encodeURIComponent(devUrl)}. Start it with: npm run dev`);
    }
    return;
  }

  try {
    await win.loadFile(path.join(__dirname, "../renderer/index.html"));
  } catch (err) {
    const msg = String((err as any)?.message || err || "unknown error");
    console.error(`[main] Failed to load renderer file: ${msg}`);
    await win.loadURL("data:text/plain,Failed to load renderer index.html");
  }
}

app.whenReady().then(async () => {
  // IPC handlers (accounts, versions, mods, packs, local uploads, launch)
  registerIpc();
  await createWindow();
  if (win) initUpdater(win);
});

app.on("second-instance", () => {
  if (allowMultiInstance) return;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
