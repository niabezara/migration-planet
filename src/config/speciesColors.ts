/**
 * THE single source of species colours (UI swatches, timeline spans and the
 * population clusters of archaic species).
 *
 * Homo sapiens populations keep their route / ancestral colours; its swatch
 * is a neutral warm white. Archaic species use muted, earthy hues that stay
 * apart from the bright route palette so they never read as migration streams.
 */
export const SPECIES_COLORS: Record<string, string> = {
  "homo-sapiens": "#f4eee2",
  "homo-neanderthalensis": "#a9c47e", // sage
  denisovans: "#7fb8c4", // slate cyan
  "homo-floresiensis": "#d8c27a", // straw
  "homo-naledi": "#c9a0a0", // dusty rose
  "homo-erectus": "#d69a62", // ochre
  "homo-habilis": "#b9946f", // umber
  "paranthropus-boisei": "#9a9fbe", // slate lavender
  "australopithecus-afarensis": "#bfae95", // sandstone
};

export const FALLBACK_SPECIES_COLOR = "#cfc8bb";
