"use client";

import { species } from "@/data";
import { formatRange, speciesVisible } from "@/engine/species/speciesModel";
import { TIMELINE_START, yearToTimeline } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { openSpecies } from "@/components/information/SpeciesList";

/** Greedy lanes: overlapping species (coexistence) stack instead of colliding. */
const lanes: Record<string, number> = (() => {
  const ends: number[] = [];
  const out: Record<string, number> = {};
  [...species]
    .sort((a, b) => b.timeRange.older - a.timeRange.older)
    .forEach((sp) => {
      const x0 = yearToTimeline(Math.min(TIMELINE_START, sp.timeRange.older));
      let lane = ends.findIndex((end) => end < x0 - 0.006);
      if (lane === -1) lane = ends.length;
      ends[lane] = yearToTimeline(sp.timeRange.younger);
      out[sp.id] = lane;
    });
  return out;
})();
const LANES = Math.max(1, ...Object.values(lanes).map((l) => l + 1));
const LANE_PX = 5;

/** Species ranges under the timeline (shown when the filter includes other hominins). */
export function SpeciesSpans() {
  const filter = useHistoryStore((s) => s.speciesFilter);
  const selected = useHistoryStore((s) => (s.selection?.kind === "species" ? s.selection.id : null));
  if (filter === "sapiens") return null;
  return (
    <div className="relative mt-2" style={{ height: LANES * LANE_PX }} aria-label="Species time ranges">
      {species
        .filter((sp) => speciesVisible(filter, sp))
        .map((sp) => {
          const x0 = yearToTimeline(Math.min(TIMELINE_START, sp.timeRange.older));
          const x1 = yearToTimeline(sp.timeRange.younger);
          return (
            <button
              key={sp.id}
              className="species-span"
              data-selected={selected === sp.id}
              data-open-start={sp.timeRange.older > TIMELINE_START}
              style={{
                left: `${(x0 * 100).toFixed(3)}%`,
                width: `${Math.max(0.4, (x1 - x0) * 100).toFixed(3)}%`,
                top: lanes[sp.id] * LANE_PX,
                ["--species-color" as string]: sp.color,
              }}
              onClick={() => openSpecies(sp)}
              aria-label={`${sp.name}, ${formatRange(sp)}`}
              title={`${sp.name} · ${formatRange(sp)}`}
            />
          );
        })}
    </div>
  );
}
