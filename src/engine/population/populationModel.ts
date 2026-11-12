/**
 * Population clusters: time-aware presence of populations in regions.
 *
 * Like the routes, everything here is a pure function of `yearsBP`: no state
 * accumulates between frames, so scrubbing forwards or backwards to a year
 * always gives the same result. The vertex shader evaluates the same formulas
 * per particle (see POPULATION_CONSTANTS and populationPresence).
 */
import type { LatLng, MigrationRoute, PopulationCluster, PopulationClusterData } from "@/types/migration";
import { haversineKm } from "@/engine/geo/coordinates";

export const POPULATION_CONSTANTS = {
  /**
   * Each particle appears over this fraction of the formation window. Its
   * start is staggered by its formation rank, so a cluster grows outward from
   * its growth origin instead of popping in.
   */
  particleWindow: 0.15,
  /** A lobe "contains" a point within this many sigmas (role detection). */
  containSigma: 1.8,
  /** Fallback fade duration when a cluster has an endYear but no fadeYears. */
  defaultFadeYears: 8000,
  /** Shader stand-in for "no end": far in the future, exact in float32. */
  noEnd: -1_000_000,
} as const;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Whether `p` falls inside the cluster's footprint. */
export function clusterContains(cluster: PopulationClusterData, p: LatLng): boolean {
  const k = POPULATION_CONSTANTS.containSigma;
  return cluster.lobes.some((lobe) => {
    const north = haversineKm({ lat: lobe.lat, lng: lobe.lng }, { lat: p.lat, lng: lobe.lng }) * Math.sign(p.lat - lobe.lat);
    const east = haversineKm({ lat: p.lat, lng: lobe.lng }, { lat: p.lat, lng: p.lng });
    const d = (north / lobe.radiusKm.north) ** 2 + (east / lobe.radiusKm.east) ** 2;
    return d <= k * k;
  });
}

/** Arrival points of a route: main destination plus any branch ends. */
export function routeArrivals(route: MigrationRoute): LatLng[] {
  return [route.path, ...(route.branches ?? []).map((b) => b.path)].map((w) => w[w.length - 1]);
}

/**
 * Source / destination roles, derived from geometry and limited to the
 * cluster's declared relatedRouteIds (data stays explicit, roles stay honest).
 */
export function deriveRoles(cluster: PopulationClusterData, routes: MigrationRoute[]) {
  const related = routes.filter((r) => cluster.relatedRouteIds.includes(r.id));
  return {
    sourceOf: related.filter((r) => clusterContains(cluster, r.path[0])).map((r) => r.id),
    destinationOf: related.filter((r) => routeArrivals(r).some((a) => clusterContains(cluster, a))).map((r) => r.id),
  };
}

/** Year at which the fade-out starts and ends (shader convention when there is no end). */
export function fadeWindow(c: PopulationClusterData): { fadeStart: number; end: number } {
  if (c.endYear === undefined) return { fadeStart: POPULATION_CONSTANTS.noEnd, end: POPULATION_CONSTANTS.noEnd - 1000 };
  return { fadeStart: c.endYear + (c.fadeYears ?? POPULATION_CONSTANTS.defaultFadeYears), end: c.endYear };
}

/**
 * Visibility of one particle with formation rank `rank` (0 = forms first,
 * 1 = last). Identical to the vertex shader's `presence()`.
 */
export function particlePresence(c: PopulationClusterData, rank: number, yearsBP: number): number {
  const w = POPULATION_CONSTANTS.particleWindow;
  const form = (c.startYear - yearsBP) / Math.max(1, c.startYear - c.establishedYear);
  const lead = rank * (1 - w);
  let a = clamp01((form - lead) / w);
  const { fadeStart, end } = fadeWindow(c);
  const dissolve = (fadeStart - yearsBP) / Math.max(1, fadeStart - end);
  const leadOut = (1 - rank) * (1 - w); // outer particles dissolve first
  a *= 1 - clamp01((dissolve - leadOut) / w);
  return a;
}

export type PopulationStatus = "absent" | "forming" | "established" | "fading" | "ended";

export interface PopulationState {
  cluster: PopulationCluster;
  /** Fraction of the cluster's particles on screen (0..1). */
  presence: number;
  status: PopulationStatus;
  /** Presence at this year is supported by archaeological / fossil evidence. */
  attested: boolean;
}

/**
 * Cluster-level state. `presence` is the mean particle presence for evenly
 * distributed ranks (ranks are assigned by percentile, so this matches the GPU).
 */
export function populationState(cluster: PopulationCluster, yearsBP: number): PopulationState {
  const N = 24;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += particlePresence(cluster, (i + 0.5) / N, yearsBP);
  const presence = sum / N;
  const { fadeStart, end } = fadeWindow(cluster);
  const status: PopulationStatus =
    yearsBP >= cluster.startYear
      ? "absent"
      : yearsBP > cluster.establishedYear
        ? "forming"
        : yearsBP > fadeStart
          ? "established"
          : yearsBP > end
            ? "fading"
            : "ended";
  return {
    cluster,
    presence,
    status: presence < 0.005 && status !== "forming" ? (status === "absent" ? "absent" : "ended") : status,
    attested: cluster.attestedYear !== undefined && yearsBP <= cluster.attestedYear,
  };
}

/**
 * Departure activity of a source cluster (0..1): rises while a related route's
 * groups gather at the origin, decays as the stream leaves. Pure in yearsBP.
 */
export function departureActivity(cluster: PopulationCluster, routes: MigrationRoute[], yearsBP: number): number {
  let act = 0;
  for (const r of routes) {
    if (!cluster.sourceOf.includes(r.id)) continue;
    const p = (r.startYear - yearsBP) / Math.max(1, r.startYear - r.endYear);
    const rise = clamp01((p + 0.07) / 0.07);
    const fall = 1 - clamp01((p - 0.04) / 0.3);
    act = Math.max(act, rise * fall);
  }
  return act;
}
