/**
 * Content tables → raw dataset (the JSON file shapes). The inverse of
 * toSeedSql: optional fields are omitted when empty, and the loader defaults
 * (Homo sapiens for routes and sites) are folded back, so an unchanged
 * database exports exactly the authored files.
 */
import type {
  ArchaeologicalSite,
  EvidenceItem,
  HistoricalMilestone,
  HistoricalPeriod,
  MigrationRouteData,
  PopulationClusterData,
  Source,
  SpeciesData,
} from "@/types/migration";
import { DEFAULT_SPECIES_ID, NOTE_KEYS, type RawDataset } from "./rawDataset";

/** Runs a read-only SQL query and returns its rows (PGlite, postgres.js, …). */
export type Query = <T = Record<string, unknown>>(sql: string) => Promise<T[]>;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Content tables read by the export, with the column order that reproduces the authored order. */
export const CONTENT_TABLE_ORDER = {
  dataset_notes: ["key"],
  sources: ["legacy_file", "sort_order"],
  species: ["sort_order"],
  species_sources: ["species_id", "position"],
  species_sites: ["species_id", "position"],
  archaeological_sites: ["sort_order"],
  site_species: ["site_id", "position"],
  site_sources: ["site_id", "position"],
  historical_periods: ["sort_order"],
  migration_routes: ["sort_order"],
  route_evidence: ["route_id", "position"],
  route_evidence_sources: ["evidence_id", "position"],
  route_sites: ["route_id", "position"],
  population_clusters: ["sort_order"],
  cluster_routes: ["cluster_id", "position"],
  cluster_sites: ["cluster_id", "position"],
  milestones: ["sort_order"],
  milestone_species: ["milestone_id", "position"],
  milestone_routes: ["milestone_id", "position"],
  milestone_sites: ["milestone_id", "position"],
  milestone_sources: ["milestone_id", "position"],
} as const;
export type ContentTable = keyof typeof CONTENT_TABLE_ORDER;

/** Returns every row of a content table, ordered by `orderBy`. */
export type TableReader = (table: ContentTable, orderBy: readonly string[]) => Promise<Row[]>;

/** Table reader over plain SQL (PGlite in tests, direct connections in scripts). */
export const sqlTableReader =
  (query: Query): TableReader =>
  (table, orderBy) =>
    query<Row>(`select * from public.${table} order by ${orderBy.join(", ")}`);

/** owner id → ordered linked ids. Rows arrive ordered by owner, position. */
function linkMap(rows: Row[], owner: string, target: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r[owner], [...(map.get(r[owner]) ?? []), r[target]]);
  return map;
}

