import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const RESOURCES_ROOT = path.join(ROOT, "src-tauri", "resources");
const DEST_ROOT = path.join(RESOURCES_ROOT, "msmc-runtime");
const DEST_SECRETS = path.join(RESOURCES_ROOT, "secrets");
const DEST_BUNDLED_RUNTIME = path.join(RESOURCES_ROOT, "runtime");
const CURSEFORGE_KEY_FILE = "curseforge-api-key.txt";

const DIRS = [
  "node_modules/msmc",
  "node_modules/tslib",
  "node_modules/node-fetch",
  "node_modules/whatwg-url",
  "node_modules/tr46",
  "node_modules/webidl-conversions"
];

function hostRuntimeMatrix() {
  if (process.platform === "win32" && process.arch === "x64") {
    return [
      {
        channel: "java8",
        archiveKind: "zip",
        url: "https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jdk/hotspot/normal/eclipse",
        localPattern: /^OpenJDK8U-.*_x64_windows_/i
      },
      {
        channel: "java17",
        archiveKind: "zip",
        url: "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse",
        localPattern: /^OpenJDK17U-.*_x64_windows_/i
      },
      {
        channel: "java21",
        archiveKind: "zip",
        url: "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse",
        localPattern: /^OpenJDK21U-.*_x64_windows_/i
      },
      {
        channel: "java25",
        archiveKind: "zip",
        url: "https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jre/hotspot/normal/eclipse",
        localPattern: /^(?:OpenJDK25U-.*_x64_windows_|jdk-25.*_windows-x64_bin)$/i
      }
    ];
  }

  if (process.platform === "darwin" && process.arch === "arm64") {
    return [
      {
        channel: "java8",
        archiveKind: "targz",
        url: "https://corretto.aws/downloads/latest/amazon-corretto-8-aarch64-macos-jdk.tar.gz",
        localPattern: /(?:OpenJDK8U|corretto).*aarch64.*mac/i
      },
      {
        channel: "java17",
        archiveKind: "targz",
        url: "https://api.adoptium.net/v3/binary/latest/17/ga/mac/aarch64/jre/hotspot/normal/eclipse",
        localPattern: /^OpenJDK17U-.*_aarch64_mac_/i
      },
      {
        channel: "java21",
        archiveKind: "targz",
        url: "https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse",
        localPattern: /^OpenJDK21U-.*_aarch64_mac_/i
      },
      {
        channel: "java25",
        archiveKind: "targz",
        url: "https://api.adoptium.net/v3/binary/latest/25/ga/mac/aarch64/jre/hotspot/normal/eclipse",
        localPattern: /^OpenJDK25U-.*_aarch64_mac_/i
      }
    ];
  }

  if (process.platform === "darwin" && process.arch === "x64") {
    return [
      {
        channel: "java8",
        archiveKind: "targz",
        url: "https://api.adoptium.net/v3/binary/latest/8/ga/mac/x64/jdk/hotspot/normal/eclipse",
        localPattern: /^OpenJDK8U-.*_x64_mac_/i
      },
      {
        channel: "java17",
        archiveKind: "targz",
        url: "https://api.adoptium.net/v3/binary/latest/17/ga/mac/x64/jre/hotspot/normal/eclipse",
        localPattern: /^OpenJDK17U-.*_x64_mac_/i
      },
      {
        channel: "java21",
        archiveKind: "targz",
        url: "https://api.adoptium.net/v3/binary/latest/21/ga/mac/x64/jre/hotspot/normal/eclipse",
        localPattern: /^OpenJDK21U-.*_x64_mac_/i
      },
      {
        channel: "java25",
        archiveKind: "targz",
        url: "https://api.adoptium.net/v3/binary/latest/25/ga/mac/x64/jre/hotspot/normal/eclipse",
        localPattern: /^OpenJDK25U-.*_x64_mac_/i
      }
    ];
  }

  return [];
}

function isJavaBinaryName(name) {
  if (process.platform === "win32") return /^javaw?\.exe$/i.test(name);
  return name === "java";
}

