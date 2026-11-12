/**
 * Species-level logic: filter membership and presence in time. Pure
 * functions of the data and the year (no state), like the rest of the engine.
 */
import type { ArchaeologicalSite, Species, SpeciesGroup } from "@/types/migration";
import type { SpeciesFilter } from "@/stores/useHistoryStore";

export const MAX_SPECIES = 16;

export function groupVisible(filter: SpeciesFilter, group: SpeciesGroup): boolean {
  return filter === "all" || filter === group;
}

export function speciesVisible(filter: SpeciesFilter, sp: Pick<Species, "group">): boolean {
  return groupVisible(filter, sp.group);
}

/**
 * Sites are shown for the species their evidence is attributed to. Sites
 * with no attribution (maker unknown) belong to the non-sapiens view.
 */
export function siteVisible(filter: SpeciesFilter, site: ArchaeologicalSite, speciesById: Record<string, Species>): boolean {
  const ids = site.speciesIds ?? [];
  if (ids.length === 0) return filter !== "sapiens";
  return ids.some((id) => speciesById[id] && speciesVisible(filter, speciesById[id]));
}

export type SpeciesStatus = "not-yet" | "present" | "gone";

/** Where `yearsBP` falls relative to the species' known record. */
export function speciesStatus(sp: Species, yearsBP: number): SpeciesStatus {
  if (yearsBP > sp.timeRange.older) return "not-yet";
  if (yearsBP < sp.timeRange.younger) return "gone";
  return "present";
}

/** Species in the record at `yearsBP` (used to show coexistence). */
export function speciesAt(all: Species[], yearsBP: number): Species[] {
  return all.filter((sp) => speciesStatus(sp, yearsBP) === "present");
}

/** Compact range label: "~2.4–1.4 Ma", "~430–40 ka", "~315 ka–present". */
export function formatRange(sp: Pick<Species, "timeRange">): string {
  const f = (y: number) =>
    y >= 1_000_000 ? `${Math.round(y / 100_000) / 10}` : y >= 1000 ? `${Math.round(y / 1000)}` : `${y}`;
  const unit = (y: number) => (y >= 1_000_000 ? " Ma" : y >= 1000 ? " ka" : "");
  const { older, younger } = sp.timeRange;
  if (younger === 0) return `~${f(older)}${unit(older)}–present`;
  const sameUnit = unit(older) === unit(younger);
  return `~${f(older)}${sameUnit ? "" : unit(older)}–${f(younger)}${unit(younger)}`;
}
