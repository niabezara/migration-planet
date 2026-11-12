"use client";

import type { MigrationRoute, PopulationCluster } from "@/types/migration";
import { populationsByRoute } from "@/data";
import { displayYear } from "@/engine/timeline/timeEngine";
import { populationState, type PopulationStatus } from "@/engine/population/populationModel";
import { useHistoryStore } from "@/stores/useHistoryStore";

const STATUS_LABEL: Record<PopulationStatus, string> = {
  absent: "Not yet present",
  forming: "Becoming established",
  established: "Present",
  fading: "Evidence of continuity fades",
  ended: "No longer shown",
};

const kyr = (y: number) => `~${Math.round(y / 1000).toLocaleString("en-US")}k`;

function role(c: PopulationCluster, route: MigrationRoute): string {
  const src = c.sourceOf.includes(route.id);
  const dst = c.destinationOf.includes(route.id);
  return src && dst ? "Source & destination" : src ? "Source population" : dst ? "Destination population" : "Related population";
}

/**
 * The populations a route connects: where it starts (which remains populated)
 * and where a new population forms. Status follows the selected year.
 */
export function RoutePopulations({ route }: { route: MigrationRoute }) {
  const mode = useHistoryStore((s) => s.mode);
  const yearsBP = useHistoryStore((s) => displayYear(s.yearsBP));
  const clusters = populationsByRoute[route.id] ?? [];
  if (!clusters.length) return null;
  // Sources first, then destinations.
  const ordered = [...clusters].sort(
    (a, b) => Number(b.sourceOf.includes(route.id)) - Number(a.sourceOf.includes(route.id)),
  );

  return (
    <div>
      <p className="mb-2 text-white/50">
        Source populations remain after groups depart; new populations form gradually where groups arrive.
      </p>
      <ul>
        {ordered.map((c) => {
          const st = populationState(c, yearsBP);
          const basis = mode === "historical" ? (st.attested ? "attested" : "inferred") : c.attestedYear ? "attested" : "inferred";
          return (
            <li key={c.id} className="pop-row">
              <div className="flex items-center gap-2.5">
                <span
                  className="pop-dot"
                  data-basis={basis}
                  style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-white/80">{c.region}</span>
                <span className="shrink-0 text-[10.5px] text-white/40">{role(c, route)}</span>
              </div>
              <div className="mt-1 pl-[17px] text-[11px] text-white/45">
                {mode === "historical" ? (
                  <>
                    {STATUS_LABEL[st.status]}
                    {st.status === "forming" && ` · ${Math.round(st.presence * 100)}%`}
                    {st.status !== "absent" && st.status !== "ended" && (
                      <> · {st.attested ? "archaeological evidence" : "inferred"}</>
                    )}
                  </>
                ) : (
                  <>
                    Modelled from {kyr(c.startYear)} years ago
                    {c.endYear !== undefined && ` to ${kyr(c.endYear)}`}
                    {c.attestedYear !== undefined ? ` · evidence from ${kyr(c.attestedYear)}` : " · inferred"}
                  </>
                )}
              </div>
              <p className="mt-1 pl-[17px] text-[11px] leading-relaxed text-white/35">{c.basisNote}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
