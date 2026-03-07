import { invoke } from "@tauri-apps/api/core";

type ModrinthSearchHit = {
  project_id: string;
  title: string;
  description?: string;
  icon_url?: string | null;
  latest_version?: string;
};

type ModrinthSearchResponse = {
  hits: ModrinthSearchHit[];
};

type ModrinthVersion = {
  game_versions?: string[];
  loaders?: string[];
};

type ExternalProvider = "curseforge" | "technic" | "atlauncher" | "ftb";

type ProviderPack = {
  id: string;
  provider: ExternalProvider;
  name: string;
  description: string;
  mcVersion: string;
  loader: string;
  iconUrl?: string | null;
  tags?: string[];
};

const FALLBACK_CATALOG: ProviderPack[] = [
  {
    id: "cf-rlcraft",
    provider: "curseforge",
    name: "RLCraft",
    description: "Hardcore survival RPG experience with many mods and progression.",
    mcVersion: "1.12.2",
    loader: "Forge",
    tags: ["survival", "rpg", "hardcore"]
  },
  {
    id: "cf-atm9",
    provider: "curseforge",
    name: "All the Mods 9",
    description: "Large kitchen-sink modpack with tech, magic, and exploration.",
    mcVersion: "1.20.1",
    loader: "NeoForge",
    tags: ["kitchen sink", "tech", "magic"]
  },
  {
    id: "cf-skyfactory4",
    provider: "curseforge",
    name: "SkyFactory 4",
    description: "Skyblock progression with automation and unique resource systems.",
    mcVersion: "1.12.2",
    loader: "Forge",
    tags: ["skyblock", "automation"]
  },
  {
    id: "technic-tekkit2",
    provider: "technic",
    name: "Tekkit 2",
    description: "Classic-style tech progression and automation on the Technic platform.",
    mcVersion: "1.12.2",
    loader: "Forge",
    tags: ["tech", "automation", "classic"]
  },
  {
    id: "technic-hexxit2",
    provider: "technic",
    name: "Hexxit II",
    description: "Adventure and exploration-focused pack with dungeons and loot.",
    mcVersion: "1.12.2",
    loader: "Forge",
    tags: ["adventure", "exploration"]
  },
  {
    id: "technic-blightfall",
    provider: "technic",
    name: "Blightfall",
    description: "Quest-driven survival challenge on a contaminated alien world.",
    mcVersion: "1.7.10",
    loader: "Forge",
    tags: ["quest", "survival"]
  }
];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "FishbatteryLauncher/0.2.1" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function filterByQuery(items: ProviderPack[], query: string) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return items;
  return items.filter((x) => {
    const hay = `${x.name} ${x.description} ${(x.tags || []).join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
}

async function searchATLauncher(query: string, limit: number): Promise<ProviderPack[]> {
  type SimpleResp = { data?: Array<{ name: string; safeName: string }> };
  type PackResp = { data?: { description?: string; versions?: Array<{ minecraft?: string; version?: string }> } };

  const simple = await fetchJson<SimpleResp>("https://api.atlauncher.com/v1/packs/simple");
  const entries = (simple.data || []).slice(0, 120);
  const q = String(query || "").trim().toLowerCase();
  const filtered = q
    ? entries.filter((x) => `${x.name} ${x.safeName}`.toLowerCase().includes(q))
    : entries.slice(0, 24);

  const out: ProviderPack[] = [];
  for (const e of filtered.slice(0, Math.max(1, Math.min(40, limit)))) {
    let mc = "unknown";
    let loader = "varies";
    let description = "ATLauncher pack";
    try {
      const detail = await fetchJson<PackResp>(`https://api.atlauncher.com/v1/pack/${encodeURIComponent(e.safeName)}`);
      description = String(detail?.data?.description || description).replace(/<[^>]+>/g, " ").trim();
      const first = (detail?.data?.versions || [])[0] || null;
      if (first?.minecraft) mc = String(first.minecraft);
      const v = String(first?.version || "").toLowerCase();
      if (v.includes("forge")) loader = "Forge";
      else if (v.includes("fabric")) loader = "Fabric";
      else if (v.includes("neo")) loader = "NeoForge";
    } catch {
      // Keep defaults.
    }

    out.push({
      id: `atl-${e.safeName}`,
      provider: "atlauncher",
      name: e.name,
      description,
      mcVersion: mc,
      loader,
      tags: ["atlauncher"]
    });
  }
  return out.slice(0, limit);
}

