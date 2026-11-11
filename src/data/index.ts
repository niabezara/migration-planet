/**
 * Typed access to the JSON datasets. JSON stays the editable source of truth;
 * this module is the only place that casts it to domain types and the only
 * place colours are attached to routes (from src/config/routeColors.ts).
 */
import type {
  ArchaeologicalSite,
  HistoricalPeriod,
  MigrationDataset,
  MigrationRoute,
  MigrationRouteData,
  Source,
} from "@/types/migration";
import { FALLBACK_ROUTE_COLOR, ROUTE_COLORS } from "@/config/routeColors";
import migrations from "./migrations.json";
import events from "./events.json";

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
export const sources: Record<string, Source> = Object.fromEntries(dataset.sources.map((s) => [s.id, s]));
export const periods = events.periods as HistoricalPeriod[];
export const sites = events.sites as unknown as ArchaeologicalSite[];
export const siteById: Record<string, ArchaeologicalSite> = Object.fromEntries(sites.map((s) => [s.id, s]));
