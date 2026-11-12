"use client";

import { useState } from "react";
import type { HistoricalMilestone } from "@/types/migration";
import { displayYear } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { MilestoneScene } from "./MilestoneScene";
import { goToMilestone, milestoneReached } from "./milestoneNav";

/**
 * Vertical milestone timeline inside the information panel. Clicking a
 * milestone opens its full detail panel and takes the globe there (year,
 * camera, highlight). Rows show whether the evidence exists yet at the
 * selected year, so the list follows timeline scrubbing.
 */
export function MilestoneTimeline({
  items,
  tags,
  empty,
}: {
  items: HistoricalMilestone[];
  /** Optional per-milestone tag, e.g. "Related" vs "Same period, not connected". */
  tags?: Record<string, string>;
  empty?: string;
}) {
  const highlighted = useHistoryStore((s) => s.highlightMilestoneId);
  const mode = useHistoryStore((s) => s.mode);
  const year = useHistoryStore((s) => displayYear(s.yearsBP));
  const [hovered, setHovered] = useState<string | null>(null);

  if (items.length === 0) return <p className="text-white/40">{empty ?? "No milestones recorded for this selection."}</p>;

  return (
    <ol className="milestone-timeline">
      {items.map((m) => {
        const future = mode === "historical" && !milestoneReached(m, year);
        return (
          <li key={m.id} className="milestone-row" data-highlight={highlighted === m.id} data-future={future}>
            <button
              className="milestone-row__head"
              onClick={() => goToMilestone(m, { openPanel: true })}
              onPointerEnter={() => setHovered(m.id)}
              onPointerLeave={() => setHovered((h) => (h === m.id ? null : h))}
              aria-label={`${m.title}, ${m.dateLabel}. Open details`}
            >
              <span className="milestone-row__icon">
                <MilestoneScene icon={m.visualIcon} variant="thumb" animate={hovered === m.id || highlighted === m.id} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[12.5px] leading-snug text-white/85">{m.title}</span>
                <span className="mt-0.5 block text-[10.5px] text-white/40">
                  {m.dateLabel}
                  {future && <span className="ml-1.5 text-white/55">· after the selected year</span>}
                  {tags?.[m.id] && <span className="ml-1.5 text-white/55">· {tags[m.id]}</span>}
                </span>
                <span className="mt-1 line-clamp-2 block text-[11.5px] leading-relaxed text-white/50">{m.shortDescription}</span>
              </span>
              <span className="milestone-row__chevron" aria-hidden>
                ›
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