async function searchFTB(query: string, limit: number): Promise<ProviderPack[]> {
  type ListResp = { packs?: number[] };
  type DetailResp = {
    id: number;
    name?: string;
    synopsis?: string;
    art?: Array<{ url?: string; type?: string }>;
    versions?: Array<{ targets?: Array<{ name?: string; type?: string; version?: string }> }>;
  };

  const sourceUrl = String(query || "").trim()
    ? "https://api.modpacks.ch/public/modpack/all"
    : "https://api.modpacks.ch/public/modpack/featured/30";

  const list = await fetchJson<ListResp>(sourceUrl);
  const ids = (list.packs || []).slice(0, 80);
  const q = String(query || "").trim().toLowerCase();

  const details: ProviderPack[] = [];
  for (const id of ids) {
    try {
      const d = await fetchJson<DetailResp>(`https://api.modpacks.ch/public/modpack/${id}`);
      const name = String(d.name || `FTB Pack ${id}`);
      const desc = String(d.synopsis || "FTB pack");
      if (q && !`${name} ${desc}`.toLowerCase().includes(q)) continue;

      const firstVersion = (d.versions || [])[0] || null;
      const targets = firstVersion?.targets || [];
      const game = targets.find((t) => t.type === "game" || t.name === "minecraft");
      const modloader = targets.find((t) => t.type === "modloader");
      const icon = (d.art || []).find((a) => a.type === "square")?.url || null;

      details.push({
        id: `ftb-${d.id}`,
        provider: "ftb",
        name,
        description: desc,
        mcVersion: String(game?.version || "unknown"),
        loader: String(modloader?.name || "varies"),
        iconUrl: icon,
        tags: ["ftb"]
      });
      if (details.length >= limit) break;
    } catch {
      // Ignore single-pack failures.
    }
  }
  return details.slice(0, limit);
}

async function searchCurseForge(query: string, limit: number): Promise<ProviderPack[]> {
  const data = (await invoke("provider_packs_search_curseforge", {
    query: String(query || ""),
    limit
  })) as { hits?: ProviderPack[] };
  return Array.isArray(data?.hits) ? data.hits : [];
}

export async function modrinthPacksSearch(query: string, limit = 24) {
  const q = String(query || "").trim();
  const facets = encodeURIComponent('[["project_type:modpack"]]');
  const index = q ? "relevance" : "downloads";
  const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&limit=${Math.max(1, Math.min(50, limit))}&index=${index}&facets=${facets}`;
  const data = await fetchJson<ModrinthSearchResponse>(url);
  const rawHits = data.hits || [];
  const enriched = await Promise.all(
    rawHits.map(async (h) => {
      let mcVersion: string | null = null;
      let loader: string | null = null;
      if (h.latest_version) {
        try {
          const v = await fetchJson<ModrinthVersion>(
            `https://api.modrinth.com/v2/version/${encodeURIComponent(h.latest_version)}`
          );
          mcVersion = Array.isArray(v.game_versions) && v.game_versions.length ? String(v.game_versions[0]) : null;
          loader = Array.isArray(v.loaders) && v.loaders.length ? String(v.loaders[0]) : null;
        } catch {
          // Keep nulls.
        }
      }
      return { h, mcVersion, loader };
    })
  );
  return {
    hits: enriched.map(({ h, mcVersion, loader }) => ({
      projectId: h.project_id,
      title: h.title,
      description: h.description || "",
      iconUrl: h.icon_url || null,
      latestVersionId: h.latest_version || null,
      mcVersion,
      loader
    }))
  };
}

export async function providerPacksSearch(provider: ExternalProvider, query: string, limit = 24) {
  const capped = Math.max(1, Math.min(60, limit));

  if (provider === "curseforge") {
    try {
      const hits = await searchCurseForge(query, capped);
      return { hits };
    } catch {
      return { hits: [] as ProviderPack[] };
    }
  }

  if (provider === "atlauncher") {
    try {
      const hits = await searchATLauncher(query, capped);
      if (hits.length) return { hits };
    } catch {
      // Fall back.
    }
  }

  if (provider === "ftb") {
    try {
      const hits = await searchFTB(query, capped);
      if (hits.length) return { hits };
    } catch {
      // Fall back.
    }
  }

  const fallback = filterByQuery(
    FALLBACK_CATALOG.filter((x) => x.provider === provider),
    query
  ).slice(0, capped);
  return { hits: fallback };
}
