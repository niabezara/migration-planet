/**
 * What the globe should emphasise for the current selection. Kept out of the
 * renderer so every selection kind maps to highlights in one place.
 */
import { milestoneById, populationById } from "@/data";
import type { Selection } from "./useHistoryStore";

export interface FocusTargets {
  /** Species whose populations are emphasised (others dimmed). */
  speciesIds: string[];
  /** A single population cluster to emphasise. */
  clusterId: string | null;
  /** Route to emphasise (streams of other routes dimmed). */
  routeId: string | null;
}

const NONE: FocusTargets = { speciesIds: [], clusterId: null, routeId: null };

function milestoneFocus(id: string | null): FocusTargets {
  const m = id ? milestoneById[id] : undefined;
  if (!m) return NONE;
  return { speciesIds: m.relatedSpeciesIds, clusterId: null, routeId: m.relatedRouteIds?.[0] ?? null };
}

/** `highlightMilestoneId` is a milestone expanded inside another panel's timeline. */
export function focusTargets(selection: Selection | null, highlightMilestoneId: string | null = null): FocusTargets {
  if (!selection) return milestoneFocus(highlightMilestoneId);
  switch (selection.kind) {
    case "route":
      return { ...NONE, routeId: selection.id };
    case "species":
      return { ...NONE, speciesIds: [selection.id] };
    case "population":
      return { ...NONE, clusterId: populationById[selection.id] ? selection.id : null };
    case "milestone":
      return milestoneFocus(selection.id);
    default:
      return milestoneFocus(highlightMilestoneId);
  }
}
