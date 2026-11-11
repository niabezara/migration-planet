import { create } from "zustand";
import type { CameraFocus } from "@/types/migration";
import { clampYear, type PlaybackSpeed } from "@/engine/timeline/timeEngine";

/**
 * - overview:   all routes loop as a visual summary (no single moment in time)
 * - historical: the scene shows exactly the state at `yearsBP`
 */
export type ViewMode = "overview" | "historical";

/** Where historical mode starts when entered without an explicit year. */
export const DEFAULT_HISTORICAL_YEAR = 140_000;

/**
 * Global app state. High-frequency consumers (shaders, timeline thumb)
 * read via `getState()` / `subscribe()` instead of hooks, so advancing
 * time does not re-render React trees.
 */
interface HistoryState {
  mode: ViewMode;
  yearsBP: number;
  playing: boolean;
  direction: 1 | -1;
  speed: PlaybackSpeed;
  /** User is dragging the timeline. Playback pauses advancing meanwhile. */
  scrubbing: boolean;
  selectedRouteId: string | null;

  /** Camera: follow migrations while playing (historical mode). */
  followCamera: boolean;
  /** One-shot camera request; nonce changes trigger a GSAP flight. */
  cameraRequest: { focus: CameraFocus; nonce: number; duration?: number } | null;

  /** Raw year update (playback driver). Does not change mode. */
  setYear: (yearsBP: number) => void;
  /** User picked a moment: enters historical mode. */
  selectYear: (yearsBP: number) => void;
  enterOverview: () => void;
  play: (direction?: 1 | -1) => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  setScrubbing: (scrubbing: boolean) => void;
  setFollowCamera: (follow: boolean) => void;
  selectRoute: (id: string | null, focus?: CameraFocus) => void;
  flyTo: (focus: CameraFocus, duration?: number) => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  mode: "overview",
  yearsBP: DEFAULT_HISTORICAL_YEAR,
  playing: false,
  direction: 1,
  speed: 1,
  scrubbing: false,
  selectedRouteId: null,
  followCamera: true,
  cameraRequest: null,

  setYear: (yearsBP) => set({ yearsBP: clampYear(yearsBP) }),
  selectYear: (yearsBP) => set({ yearsBP: clampYear(yearsBP), mode: "historical" }),
  enterOverview: () => set({ mode: "overview", playing: false }),

  play: (direction) => {
    const dir = direction ?? get().direction;
    let { yearsBP } = get();
    // Restart from the relevant end if parked at the limit.
    if (dir === 1 && yearsBP <= 0) yearsBP = DEFAULT_HISTORICAL_YEAR;
    if (dir === -1 && yearsBP >= 300_000) yearsBP = 0;
    set({ playing: true, direction: dir, yearsBP, mode: "historical", followCamera: true });
  },
  pause: () => set({ playing: false }),
  togglePlay: () => (get().playing ? get().pause() : get().play()),
  setSpeed: (speed) => set({ speed }),
  setScrubbing: (scrubbing) => set({ scrubbing }),
  setFollowCamera: (followCamera) => set({ followCamera }),

  selectRoute: (id, focus) => {
    set({ selectedRouteId: id });
    if (id && focus) get().flyTo(focus);
  },

  flyTo: (focus, duration) =>
    set((s) => ({ cameraRequest: { focus, duration, nonce: (s.cameraRequest?.nonce ?? 0) + 1 } })),
}));
