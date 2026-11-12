"use client";

import { useState, type ReactNode } from "react";
import type { Confidence } from "@/types/migration";
import { datasetDisclaimer, sources } from "@/data";
import { useHistoryStore } from "@/stores/useHistoryStore";

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };

/** Same glass panel as the route panel, re-tinted per entity. */
export function PanelShell({
  accent,
  kicker,
  title,
  subtitle,
  media,
  hero,
  chips,
  ariaLabel,
  children,
}: {
  accent: string;
  kicker: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional visual beside the title (e.g. an animated milestone icon). */
  media?: ReactNode;
  /** Full-width visual above the header (e.g. an animated milestone scene). */
  hero?: ReactNode;
  chips?: ReactNode;
  ariaLabel: string;
  children: ReactNode;
}) {
  const close = () => useHistoryStore.getState().select(null);
  return (
    <aside className="route-panel glass" style={{ ["--route-color" as string]: accent }} aria-label={ariaLabel}>
      {hero && <div className="-mx-1 -mt-1 mb-4">{hero}</div>}
      <div className="flex items-start gap-3">
        {media ?? (hero ? null : <span className="legend-swatch mt-2" style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />)}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.28em]" style={{ color: accent }}>
            {kicker}
          </div>
          <h2 className="mt-1 font-serif text-[24px] leading-tight text-[#f4eee2]">{title}</h2>
          {subtitle && <p className="mt-1 text-[11.5px] text-white/45">{subtitle}</p>}
        </div>
        <button className="close-btn" onClick={close} aria-label="Close details" title="Close (Esc)">
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {chips && <div className="mt-3 flex flex-wrap gap-1.5">{chips}</div>}
      <div className="mt-4 space-y-5 text-[12.5px] leading-relaxed">{children}</div>
    </aside>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/[0.07] pt-4">
      <h3 className="label mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-1">
      <dt className="text-white/40">{label}</dt>
      <dd className="text-white/75">{children}</dd>
    </div>
  );
}

export function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  return (
    <span className="chip" data-tone={confidence}>
      Confidence: {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

/** Inline link-styled button to open another entity. */
export function EntityLink({ onClick, children, color }: { onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button className="entity-link" onClick={onClick} style={color ? { ["--link-color" as string]: color } : undefined}>
      {children}
    </button>
  );
}

export function SourcesBlock({ ids, note }: { ids: string[]; note?: string }) {
  const [open, setOpen] = useState(false);
  const unique = [...new Set(ids)].filter((id) => sources[id]);
  return (
    <section className="border-t border-white/[0.07] pt-4">
      <button className="label transition-colors hover:text-white/80" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Sources ({unique.length}) {open ? "–" : "+"}
      </button>
      {open && (
        <ol className="mt-3 space-y-2 text-[11px] text-white/45">
          {unique.map((id) => {
            const s = sources[id];
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
          <li className="pt-1 italic text-white/30">{note ?? datasetDisclaimer}</li>
        </ol>
      )}
    </section>
  );
}

/** Italicise binomial names only (common names like "Neanderthals" stay roman). */
export function SpeciesName({ name, scientificName }: { name: string; scientificName: string | null }) {
  return scientificName === name ? <em className="font-serif">{name}</em> : <>{name}</>;
}
