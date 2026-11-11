"use client";

import { useEffect, useRef } from "react";
import {
  formatYearShort,
  timelineToYear,
  yearToTimeline,
} from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { HistoricalEvents } from "./HistoricalEvents";
import { PlaybackControls } from "./PlaybackControls";

const TICKS = [300000, 200000, 150000, 100000, 70000, 50000, 30000, 20000, 10000, 5000, 1000, 0];

/**
 * Full-width, non-linear timeline. The thumb and fill are moved via a
 * transient store subscription (direct DOM writes), so playback does not
 * re-render this component.
 */
export function Timeline() {
  const mode = useHistoryStore((st) => st.mode);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const render = (yearsBP: number) => {
      const s = yearToTimeline(yearsBP) * 100;
      if (fillRef.current) fillRef.current.style.width = `${s}%`;
      if (thumbRef.current) thumbRef.current.style.left = `${s}%`;
      sliderRef.current?.setAttribute("aria-valuenow", String(Math.round(yearsBP)));
      sliderRef.current?.setAttribute("aria-valuetext", `${Math.round(yearsBP).toLocaleString("en-US")} years ago`);
    };
    render(useHistoryStore.getState().yearsBP);
    return useHistoryStore.subscribe((state, prev) => {
      if (state.yearsBP !== prev.yearsBP) render(state.yearsBP);
    });
  }, []);

  const yearAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return timelineToYear((clientX - rect.left) / rect.width);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { setScrubbing, selectYear } = useHistoryStore.getState();
    setScrubbing(true);
    selectYear(yearAt(e.clientX)); // touching the timeline enters historical mode
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!useHistoryStore.getState().scrubbing) return;
    useHistoryStore.getState().setYear(yearAt(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    useHistoryStore.getState().setScrubbing(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const { yearsBP, selectYear } = useHistoryStore.getState();
    const s = yearToTimeline(yearsBP);
    const step = e.shiftKey ? 0.05 : 0.01;
    if (e.key === "ArrowRight") selectYear(timelineToYear(s + step));
    else if (e.key === "ArrowLeft") selectYear(timelineToYear(s - step));
    else if (e.key === "Home") selectYear(300000);
    else if (e.key === "End") selectYear(0);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="w-full" data-mode={mode}>
      <div className="mb-9 flex items-center justify-between gap-6">
        <PlaybackControls />
        <span className="hidden text-right text-[10px] uppercase tracking-[0.3em] text-white/35 md:block">
          {mode === "overview"
            ? "Overview · waves from different periods · pick a year to explore"
            : "Non-linear scale · recent time expanded"}
        </span>
      </div>

      <div className="relative">
        <HistoricalEvents />
        <div
          ref={(el) => {
            trackRef.current = el;
            sliderRef.current = el;
          }}
          className="timeline-track"
          role="slider"
          tabIndex={0}
          aria-label="Historical time"
          aria-valuemin={0}
          aria-valuemax={300000}
          aria-valuenow={300000}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <div className="timeline-rail" />
          <div ref={fillRef} className="timeline-fill" />
          <div ref={thumbRef} className="timeline-thumb" />
        </div>

        <div className="relative mt-4 h-4 select-none">
          {TICKS.map((y) => (
            <span
              key={y}
              className="absolute -translate-x-1/2 font-mono text-[10px] tracking-wider text-white/35"
              style={{ left: `${yearToTimeline(y) * 100}%` }}
            >
              {formatYearShort(y)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
