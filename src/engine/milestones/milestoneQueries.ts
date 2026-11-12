/**
 * Which milestones belong in which panel. Explicit links (species, route,
 * site ids) come first; geographic or temporal proximity is offered only as
 * context and labelled as such, never as a causal connection.
 */
import type {
  ArchaeologicalSite,
  HistoricalMilestone,
  HistoricalPeriod,
  MigrationRoute,
  PopulationCluster,
} from "@/types/migration";
import { haversineKm } from "@/engine/geo/coordinates";

export function milestonesForSpecies(all: HistoricalMilestone[], speciesId: string) {
  return all.filter((m) => m.relatedSpeciesIds.includes(speciesId));
}

/** Explicitly related milestones, plus others from the same period (context only). */
export function milestonesForRoute(all: HistoricalMilestone[], route: MigrationRoute) {
  const pad = (route.startYear - route.endYear) * 0.25;
  const items: HistoricalMilestone[] = [];
  const tags: Record<string, string> = {};
  for (const m of all) {
    if (m.relatedRouteIds?.includes(route.id)) {
      items.push(m);
      tags[m.id] = "Related to this route";
    } else if (m.approximateStartYear <= route.startYear + pad && m.approximateStartYear >= route.endYear - pad) {
      items.push(m);
      tags[m.id] = "Same period, not connected";
    }
  }
  return { items, tags };
}

export function milestonesForSite(all: HistoricalMilestone[], site: ArchaeologicalSite) {
  return all.filter(
    (m) =>
      m.relatedSiteIds?.includes(site.id) ||
      (haversineKm(m.geographicLocation, site.location) < 60 &&
        m.approximateStartYear <= site.dateRange[0] * 1.1 &&
        m.approximateStartYear >= site.dateRange[1] * 0.9),
  );
}

/** Milestones in a region while this population is present (species-compatible). */
export function milestonesForPopulation(all: HistoricalMilestone[], c: PopulationCluster) {
  const end = c.endYear ?? 0;
  return all.filter(
    (m) =>
      m.approximateStartYear <= c.startYear &&
      m.approximateStartYear >= end &&
      (m.relatedSpeciesIds.length === 0 || m.relatedSpeciesIds.includes(c.speciesId)) &&
      c.lobes.some((l) => haversineKm(m.geographicLocation, l) < 900),
  );
}

export function milestonesForPeriod(all: HistoricalMilestone[], p: HistoricalPeriod) {
  return all.filter((m) => m.approximateStartYear <= p.startYear && m.approximateStartYear > p.endYear);
}

/** A few milestones either side in time, for the milestone panel's own timeline. */
export function milestonesAround(all: HistoricalMilestone[], m: HistoricalMilestone, each = 2) {
  const i = all.findIndex((x) => x.id === m.id);
  return all.slice(Math.max(0, i - each), i + each + 1);
}
