/**
 * THE single source of route colours.
 *
 * The data loader attaches these to each route as `route.color`; every
 * consumer (GPU particles, path line, legend, panel, timeline) reads that
 * field. Do not hard-code route colours anywhere else.
 *
 * Chosen for separation on a dark globe: distinct hues, similar perceived
 * brightness, moderate saturation so bloom does not blow them out.
 */
export const ROUTE_COLORS: Record<string, string> = {
  "africa-levant": "#ffb547", // warm amber
  "out-of-africa-south": "#ff6fa8", // rose
  "levant-europe": "#4ea8ff", // electric blue
  "levant-caucasus": "#3fe0b8", // teal
  "sunda-sahul": "#a38cff", // violet
  "beringia-americas": "#ff7b52", // coral
  // Added routes: Homo sapiens (generated hues), then archaic species (tints of the species colour).
  "arabia-interior-early": "#ec7d65",
  "apidima-early-europe": "#65eca4",
  "early-mainland-sea": "#cc65ec",
  "north-eurasia-siberia": "#e4ec65",
  "east-asia-japan": "#65bdec",
  "ryukyu-seafaring": "#ec6596",
  "tibetan-plateau": "#6eec65",
  "north-africa-backflow": "#8365ec",
  "eurasian-backflow-east-africa": "#ecaa65",
  "pastoralist-spread": "#65ecd2",
  "bantu-expansion": "#ec65df",
  "neolithic-danubian": "#b7ec65",
  "neolithic-cardial": "#6590ec",
  "steppe-west": "#ec6568",
  "steppe-east-afanasievo": "#65ec89",
  "steppe-to-south-asia": "#b065ec",
  "magdalenian-recolonisation": "#ecd765",
  "epigravettian-villabruna": "#65d9ec",
  "neolithic-mainland-sea": "#ec65b1",
  "austronesian-near-oceania": "#8aec65",
  "polynesia-remote": "#6765ec",
  "austronesian-madagascar": "#ec8e65",
  "paleo-inuit": "#65ecb6",
  "thule-inuit": "#dd65ec",
  "norse-north-atlantic": "#d3ec65",
  "caribbean-archaic": "#65acec",
  "caribbean-ceramic": "#ec6584",
  "south-america-interior": "#65ec6d",
  "erectus-out-of-africa": "#e56057",
  "erectus-east-asia": "#e78864",
  "erectus-south-asia": "#e59c57",
  "erectus-sundaland": "#e7bf64",
  "erectus-europe": "#e5d857",
  "floresiensis-to-flores": "#e2895b",
  "luzonensis-to-luzon": "#cf886d",
  "neanderthal-levant": "#d1cd6b",
  "neanderthal-central-asia": "#c4d477",
  "neanderthal-altai-first": "#aad16b",
  "neanderthal-altai-second": "#9dd477",
  "denisovan-tibet": "#6cd0b8",
  "denisovan-northeast-asia": "#77d4d1",
  "denisovan-southeast-asia": "#6cbfd0",
  "denisovan-wallacea": "#77b1d4",
};

/** Fallback for routes added to the data without a palette entry. */
export const FALLBACK_ROUTE_COLOR = "#e8e3d8";

/**
 * Long-standing source populations not tied to a single route (e.g. Africa).
 * A pale warm ivory: reads as "people living here", never as a stream.
 */
export const ANCESTRAL_POPULATION_COLOR = "#ffc488";
