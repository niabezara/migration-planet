/**
 * Typed access to the JSON datasets. JSON stays the editable source of truth;
 * this module is the only place that casts it to domain types and the only
 * place colours are attached to routes (from src/config/routeColors.ts).
 */
import type {
  ArchaeologicalSite,
  HistoricalMilestone,
  HistoricalPeriod,
  MigrationDataset,
  MigrationRoute,
  MigrationRouteData,
  PopulationCluster,
  PopulationClusterData,
  PopulationDataset,
  Source,
  Species,
  SpeciesData,
} from "@/types/migration";
import { FALLBACK_SPECIES_COLOR, SPECIES_COLORS } from "@/config/speciesColors";
import { ANCESTRAL_POPULATION_COLOR, FALLBACK_ROUTE_COLOR, ROUTE_COLORS } from "@/config/routeColors";
import { deriveRoles } from "@/engine/population/populationModel";
import migrations from "./migrations.json";
import events from "./events.json";
import populationData from "./populations.json";
import speciesData from "./species.json";
import extraSources from "./sources.json";
import milestoneData from "./milestones.json";

const dataset = migrations as MigrationDataset;

function normalizeRoute(raw: MigrationRouteData, index: number): MigrationRoute {
  if (raw.path.length < 2) throw new Error(`Route ${raw.id}: path needs at least two waypoints`);
  for (let i = 1; i < raw.path.length; i++) {
    if (raw.path[i].year > raw.path[i - 1].year) {
      throw new Error(`Route ${raw.id}: waypoint years must not increase (years before present)`);
    }
  }
  const endYear = raw.path[raw.path.length - 1].year;
  for (const b of raw.branches ?? []) {
    const fork = raw.path[b.fromWaypoint];
    if (!fork || b.fromWaypoint >= raw.path.length - 1) throw new Error(`Route ${raw.id}/${b.id}: invalid fromWaypoint`);
    const years = [fork.year, ...b.path.map((w) => w.year)];
    if (years.some((y, i) => i > 0 && y > years[i - 1])) throw new Error(`Route ${raw.id}/${b.id}: years must not increase`);
    if (years[years.length - 1] !== endYear) throw new Error(`Route ${raw.id}/${b.id}: must end in the route's end year`);
  }
  const color = ROUTE_COLORS[raw.id];
  if (!color && process.env.NODE_ENV !== "production") {
    console.warn(`Route ${raw.id} has no entry in ROUTE_COLORS; using fallback colour.`);
  }
  return {
    ...raw,
    index,
    color: color ?? FALLBACK_ROUTE_COLOR,
    startYear: raw.path[0].year,
    endYear: raw.path[raw.path.length - 1].year,
  };
}

