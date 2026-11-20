/** Shared by the discovery Edge Function (Deno) and the Node tests: web APIs only. */

export interface ResearchSource {
  id: string;
  name: string;
  source_type: "rss" | "api" | "curated";
  feed_url: string | null;
  api_endpoint: string | null;
  is_active: boolean;
  check_frequency: string; // Postgres interval text, e.g. "3 days"
  last_checked_at: string | null;
  configuration: Record<string, unknown>;
}

/** A publication as found in a feed or API, before relevance filtering. */
export interface Publication {
  externalId: string | null;
  doi: string | null;
  title: string;
  url: string | null;
  authors: string | null;
  journal: string | null;
  abstract: string | null;
  publicationDate: string | null; // YYYY-MM-DD
  /** true / false when the source says so (journal vs repository); null = unknown. */
  isPeerReviewed: boolean | null;
  /** Small, source-specific facts worth keeping (article type, OpenAlex id, …). */
  metadata: Record<string, unknown>;
}

/** What gets stored in research_updates. */
export interface DiscoveredItem extends Publication {
  normalizedUrl: string | null;
  contentHash: string;
  metadata: Record<string, unknown> & { matchedTerms: string[] };
}

export type RunTrigger = "scheduled" | "manual" | "retry";

export interface RunError {
  source?: string;
  message: string;
}

export interface RunResult {
  runId: string;
  status: "succeeded" | "partial" | "failed";
  sourcesChecked: number;
  publicationsDiscovered: number;
  candidatesSeen: number;
  errors: RunError[];
  summary: string;
}

/** Persistence used by the discovery run (Supabase in production, PGlite in tests). */
export interface DiscoveryStore {
  /** null when another run is in progress. */
  startRun(trigger: RunTrigger, retryOf?: string | null): Promise<string | null>;
  finishRun(runId: string, result: Omit<RunResult, "runId" | "candidatesSeen">): Promise<void>;
  activeSources(): Promise<ResearchSource[]>;
  /** true when the item is new, false when it was already known. */
  recordUpdate(sourceId: string, runId: string, item: DiscoveredItem): Promise<boolean>;
  markChecked(sourceId: string): Promise<void>;
}

/** HTTP access, injectable for tests. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