async function findJavaHome(rootDir) {
  const queue = [rootDir];
  while (queue.length) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    const binDir = path.join(current, "bin");
    try {
      const binEntries = await fs.readdir(binDir, { withFileTypes: true });
      if (binEntries.some((entry) => entry.isFile() && isJavaBinaryName(entry.name))) {
        return current;
      }
    } catch {
      // keep scanning
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push(path.join(current, entry.name));
      }
    }
  }
  return null;
}

async function copyJavaHome(javaHome, channel) {
  const dest = path.join(DEST_BUNDLED_RUNTIME, channel);
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(javaHome, dest, { recursive: true });
  console.log(`Included bundled ${channel} runtime from ${javaHome}`);
}

async function tryCopyLocalBundledRuntime(spec) {
  const runtimeRoot = path.join(ROOT, "runtime");
  let entries = [];
  try {
    entries = await fs.readdir(runtimeRoot, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !spec.localPattern.test(entry.name)) continue;
    const javaHome = await findJavaHome(path.join(runtimeRoot, entry.name));
    if (!javaHome) continue;
    await copyJavaHome(javaHome, spec.channel);
    return true;
  }
  return false;
}

async function extractZipBuffer(buffer, dest) {
  const { default: extract } = await import("extract-zip");
  const tmpZip = path.join(RESOURCES_ROOT, `.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);
  await fs.writeFile(tmpZip, buffer);
  try {
    await extract(tmpZip, { dir: dest });
  } finally {
    await fs.rm(tmpZip, { force: true });
  }
}

async function extractTarGzBuffer(buffer, dest) {
  const tar = await import("tar");
  const tmpTgz = path.join(RESOURCES_ROOT, `.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}.tar.gz`);
  await fs.writeFile(tmpTgz, buffer);
  try {
    await tar.x({ file: tmpTgz, cwd: dest, gzip: true });
  } finally {
    await fs.rm(tmpTgz, { force: true });
  }
}

async function downloadAndStageBundledRuntime(spec) {
  console.log(`Downloading bundled ${spec.channel} runtime from ${spec.url}`);
  const response = await fetch(spec.url, {
    headers: { "user-agent": "FishbatteryLauncher/0.5.0" }
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${spec.channel} runtime: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const scratch = path.join(RESOURCES_ROOT, `.runtime-extract-${spec.channel}`);
  await fs.rm(scratch, { recursive: true, force: true });
  await fs.mkdir(scratch, { recursive: true });
  if (spec.archiveKind === "zip") {
    await extractZipBuffer(bytes, scratch);
  } else {
    await extractTarGzBuffer(bytes, scratch);
  }
  const javaHome = await findJavaHome(scratch);
  if (!javaHome) {
    throw new Error(`Downloaded ${spec.channel} runtime did not contain a Java home`);
  }
  await copyJavaHome(javaHome, spec.channel);
  await fs.rm(scratch, { recursive: true, force: true });
}

async function prepareBundledRuntimes() {
  const specs = hostRuntimeMatrix();
  await fs.rm(DEST_BUNDLED_RUNTIME, { recursive: true, force: true });
  await fs.mkdir(DEST_BUNDLED_RUNTIME, { recursive: true });
  for (const spec of specs) {
    const copied = await tryCopyLocalBundledRuntime(spec);
    if (!copied) {
      await downloadAndStageBundledRuntime(spec);
    }
  }
}

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
  const fromEnv = String(process.env.FISHBATTERY_CURSEFORGE_API_KEY || process.env.VITE_CURSEFORGE_API_KEY || "").trim();
  if (fromEnv && !/^placeholder api key$/i.test(fromEnv)) {
    await fs.mkdir(DEST_SECRETS, { recursive: true });
    await fs.writeFile(path.join(DEST_SECRETS, CURSEFORGE_KEY_FILE), `${fromEnv}\n`, "utf8");
    console.log("Included CurseForge key from environment variable.");
    return;
  }

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
  await prepareBundledRuntimes();
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
