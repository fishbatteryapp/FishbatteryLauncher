import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export async function installBridgeToMods(modsDir: string, mcVersion: string, loader: string, onLog?: (m: string) => void) {
  const owner = "fishbatteryapp";
  const repo = "fishbattery-cape-bridge";
  const tag = "v1.2.3"; // release we publish (updated)

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
  const headers: any = { "User-Agent": "FishbatteryLauncher/1.0", Accept: "application/vnd.github.v3+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;

  const release = await new Promise<any>((resolve, reject) => {
    const req = https.get(apiUrl, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${body}`));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });

  const assets: any[] = release.assets || [];
  const desired = assets.find(a => {
    const name = String(a.name || "").toLowerCase();
    return name.includes(String(mcVersion).toLowerCase()) && name.includes(String(loader || "fabric").toLowerCase()) && name.endsWith('.jar');
  }) || assets.find(a => String(a.name || "").toLowerCase().includes('fabric') && a.name.endsWith('.jar'));

  if (!desired) throw new Error('No suitable bridge JAR found in release assets');

  fs.mkdirSync(modsDir, { recursive: true });
  const outPath = path.join(modsDir, desired.name);
  const tmpPath = outPath + ".partial";
  onLog?.(`[capes] Downloading bridge asset ${desired.name} to ${outPath}`);

  // Helper: download a URL with simple redirect following (up to maxRedirects)
  async function downloadWithRedirect(url: string, headersObj: any, destPath: string, maxRedirects = 5) {
    return new Promise<void>((resolve, reject) => {
      const req = https.get(url, { headers: headersObj }, (res) => {
        // Handle redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (maxRedirects <= 0) {
            res.resume();
            return reject(new Error('Too many redirects'));
          }
          const loc = String(res.headers.location);
          // Resolve relative redirects against the previous URL
          const nextUrl = loc.startsWith('http') ? loc : new URL(loc, url).toString();
          res.resume();
          return downloadWithRedirect(nextUrl, headersObj, destPath, maxRedirects - 1).then(resolve).catch(reject);
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`Download failed: ${res.statusCode}`));
        }

        const fileStream = fs.createWriteStream(destPath);
        pipeline(res, fileStream)
          .then(() => resolve())
          .catch(reject);
      });

      req.on('error', (err) => reject(err));
    });
  }

  const headers2: any = { "User-Agent": "FishbatteryLauncher/1.0" };
  if (process.env.GITHUB_TOKEN) headers2.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  try {
    await downloadWithRedirect(desired.browser_download_url, headers2, tmpPath, 6);
    // Validate file
    const stat = fs.statSync(tmpPath);
    if (!stat.isFile() || stat.size === 0) {
      try { fs.unlinkSync(tmpPath); } catch (e) {}
      throw new Error('Downloaded bridge JAR is empty');
    }
    fs.renameSync(tmpPath, outPath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (__) {}
    throw err;
  }

  onLog?.(`[capes] Bridge asset installed: ${outPath}`);
}
