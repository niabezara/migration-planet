import type { EntityType } from "./entities.ts";

export interface EntityRef {
  entity_type: EntityType;
  entity_id: string;
}

/** Compact view of the current dataset, given to Claude as context. */
export interface Catalog {
  species: { id: string; name: string; older_bp: number; younger_bp: number; confidence: string }[];
  sites: { id: string; name: string; region: string; older_bp: number; younger_bp: number; confidence: string; species_ids: string[] }[];
  routes: { id: string; name: string; species_id: string; older_bp: number; younger_bp: number; origin: string; destination: string; confidence: string }[];
  milestones: { id: string; title: string; category: string; approximate_start_bp: number; approximate_end_bp: number | null; species_ids: string[] }[];
  /** DOIs of the sources the dataset already cites (lower-case). */
  sourceDois: string[];
}

/** A full current record (table row) with its optimistic-locking version. */
export interface EntityRecord {
  ref: EntityRef;
  version: number;
  row: Record<string, unknown>;
}

/** A discovered publication as stored in research_updates. */
export interface PublicationRow {
  id: string;
  doi: string | null;
  title: string;
  abstract: string | null;
  authors: string | null;
  journal: string | null;
  publication_date: string | null;
  original_url: string | null;
  is_peer_reviewed: boolean | null;
  raw_metadata: Record<string, unknown>;
}

export interface DoiVerification {
  status: "verified" | "mismatch" | "not_found" | "no_doi" | "error";
  crossrefTitle?: string | null;
  crossrefJournal?: string | null;
  crossrefType?: string | null;
  similarity?: number;
  message?: string;
}

// ----- Claude's structured outputs (see schemas.ts) ----------------------------

export interface TriageOutput {
  relevant: boolean;
  reason: string;
  candidates: EntityRef[];
  may_warrant_new_site: boolean;
}

export interface ProposedChange {
  field: string;
  value_json: string;
  evidence_quote: string;
}

export interface ModelProposal {
  entity_type: EntityType;
  entity_id: string;
  proposal_type: "create" | "update" | "correction" | "additional_evidence";
  changes: ProposedChange[];
  reasoning: string;
  confidence: "low" | "medium" | "high";
  uncertainty_notes: string;
}

export interface AnalysisOutput {
  finding_summary: string;
  evidence_kind: "archaeological" | "fossil" | "genetic" | "palaeoenvironmental" | "chronological" | "interpretation_only" | "review_or_commentary";
  publication_status: "peer_reviewed_research" | "preprint" | "news_or_commentary" | "unclear";
  challenges_existing_interpretation: boolean;
  scientific_limitations: string;
  competing_interpretations: string;
  decision: "no_change" | "propose";
  no_change_reason: string;
  proposals: ModelProposal[];
}

/** One row for update_proposals, as complete_research_analysis() expects it. */
export interface ProposalRow {
  entity_type: EntityType;
  entity_id: string;
  proposal_type: ModelProposal["proposal_type"];
  base_version: number | null;
  current_data: Record<string, unknown> | null;
  proposed_data: Record<string, unknown>;
  finding_summary: string;
  reasoning: string;
  supporting_sources: Record<string, unknown>[];
  confidence_score: number;
  uncertainty_notes: string;
  scientific_limitations: string;
  evidence_quotes: { field: string; quote: string }[];
  requires_admin_input: string[];
  analysis_model: string;
}

export interface LlmResult<T> {
  output: T;
  model: string;
  usage: Record<string, unknown>;
}

/** The model behind the analysis; Claude in production, a fake in tests. */
export interface AnalysisLlm {
  triage(system: string, user: string): Promise<LlmResult<TriageOutput>>;
  analyze(system: string, user: string): Promise<LlmResult<AnalysisOutput>>;
}

export interface AnalysisStore {
  claim(limit: number): Promise<PublicationRow[]>;
  loadCatalog(): Promise<Catalog>;
  loadRecords(refs: EntityRef[]): Promise<EntityRecord[]>;
  complete(updateId: string, status: "irrelevant" | "no_change" | "proposed", analysis: Record<string, unknown>, proposals: ProposalRow[]): Promise<void>;
  fail(updateId: string, error: string): Promise<void>;
}
