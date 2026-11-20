/**
 * The authored dataset exactly as it lives in the JSON files (before the
 * loader in src/data/index.ts validates it and attaches colours).
 * The database import (toSeedSql) and export (exportDataset) both speak this
 * shape, so a round trip can be compared with the files directly.
 */
import type {
  ArchaeologicalSite,
  HistoricalMilestone,
  HistoricalPeriod,
  MigrationRouteData,
  PopulationClusterData,
  Source,
  SpeciesData,
} from "@/types/migration";

export interface RawDataset {
  species: { note: string; species: SpeciesData[] };
  migrations: { disclaimer: string; sources: Source[]; routes: MigrationRouteData[] };
  events: { periods: HistoricalPeriod[]; sites: ArchaeologicalSite[] };
  populations: { note: string; clusters: PopulationClusterData[] };
  milestones: { note: string; milestones: HistoricalMilestone[] };
  sources: { note: string; sources: Source[] };
}

/** File name (in src/data) of each part of the dataset. */
export const RAW_DATASET_FILES: Record<keyof RawDataset, string> = {
  species: "species.json",
  migrations: "migrations.json",
  events: "events.json",
  populations: "populations.json",
  milestones: "milestones.json",
  sources: "sources.json",
};

/** Default species of routes and sites that do not name one (see src/data/index.ts). */
export const DEFAULT_SPECIES_ID = "homo-sapiens";

/** dataset_notes keys for the top-level notes of each file. */
export const NOTE_KEYS = {
  species: "species.note",
  migrations: "migrations.disclaimer",
  populations: "populations.note",
  milestones: "milestones.note",
  sources: "sources.note",
} as const;

/** Lower-case DOI from a doi.org URL, or null. */
export function doiFromUrl(url: string | undefined): string | null {
  const m = url?.match(/^https?:\/\/(?:dx\.)?doi\.org\/(10\.\S+)$/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}
