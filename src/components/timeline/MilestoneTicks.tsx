"use client";

import { milestones } from "@/data";
import { displayYear, yearToTimeline } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { milestoneAccent } from "@/components/milestones/MilestoneIcon";
import { goToMilestone, milestoneReached, milestoneVisible } from "@/components/milestones/milestoneNav";

/** Lanes so neighbours (e.g. ~51,200 and ~50,000 years ago) do not overlap. */
const placed = (() => {
  const lastX: number[] = [];
  return milestones.map((m) => {
    const x = yearToTimeline(m.approximateStartYear);
    let lane = lastX.findIndex((lx) => x - lx > 0.009);
    if (lane === -1) lane = lastX.length;
    lastX[lane] = x;
    return { m, x, lane };
  });
})();

/**
 * Milestones on the main timeline, at their earliest-evidence year. They
 * follow the species filter, light up once the selected year reaches them,
 * and open the milestone's detail panel on click.
 */
export function MilestoneTicks() {
  const filter = useHistoryStore((s) => s.speciesFilter);
  const mode = useHistoryStore((s) => s.mode);
  const highlighted = useHistoryStore((s) => s.highlightMilestoneId);
  // Re-renders only when a milestone crosses the scrubber.
  const reachedKey = useHistoryStore((s) => milestones.map((m) => (milestoneReached(m, displayYear(s.yearsBP)) ? 1 : 0)).join(""));

  return (
    <div className="pointer-events-none absolute inset-x-0 -top-[42px] h-4" aria-label="Milestones on the timeline">
      {placed.map(({ m, x, lane }, i) => {
        if (!milestoneVisible(filter, m)) return null;
        const reached = mode === "overview" || reachedKey[i] === "1";
        return (
          <button
            key={m.id}
            className="milestone-tick pointer-events-auto"
            data-reached={reached}
            data-active={highlighted === m.id}
            style={{
              left: `${(x * 100).toFixed(3)}%`,
              top: `${lane * -7}px`,
              ["--tick-color" as string]: milestoneAccent(m.visualIcon),
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => goToMilestone(m, { openPanel: true })}
            aria-label={`${m.title}, ${m.dateLabel}`}
            title={`${m.title} · ${m.dateLabel}`}
          />
        );
      })}
    </div>
  );
}
