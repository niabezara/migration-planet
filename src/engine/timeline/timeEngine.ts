/**
 * Historical time engine.
 *
 * Everything that moves in the scene is a pure function of `yearsBP`
 * (years before present). Nothing here accumulates state between frames:
 * given a year you can always recompute the whole world. Playback is just
 * "advance yearsBP over wall-clock time".
 */
import type { HistoricalPeriod, MigrationRoute } from "@/types/migration";
import { PARTICLE_CONSTANTS } from "@/engine/particles/constants";

export const TIMELINE_START = 300_000;
export const TIMELINE_END = 0;

/**
 * The timeline is non-linear: a linear 300k-year axis would squeeze the last
 * 50,000 years (most of the story) into a sliver. A power curve gives recent
 * time more room while staying monotonic and easy to invert.
 *   s = 0 -> 300,000 years ago,  s = 1 -> present.
 */
const TIMELINE_POWER = 2.2;

export function timelineToYear(s: number): number {
  const c = Math.min(1, Math.max(0, s));
  return TIMELINE_START * Math.pow(1 - c, TIMELINE_POWER);
}

export function yearToTimeline(yearsBP: number): number {
  const y = Math.min(TIMELINE_START, Math.max(0, yearsBP));
  return 1 - Math.pow(y / TIMELINE_START, 1 / TIMELINE_POWER);
}

export function clampYear(yearsBP: number): number {
  return Math.min(TIMELINE_START, Math.max(TIMELINE_END, yearsBP));
}

// ---------------------------------------------------------------------------
// Route status (historical mode)

/**
 * - upcoming:  route window has not begun (hidden)
 * - gathering: just before departure; groups appear at the origin
 * - active:    groups are travelling
 * - arrived:   travel complete, groups settling at the destination
 * - completed: faded out (hidden)
 */
export type RouteStatus = "upcoming" | "gathering" | "active" | "arrived" | "completed";

export interface RouteState {
  route: MigrationRoute;
  /** 0 at startYear, 1 at endYear (unclamped). */
  progress: number;
  status: RouteStatus;
  /** Whether particles of this route are on screen in historical mode. */
  visible: boolean;
}

export function routeProgress(route: MigrationRoute, yearsBP: number): number {
  return (route.startYear - yearsBP) / Math.max(1, route.startYear - route.endYear);
}

export function routeState(route: MigrationRoute, yearsBP: number): RouteState {
  const progress = routeProgress(route, yearsBP);
  const { visibleFrom, hiddenAfter } = PARTICLE_CONSTANTS;
  const status: RouteStatus =
    progress < visibleFrom
      ? "upcoming"
      : progress < 0
        ? "gathering"
        : progress <= 1
          ? "active"
          : progress < hiddenAfter
            ? "arrived"
            : "completed";
  return { route, progress, status, visible: status !== "upcoming" && status !== "completed" };
}

/** Routes whose particles are on screen at `yearsBP` in historical mode. */
export function visibleRoutes(routes: MigrationRoute[], yearsBP: number): MigrationRoute[] {
  return routes.filter((r) => routeState(r, yearsBP).visible);
}

/** Routes strictly within their travel window at `yearsBP`. */
export function activeRoutes(routes: MigrationRoute[], yearsBP: number): MigrationRoute[] {
  return routes.filter((r) => routeState(r, yearsBP).status === "active");
}

export function currentPeriod(periods: HistoricalPeriod[], yearsBP: number): HistoricalPeriod | null {
  return periods.find((p) => yearsBP <= p.startYear && yearsBP >= p.endYear) ?? null;
}

// ---------------------------------------------------------------------------
// Playback

/** Wall-clock seconds to traverse the whole timeline at 1x. */
export const BASE_TIMELINE_SECONDS = 110;
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/**
 * Cinematic slow-motion: playback slows while a migration is under way so
 * the movement can be read. Smooth ramp so the change of pace is not abrupt.
 */
export function playbackRateAt(routes: MigrationRoute[], yearsBP: number): number {
  let rate = 1;
  for (const e of routes) {
    const span = e.startYear - e.endYear;
    const ramp = span * 0.25;
    const inside = Math.min(
      smoothstep(e.startYear + ramp, e.startYear, yearsBP),
      smoothstep(e.endYear - ramp * 2, e.endYear, yearsBP),
    );
    rate = Math.min(rate, 1 - 0.55 * inside);
  }
  return rate;
}

/**
 * Advance the clock. Movement happens in timeline space (s), so playback
 * speed feels uniform across the non-linear axis.
 */
export function advanceYear(
  yearsBP: number,
  dtSeconds: number,
  direction: 1 | -1,
  speed: number,
  routes: MigrationRoute[],
): number {
  const ds = (dtSeconds / BASE_TIMELINE_SECONDS) * speed * playbackRateAt(routes, yearsBP) * direction;
  return timelineToYear(yearToTimeline(yearsBP) + ds);
}

// ---------------------------------------------------------------------------
// Formatting

/** Rounded the same way formatYear displays it (cheap selector key for React). */
export function displayYear(yearsBP: number): number {
  return yearsBP >= 10_000 ? Math.round(yearsBP / 100) * 100 : Math.round(yearsBP);
}

export function formatYear(yearsBP: number): { value: string; unit: string } {
  if (yearsBP < 1) return { value: "Present", unit: "" };
  if (yearsBP >= 10_000) {
    const rounded = Math.round(yearsBP / 100) * 100;
    return { value: rounded.toLocaleString("en-US"), unit: "years ago" };
  }
  // Evaluated lazily (client-side, only near the present) to keep prerender pure.
  const calendar = Math.round(new Date().getFullYear() - yearsBP);
  if (calendar <= 0) {
    const bce = Math.round((1 - calendar) / 10) * 10;
    return { value: bce.toLocaleString("en-US"), unit: "BCE" };
  }
  return { value: String(calendar), unit: "CE" };
}

export function formatYearShort(yearsBP: number): string {
  if (yearsBP < 1) return "Now";
  if (yearsBP >= 1000) return `${Math.round(yearsBP / 1000)}k`;
  return `${Math.round(yearsBP)}`;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
