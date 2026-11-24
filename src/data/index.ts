/**
 * The current dataset, as module-level bindings for the rest of the app.
 *
 * The data itself is loaded on the server (src/data/server/publicDataset.ts:
 * Supabase, with the JSON files as fallback), validated by buildDataset() and
 * installed here once by <DatasetProvider> before anything renders. ES module
 * exports are live bindings, so every `import { routes } from "@/data"` sees
 * the installed values. Nothing may read these at module load time.
 *
 * Scripts and tests install a dataset themselves (see scripts/useJsonDataset.ts).
 */
import type {
  ArchaeologicalSite,
  HistoricalMilestone,
  HistoricalPeriod,
  MigrationRoute,
  PopulationCluster,
  Source,
  Species,
} from "@/types/migration";
import type { Dataset } from "./buildDataset";

export { buildDataset, type Dataset } from "./buildDataset";

export let datasetDisclaimer = "";
export let routes: MigrationRoute[] = [];
export let routeById: Record<string, MigrationRoute> = {};
export let sources: Record<string, Source> = {};
export let periods: HistoricalPeriod[] = [];
export let sites: ArchaeologicalSite[] = [];
export let siteById: Record<string, ArchaeologicalSite> = {};
export let speciesNote = "";
export let species: Species[] = [];
export let speciesById: Record<string, Species> = {};
/** Routes per species, in data order. */
export let routesBySpecies: Record<string, MigrationRoute[]> = {};
export let populationNote = "";
export let populations: PopulationCluster[] = [];
export let populationById: Record<string, PopulationCluster> = {};
/** Clusters linked to each route (source and/or destination), for the info panel. */
export let populationsByRoute: Record<string, PopulationCluster[]> = {};
/** Population clusters per species. */
export let populationsBySpecies: Record<string, PopulationCluster[]> = {};
export let milestoneNote = "";
export let milestones: HistoricalMilestone[] = [];
export let milestoneById: Record<string, HistoricalMilestone> = {};

let installedVersion: string | null = null;

/** Version string of the installed dataset (null before installation). */
export function datasetVersion(): string | null {
  return installedVersion;
}

/** Installs a validated dataset. Idempotent per version. */
export function installDataset(ds: Dataset, version: string): void {
  if (installedVersion === version) return;
  // Plain assignments, not a destructuring assignment: Turbopack's production
  // build only keeps an export live when it sees it reassigned directly, so a
  // destructured `({ routes } = ds)` left every import frozen at its empty value.
  datasetDisclaimer = ds.datasetDisclaimer;
  routes = ds.routes;
  routeById = ds.routeById;
  sources = ds.sources;
  periods = ds.periods;
  sites = ds.sites;
  siteById = ds.siteById;
  speciesNote = ds.speciesNote;
  species = ds.species;
  speciesById = ds.speciesById;
  routesBySpecies = ds.routesBySpecies;
  populationNote = ds.populationNote;
  populations = ds.populations;
  populationById = ds.populationById;
  populationsByRoute = ds.populationsByRoute;
  populationsBySpecies = ds.populationsBySpecies;
  milestoneNote = ds.milestoneNote;
  milestones = ds.milestones;
  milestoneById = ds.milestoneById;
  installedVersion = version;
}
