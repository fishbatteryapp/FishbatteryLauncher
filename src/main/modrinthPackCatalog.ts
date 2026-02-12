export type CatalogPack = {
  id: string; // internal id (used for filenames + state keys)
  name: string;
  kind: "resourcepack" | "shaderpack";
  required?: boolean;
  source: { kind: "modrinth"; projectId: string };
};

/**
 * Recommended packs (downloaded from Modrinth), version-resolved per Minecraft version.
 *
 * Notes:
 * - Resource packs and shader packs on Modrinth typically DO NOT have loaders, so we do not pass a loader filter.
 * - Keep IDs stable once users have instances, because IDs are used for filenames + enable/disable state.
 *
 * To add a pack:
 * 1) Open the pack on Modrinth
 * 2) Copy its Project ID (not slug)
 * 3) Add it here
 */
export const PACK_CATALOG: CatalogPack[] = [
  { id: "fresh-animations", name: "Fresh Animations", kind: "resourcepack", source: { kind: "modrinth", projectId: "50dA9Sha" } },
  { id: "f8thful", name: "F8thful", kind: "resourcepack", source: { kind: "modrinth", projectId: "ZrW0og1b" } },
  { id: "better-leaves", name: "Better Leaves", kind: "resourcepack", source: { kind: "modrinth", projectId: "uvpymuxq" } },
  { id: "fast-better-grass", name: "Fast Better Grass", kind: "resourcepack", source: { kind: "modrinth", projectId: "dspVZXKP" } },
  { id: "dramatic-skys", name: "Dramatic Skys", kind: "resourcepack", source: { kind: "modrinth", projectId: "2YyNMled" } },
  { id: "xalis-enchanted-books", name: "Xali's Enchanted Books", kind: "resourcepack", source: { kind: "modrinth", projectId: "ZpBKASR2" } },
  { id: "complementary-reimagined", name: "Complementary Reimagined", kind: "shaderpack", source: { kind: "modrinth", projectId: "HVnmMxH1" } },
  { id: "complementary-unbound", name: "Complementary Unbound", kind: "shaderpack", source: { kind: "modrinth", projectId: "R6NEzAwj" } },
  { id: "photon-shader", name: "Photon Shader", kind: "shaderpack", source: { kind: "modrinth", projectId: "lLqFfGNs" } }
];
