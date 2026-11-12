"use client";

import { routes } from "@/data";
import { routeState, type RouteStatus } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { useState } from "react";
import { SpeciesFilter } from "./SpeciesFilter";
import { SpeciesList } from "./SpeciesList";

const STATUS_LABEL: Record<RouteStatus, string> = {
  upcoming: "Not yet",
  gathering: "Beginning",
  active: "Under way",
  arrived: "Arrived",
  completed: "Ended",
};

const kyr = (y: number) => `${Math.round(y / 1000)}k`;

/**
 * Compact route legend: colour, name, interval, and (historical mode)
 * whether each route is active. Doubles as a route selector.
 * Re-renders only when the visible status bucket changes.
 */
export function RouteLegend() {
  const mode = useHistoryStore((s) => s.mode);
  const selectedId = useHistoryStore((s) => s.selectedRouteId);
  // A compact signature of every route's status: changes rarely during playback.
  const statusKey = useHistoryStore((s) => routes.map((r) => routeState(r, s.yearsBP).status).join("|"));
  const statuses = statusKey.split("|") as RouteStatus[];
  const { selectRoute } = useHistoryStore.getState();
  const filter = useHistoryStore((s) => s.speciesFilter);
  const selectionKind = useHistoryStore((s) => s.selection?.kind);
  // In "All", the wave list folds away so the species list stays readable.
  const [wavesOpen, setWavesOpen] = useState(false);
  const showWaves = filter === "sapiens" || (filter === "all" && wavesOpen);

  return (
    <nav aria-label="Species and migration routes" className="w-[min(380px,calc(100vw-2rem))] [&>*:not(:first-child)]:max-w-[270px]">
      <div className="flex flex-wrap items-center gap-2">
        <SpeciesFilter />
        <button
          className="milestones-btn"
          data-active={selectionKind === "milestones"}
          onClick={() =>
            useHistoryStore.getState().select(selectionKind === "milestones" ? null : { kind: "milestones", id: "all" })
          }
          title="Browse historical milestones"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
            <path d="M12 3v18M7 7h10M7 12h7M7 17h9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Milestones
        </button>
      </div>
      {filter !== "sapiens" && (
        <div className="mt-4">
          <SpeciesList />
        </div>
      )}
      {filter === "all" && (
        <button className="label mt-3 block text-left transition-colors hover:text-white/80" onClick={() => setWavesOpen((v) => !v)} aria-expanded={wavesOpen}>
          Homo sapiens migration waves ({routes.length}) {wavesOpen ? "–" : "+"}
        </button>
      )}
      {filter === "sapiens" && <div className="label mb-2.5 mt-4">Migration waves</div>}
      {showWaves && (
      <ul className="mt-1 space-y-0.5">
        {routes.map((r, i) => {
          const status = statuses[i];
          const inactive = mode === "historical" && (status === "upcoming" || status === "completed");
          const selected = selectedId === r.id;
          return (
            <li key={r.id}>
              <button
                className="legend-item"
                data-selected={selected}
                data-inactive={inactive}
                onClick={() => selectRoute(selected ? null : r.id, selected ? undefined : r.camera)}
                aria-pressed={selected}
              >
                <span
                  className="legend-swatch"
                  style={{ background: r.color, boxShadow: `0 0 10px ${r.color}` }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[12.5px] text-white/85">{r.name}</span>
                  <span className="block text-[10.5px] tabular-nums text-white/40">
                    ~{kyr(r.startYear)}–{kyr(r.endYear)} years ago
                    {mode === "historical" && <span className="ml-1.5 text-white/55">· {STATUS_LABEL[status]}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      )}
      <div className="mt-4 space-y-1.5 border-t border-white/[0.07] pt-3" aria-label="Visual key">
        {filter !== "other" && (
          <div className="key-row">
            <span className="key-glyph" data-kind="stream" aria-hidden />
            Homo sapiens groups migrating
          </div>
        )}
        <div className="key-row">
          <span className="key-glyph" data-kind="attested" aria-hidden />
          Population present · archaeological evidence
        </div>
        <div className="key-row">
          <span className="key-glyph" data-kind="inferred" aria-hidden />
          Population present · inferred
        </div>
      </div>
    </nav>
  );
}
