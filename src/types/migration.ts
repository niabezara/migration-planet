/**
 * Domain types for the migration visualisation.
 *
 * TIME CONVENTION: every year is expressed as "years before present"
 * (positive number: 300_000 = 300,000 years ago, 0 = present).
 * Larger numbers are older, so `startYear >= endYear`.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** How strongly the claim behind a record is supported. */
export type Confidence = "high" | "medium" | "low";

/** Whether geometry/timing is evidence-derived or a visual placeholder. */
export type DataStatus = "evidence-based" | "illustrative";

export interface Source {
  id: string;
  citation: string;
  url?: string;
}

export interface CameraFocus {
  lat: number;
  lng: number;
  /** Camera distance from globe centre, in globe radii. */
  distance: number;
}

export interface ArchaeologicalSite {
  id: string;
  name: string;
  region: string;
  location: LatLng;
  /** [older, younger] bound of the published date range, years before present. */
  dateRange: [number, number];
  description: string;
  confidence: Confidence;
  sources: string[];
  /** Species whose remains or material culture the site is attributed to (default: Homo sapiens). */
  speciesIds?: string[];
  /** Longer text for the site panel. */
  details?: string;
}

export interface HistoricalPeriod {
  id: string;
  name: string;
  /** Compact label for the timeline. */
  shortName?: string;
  startYear: number;
  endYear: number;
  description: string;
  confidence: Confidence;
}

/**
 * A point the wave front passes, with the (approximate) year it gets there.
 * Years set the *pacing* along the route; individual groups are staggered
 * around it by the particle configuration.
 */
export interface RouteWaypoint {
  lat: number;
  lng: number;
  year: number;
  name?: string;
}

export interface ParticleConfig {
  /** Nominal particle count (scaled by the adaptive quality factor). */
  count: number;
  /** Number of travelling groups. */
  clusterCount: number;
  /** Half-width of the travelling corridor, km (1 sigma of the dense core). */
  spreadKm: number;
  /** Fraction of particles in the sparse outer fringe of the corridor (0..1). */
  edgeShare: number;
  /** Along-track length of each travelling group, km [min, max]. */
  groupLengthKm: [number, number];
  /** Scatter of the starting groups around the origin, km. */
  originSpreadKm: number;
  /** Individual speed variation (0.08 = ±8%, 1 sigma). */
  speedVariation: number;
  /** Fraction of the route window between the first and last group departing. */
  stagger: number;
  /** Groups divide into this many sub-groups as they travel (1 = no split). */
  splitGroups: number;
  /** Route progress (0..1) at which splitting starts. */
  splitAt: number;
  /** 1-sigma spread of the arrival area, km. */
  dispersalKm: { north: number; east: number };
}

/**
 * An alternative path that part of the population follows from a waypoint of
 * the main route. Use only where the literature discusses the alternative.
 * The last waypoint's year must equal the route's end year.
 */
export interface RouteBranch {
  id: string;
  name: string;
  /** Index of the main-path waypoint where the branch leaves. */
  fromWaypoint: number;
  /** Waypoints after the fork. */
  path: RouteWaypoint[];
  /** Fraction of the route's particles that take this branch. */
  share: number;
  note: string;
}

export type EvidenceType = "archaeological" | "fossil" | "genetic" | "palaeoenvironmental" | "chronological";

export interface EvidenceItem {
  type: EvidenceType;
  description: string;
  sourceIds?: string[];
}

/** Route as authored in JSON. Colour and time bounds are attached by the loader. */
export interface MigrationRouteData {
  id: string;
  name: string;
  /** Wave / category label, e.g. "Early dispersal". */
  category: string;
  path: RouteWaypoint[];
  branches?: RouteBranch[];
  particleConfig: ParticleConfig;
  confidence: Confidence;
  /** Status of the drawn path and timing (vs. the underlying claim). */
  dataStatus: DataStatus;
  /** Explicit statement of what is uncertain. */
  uncertainty: string;

