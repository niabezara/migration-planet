/**
 * Turns Claude's analysis into proposal rows, or rejects it. Structured
 * outputs guarantee the JSON shape; this checks the content against the
 * integrity rules, in code, because model output is never trusted as a
 * database instruction:
 *
 *  - records exist (or, for a new site, the id is free and well-formed);
 *  - only whitelisted fields, with values of the right type and range;
 *  - every value is backed by a quote that really occurs in the publication;
 *  - date ranges stay ordered after the change;
 *  - preprints never raise confidence; news/commentary never changes anything;
 *  - the only supporting source is the publication itself (no invented citations);
 *  - changes identical to the current value are dropped.
 */
import {
  ADDITIONAL_EVIDENCE_FIELDS,
  CONFIDENCE_LEVELS,
  EDITABLE_FIELDS,
  EVIDENCE_TYPES,
  NEW_SITE_ADMIN_FILLABLE,
  NEW_SITE_FIELDS,
  NEW_SITE_REQUIRED,
  SLUG,
  YEAR_PAIRS,
  type EntityType,
  type FieldKind,
} from "./entities.ts";
import type { AnalysisOutput, DoiVerification, EntityRecord, ModelProposal, ProposalRow, PublicationRow } from "./types.ts";

export interface ValidationContext {
  publication: PublicationRow;
  verification: DoiVerification;
  records: EntityRecord[];
  existingIds: Record<string, Set<string>>;
  model: string;
}

export interface Rejection {
  proposal: number;
  entity: string;
  reason: string;
}

export interface ValidationResult {
  proposals: ProposalRow[];
  rejected: Rejection[];
}

const MAX_PROPOSALS = 5;
const MIN_QUOTE = 12;
const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };
const SCORE: Record<string, number> = { low: 0.3, medium: 0.6, high: 0.85 };

class Reject extends Error {}

