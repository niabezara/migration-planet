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
};

/** Fallback for routes added to the data without a palette entry. */
export const FALLBACK_ROUTE_COLOR = "#e8e3d8";

/**
 * Long-standing source populations not tied to a single route (e.g. Africa).
 * A pale warm ivory: reads as "people living here", never as a stream.
 */
export const ANCESTRAL_POPULATION_COLOR = "#ffc488";