  origin: string;
  destination: string;
  intermediateRegions: string[];
  pathDescription: string;

  /** One or two sentence summary. */
  description: string;
  /** Who were these people (no invented ethnic/national identities). */
  people: string;
  /** What was happening during this period. */
  historicalContext: string;
  /** Why it matters. */
  significance: string;

  evidence: EvidenceItem[];
  siteIds: string[];
  camera: CameraFocus;
}

export interface MigrationRoute extends MigrationRouteData {
  /** From the central palette (src/config/routeColors.ts). */
  color: string;
  /** Derived: year of the first waypoint. */
  startYear: number;
  /** Derived: year of the last waypoint. */
  endYear: number;
  /** Stable index used by the GPU (aRoute attribute, uSelected uniform). */
  index: number;
}

export interface MigrationDataset {
  disclaimer: string;
  sources: Source[];
  routes: MigrationRouteData[];
}

// ---------------------------------------------------------------------------
// Population clusters

/**
 * One part of a cluster's footprint: an ellipse on the surface (1 sigma, km).
 * Several lobes give an organic, region-shaped distribution.
 */
export interface PopulationLobe {
  lat: number;
  lng: number;
  radiusKm: { north: number; east: number };
  /** Relative share of the cluster's particles. */
  weight: number;
  name?: string;
}

/**
 * The modelled presence of Homo sapiens in a region over a period of time.
 * Separate from routes: a route moves *some* people; a cluster shows that a
 * population lives in a region, and keeps living there after groups leave.
 *
 * Years follow the global convention (years before present).
 */
export interface PopulationClusterData {
  id: string;
  /** Species this population belongs to (see species.json). */
  speciesId: string;
  /** Display name of the region. */
  region: string;
  /** Representative point (labels, camera). */
  coordinates: LatLng;
  lobes: PopulationLobe[];
  /** Modelled presence begins forming (approximate). */
  startYear: number;
  /** Fully formed by this year (approximate). */
  establishedYear: number;
  /**
   * Modelled presence fades out by this year. Only used where continuity is
   * not supported by evidence; it is not a claim of a known extinction.
   */
  endYear?: number;
  /** Duration of the fade before `endYear`, years. */
  fadeYears?: number;
  /** Formation spreads outward from here (e.g. where a stream arrives). Defaults to `coordinates`. */
  growthOrigin?: LatLng;
  /** A route id (its palette colour), "ancestral", or "species" (the species colour). Resolved to `color` by the loader. */
  colorFrom: string;
  /**
   * Visual weight 0..1: how many particles represent the cluster.
   * NOT a population size; no population counts are modelled.
   */
  visualDensity: number;
  confidence: Confidence;
  /**
   * From this year on (and younger), presence is supported by archaeological
   * or fossil evidence. Before it, or if absent, presence is inferred
   * (from genetic models, route timing or regional continuity).
   */
  attestedYear?: number;
  /** What the presence rests on, in plain words. */
  basisNote: string;
  relatedRouteIds: string[];
  siteIds: string[];
  /** Keep particles on present-day land (default true). */
  landOnly?: boolean;
}

export interface PopulationCluster extends PopulationClusterData {
  color: string;
  /** Stable index used by the GPU (activity uniform). */
  index: number;
  /** Routes whose origin lies within this cluster (derived from geometry). */
  sourceOf: string[];
  /** Routes (or branches) whose arrival area lies within this cluster (derived). */
  destinationOf: string[];
}

export interface PopulationDataset {
  note: string;
  clusters: PopulationClusterData[];
}

// ---------------------------------------------------------------------------
// Species

/** Filter groups: Homo sapiens vs every other hominin. */
export type SpeciesGroup = "sapiens" | "other";

/**
 * A hominin species (or, for Denisovans, a population known mainly from DNA
 * with no formal species name). Taxonomy is explicit: not every hominin
 * belongs to the genus Homo.
 */
