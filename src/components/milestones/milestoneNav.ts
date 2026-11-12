/**
 * Selecting a milestone moves the experience to it: the timeline jumps to
 * just after its earliest evidence, the camera flies to its location, the
 * species filter widens if its species are hidden, and related populations /
 * routes are emphasised (via selectionFocus).
 */
import type { HistoricalMilestone } from "@/types/migration";
import { speciesById } from "@/data";
import { speciesVisible } from "@/engine/species/speciesModel";
import { useHistoryStore, type SpeciesFilter } from "@/stores/useHistoryStore";
import { animateYearTo } from "@/stores/yearTween";

/** Whether the milestone's earliest evidence exists at `yearsBP` (small tolerance for the jump target). */
export function milestoneReached(m: HistoricalMilestone, yearsBP: number): boolean {
  return yearsBP <= m.approximateStartYear * 1.005;
}

export function milestoneVisible(filter: SpeciesFilter, m: HistoricalMilestone): boolean {
  if (m.relatedSpeciesIds.length === 0) return filter !== "sapiens"; // maker unknown: pre-sapiens contexts
  return m.relatedSpeciesIds.some((id) => speciesById[id] && speciesVisible(filter, speciesById[id]));
}

/** Navigate to a milestone. `openPanel` also switches the panel to its full story. */
export function goToMilestone(m: HistoricalMilestone, { openPanel }: { openPanel: boolean }) {
  const s = useHistoryStore.getState();
  if (!milestoneVisible(s.speciesFilter, m)) s.setSpeciesFilter("all");
  s.pause();
  s.setHighlightMilestone(m.id);
  if (openPanel) s.select({ kind: "milestone", id: m.id });
  // Just after the earliest evidence, so related populations are on screen.
  animateYearTo(Math.max(0, m.approximateStartYear * 0.985), 1.6);
  s.flyTo({ lat: m.geographicLocation.lat, lng: m.geographicLocation.lng, distance: 2.35 }, 2.6);
}
