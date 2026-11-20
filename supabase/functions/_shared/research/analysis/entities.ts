/**
 * What an analysis may propose to change, in database terms (table columns),
 * so an approved proposal maps directly onto an update (phase 6).
 *
 * Deliberately narrow: route geometry, species identity, links between
 * records, colours and icons are never proposed by the AI; an administrator
 * edits those by hand.
 */

export type EntityType = "species" | "migration_route" | "archaeological_site" | "milestone";
export const ENTITY_TYPES: EntityType[] = ["species", "migration_route", "archaeological_site", "milestone"];

export const ENTITY_TABLE: Record<EntityType, string> = {
  species: "species",
  migration_route: "migration_routes",
  archaeological_site: "archaeological_sites",
  milestone: "milestones",
};

export type FieldKind = "text" | "year" | "confidence" | "lat" | "lng" | "species_ids" | "evidence_type";

/** Fields an update or correction may change, per entity type. */
export const EDITABLE_FIELDS: Record<EntityType, Record<string, FieldKind>> = {
  species: {
    older_bp: "year",
    younger_bp: "year",
    time_note: "text",
    distribution: "text",
    physical: "text",
    technology: "text",
    relationships: "text",
    taxonomy_note: "text",
    confidence: "confidence",
  },
  archaeological_site: {
    older_bp: "year",
    younger_bp: "year",
    description: "text",
    details: "text",
    region: "text",
    confidence: "confidence",
  },
  migration_route: {
    uncertainty: "text",
    description: "text",
    historical_context: "text",
    significance: "text",
    confidence: "confidence",
  },
  milestone: {
    approximate_start_bp: "year",
    approximate_end_bp: "year",
    date_label: "text",
    short_description: "text",
    detailed_description: "text",
    evidence: "text",
    origin_note: "text",
    confidence: "confidence",
  },
};

/** "Additional evidence" proposals attach the publication as a source, with a note. */
export const ADDITIONAL_EVIDENCE_FIELDS: Record<string, FieldKind> = {
  evidence_note: "text",
  evidence_type: "evidence_type",
};

/** New records may only be archaeological sites (other kinds need human design). */
export const NEW_SITE_FIELDS: Record<string, FieldKind> = {
  name: "text",
  region: "text",
  lat: "lat",
  lng: "lng",
  older_bp: "year",
  younger_bp: "year",
  description: "text",
  confidence: "confidence",
  species_ids: "species_ids",
};
export const NEW_SITE_REQUIRED = ["name", "region", "older_bp", "younger_bp", "description", "confidence"];
/** May be missing from a publication's abstract; the administrator then supplies them. */
export const NEW_SITE_ADMIN_FILLABLE = ["lat", "lng"];

/** [older, younger] column pairs: older must be >= younger (strictly > for species). */
export const YEAR_PAIRS: Record<EntityType, [string, string, "gt" | "gte"] | null> = {
  species: ["older_bp", "younger_bp", "gt"],
  archaeological_site: ["older_bp", "younger_bp", "gte"],
  migration_route: null,
  milestone: ["approximate_start_bp", "approximate_end_bp", "gte"],
};

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const EVIDENCE_TYPES = ["archaeological", "fossil", "genetic", "palaeoenvironmental", "chronological"] as const;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Columns that are bookkeeping or rendering detail, not content: never shown to the model. */
const NOT_CONTENT = new Set(["version", "created_at", "updated_at", "sort_order", "particle_config", "camera"]);

/** A table row as the analysis sees it: content columns only, with the row's version kept aside. */
export function toEntityRecord(type: EntityType, row: Record<string, unknown>): { ref: { entity_type: EntityType; entity_id: string }; version: number; row: Record<string, unknown> } {
  return {
    ref: { entity_type: type, entity_id: String(row.id) },
    version: Number(row.version),
    row: Object.fromEntries(Object.entries(row).filter(([k]) => !NOT_CONTENT.has(k))),
  };
}