export const datasetDisclaimer = dataset.disclaimer;
export const routes: MigrationRoute[] = dataset.routes.map(normalizeRoute);
export const routeById: Record<string, MigrationRoute> = Object.fromEntries(routes.map((r) => [r.id, r]));
export const sources: Record<string, Source> = Object.fromEntries(
  [...dataset.sources, ...(extraSources.sources as Source[])].map((s) => [s.id, s]),
);
export const periods = events.periods as HistoricalPeriod[];
/** Sites default to Homo sapiens unless the data says otherwise ([] = maker unknown). */
export const sites = (events.sites as unknown as ArchaeologicalSite[]).map((s) => ({
  ...s,
  speciesIds: s.speciesIds ?? ["homo-sapiens"],
}));
export const siteById: Record<string, ArchaeologicalSite> = Object.fromEntries(sites.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
// Species

export const speciesNote = speciesData.note;
export const species: Species[] = (speciesData.species as SpeciesData[]).map((raw, index) => {
  if (raw.timeRange.older <= raw.timeRange.younger) throw new Error(`Species ${raw.id}: timeRange.older must be older`);
  for (const id of raw.sources) if (!sources[id]) throw new Error(`Species ${raw.id}: unknown source ${id}`);
  return { ...raw, index, color: SPECIES_COLORS[raw.id] ?? FALLBACK_SPECIES_COLOR };
});
export const speciesById: Record<string, Species> = Object.fromEntries(species.map((s) => [s.id, s]));
/** Every migration route in the dataset is a Homo sapiens dispersal. */
export const ROUTE_SPECIES_ID = "homo-sapiens";

// ---------------------------------------------------------------------------
// Population clusters (separate from routes; linked by relatedRouteIds)

const populationDataset = populationData as PopulationDataset;

function normalizeCluster(raw: PopulationClusterData, index: number): PopulationCluster {
  const where = `Population ${raw.id}`;
  if (!(raw.startYear > raw.establishedYear)) throw new Error(`${where}: startYear must be older than establishedYear`);
  if (raw.endYear !== undefined && !(raw.endYear < raw.establishedYear)) {
    throw new Error(`${where}: endYear must be younger than establishedYear`);
  }
  if (raw.lobes.length === 0) throw new Error(`${where}: needs at least one lobe`);
  if (raw.visualDensity <= 0 || raw.visualDensity > 1) throw new Error(`${where}: visualDensity must be in (0, 1]`);
  for (const id of raw.relatedRouteIds) if (!routeById[id]) throw new Error(`${where}: unknown route ${id}`);
  for (const id of raw.siteIds) if (!siteById[id]) throw new Error(`${where}: unknown site ${id}`);
  const sp = speciesById[raw.speciesId];
  if (!sp) throw new Error(`${where}: unknown species ${raw.speciesId}`);
  const color =
    raw.colorFrom === "ancestral"
      ? ANCESTRAL_POPULATION_COLOR
      : raw.colorFrom === "species"
        ? sp.color
        : routeById[raw.colorFrom]?.color;
  if (!color) throw new Error(`${where}: colorFrom must be "ancestral", "species" or a route id`);
  return { ...raw, index, color, ...deriveRoles(raw, routes) };
}

export const populationNote = populationDataset.note;
export const populations: PopulationCluster[] = populationDataset.clusters.map(normalizeCluster);
export const populationById: Record<string, PopulationCluster> = Object.fromEntries(populations.map((c) => [c.id, c]));
/** Clusters linked to each route (source and/or destination), for the info panel. */
export const populationsByRoute: Record<string, PopulationCluster[]> = Object.fromEntries(
  routes.map((r) => [r.id, populations.filter((c) => c.relatedRouteIds.includes(r.id))]),
);

for (const sp of species) for (const id of sp.siteIds) if (!siteById[id]) throw new Error(`Species ${sp.id}: unknown site ${id}`);
for (const site of sites) {
  for (const id of site.sources) if (!sources[id]) throw new Error(`Site ${site.id}: unknown source ${id}`);
  for (const id of site.speciesIds) if (!speciesById[id]) throw new Error(`Site ${site.id}: unknown species ${id}`);
}
/** Population clusters per species. */
export const populationsBySpecies: Record<string, PopulationCluster[]> = Object.fromEntries(
  species.map((sp) => [sp.id, populations.filter((c) => c.speciesId === sp.id)]),
);

// ---------------------------------------------------------------------------
// Historical milestones (independent of routes)

export const milestoneNote = milestoneData.note;
export const milestones: HistoricalMilestone[] = (milestoneData.milestones as HistoricalMilestone[])
  .map((m) => {
    const where = `Milestone ${m.id}`;
    if (m.approximateEndYear !== undefined && m.approximateEndYear > m.approximateStartYear) {
      throw new Error(`${where}: approximateEndYear must be younger`);
    }
    for (const id of m.relatedSpeciesIds) if (!speciesById[id]) throw new Error(`${where}: unknown species ${id}`);
    for (const id of m.relatedRouteIds ?? []) if (!routeById[id]) throw new Error(`${where}: unknown route ${id}`);
    for (const id of m.relatedSiteIds ?? []) if (!siteById[id]) throw new Error(`${where}: unknown site ${id}`);
    for (const id of m.sources) if (!sources[id]) throw new Error(`${where}: unknown source ${id}`);
    return m;
  })
  .sort((a, b) => b.approximateStartYear - a.approximateStartYear);
export const milestoneById: Record<string, HistoricalMilestone> = Object.fromEntries(milestones.map((m) => [m.id, m]));
