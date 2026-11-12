"use client";

import { periods, species } from "@/data";
import { speciesAt, speciesVisible } from "@/engine/species/speciesModel";
import { currentPeriod, displayYear, formatSignedYear, formatYear } from "@/engine/timeline/timeEngine";
import { useIntroStore } from "@/components/intro/introState";
import { useHistoryStore } from "@/stores/useHistoryStore";

const OVERVIEW_TEXT = {
  sapiens: { tagline: "300,000 years. One species.", text: "" },
  other: {
    tagline: "3.5 million years. Many lineages.",
    text: "Other human species and earlier hominins, from Australopithecus to the last Neanderthals and Denisovans. They lived at different times, and are shown together here as a summary. Pick a year on the timeline to see who existed when.",
  },
  all: {
    tagline: "3.5 million years. Many lineages, one survivor.",
    text: "Hominin ranges and Homo sapiens migrations shown together as a summary; they did not all exist at the same time. Pick a year on the timeline to see which species coexisted, and where.",
  },
} as const;

/** Title, current date (or overview state) and period. Re-renders per displayed-year change only. */
export function DateHeader() {
  const mode = useHistoryStore((s) => s.mode);
  const yearsBP = useHistoryStore((s) => displayYear(s.yearsBP));
  const { value, unit } = formatYear(yearsBP);
  const period = currentPeriod(periods, yearsBP);
  const filter = useHistoryStore((s) => s.speciesFilter);
  const shownNow = speciesAt(species, yearsBP).filter((sp) => speciesVisible(filter, sp));
  const overview = OVERVIEW_TEXT[filter];

  return (
    <header className="max-w-[min(30rem,calc(100vw-2rem))]">
      <div className="ui-fade flex items-center gap-4">
        <h1 className="text-[11px] font-medium uppercase tracking-[0.55em] text-white/75">The Human Journey</h1>
        <button
          className="replay-btn"
          onClick={() => useIntroStore.getState().replay()}
          title="Replay the opening sequence"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
            <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Intro
        </button>
      </div>
      <div className="ui-fade mt-1 h-px w-10 bg-linear-to-r from-[#e8e3d8]/70 to-transparent" />

      {mode === "overview" ? (
        <div className="ui-fade">
          <div className="mt-6 flex items-baseline gap-3">
            <span className="font-serif text-[clamp(2.2rem,4.6vw,3.4rem)] leading-none text-[#f4eee2]">
              Overview
            </span>
            <span className="text-[11px] uppercase tracking-[0.3em] text-white/45">All waves</span>
          </div>
          <p className="mt-3 text-[10.5px] uppercase tracking-[0.42em] text-[#ffd59a]/75">{overview.tagline}</p>
          {filter === "sapiens" ? (
            <p className="mt-3 text-[13px] leading-relaxed text-white/55">
              How <em className="font-serif text-[15px] not-italic text-white/75">Homo sapiens</em> spread from
              Africa across the world. These waves happened at <span className="text-white/80">different times</span>,
              from ~135,000 to ~15,000 years ago. They are looped together here as a summary. Pick a year on
              the timeline to see one moment.
            </p>
          ) : (
            <p className="mt-3 text-[13px] leading-relaxed text-white/55">{overview.text}</p>
          )}
        </div>
      ) : (
        <div className="ui-fade">
          <div className="mt-6 flex items-baseline gap-3">
            <span className="font-serif text-[clamp(2.4rem,5vw,3.6rem)] leading-none tabular-nums text-[#f4eee2]">
              {value}
            </span>
            {unit && <span className="text-[11px] uppercase tracking-[0.3em] text-white/45">{unit}</span>}
          </div>
          <div className="mt-2 font-mono text-[11px] tracking-wider text-white/35" title="Signed year: negative = before present">
            year {formatSignedYear(yearsBP)}
          </div>
          {shownNow.length === 0 && (
            <p className="mt-3 max-w-[26rem] text-[12px] leading-relaxed text-white/45">
              {filter === "sapiens"
                ? "Homo sapiens does not yet appear in the fossil record at this time."
                : yearsBP < 50_000
                  ? "No other hominins are known from the record after this time; Homo sapiens is the only surviving human species."
                  : "None of the hominins modelled here is in the record at exactly this moment. The fossil record has gaps, and other hominins not shown here (for example early Homo at Ledi-Geraru, ~2.8 million years ago) lived during parts of this time."}{" "}
              {filter !== "all" && (
                <button className="inline-link" style={{ ["--route-color" as string]: "#ffd59a" }} onClick={() => useHistoryStore.getState().setSpeciesFilter("all")}>
                  Show all hominins →
                </button>
              )}
            </p>
          )}
          {period && (
            <div className="mt-4">
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#ffc888]/80">{period.name}</span>
              <p className="mt-2 line-clamp-4 text-[13px] leading-relaxed text-white/55" title={period.description}>
                {period.description}
              </p>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