/** Postgres returns JSONB as parsed values in most drivers, but some return text. */
const json = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);
/** Assigns only defined values, so omitted optionals stay absent. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export async function exportDataset(read: TableReader): Promise<RawDataset> {
  // All tables in parallel: over HTTP this is one round trip of latency, not twenty.
  const tables = Object.keys(CONTENT_TABLE_ORDER) as ContentTable[];
  const loaded = await Promise.all(tables.map((t) => read(t, CONTENT_TABLE_ORDER[t])));
  const rows = Object.fromEntries(tables.map((t, i) => [t, loaded[i]])) as Record<ContentTable, Row[]>;

  const notes = Object.fromEntries(rows.dataset_notes.map((r) => [r.key, r.body]));

  const sourceRows = rows.sources;
  const toSource = (r: Row): Source => compact({ id: r.id, citation: r.citation, url: opt(r.url) });

  const speciesSources = linkMap(rows.species_sources, "species_id", "source_id");
  const speciesSites = linkMap(rows.species_sites, "species_id", "site_id");
  const species: SpeciesData[] = rows.species.map((r) => ({
    id: r.id,
    name: r.name,
    scientificName: r.scientific_name,
    genus: r.genus,
    group: r.species_group,
    classification: r.classification,
    taxonomyNote: r.taxonomy_note,
    timeRange: { older: r.older_bp, younger: r.younger_bp },
    timeNote: r.time_note,
    distribution: r.distribution,
    physical: r.physical,
    technology: r.technology,
    relationships: r.relationships,
    siteIds: speciesSites.get(r.id) ?? [],
    confidence: r.confidence,
    sources: speciesSources.get(r.id) ?? [],
    camera: json(r.camera),
    focusYear: r.focus_year,
  }));

  const siteSpecies = linkMap(rows.site_species, "site_id", "species_id");
  const siteSources = linkMap(rows.site_sources, "site_id", "source_id");
  const sites: ArchaeologicalSite[] = rows.archaeological_sites.map((r) => {
    const sp = siteSpecies.get(r.id) ?? [];
    const isDefault = sp.length === 1 && sp[0] === DEFAULT_SPECIES_ID;
    return compact({
      id: r.id,
      name: r.name,
      region: r.region,
      location: { lat: r.lat, lng: r.lng },
      dateRange: [r.older_bp, r.younger_bp] as [number, number],
      description: r.description,
      confidence: r.confidence,
      sources: siteSources.get(r.id) ?? [],
      speciesIds: isDefault ? undefined : sp,
      details: opt(r.details),
    });
  });

  const periods: HistoricalPeriod[] = rows.historical_periods.map((r) =>
    compact({
      id: r.id,
      name: r.name,
      shortName: opt(r.short_name),
      startYear: r.start_bp,
      endYear: r.end_bp,
      description: r.description,
      confidence: r.confidence,
    }),
  );

  const evidenceSources = linkMap(rows.route_evidence_sources, "evidence_id", "source_id");
  const evidence = new Map<string, EvidenceItem[]>();
  for (const r of rows.route_evidence) {
    const item: EvidenceItem = { type: r.type, description: r.description, sourceIds: evidenceSources.get(r.id) ?? [] };
    evidence.set(r.route_id, [...(evidence.get(r.route_id) ?? []), item]);
  }
  const routeSites = linkMap(rows.route_sites, "route_id", "site_id");
  const routes: MigrationRouteData[] = rows.migration_routes.map((r) =>
    compact({
      id: r.id,
      speciesId: r.species_id === DEFAULT_SPECIES_ID ? undefined : r.species_id,
      name: r.name,
      category: r.category,
      path: json(r.path),
      branches: r.branches === null ? undefined : json(r.branches),
      particleConfig: json(r.particle_config),
      confidence: r.confidence,
      dataStatus: r.data_status,
      uncertainty: r.uncertainty,
      origin: r.origin,
      destination: r.destination,
      intermediateRegions: r.intermediate_regions,
      pathDescription: r.path_description,
      description: r.description,
      people: r.people,
      historicalContext: r.historical_context,
      significance: r.significance,
      evidence: evidence.get(r.id) ?? [],
      siteIds: routeSites.get(r.id) ?? [],
      camera: json(r.camera),
    }),
  );

  const clusterRoutes = linkMap(rows.cluster_routes, "cluster_id", "route_id");
  const clusterSites = linkMap(rows.cluster_sites, "cluster_id", "site_id");
  const clusters: PopulationClusterData[] = rows.population_clusters.map((r) =>
    compact({
      id: r.id,
      speciesId: r.species_id,
      region: r.region,
      coordinates: { lat: r.lat, lng: r.lng },
      lobes: json(r.lobes),
      startYear: r.start_bp,
      establishedYear: r.established_bp,
      endYear: opt(r.end_bp),
      fadeYears: opt(r.fade_years),
      growthOrigin: r.growth_origin === null ? undefined : json(r.growth_origin),
      colorFrom: r.color_from,
      visualDensity: r.visual_density,
      confidence: r.confidence,
      attestedYear: opt(r.attested_bp),
      basisNote: r.basis_note,
      relatedRouteIds: clusterRoutes.get(r.id) ?? [],
      siteIds: clusterSites.get(r.id) ?? [],
      landOnly: opt(r.land_only),
    }),
  );

  const msSpecies = linkMap(rows.milestone_species, "milestone_id", "species_id");
  const msRoutes = linkMap(rows.milestone_routes, "milestone_id", "route_id");
  const msSites = linkMap(rows.milestone_sites, "milestone_id", "site_id");
  const msSources = linkMap(rows.milestone_sources, "milestone_id", "source_id");
  const nonEmpty = (a: string[] | undefined) => (a && a.length ? a : undefined);
  const milestones: HistoricalMilestone[] = rows.milestones.filter((r) => r.is_published !== false).map((r) =>
    compact({
      id: r.id,
      title: r.title,
      category: r.category,
      approximateStartYear: r.approximate_start_bp,
      approximateEndYear: opt(r.approximate_end_bp),
      dateLabel: r.date_label,
      geographicLocation: compact({ lat: r.lat, lng: r.lng, label: r.location_label, approximate: opt(r.location_approximate) }),
      relatedSpeciesIds: msSpecies.get(r.id) ?? [],
      relatedRouteIds: nonEmpty(msRoutes.get(r.id)),
      relatedSiteIds: nonEmpty(msSites.get(r.id)),
      shortDescription: r.short_description,
      detailedDescription: r.detailed_description,
      evidence: r.evidence,
      originNote: r.origin_note,
      significance: r.significance,
      evidenceType: r.evidence_type,
      confidence: r.confidence,
      sources: msSources.get(r.id) ?? [],
      visualIcon: r.visual_icon,
      animationType: r.animation_type,
    }),
  );

  return {
    species: { note: notes[NOTE_KEYS.species], species },
    migrations: {
      disclaimer: notes[NOTE_KEYS.migrations],
      sources: sourceRows.filter((r) => r.legacy_file === "migrations").map(toSource),
      routes,
    },
    events: { periods, sites },
    populations: { note: notes[NOTE_KEYS.populations], clusters },
    milestones: { note: notes[NOTE_KEYS.milestones], milestones },
    sources: { note: notes[NOTE_KEYS.sources], sources: sourceRows.filter((r) => r.legacy_file === "sources").map(toSource) },
  };
}
