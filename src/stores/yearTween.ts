import gsap from "gsap";
import { timelineToYear, yearToTimeline } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "./useHistoryStore";

/**
 * Smooth jumps between historical moments.
 *
 * The tween animates the *year* (in timeline space), and every frame the
 * particles are recomputed from that year. Nothing accumulates, so
 * intermediate frames are themselves exact historical states, and
 * scrubbing can interrupt the tween at any moment.
 */
const proxy = { s: 0 };
let active: gsap.core.Tween | null = null;

export function cancelYearTween() {
  active?.kill();
  active = null;
}

export function animateYearTo(yearsBP: number, duration = 0.9) {
  cancelYearTween();
  const store = useHistoryStore.getState();
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const from = store.mode === "historical" ? store.yearsBP : yearsBP;
  store.selectYear(from); // enters historical mode
  if (reduced || Math.abs(yearToTimeline(from) - yearToTimeline(yearsBP)) < 0.002) {
    store.selectYear(yearsBP);
    return;
  }
  proxy.s = yearToTimeline(from);
  active = gsap.to(proxy, {
    s: yearToTimeline(yearsBP),
    duration,
    ease: "power2.inOut",
    onUpdate: () => useHistoryStore.getState().setYear(timelineToYear(proxy.s)),
    onComplete: () => {
      active = null;
    },
  });
}
