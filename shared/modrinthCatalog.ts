export type CatalogMod = {
  id: string;      // internal id
  name: string;
  required?: boolean;
  source: { kind: "modrinth"; projectId: string };
};

/**
 * Edit this list.
 * Project IDs are Modrinth project IDs (not slugs).
 * You can find them on Modrinth project pages or via the Modrinth API.
 */
export const CATALOG: CatalogMod[] = [
  { id: "fabric-api", name: "Fabric API", source: { kind: "modrinth", projectId: "P7dR8mSH" } },
  { id: "sodium", name: "Sodium", source: { kind: "modrinth", projectId: "AANobbMI" } },
  { id: "lithium", name: "Lithium", source: { kind: "modrinth", projectId: "gvQqBUqZ" } },
  { id: "ferrite-core", name: "FerriteCore", source: { kind: "modrinth", projectId: "uXXizFIs" } },
  { id: "indium", name: "Indium", source: { kind: "modrinth", projectId: "Orvt0mRa" } },
  { id: "immediatelyfast", name: "ImmediatelyFast", source: { kind: "modrinth", projectId: "5ZwdcRci" } },
  { id: "entityculling", name: "EntityCulling", source: { kind: "modrinth", projectId: "NNAgCjsB" } },
  { id: "modernfix", name: "ModernFix", source: { kind: "modrinth", projectId: "nmDcB62a" } },
  { id: "noisium", name: "Noisium", source: { kind: "modrinth", projectId: "KuNKN7d2" } },
  { id: "c2me", name: "C2ME", source: { kind: "modrinth", projectId: "VSNURh3q" } },
  { id: "starlight", name: "Starlight", source: { kind: "modrinth", projectId: "H8CaAYZC" } },
  { id: "sodium-extra", name: "Sodium Extra", source: { kind: "modrinth", projectId: "PtjYWJkn" } },
  { id: "reeses-sodium-options", name: "Reese's Sodium Options", source: { kind: "modrinth", projectId: "Bh37bMuy" } },
  { id: "dynamic-fps", name: "Dynamic FPS", source: { kind: "modrinth", projectId: "LQ3K71Q1" } },
  { id: "distanthorizons", name: "Distant Horizons", source: { kind: "modrinth", projectId: "uCdwusMi" } },
  { id: "mod-menu", name: "Mod Menu", required: true, source: { kind: "modrinth", projectId: "mOgUt4GM" } },
  { id: "iris", name: "Iris Shaders", source: { kind: "modrinth", projectId: "YL57xq9U" } },
  { id: "emf", name: "Entity Model Features", source: { kind: "modrinth", projectId: "4I1XuqiY" } },
  { id: "pvp-essentials-refined", name: "PVP essentials Refined", source: { kind: "modrinth", projectId: "DlA1yH1r" } },
  { id: "no-chat-reports", name: "No Chat Reports", source: { kind: "modrinth", projectId: "qQyHxfxd" } },
  { id: "totemcounter", name: "Totem Counter", source: { kind: "modrinth", projectId: "T9R7YTnA" } },
  { id: "potioncounter", name: "Potion Counter", source: { kind: "modrinth", projectId: "JzdjByS4" } },
  { id: "wi-zoom", name: "WI Zoom", source: { kind: "modrinth", projectId: "o7DitHWP" } },
  { id: "zoomify", name: "Zoomify", source: { kind: "modrinth", projectId: "w7ThoJFB" } },
  { id: "better-ping-display-fabric", name: "Better Ping Display [Fabric]", source: { kind: "modrinth", projectId: "MS1ZMyR7" } },
  { id: "health-indicators", name: "Health Indicators", source: { kind: "modrinth", projectId: "htkVd6dQ" } },
  { id: "status-effect-timer", name: "Status Effect Timer", source: { kind: "modrinth", projectId: "T9FDHbY5" } },
  { id: "fast-ip-ping", name: "Fast IP Ping", source: { kind: "modrinth", projectId: "9mtu0sUO" } },
  { id: "betterhurtcam", name: "BetterHurtCam", source: { kind: "modrinth", projectId: "o4y0N2hu" } },
  { id: "moreculling", name: "More Culling", source: { kind: "modrinth", projectId: "51shyZVL" } },
  { id: "rrls", name: "Remove Reloading Screen", source: { kind: "modrinth", projectId: "ZP7xHXtw" } },
  { id: "sodium-dynamic-lights", name: "Sodium Dynamic Lights", source: { kind: "modrinth", projectId: "PxQSWIcD" } },
  { id: "scalablelux", name: "ScalableLux", source: { kind: "modrinth", projectId: "Ps1zyz6x" } },
  { id: "healthindicator", name: "HealthIndicator", source: { kind: "modrinth", projectId: "gVFdvNDw" } },
  { id: "badoptimizations", name: "BadOptimizations", source: { kind: "modrinth", projectId: "g96Z4WVZ" } },
  { id: "fastquit", name: "FastQuit", source: { kind: "modrinth", projectId: "x1hIzbuY" } },
  { id: "better-block-entities", name: "Better Block Entities", source: { kind: "modrinth", projectId: "ONZm0H7Y" } },
  { id: "saturn", name: "Saturn", source: { kind: "modrinth", projectId: "2eT495vq" } },
  { id: "lambdynamiclights", name: "LambDynamicLights", source: { kind: "modrinth", projectId: "yBW8D80W" } },
  { id: "enhanced-block-entities", name: "Enhanced Block Entities", source: { kind: "modrinth", projectId: "OVuFYfre" } },
  { id: "cull-leaves", name: "Cull Leaves", source: { kind: "modrinth", projectId: "GNxdLCoP" } },
  { id: "fastquit-forge", name: "FastQuit-Forge", source: { kind: "modrinth", projectId: "itFaO2Tg" } },
  { id: "polypatcher", name: "PolyPatcher", source: { kind: "modrinth", projectId: "YknNc5nN" } },
  { id: "polysprint", name: "PolySprint", source: { kind: "modrinth", projectId: "i9xRThb3" } },
  { id: "phosphor-legacy-forge", name: "Phosphor Legacy Forge", source: { kind: "modrinth", projectId: "oCBQFmrZ" } },
  { id: "hytils-reborn", name: "Hytils Reborn", source: { kind: "modrinth", projectId: "nF6YaBfO" } },
  { id: "effecttimerplus", name: "Effect Timer Plus", source: { kind: "modrinth", projectId: "JIUF2Wb5" } },
  { id: "rebind-quick-swap", name: "Rebind Quick Swap", source: { kind: "modrinth", projectId: "pNImAg8S" } },
  { id: "shulkerboxtooltip", name: "ShulkerBoxTooltip", source: { kind: "modrinth", projectId: "2M01OLQq" } },
  { id: "etf", name: "Entity Texture Features", source: { kind: "modrinth", projectId: "BVzZfTc1" } },
  { id: "embeddium", name: "Embeddium", source: { kind: "modrinth", projectId: "sk9rgfiA" } },
  { id: "oculus", name: "Oculus", source: { kind: "modrinth", projectId: "GchcoXML" } },
  { id: "canary", name: "Canary", source: { kind: "modrinth", projectId: "qa2H4BS9" } },
  { id: "memoryleakfix", name: "Memory Leak Fix", source: { kind: "modrinth", projectId: "NRjRiSSD" } },
  { id: "clumps", name: "Clumps", source: { kind: "modrinth", projectId: "Wnxd13zP" } },
  { id: "embeddium-extra", name: "Embeddium (Rubidium) Extra", source: { kind: "modrinth", projectId: "oY2B1pjg" } },
  { id: "xaeros-minimap", name: "Xaero's Minimap", source: { kind: "modrinth", projectId: "1bokaNcj" } },
  { id: "xaeros-world-map", name: "Xaero's World Map", source: { kind: "modrinth", projectId: "NcUtCpym" } },
  { id: "appleskin", name: "AppleSkin", source: { kind: "modrinth", projectId: "EsAfCjCV" } },
  { id: "toggle-sprint", name: "Toggle Sprint", source: { kind: "modrinth", projectId: "gQ6IIk5e" } },
  { id: "fps-reducer", name: "FPS Reducer", source: { kind: "modrinth", projectId: "iZ10HXDj" } }
];
