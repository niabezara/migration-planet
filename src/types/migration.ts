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

export type EvidenceType = "archaeological" | "genetic" | "palaeoenvironmental" | "chronological";

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
