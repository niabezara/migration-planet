import type { CameraFocus } from "@/types/migration";
import { OVERVIEW_CAMERA } from "./camera";

/**
 * Choreography of the opening sequence (seconds from intro start).
 *
 *   Scene 1  0.0 – 3.2  Earth emerges from darkness, back-lit, camera approaching
 *   Scene 2  3.2 – 4.6  camera drifts to Africa; warm light rises in East Africa
 *   Scene 3  4.3 – 6.8  amber stream bursts from Africa; other routes awaken
 *   Scene 4  5.6 – 9.0  camera pulls back to the full globe; title reveal
 *
 * Everything here is data: the director (IntroSequence) only plays it.
 */
export const INTRO = {
  /** When the experience becomes interactive. */
  duration: 9,
  /** Title card appears / interactive UI fades in. */
  titleAt: 6.4,

  camera: {
    start: { lat: 16, lng: -30, distance: 13 } as CameraFocus,
    /** Scene 1 end: Earth fills the frame, Africa turning into view. */
    approach: { lat: 9, lng: 16, distance: 4.6, at: 3.2 },
    /** Scene 2/3: close on East Africa as the light rises. */
    origin: { lat: 7, lng: 33, distance: 2.75, at: 5.0 },
    /** Scene 4: full reveal. */
    reveal: { ...OVERVIEW_CAMERA, at: 8.8 },
  },

  /** Planet exposure rises from black over this window. */
  exposure: { from: 0.6, to: 3.4 },
  /**
   * Sun angle relative to the camera (radians): starts behind the planet so
   * only a thin crescent of atmosphere glows, then swings to the documentary
   * three-quarter light.
   */
  sun: { start: 2.55, mid: 1.4, end: 0.85, midAt: 2.6, endAt: 4.6 },
  /** Warm light over East Africa: rise, peak, fade. */
  origin: { location: { lat: 6.5, lng: 37 }, riseAt: 2.9, peakAt: 4.3, fadeOutAt: 6.6 },

  /**
   * Story-clock time (s) at which each route bursts out of its origin.
   * Africa first; the rest follow in roughly historical order.
   */
  routeAwakenAt: {
    "africa-levant": 4.3,
    "out-of-africa-south": 4.85,
    "levant-europe": 5.45,
    "levant-caucasus": 5.8,
    "sunda-sahul": 6.15,
    "beringia-americas": 6.55,
  } as Record<string, number>,
  /** Routes without an entry awaken here. */
  defaultAwakenAt: 6.8,

  /**
   * Story-time warp for the overview loops: at the awakening the streams run
   * ~4× faster (the surge out of Africa), easing back to 1× by the end of the
   * intro. Monotonic and smooth, so loops continue seamlessly afterwards.
   */
  warp: { at: 4.3, amount: 7, tau: 2.2 },
  /** Stream emphasis: rises with the first burst, decays after the reveal. */
  hero: { riseAt: 4.1, rise: 0.6, fallAt: 8.2, fall: 3.8 },
} as const;

/** Warped story time used by the overview loops (see INTRO.warp). */
export function loopTime(storySeconds: number): number {
  const { at, amount, tau } = INTRO.warp;
  return storySeconds + amount * (1 - Math.exp(-Math.max(0, storySeconds - at) / tau));
}
