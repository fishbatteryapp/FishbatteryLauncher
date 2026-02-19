import fetch from "node-fetch";

export type ModrinthVersion = {
  id: string;
  version_number: string;
  date_published: string;
  game_versions: string[];
  loaders: string[]; // may be empty for packs
  files: Array<{
    url: string;
    filename: string;
    hashes: { sha1?: string; sha512?: string };
    primary: boolean;
  }>;
  dependencies?: Array<{
    version_id?: string | null;
    project_id?: string | null;
    file_name?: string | null;
    dependency_type?: "required" | "optional" | "incompatible" | "embedded" | string;
  }>;
};

export type ModrinthSearchHit = {
  project_id: string;
  slug: string;
  title: string;
  project_type: string;
};

export type ResolveLatestModrinthOpts = {
  projectId: string;
  mcVersion: string;
  /**
   * Mods: pass "fabric"
   * Resourcepacks/Shaderpacks: omit loader
   *
   * Why: packs often have no loader on Modrinth, so filtering by loaders would return 0 results.
   */
  loader?: "fabric";
};

export type ResolvedModrinthFile = {
  versionId: string;
  versionName: string;
  changelog?: string;
  publishedAt?: string;
  fileName: string;
  url: string;
  sha1?: string;
  sha512?: string;
  requiredProjectIds: string[];
} | null;

const UA = "YourLauncher/0.2.0 (local)";

const POPULAR_RELEASE_FALLBACKS = [
  "1.21.4",
  "1.21.3",
  "1.21.1",
  "1.20.6",
  "1.20.4",
  "1.20.1",
  "1.19.4",
  "1.19.2",
  "1.18.2",
  "1.17.1",
  "1.16.5",
  "1.12.2"
] as const;

function parseReleaseTuple(v: string): [number, number, number] | null {
  const m = String(v || "").trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3] ?? "0");
  if (![a, b, c].every((n) => Number.isFinite(n))) return null;
  return [a, b, c];
}

function compareReleaseTuple(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

function buildMcCompatibilityCandidates(mcVersion: string): string[] {
  const raw = String(mcVersion || "").trim();
  if (!raw) return [];
  const out: string[] = [raw];

  // For releases like 1.20.4, include same-line patch fallbacks:
  // 1.20.4 -> 1.20.3 -> 1.20.2 -> 1.20.1 -> 1.20
  const m = raw.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (m) {
    const major = Number(m[1]);
    const minor = Number(m[2]);
    const patch = m[3] != null ? Number(m[3]) : null;
    if (Number.isFinite(major) && Number.isFinite(minor) && patch != null && Number.isFinite(patch)) {
      for (let p = patch - 1; p >= 0; p -= 1) {
        out.push(`${major}.${minor}.${p}`);
      }
      out.push(`${major}.${minor}`);
    }
  }

  // If still unresolved, broaden to popular stable versions at or below target release.
  const targetTuple = parseReleaseTuple(raw);
  if (targetTuple) {
    for (const popular of POPULAR_RELEASE_FALLBACKS) {
      const tuple = parseReleaseTuple(popular);
      if (!tuple) continue;
      if (compareReleaseTuple(tuple, targetTuple) <= 0) out.push(popular);
    }
  } else {
    // For snapshots/unusual tags, use popular releases as final fallback pool.
    out.push(...POPULAR_RELEASE_FALLBACKS);
  }

  return [...new Set(out)];
}

export async function resolveLatestModrinth(
  opts: ResolveLatestModrinthOpts
): Promise<ResolvedModrinthFile> {
  const params = new URLSearchParams();

  // Loader filter remains strict; MC version fallback is handled client-side.
  if (opts.loader) {
    params.set("loaders", JSON.stringify([opts.loader]));
  }

  const url = `https://api.modrinth.com/v2/project/${opts.projectId}/version?${params.toString()}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Modrinth resolve failed: ${res.status}`);

  const versions = (await res.json()) as ModrinthVersion[];
  if (!versions.length) return null;

  const candidates = buildMcCompatibilityCandidates(opts.mcVersion);
  const rank = new Map<string, number>(candidates.map((v, i) => [v, i]));

  // Pick the newest version with the best (lowest index) compatible MC tag.
  const compatible = versions
    .map((v) => {
      const scores = (v.game_versions || [])
        .map((gv) => rank.get(String(gv)))
        .filter((x): x is number => Number.isFinite(x));
      const score = scores.length ? Math.min(...scores) : Number.POSITIVE_INFINITY;
      return { v, score };
    })
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => a.score - b.score || b.v.date_published.localeCompare(a.v.date_published));

  if (!compatible.length) return null;
  const chosen = compatible[0].v;

  // Prefer primary file
  const primary = chosen.files.find((f) => f.primary) ?? chosen.files[0];
  if (!primary) return null;

  return {
    versionId: chosen.id,
    versionName: chosen.version_number,
    changelog: typeof (chosen as any).changelog === "string" ? String((chosen as any).changelog) : "",
    publishedAt: chosen.date_published,
    fileName: primary.filename,
    url: primary.url,
    sha1: primary.hashes.sha1,
    sha512: primary.hashes.sha512,
    requiredProjectIds: (chosen.dependencies ?? [])
      .filter((d) => d?.dependency_type === "required" && !!d?.project_id)
      .map((d) => String(d.project_id))
  };
}

export async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export async function searchModrinthProjects(query: string, loader: "fabric" = "fabric", limit = 8) {
  const q = String(query || "").trim();
  if (!q) return [] as ModrinthSearchHit[];
  const facets = [
    ["project_type:mod"],
    [`categories:${loader}`]
  ];
  const url =
    `https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}` +
    `&limit=${Math.max(1, Math.min(30, Number(limit || 8)))}` +
    `&index=relevance&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Modrinth search failed: ${res.status}`);
  const json = (await res.json()) as { hits?: ModrinthSearchHit[] };
  return Array.isArray(json?.hits) ? json.hits : [];
}
