"use client";

import { periods, routes, sites } from "@/data";
import { yearToTimeline } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";

const pct = (yearsBP: number) => `${yearToTimeline(yearsBP) * 100}%`;
const width = (older: number, younger: number) =>
  `${(yearToTimeline(younger) - yearToTimeline(older)) * 100}%`;

/** Greedy lane packing so overlapping route intervals stack instead of colliding. */
const routeLanes: Record<string, number> = (() => {
  const laneEnds: number[] = [];
  const out: Record<string, number> = {};
  [...routes]
    .sort((a, b) => b.startYear - a.startYear)
    .forEach((r) => {
      const x0 = yearToTimeline(r.startYear);
      const x1 = yearToTimeline(r.endYear);
      let lane = laneEnds.findIndex((end) => end < x0 - 0.004);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = x1;
      out[r.id] = lane;
    });
  return out;
})();
export const ROUTE_LANE_COUNT = Math.max(1, ...Object.values(routeLanes).map((l) => l + 1));

/** Period bands, route intervals (in route colours) and site ticks on the timeline. */
export function HistoricalEvents() {
  const selectedRouteId = useHistoryStore((s) => s.selectedRouteId);
  const { selectYear, selectRoute, pause } = useHistoryStore.getState();

  return (
    <>
      {/* Period bands (above the track) */}
      <div className="pointer-events-none absolute inset-x-0 -top-6 h-5">
        {periods.map((p) => (
          <button
            key={p.id}
            className="period-band pointer-events-auto"
            style={{ left: pct(p.startYear), width: width(p.startYear, p.endYear) }}
            onClick={(e) => {
              e.stopPropagation();
              pause();
              selectYear(p.startYear);
            }}
            title={`${p.name}: jump to ${p.startYear.toLocaleString("en-US")} years ago`}
          >
            <span>{p.shortName ?? p.name}</span>
          </button>
        ))}
      </div>

      {/* Route intervals, one lane per overlap level */}
      {routes.map((r) => (
        <button
          key={r.id}
          className="route-span"
          data-selected={selectedRouteId === r.id}
          style={{
            left: pct(r.startYear),
            width: width(r.startYear, r.endYear),
            top: `${4 + routeLanes[r.id] * 5}px`,
            ["--route-color" as string]: r.color,
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={() => {
            pause();
            selectYear(r.startYear - (r.startYear - r.endYear) * 0.35);
            selectRoute(r.id, r.camera);
          }}
          aria-label={`${r.name}: jump to this route`}
          title={`${r.name} · ~${Math.round(r.startYear / 1000)}k–${Math.round(r.endYear / 1000)}k years ago`}
        />
      ))}

      {/* Archaeological site ticks (below the track) */}
      {sites.map((s) => (
        <button
          key={s.id}
          className="site-tick"
          style={{ left: pct(s.dateRange[0]) }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={() => {
            pause();
            selectYear(s.dateRange[0] * 0.995);
            useHistoryStore.getState().flyTo({ lat: s.location.lat, lng: s.location.lng, distance: 2.2 });
          }}
          aria-label={`${s.name} (${s.region})`}
          title={`${s.name} (${s.region})`}
        />
      ))}
    </>
  );
}
