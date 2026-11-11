"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Leva } from "leva";
import { DateHeader } from "@/components/information/DateHeader";
import { RouteLegend } from "@/components/information/RouteLegend";
import { RoutePanel } from "@/components/information/RoutePanel";
import { routeById } from "@/data";
import { IntroOverlay } from "@/components/intro/IntroOverlay";
import { useIntroStore } from "@/components/intro/introState";
import { Timeline } from "@/components/timeline/Timeline";
import { fromSignedYear, timelineToYear, yearToTimeline } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";

// WebGL must never render on the server.
const GlobeCanvas = dynamic(() => import("./GlobeCanvas"), { ssr: false });

export function GlobeExperience() {
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const introStage = useIntroStore((s) => s.stage);
  const interactive = introStage === "done";

  // The interface enters only after the cinematic, while the title fades.
  useEffect(() => {
    if (!interactive || !rootRef.current) return;
    const ctx = gsap.context(() => {
      // Starts as the title finishes leaving (IntroOverlay: 1.5 s linger + 0.9 s fade).
      gsap.from(".ui-fade", { opacity: 0, y: 10, duration: 1.6, stagger: 0.1, ease: "power2.out", delay: 2.2 });
      gsap.from(".ui-rise", { opacity: 0, y: 24, duration: 1.6, stagger: 0.12, ease: "power3.out", delay: 2.5 });
    }, rootRef);
    return () => ctx.revert();
  }, [interactive]);

  // During the cinematic, any key or click skips it.
  useEffect(() => {
    if (interactive) return;
    const skipNow = (e: Event) => {
      const s = useIntroStore.getState().stage;
      if (s !== "playing" && s !== "title") return;
      if (e instanceof KeyboardEvent && ["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      useIntroStore.getState().skip();
    };
    window.addEventListener("keydown", skipNow, { capture: true });
    window.addEventListener("pointerdown", skipNow, { capture: true });
    return () => {
      window.removeEventListener("keydown", skipNow, { capture: true });
      window.removeEventListener("pointerdown", skipNow, { capture: true });
    };
  }, [interactive]);

  // Deep links (shareable): ?year=45000 opens that moment, ?route=<id> opens a route.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = useHistoryStore.getState();
    const year = Number(params.get("year")); // signed: -45000 = 45,000 years ago
    const route = routeById[params.get("route") ?? ""];
    if (params.has("year") || route) {
      // A deep link goes straight to the requested state: no cinematic.
      useIntroStore.getState().disableAutoplay();
      if (params.has("year") && Number.isFinite(year)) s.selectYear(fromSignedYear(year));
      if (route) s.selectRoute(route.id);
    }
  }, []);

  // Keyboard: space = play/pause, arrows = scrub.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      const s = useHistoryStore.getState();
      if (e.key === "Escape") {
        s.selectRoute(null);
      } else if (e.code === "Space") {
        // Global play/pause; also stops Space from "clicking" a focused button.
        e.preventDefault();
        s.togglePlay();
      } else if (target.closest("[role=slider]")) {
        return; // the timeline handles its own arrow keys
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const d = (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 0.05 : 0.01);
        s.selectYear(timelineToYear(yearToTimeline(s.yearsBP) + d));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main ref={rootRef} className="relative h-dvh w-full overflow-hidden bg-[#02040a] text-white">
      <div className="absolute inset-0">
        <GlobeCanvas onReady={() => setReady(true)} />
      </div>

      {/* Loading veil */}
      <div
        className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#02040a] transition-opacity duration-1500"
        style={{ opacity: ready ? 0 : 1 }}
      >
        <span className="text-[10px] uppercase tracking-[0.6em] text-white/40">Loading Earth</span>
      </div>

      {/* Edge gradients keep text legible over the globe */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-linear-to-b from-[#02040a]/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-linear-to-t from-[#02040a]/90 to-transparent" />

      <IntroOverlay />

      <div
        className="hud pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-8"
        data-hidden={!interactive}
      >
        <div className="flex flex-col items-start gap-7">
          <div className="pointer-events-auto">
            <DateHeader />
          </div>
          <div className="ui-rise pointer-events-auto hidden sm:block">
            <RouteLegend />
          </div>
        </div>

        <div className="ui-rise pointer-events-auto">
          <Timeline />
        </div>
      </div>

      {/* Positioned against <main>; z-index set in .route-panel */}
      <RoutePanel />

      <Leva collapsed hidden={process.env.NODE_ENV === "production"} titleBar={{ title: "dev" }} />
    </main>
  );
}
