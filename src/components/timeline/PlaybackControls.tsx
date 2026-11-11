"use client";

import { PLAYBACK_SPEEDS, timelineToYear, yearToTimeline } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { animateYearTo, cancelYearTween } from "@/stores/yearTween";
import { OVERVIEW_CAMERA } from "@/config/camera";

const STEP = 0.02; // timeline units per step click

function Icon({ d, fill = false }: { d: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" aria-hidden>
      <path
        d={d}
        fill={fill ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={fill ? 0 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ICONS = {
  play: "M8 5.5v13l10.5-6.5z",
  pause: "M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z",
  reverse: "M16 5.5v13L5.5 12z",
  stepBack: "M18 6l-7 6 7 6M11 6l-7 6 7 6",
  stepFwd: "M6 6l7 6-7 6M13 6l7 6-7 6",
};

export function PlaybackControls() {
  const playing = useHistoryStore((s) => s.playing);
  const direction = useHistoryStore((s) => s.direction);
  const speed = useHistoryStore((s) => s.speed);
  const follow = useHistoryStore((s) => s.followCamera);
  const mode = useHistoryStore((s) => s.mode);
  const { play, pause, setSpeed, setFollowCamera, enterOverview, flyTo } = useHistoryStore.getState();

  const step = (delta: number) => {
    const y = useHistoryStore.getState().yearsBP;
    animateYearTo(timelineToYear(yearToTimeline(y) + delta), 0.45);
  };

  const toOverview = () => {
    cancelYearTween();
    enterOverview();
    flyTo(OVERVIEW_CAMERA, 2.8);
  };

  const forwardActive = playing && direction === 1;
  const reverseActive = playing && direction === -1;

  return (
    <div className="flex flex-wrap items-center gap-1 gap-y-2">
      <button
        className="mode-btn"
        data-active={mode === "overview"}
        onClick={toOverview}
        aria-pressed={mode === "overview"}
        title="Show all migration waves as a looping summary"
      >
        <span className="mode-btn__dot" aria-hidden />
        Overview
      </button>

      <div className="mx-2 hidden h-4 w-px bg-white/10 sm:block" />

      <button className="ctrl-btn" onClick={() => step(-STEP)} aria-label="Step back in time" title="Step back (←)">
        <Icon d={ICONS.stepBack} />
      </button>
      <button
        className="ctrl-btn"
        data-active={reverseActive}
        onClick={() => (reverseActive ? pause() : play(-1))}
        aria-label={reverseActive ? "Pause" : "Play in reverse"}
        title="Play backwards"
      >
        <Icon d={reverseActive ? ICONS.pause : ICONS.reverse} fill />
      </button>
      <button
        className="ctrl-btn ctrl-btn--primary"
        data-active={forwardActive}
        onClick={() => (forwardActive ? pause() : play(1))}
        aria-label={forwardActive ? "Pause" : "Play"}
        title="Play / pause (space)"
      >
        <Icon d={forwardActive ? ICONS.pause : ICONS.play} fill />
      </button>
      <button className="ctrl-btn" onClick={() => step(STEP)} aria-label="Step forward in time" title="Step forward (→)">
        <Icon d={ICONS.stepFwd} />
      </button>

      <div className="mx-3 hidden h-4 w-px bg-white/10 sm:block" />

      <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Playback speed">
        {PLAYBACK_SPEEDS.map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={speed === s}
            className="speed-btn"
            data-active={speed === s}
            onClick={() => setSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>

      {mode === "historical" && (
        <>
          <div className="mx-3 hidden h-4 w-px bg-white/10 sm:block" />
          <button
            className="speed-btn"
            data-active={follow}
            onClick={() => setFollowCamera(!follow)}
            title="Let the camera follow migrations during playback"
          >
            {follow ? "Director cam" : "Free cam"}
          </button>
        </>
      )}
    </div>
  );
}
