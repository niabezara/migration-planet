/**
 * Raw dataset (JSON-file shape, from the database or the bundled fallback)
 * → validated, typed dataset with colours and derived lookups. Pure: the same
 * input always gives the same output. Throws on any broken reference, so an
 * invalid dataset never reaches the globe.
 */
import type {
  ArchaeologicalSite,
  HistoricalMilestone,
  HistoricalPeriod,
  MigrationRoute,
  MigrationRouteData,
  PopulationCluster,
  PopulationClusterData,
  Source,
  Species,
} from "@/types/migration";
import { FALLBACK_SPECIES_COLOR, SPECIES_COLORS } from "@/config/speciesColors";
import { ANCESTRAL_POPULATION_COLOR, FALLBACK_ROUTE_COLOR, ROUTE_COLORS } from "@/config/routeColors";
import { deriveRoles } from "@/engine/population/populationModel";
import { DEFAULT_SPECIES_ID, type RawDataset } from "./db/rawDataset";

export interface Dataset {
  datasetDisclaimer: string;
  routes: MigrationRoute[];
  routeById: Record<string, MigrationRoute>;
  sources: Record<string, Source>;
  periods: HistoricalPeriod[];
  sites: ArchaeologicalSite[];
  siteById: Record<string, ArchaeologicalSite>;
  speciesNote: string;
  species: Species[];
  speciesById: Record<string, Species>;
  routesBySpecies: Record<string, MigrationRoute[]>;
  populationNote: string;
  populations: PopulationCluster[];
  populationById: Record<string, PopulationCluster>;
  populationsByRoute: Record<string, PopulationCluster[]>;
  populationsBySpecies: Record<string, PopulationCluster[]>;
  milestoneNote: string;
  milestones: HistoricalMilestone[];
  milestoneById: Record<string, HistoricalMilestone>;
}

const byId = <T extends { id: string }>(items: T[]): Record<string, T> => Object.fromEntries(items.map((x) => [x.id, x]));

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
    speciesId: raw.speciesId ?? DEFAULT_SPECIES_ID,
    index,
    color: color ?? FALLBACK_ROUTE_COLOR,
    startYear: raw.path[0].year,
    endYear,
  };
}

export function buildDataset(raw: RawDataset): Dataset {
  const routes = raw.migrations.routes.map(normalizeRoute);
  const routeById = byId(routes);
  const sources: Record<string, Source> = byId([...raw.migrations.sources, ...raw.sources.sources]);
  const periods = raw.events.periods;
  /** Sites default to Homo sapiens unless the data says otherwise ([] = maker unknown). */
  const sites = raw.events.sites.map((s) => ({ ...s, speciesIds: s.speciesIds ?? [DEFAULT_SPECIES_ID] }));
  const siteById = byId(sites);

  // Species ---------------------------------------------------------------------
  const species: Species[] = raw.species.species.map((s, index) => {
    if (s.timeRange.older <= s.timeRange.younger) throw new Error(`Species ${s.id}: timeRange.older must be older`);
    for (const id of s.sources) if (!sources[id]) throw new Error(`Species ${s.id}: unknown source ${id}`);
    return { ...s, index, color: SPECIES_COLORS[s.id] ?? FALLBACK_SPECIES_COLOR };
  });
  const speciesById = byId(species);
  for (const r of routes) {
    if (!speciesById[r.speciesId]) throw new Error(`Route ${r.id}: unknown species ${r.speciesId}`);
    for (const id of r.siteIds) if (!siteById[id]) throw new Error(`Route ${r.id}: unknown site ${id}`);
    for (const e of r.evidence) for (const id of e.sourceIds ?? []) if (!sources[id]) throw new Error(`Route ${r.id}: unknown source ${id}`);
  }
  /** Routes per species, in data order. */
  const routesBySpecies = Object.fromEntries(species.map((sp) => [sp.id, routes.filter((r) => r.speciesId === sp.id)]));

  // Population clusters (separate from routes; linked by relatedRouteIds) ----------
  const normalizeCluster = (c: PopulationClusterData, index: number): PopulationCluster => {
    const where = `Population ${c.id}`;
    if (!(c.startYear > c.establishedYear)) throw new Error(`${where}: startYear must be older than establishedYear`);
    if (c.endYear !== undefined && !(c.endYear < c.establishedYear)) throw new Error(`${where}: endYear must be younger than establishedYear`);
    if (c.lobes.length === 0) throw new Error(`${where}: needs at least one lobe`);
    if (c.visualDensity <= 0 || c.visualDensity > 1) throw new Error(`${where}: visualDensity must be in (0, 1]`);
    for (const id of c.relatedRouteIds) if (!routeById[id]) throw new Error(`${where}: unknown route ${id}`);
    for (const id of c.siteIds) if (!siteById[id]) throw new Error(`${where}: unknown site ${id}`);
    const sp = speciesById[c.speciesId];
    if (!sp) throw new Error(`${where}: unknown species ${c.speciesId}`);
    const color =
      c.colorFrom === "ancestral" ? ANCESTRAL_POPULATION_COLOR : c.colorFrom === "species" ? sp.color : routeById[c.colorFrom]?.color;
    if (!color) throw new Error(`${where}: colorFrom must be "ancestral", "species" or a route id`);
    return { ...c, index, color, ...deriveRoles(c, routes) };
  };
  const populations = raw.populations.clusters.map(normalizeCluster);
  /** Clusters linked to each route (source and/or destination), for the info panel. */
  const populationsByRoute = Object.fromEntries(routes.map((r) => [r.id, populations.filter((c) => c.relatedRouteIds.includes(r.id))]));

  for (const sp of species) for (const id of sp.siteIds) if (!siteById[id]) throw new Error(`Species ${sp.id}: unknown site ${id}`);
  for (const site of sites) {
    for (const id of site.sources) if (!sources[id]) throw new Error(`Site ${site.id}: unknown source ${id}`);
    for (const id of site.speciesIds) if (!speciesById[id]) throw new Error(`Site ${site.id}: unknown species ${id}`);
  }
  const populationsBySpecies = Object.fromEntries(species.map((sp) => [sp.id, populations.filter((c) => c.speciesId === sp.id)]));

  // Historical milestones (independent of routes) ------------------------------------
  const milestones = raw.milestones.milestones
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

  return {
    datasetDisclaimer: raw.migrations.disclaimer,
    routes,
    routeById,
    sources,
    periods,
    sites,
    siteById,
    speciesNote: raw.species.note,
    species,
    speciesById,
    routesBySpecies,
    populationNote: raw.populations.note,
    populations,
    populationById: byId(populations),
    populationsByRoute,
    populationsBySpecies,
    milestoneNote: raw.milestones.note,
    milestones,
    milestoneById: byId(milestones),
  };
}
