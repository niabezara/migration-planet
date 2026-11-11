"use client";

import { useFrame } from "@react-three/fiber";
import type { MigrationRoute } from "@/types/migration";
import { advanceYear, TIMELINE_END, TIMELINE_START } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";

/**
 * Advances historical time while playing. This is the *only* place time
 * moves on its own; every visual derives its state from `yearsBP`.
 */
export function PlaybackDriver({ routes }: { routes: MigrationRoute[] }) {
  useFrame((_, delta) => {
    const s = useHistoryStore.getState();
    if (s.mode !== "historical" || !s.playing || s.scrubbing) return;
    const dt = Math.min(delta, 0.1); // avoid jumps after a tab switch
    const next = advanceYear(s.yearsBP, dt, s.direction, s.speed, routes);
    const atEnd = s.direction === 1 ? next <= TIMELINE_END : next >= TIMELINE_START;
    s.setYear(next);
    if (atEnd) s.pause();
  });
  return null;
}