/** Lower-case, unified quotes/dashes, collapsed whitespace: quotes survive typographic differences only. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

function parseValue(field: string, kind: FieldKind, json: string, speciesIds: Set<string>): unknown {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    throw new Reject(`${field}: value is not valid JSON`);
  }
  switch (kind) {
    case "text":
      if (typeof v !== "string" || !v.trim() || v.length > 4000) throw new Reject(`${field}: expected non-empty text`);
      return v.trim();
    case "year":
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 10_000_000) throw new Reject(`${field}: expected a whole number of years BP`);
      return v;
    case "confidence":
      if (!CONFIDENCE_LEVELS.includes(v as never)) throw new Reject(`${field}: expected low, medium or high`);
      return v;
    case "evidence_type":
      if (!EVIDENCE_TYPES.includes(v as never)) throw new Reject(`${field}: unknown evidence type`);
      return v;
    case "lat":
    case "lng": {
      const max = kind === "lat" ? 90 : 180;
      if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > max) throw new Reject(`${field}: coordinate out of range`);
      return v;
    }
    case "species_ids":
      if (!Array.isArray(v) || v.some((id) => typeof id !== "string" || !speciesIds.has(id))) throw new Reject(`${field}: unknown species id`);
      return v;
  }
}

function checkYearOrder(type: EntityType, merged: Record<string, unknown>) {
  const pair = YEAR_PAIRS[type];
  if (!pair) return;
  const [olderKey, youngerKey, mode] = pair;
  const older = merged[olderKey];
  const younger = merged[youngerKey];
  if (typeof older !== "number" || typeof younger !== "number") return; // an open end (null) is allowed
  if (mode === "gt" ? !(older > younger) : !(older >= younger)) throw new Reject(`${olderKey} must be older than ${youngerKey}`);
}

function validateOne(p: ModelProposal, out: AnalysisOutput, ctx: ValidationContext, publicationText: string): ProposalRow {
  const preprint = ctx.publication.is_peer_reviewed === false || out.publication_status === "preprint";
  const speciesIds = ctx.existingIds.species;
  const quotes: { field: string; quote: string }[] = [];
  const seen = new Set<string>();

  const parseChanges = (allowed: Record<string, FieldKind>) => {
    const values: Record<string, unknown> = {};
    for (const c of p.changes) {
      const kind = allowed[c.field];
      if (!kind) throw new Reject(`field "${c.field}" may not be changed`);
      if (seen.has(c.field)) throw new Reject(`field "${c.field}" appears twice`);
      seen.add(c.field);
      const quote = c.evidence_quote.trim();
      if (quote.length < MIN_QUOTE || !publicationText.includes(norm(quote))) {
        throw new Reject(`${c.field}: the evidence quote does not occur in the publication`);
      }
      values[c.field] = parseValue(c.field, kind, c.value_json, speciesIds);
      quotes.push({ field: c.field, quote });
    }
    return values;
  };

  const base = {
    entity_type: p.entity_type,
    entity_id: p.entity_id,
    proposal_type: p.proposal_type,
    finding_summary: out.finding_summary,
    reasoning: p.reasoning,
    supporting_sources: [
      {
        kind: "publication",
        research_update_id: ctx.publication.id,
        doi: ctx.publication.doi,
        title: ctx.publication.title,
        journal: ctx.verification.crossrefJournal ?? ctx.publication.journal,
        publication_date: ctx.publication.publication_date,
        url: ctx.publication.doi ? `https://doi.org/${ctx.publication.doi}` : ctx.publication.original_url,
        is_peer_reviewed: !preprint && ctx.publication.is_peer_reviewed !== false ? ctx.publication.is_peer_reviewed : false,
        doi_verified: ctx.verification.status === "verified",
      },
    ],
    // Preprint-based proposals are capped at "low" for triage purposes.
    confidence_score: preprint ? Math.min(SCORE.low, SCORE[p.confidence]) : SCORE[p.confidence],
    uncertainty_notes: [p.uncertainty_notes, preprint ? "Based on a preprint / non-peer-reviewed source." : ""].filter(Boolean).join(" "),
    scientific_limitations: [out.scientific_limitations, out.competing_interpretations && `Competing interpretations: ${out.competing_interpretations}`]
      .filter(Boolean)
      .join("\n"),
    analysis_model: ctx.model,
  };

  // New archaeological site --------------------------------------------------------
  if (p.proposal_type === "create") {
    if (p.entity_type !== "archaeological_site") throw new Reject("only new archaeological sites may be proposed");
    if (!SLUG.test(p.entity_id)) throw new Reject("new id must be kebab-case");
    if (ctx.existingIds.archaeological_site.has(p.entity_id)) throw new Reject("a site with this id already exists");
    const values = parseChanges(NEW_SITE_FIELDS);
    const missing = NEW_SITE_REQUIRED.filter((f) => !(f in values));
    if (missing.length) throw new Reject(`new site lacks ${missing.join(", ")}`);
    if (("lat" in values) !== ("lng" in values)) throw new Reject("give both coordinates or neither");
    checkYearOrder("archaeological_site", values);
    return {
      ...base,
      base_version: null,
      current_data: null,
      proposed_data: { id: p.entity_id, ...values },
      evidence_quotes: quotes,
      requires_admin_input: NEW_SITE_ADMIN_FILLABLE.filter((f) => !(f in values)),
    };
  }

  // Existing record --------------------------------------------------------------
  const record = ctx.records.find((r) => r.ref.entity_type === p.entity_type && r.ref.entity_id === p.entity_id);
  if (!record) throw new Reject("record does not exist");

  if (p.proposal_type === "additional_evidence") {
    const values = parseChanges(ADDITIONAL_EVIDENCE_FIELDS);
    if (!values.evidence_note) throw new Reject("additional evidence needs an evidence_note");
    if (p.entity_type === "migration_route" && !values.evidence_type) throw new Reject("route evidence needs an evidence_type");
    return {
      ...base,
      base_version: record.version,
      current_data: null,
      proposed_data: { add_source: base.supporting_sources[0], ...values },
      evidence_quotes: quotes,
      requires_admin_input: [],
    };
  }

  // update / correction
  const values = parseChanges(EDITABLE_FIELDS[p.entity_type]);
  for (const [field, value] of Object.entries(values)) {
    if (JSON.stringify(record.row[field]) === JSON.stringify(value)) delete values[field]; // no-op
  }
  if (Object.keys(values).length === 0) throw new Reject("no change to the current values");
  if (typeof values.confidence === "string" && CONFIDENCE_RANK[values.confidence] > CONFIDENCE_RANK[String(record.row.confidence)] && preprint) {
    throw new Reject("a preprint cannot raise confidence");
  }
  checkYearOrder(p.entity_type, { ...record.row, ...values });
  return {
    ...base,
    base_version: record.version,
    current_data: Object.fromEntries(Object.keys(values).map((f) => [f, record.row[f] ?? null])),
    proposed_data: values,
    evidence_quotes: quotes.filter((q) => q.field in values),
    requires_admin_input: [],
  };
}

export function validateAnalysis(out: AnalysisOutput, ctx: ValidationContext): ValidationResult {
  if (out.decision !== "propose") return { proposals: [], rejected: [] };
  const rejected: Rejection[] = [];
  if (out.publication_status === "news_or_commentary" || out.evidence_kind === "review_or_commentary") {
    return { proposals: [], rejected: out.proposals.map((p, i) => ({ proposal: i, entity: `${p.entity_type}:${p.entity_id}`, reason: "news, reviews and commentary do not change the dataset" })) };
  }
  if (ctx.verification.status !== "verified") {
    return { proposals: [], rejected: out.proposals.map((p, i) => ({ proposal: i, entity: `${p.entity_type}:${p.entity_id}`, reason: `publication identity not verified (${ctx.verification.status})` })) };
  }
  const publicationText = norm(`${ctx.publication.title}\n${ctx.publication.abstract ?? ""}`);
  const proposals: ProposalRow[] = [];
  out.proposals.forEach((p, i) => {
    const entity = `${p.entity_type}:${p.entity_id}`;
    if (i >= MAX_PROPOSALS) return rejected.push({ proposal: i, entity, reason: `more than ${MAX_PROPOSALS} proposals for one publication` });
    try {
      proposals.push(validateOne(p, out, ctx, publicationText));
    } catch (e) {
      if (!(e instanceof Reject)) throw e;
      rejected.push({ proposal: i, entity, reason: e.message });
    }
  });
  return { proposals, rejected };
}
