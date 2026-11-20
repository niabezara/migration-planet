/**
 * JSON schemas for Claude's structured outputs (output_config.format). The
 * API guarantees the shape; everything about content (ids exist, values are
 * plausible, quotes are real) is checked in validate.ts.
 * Supported subset only: no numeric/string constraints, additionalProperties false everywhere.
 */
import { ENTITY_TYPES } from "./entities.ts";

const entityRef = {
  type: "object",
  properties: {
    entity_type: { type: "string", enum: ENTITY_TYPES },
    entity_id: { type: "string" },
  },
  required: ["entity_type", "entity_id"],
  additionalProperties: false,
};

export const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    relevant: { type: "boolean", description: "Does the publication report findings about the subjects this dataset covers?" },
    reason: { type: "string" },
    candidates: { type: "array", items: entityRef, description: "Existing records (from the catalog) the finding could affect. At most 8." },
    may_warrant_new_site: { type: "boolean", description: "True only if it reports an archaeological site absent from the catalog." },
  },
  required: ["relevant", "reason", "candidates", "may_warrant_new_site"],
  additionalProperties: false,
};

export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    finding_summary: { type: "string", description: "What the publication actually found, in 1-3 sentences." },
    evidence_kind: {
      type: "string",
      enum: ["archaeological", "fossil", "genetic", "palaeoenvironmental", "chronological", "interpretation_only", "review_or_commentary"],
    },
    publication_status: { type: "string", enum: ["peer_reviewed_research", "preprint", "news_or_commentary", "unclear"] },
    challenges_existing_interpretation: { type: "boolean" },
    scientific_limitations: { type: "string" },
    competing_interpretations: { type: "string", description: "Competing interpretations the publication mentions or that exist; empty string if none." },
    decision: { type: "string", enum: ["no_change", "propose"] },
    no_change_reason: { type: "string", description: "Why no change is warranted; empty string when proposing." },
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entity_type: { type: "string", enum: ENTITY_TYPES },
          entity_id: { type: "string", description: "Existing id; for create, a new kebab-case id." },
          proposal_type: { type: "string", enum: ["create", "update", "correction", "additional_evidence"] },
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string" },
                value_json: { type: "string", description: "The new value encoded as JSON (a string in quotes, a number, an array)." },
                evidence_quote: { type: "string", description: "Exact passage from the publication text that supports this value." },
              },
              required: ["field", "value_json", "evidence_quote"],
              additionalProperties: false,
            },
          },
          reasoning: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          uncertainty_notes: { type: "string" },
        },
        required: ["entity_type", "entity_id", "proposal_type", "changes", "reasoning", "confidence", "uncertainty_notes"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "finding_summary", "evidence_kind", "publication_status", "challenges_existing_interpretation", "scientific_limitations",
    "competing_interpretations", "decision", "no_change_reason", "proposals",
  ],
  additionalProperties: false,
};
