import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const RESOURCES_ROOT = path.join(ROOT, "src-tauri", "resources");
const DEST_ROOT = path.join(RESOURCES_ROOT, "msmc-runtime");
const DEST_SECRETS = path.join(RESOURCES_ROOT, "secrets");
const CURSEFORGE_KEY_FILE = "curseforge-api-key.txt";

const DIRS = [
  "node_modules/msmc",
  "node_modules/tslib",
  "node_modules/node-fetch",
  "node_modules/whatwg-url",
  "node_modules/tr46",
  "node_modules/webidl-conversions"
];

async function ensureExists(targetPath) {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(`Missing required path: ${targetPath}`);
  }
}

async function copyDir(relativePath) {
  const src = path.join(ROOT, relativePath);
  const dest = path.join(DEST_ROOT, relativePath);
  await ensureExists(src);
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

async function copyFile(relativePath) {
  const src = path.join(ROOT, relativePath);
  const dest = path.join(DEST_ROOT, relativePath);
  await ensureExists(src);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function copyNodeRuntime() {
  const nodeExec = process.execPath;
  const ext = process.platform === "win32" ? ".exe" : "";
  const dest = path.join(DEST_ROOT, "bin", `node${ext}`);
  await ensureExists(nodeExec);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(nodeExec, dest);
  console.log(`Included Node runtime from ${nodeExec}`);
}

async function maybeCopyCurseforgeKey() {
  const candidates = [
    path.join(ROOT, "secrets", CURSEFORGE_KEY_FILE),
    path.join(ROOT, "src-tauri", "secrets", CURSEFORGE_KEY_FILE)
  ];
  for (const src of candidates) {
    try {
      await fs.access(src);
      await fs.mkdir(DEST_SECRETS, { recursive: true });
      await fs.copyFile(src, path.join(DEST_SECRETS, CURSEFORGE_KEY_FILE));
      console.log(`Included CurseForge key from ${src}`);
      return;
    } catch {
      // try next source
    }
  }
  await fs.mkdir(DEST_SECRETS, { recursive: true });
  console.log("No CurseForge key source found (expected secrets/curseforge-api-key.txt).");
}

async function main() {
  await fs.mkdir(RESOURCES_ROOT, { recursive: true });
  await fs.rm(DEST_ROOT, { recursive: true, force: true });
  await fs.mkdir(DEST_ROOT, { recursive: true });
  await fs.rm(DEST_SECRETS, { recursive: true, force: true });
  await fs.mkdir(DEST_SECRETS, { recursive: true });
  await copyFile("scripts/tauri-msmc-login.mjs");
  await copyNodeRuntime();
  for (const dir of DIRS) {
    await copyDir(dir);
  }
  await maybeCopyCurseforgeKey();
  console.log(`Prepared MSMC runtime at ${DEST_ROOT}`);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
