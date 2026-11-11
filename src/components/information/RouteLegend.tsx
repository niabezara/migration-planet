"use client";

import { routes } from "@/data";
import { routeState, type RouteStatus } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";

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

  return (
    <nav aria-label="Migration routes" className="w-[min(260px,calc(100vw-2rem))]">
      <div className="label mb-2.5">Migration waves</div>
      <ul className="space-y-0.5">
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
    </nav>
  );
}
