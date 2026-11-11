import { create } from "zustand";

/**
 * Per-frame intro values, mutated by the GSAP director and read by shaders
 * in useFrame. Never stored in React state.
 */
export const introState = {
  /** R3F clock time at which the story clock reads 0 (intro start). */
  storyStart: 0,
  /** Planet exposure 0 (black) … 1. */
  exposure: 0,
  /** Sun angle override (radians) while the intro runs; null = normal lighting. */
  sunAngle: null as number | null,
  /** Warm East-African origin light 0 … 1. */
  originGlow: 0,
  /**
   * Cinematic emphasis of the streams 0 … 1: more glow and energy during the
   * awakening, decaying into the restrained interactive look.
   */
  hero: 0,
};

/**
 * Coarse intro stage for React (changes a handful of times per intro).
 * - pending:  scene not ready yet
 * - playing:  cinematic running, UI hidden, controls locked
 * - title:    title card on screen (still cinematic)
 * - done:     interactive
 */
export type IntroStage = "pending" | "playing" | "title" | "done";

interface IntroStore {
  stage: IntroStage;
  /** False when the page opens on a deep link: start interactive, keep the linked state. */
  autoplay: boolean;
  disableAutoplay: () => void;
  /** Incremented to request a skip / replay; the director reacts. */
  skipNonce: number;
  replayNonce: number;
  setStage: (stage: IntroStage) => void;
  skip: () => void;
  replay: () => void;
}

export const useIntroStore = create<IntroStore>((set, get) => ({
  stage: "pending",
  autoplay: true,
  disableAutoplay: () => set({ autoplay: false }),
  skipNonce: 0,
  replayNonce: 0,
  setStage: (stage) => set({ stage }),
  skip: () => {
    const s = get().stage;
    if (s === "playing" || s === "title") set({ skipNonce: get().skipNonce + 1 });
  },
  replay: () => set({ replayNonce: get().replayNonce + 1 }),
}));

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
