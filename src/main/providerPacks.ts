export type ExternalProvider = "curseforge" | "technic" | "atlauncher" | "ftb";

export type ProviderPack = {
  id: string;
  provider: ExternalProvider;
  name: string;
  description: string;
  mcVersion: string;
  loader: string;
  tags?: string[];
};

const CATALOG: ProviderPack[] = [
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
  },
  {
    id: "atl-allthemods9",
    provider: "atlauncher",
    name: "All the Mods 9 (ATLauncher)",
    description: "ATLauncher variant of ATM9 with broad mod coverage.",
    mcVersion: "1.20.1",
    loader: "NeoForge",
    tags: ["kitchen sink", "tech", "magic"]
  },
  {
    id: "atl-craftoria",
    provider: "atlauncher",
    name: "Craftoria",
    description: "Modern progression pack focused on smooth performance and balance.",
    mcVersion: "1.20.1",
    loader: "NeoForge",
    tags: ["progression", "balanced"]
  },
  {
    id: "atl-vaulthunters",
    provider: "atlauncher",
    name: "Vault Hunters (ATLauncher)",
    description: "Loot and dungeon progression with RPG-style mechanics.",
    mcVersion: "1.18.2",
    loader: "Forge",
    tags: ["rpg", "dungeons", "loot"]
  },
  {
    id: "ftb-direwolf20",
    provider: "ftb",
    name: "FTB Direwolf20",
    description: "Popular FTB kitchen-sink pack with tutorial-friendly progression.",
    mcVersion: "1.20.1",
    loader: "NeoForge",
    tags: ["kitchen sink", "tech", "guide"]
  },
  {
    id: "ftb-skies",
    provider: "ftb",
    name: "FTB Skies",
    description: "Skyblock-focused FTB pack with modern progression paths.",
    mcVersion: "1.19.2",
    loader: "Forge",
    tags: ["skyblock", "progression"]
  },
  {
    id: "ftb-genesis",
    provider: "ftb",
    name: "FTB Genesis",
    description: "Exploration-first FTB pack with curated performance profile.",
    mcVersion: "1.20.1",
    loader: "NeoForge",
    tags: ["exploration", "adventure"]
  }
];

export function searchProviderPacks(provider: ExternalProvider, query: string, limit = 24) {
  const q = String(query || "").trim().toLowerCase();
  const source = CATALOG.filter((x) => x.provider === provider);

  let filtered = source;
  if (q) {
    filtered = source.filter((x) => {
      const hay = `${x.name} ${x.description} ${(x.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }

  return {
    hits: filtered.slice(0, Math.max(1, Math.min(60, limit)))
  };
}
