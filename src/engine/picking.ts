/**
 * Analytic picking on the globe (no per-particle raycasting): sites first,
 * then routes, then population regions. Pure functions of data + year + filter.
 */
import { Vector3 } from "three";
import type { ArchaeologicalSite, PopulationCluster, Species } from "@/types/migration";
import { haversineKm, vector3ToLatLng } from "@/engine/geo/coordinates";
import { clusterContains, populationState } from "@/engine/population/populationModel";
import { siteVisible, speciesVisible } from "@/engine/species/speciesModel";
import type { SpeciesFilter, ViewMode } from "@/stores/useHistoryStore";

/** Whether a site marker is on screen at this moment (mirrors SiteMarkers). */
export function siteShown(site: ArchaeologicalSite, mode: ViewMode, yearsBP: number): boolean {
  return mode === "overview" || yearsBP <= site.dateRange[0];
}

export function pickSite(
  sites: ArchaeologicalSite[],
  speciesById: Record<string, Species>,
  point: Vector3,
  toleranceKm: number,
  ctx: { mode: ViewMode; yearsBP: number; filter: SpeciesFilter },
): ArchaeologicalSite | null {
  const p = vector3ToLatLng(point);
  let best: ArchaeologicalSite | null = null;
  let bestKm = toleranceKm;
  for (const s of sites) {
    if (!siteShown(s, ctx.mode, ctx.yearsBP) || !siteVisible(ctx.filter, s, speciesById)) continue;
    const km = haversineKm(p, s.location);
    if (km < bestKm) {
      bestKm = km;
      best = s;
    }
  }
  return best;
}

/** The population region under a point (present at this year and visible under the filter). */
export function pickPopulation(
  clusters: PopulationCluster[],
  speciesById: Record<string, Species>,
  point: Vector3,
  ctx: { mode: ViewMode; yearsBP: number; filter: SpeciesFilter },
): PopulationCluster | null {
  const p = vector3ToLatLng(point);
  let best: PopulationCluster | null = null;
  let bestKm = Infinity;
  for (const c of clusters) {
    const sp = speciesById[c.speciesId];
    if (!sp || !speciesVisible(ctx.filter, sp)) continue;
    if (ctx.mode === "historical" && populationState(c, ctx.yearsBP).presence < 0.25) continue;
    if (!clusterContains(c, p)) continue;
    const km = Math.min(...c.lobes.map((l) => haversineKm(p, l)));
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  return best;
}
