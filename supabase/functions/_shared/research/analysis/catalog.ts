/** Compact, deterministic text rendering of the dataset for the system prompt (cacheable). */
import type { Catalog } from "./types.ts";

const yrs = (older: number, younger: number | null) => (younger === null ? `${older} BP` : `${older}–${younger} BP`);

export function renderCatalog(c: Catalog): string {
  const lines: string[] = ["# Current dataset (years before present, BP)", "", "## species (id | name | record span | confidence)"];
  for (const s of c.species) lines.push(`${s.id} | ${s.name} | ${yrs(s.older_bp, s.younger_bp)} | ${s.confidence}`);
  lines.push("", "## archaeological_site (id | name | region | date range | species | confidence)");
  for (const s of c.sites) {
    lines.push(`${s.id} | ${s.name} | ${s.region} | ${yrs(s.older_bp, s.younger_bp)} | ${s.species_ids.join(",") || "maker unknown"} | ${s.confidence}`);
  }
  lines.push("", "## migration_route (id | name | species | span | origin → destination | confidence)");
  for (const r of c.routes) {
    lines.push(`${r.id} | ${r.name} | ${r.species_id} | ${yrs(r.older_bp, r.younger_bp)} | ${r.origin} → ${r.destination} | ${r.confidence}`);
  }
  lines.push("", "## milestone (id | title | category | earliest evidence | species)");
  for (const m of c.milestones) {
    lines.push(`${m.id} | ${m.title} | ${m.category} | ${yrs(m.approximate_start_bp, m.approximate_end_bp)} | ${m.species_ids.join(",") || "maker unknown"}`);
  }
  return lines.join("\n");
}

export function catalogIds(c: Catalog): Record<string, Set<string>> {
  return {
    species: new Set(c.species.map((s) => s.id)),
    archaeological_site: new Set(c.sites.map((s) => s.id)),
    migration_route: new Set(c.routes.map((r) => r.id)),
    milestone: new Set(c.milestones.map((m) => m.id)),
  };
}
