"use client";

import { useHistoryStore, type SpeciesFilter as Filter } from "@/stores/useHistoryStore";

const OPTIONS: { id: Filter; label: string; title: string }[] = [
  { id: "all", label: "All", title: "Every hominin species and Homo sapiens populations" },
  { id: "sapiens", label: "Homo sapiens", title: "Homo sapiens populations and migrations" },
  { id: "other", label: "Other hominins", title: "Other human species and earlier hominins" },
];

/** Compact segmented control: which hominins the globe and timeline show. */
export function SpeciesFilter() {
  const filter = useHistoryStore((s) => s.speciesFilter);
  const { setSpeciesFilter } = useHistoryStore.getState();
  return (
    <div className="species-filter" role="radiogroup" aria-label="Species shown">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={filter === o.id}
          data-active={filter === o.id}
          title={o.title}
          onClick={() => setSpeciesFilter(o.id)}
        >
          {o.id === "sapiens" ? <em>{o.label}</em> : o.label}
        </button>
      ))}
    </div>
  );
}