export interface SpeciesData {
  id: string;
  /** Common name shown first in the UI. */
  name: string;
  /** Binomial name, or null where none has been formally assigned. */
  scientificName: string | null;
  genus: "Homo" | "Australopithecus" | "Paranthropus";
  group: SpeciesGroup;
  /** Classification path for the panel, e.g. "Hominini · Homo · H. erectus". */
  classification: string;
  /** Debates about naming, attribution or species boundaries. */
  taxonomyNote: string;
  /** Approximate span of the fossil / genetic record, years before present. */
  timeRange: { older: number; younger: number };
  /** How the time range should be read (uncertainty, earliest vs origin). */
  timeNote: string;
  distribution: string;
  physical: string;
  technology: string;
  relationships: string;
  /** Sites with key evidence (site ids). */
  siteIds: string[];
  confidence: Confidence;
  sources: string[];
  camera: CameraFocus;
  /** Year the timeline jumps to when the species is opened outside its range. */
  focusYear: number;
}

export interface Species extends SpeciesData {
  /** From src/config/speciesColors.ts. */
  color: string;
  /** Stable GPU index. */
  index: number;
}

// ---------------------------------------------------------------------------
// Historical milestones

export type MilestoneCategory =
  | "stone-tools"
  | "fire"
  | "hunting-gathering"
  | "symbolic"
  | "language"
  | "clothing"
  | "seafaring"
  | "pottery"
  | "domestication"
  | "agriculture"
  | "wine"
  | "settlement"
  | "metallurgy"
  | "writing";

/** Custom animated icon (components/milestones/MilestoneIcon.tsx). */
export type MilestoneIcon =
  | "stone-tool"
  | "handaxe"
  | "fire"
  | "cooking"
  | "ornament"
  | "spear"
  | "engraving"
  | "cave-art"
  | "voice"
  | "needle"
  | "boat"
  | "pottery"
  | "animal"
  | "herd"
  | "sprout"
  | "wine"
  | "settlement"
  | "metal"
  | "writing";

/** How the icon moves (restrained; disabled under reduced motion). */
export type MilestoneAnimation = "flicker" | "rotate" | "draw" | "grow" | "drift" | "pour" | "glow";

/**
 * A cultural or technological development, dated by its earliest known
 * evidence at a place. Independent of routes: `relatedRouteIds` is set only
 * where the evidence itself connects the two.
 */
export interface HistoricalMilestone {
  id: string;
  title: string;
  category: MilestoneCategory;
  /** Earliest known evidence, approximate (years before present). */
  approximateStartYear: number;
  approximateEndYear?: number;
  /** Human-readable date with its uncertainty, e.g. "~3.3 million years ago". */
  dateLabel: string;
  geographicLocation: LatLng & { label: string; approximate?: boolean };
  /** Species the evidence is attributed to; empty when the maker is unknown. */
  relatedSpeciesIds: string[];
  relatedRouteIds?: string[];
  relatedSiteIds?: string[];
  shortDescription: string;
  detailedDescription: string;
  /** What the evidence actually is. */
  evidence: string;
  /** Earliest known evidence is not the same as the origin: say how they differ. */
  originNote: string;
  significance: string;
  evidenceType: EvidenceType;
  confidence: Confidence;
  sources: string[];
  visualIcon: MilestoneIcon;
  animationType: MilestoneAnimation;
}

export const MILESTONE_CATEGORY_LABEL: Record<MilestoneCategory, string> = {
  "stone-tools": "Stone tools & technology",
  fire: "Fire & cooking",
  "hunting-gathering": "Hunting & gathering",
  symbolic: "Symbolic behaviour & art",
  language: "Language (indirect evidence)",
  clothing: "Clothing & adaptation",
  seafaring: "Seafaring & navigation",
  pottery: "Pottery",
  domestication: "Animal domestication",
  agriculture: "Agriculture",
  wine: "Wine",
  settlement: "Settlements & early cities",
  metallurgy: "Metallurgy",
  writing: "Writing",
};
