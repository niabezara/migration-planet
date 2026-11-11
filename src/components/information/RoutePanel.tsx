"use client";

import { useState } from "react";
import type { Confidence, EvidenceType, MigrationRoute } from "@/types/migration";
import { datasetDisclaimer, routeById, siteById, sources } from "@/data";
import { displayYear, formatYear, routeState } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { animateYearTo } from "@/stores/yearTween";

const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };
const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  archaeological: "Archaeological",
  genetic: "Genetic",
  palaeoenvironmental: "Palaeoenvironmental",
  chronological: "Chronological",
};
const kyr = (y: number) => `${Math.round(y / 1000).toLocaleString("en-US")},000`;

/** Status line: tells the truth about whether the route exists at the selected moment. */
function RouteStatusLine({ route }: { route: MigrationRoute }) {
  const mode = useHistoryStore((s) => s.mode);
  // Rounded year: re-renders only when the displayed date changes.
  const yearsBP = useHistoryStore((s) => displayYear(s.yearsBP));
  const { pause } = useHistoryStore.getState();
  const st = routeState(route, yearsBP);
  const when = `${formatYear(yearsBP).value} ${formatYear(yearsBP).unit}`.trim();

  const jumpIn = () => {
    pause();
    animateYearTo(route.startYear - (route.startYear - route.endYear) * 0.35);
  };

  if (mode === "overview") {
    return (
      <p className="status-line">
        Looping in Overview as a summary. This wave took place roughly {kyr(route.startYear)}–{kyr(route.endYear)} years ago.{" "}
        <button className="inline-link" onClick={jumpIn}>Explore it in time →</button>
      </p>
    );
  }
  if (st.status === "upcoming" || st.status === "completed") {
    return (
      <p className="status-line" data-tone="inactive">
        <strong>Not active at {when}.</strong>{" "}
        {st.status === "upcoming"
          ? `This wave begins around ${kyr(route.startYear)} years ago.`
          : `This wave had ended by around ${kyr(route.endYear)} years ago.`}{" "}
        <button className="inline-link" onClick={jumpIn}>Jump to it →</button>
      </p>
    );
  }
  const pct = Math.round(Math.min(1, Math.max(0, st.progress)) * 100);
  return (
    <div className="status-line" data-tone="active">
      <div className="flex items-center justify-between">
        <span>
          {st.status === "gathering" && "Groups gathering at the origin"}
          {st.status === "active" && "Under way"}
          {st.status === "arrived" && `Arrived · ${route.destination}`}
        </span>
        <span className="tabular-nums text-white/50">{pct}%</span>
      </div>
      <div className="mt-2 h-0.5 w-full overflow-hidden rounded bg-white/10">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: route.color }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/[0.07] pt-4">
      <h3 className="label mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 py-1">
      <dt className="text-white/40">{label}</dt>
      <dd className="text-white/75">{children}</dd>
    </div>
  );
}

export function RoutePanel() {
  const selectedId = useHistoryStore((s) => s.selectedRouteId);
  const [showSources, setShowSources] = useState(false);
  const route = selectedId ? routeById[selectedId] : null;
  if (!route) return null;

  const close = () => useHistoryStore.getState().selectRoute(null);
  const sourceIds = [...new Set(route.evidence.flatMap((e) => e.sourceIds ?? []))];
  const evidenceByType = route.evidence.reduce<Record<string, typeof route.evidence>>((acc, e) => {
    (acc[e.type] ??= []).push(e);
    return acc;
  }, {});

  return (
    <aside
      key={route.id}
      className="route-panel glass"
      style={{ ["--route-color" as string]: route.color }}
      aria-label={`${route.name} details`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="legend-swatch mt-2" style={{ background: route.color, boxShadow: `0 0 12px ${route.color}` }} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.28em]" style={{ color: route.color }}>
            {route.category}
          </div>
          <h2 className="mt-1 font-serif text-[24px] leading-tight text-[#f4eee2]">{route.name}</h2>
          <p className="mt-1 text-[11.5px] text-white/45">
            ~{kyr(route.startYear)} → ~{kyr(route.endYear)} years ago
          </p>
        </div>
        <button className="close-btn" onClick={close} aria-label="Close route details" title="Close (Esc)">
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="chip" data-tone={route.confidence}>Confidence: {CONFIDENCE_LABEL[route.confidence]}</span>
        {route.dataStatus === "illustrative" && (
          <span className="chip" data-tone="illustrative">Path &amp; timing illustrative</span>
        )}
      </div>

      <div className="mt-4">
        <RouteStatusLine route={route} />
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-white/70">{route.description}</p>

      <div className="mt-5 space-y-5 text-[12.5px] leading-relaxed">
        <Section title="Geography">
          <dl>
            <Field label="Origin">{route.origin}</Field>
            <Field label="Destination">{route.destination}</Field>
            <Field label="Via">{route.intermediateRegions.join(" · ")}</Field>
          </dl>
          <p className="mt-2 text-white/50">{route.pathDescription}</p>
        </Section>

        <Section title="History">
          <dl>
            <Field label="Who">{route.people}</Field>
            <Field label="Context">{route.historicalContext}</Field>
            <Field label="Why it matters">{route.significance}</Field>
          </dl>
        </Section>

        <Section title="Evidence">
          <div className="space-y-3">
            {Object.entries(evidenceByType).map(([type, items]) => (
              <div key={type}>
                <div className="mb-1 text-[11px] text-white/45">{EVIDENCE_LABEL[type as EvidenceType]}</div>
                <ul className="list-disc space-y-1 pl-4 text-white/70 marker:text-white/25">
                  {items.map((e) => (
                    <li key={e.description}>{e.description}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {route.siteIds.length > 0 && (
          <Section title="Key sites">
            <ul className="space-y-1.5">
              {route.siteIds.map((id) => {
                const s = siteById[id];
                if (!s) return null;
                return (
                  <li key={id} className="flex items-baseline justify-between gap-3">
                    <span className="text-white/80">
                      {s.name} <span className="text-white/40">· {s.region}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-white/45">
                      {Math.round(s.dateRange[0] / 1000)}–{Math.round(s.dateRange[1] / 1000)}k
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <Section title="Uncertainty">
          <p className="text-white/60">{route.uncertainty}</p>
        </Section>

        <section className="border-t border-white/[0.07] pt-4">
          <button
            className="label transition-colors hover:text-white/80"
            onClick={() => setShowSources((v) => !v)}
            aria-expanded={showSources}
          >
            Sources ({sourceIds.length}) {showSources ? "–" : "+"}
          </button>
          {showSources && (
            <ol className="mt-3 space-y-2 text-[11px] text-white/45">
              {sourceIds.map((id) => {
                const s = sources[id];
                if (!s) return null;
                return (
                  <li key={id}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-white/80">
                        {s.citation}
                      </a>
                    ) : (
                      s.citation
                    )}
                  </li>
                );
              })}
              <li className="pt-1 italic text-white/30">{datasetDisclaimer}</li>
            </ol>
          )}
        </section>
      </div>
    </aside>
  );
}
