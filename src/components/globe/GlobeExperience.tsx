"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Leva } from "leva";
import { DateHeader } from "@/components/information/DateHeader";
import { RouteLegend } from "@/components/information/RouteLegend";
import { RoutePanel } from "@/components/information/RoutePanel";
import { routeById } from "@/data";
import { Timeline } from "@/components/timeline/Timeline";
import { timelineToYear, yearToTimeline } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";

// WebGL must never render on the server.
const GlobeCanvas = dynamic(() => import("./GlobeCanvas"), { ssr: false });

export function GlobeExperience() {
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // UI entrance, timed against the camera's intro flight.
  useEffect(() => {
    if (!ready || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".ui-fade", { opacity: 0, y: 10, duration: 1.6, stagger: 0.12, ease: "power2.out", delay: 1.4 });
      gsap.from(".ui-rise", { opacity: 0, y: 24, duration: 1.6, stagger: 0.15, ease: "power3.out", delay: 2.6 });
    }, rootRef);
    return () => ctx.revert();
  }, [ready]);

  // Deep links (shareable): ?year=45000 opens that moment, ?route=<id> opens a route.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = useHistoryStore.getState();
    const year = Number(params.get("year"));
    if (params.has("year") && Number.isFinite(year)) s.selectYear(year);
    const route = routeById[params.get("route") ?? ""];
    if (route) s.selectRoute(route.id);
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

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-8">
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
