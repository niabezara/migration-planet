"use client";

import { species } from "@/data";
import type { Species } from "@/types/migration";
import { displayYear } from "@/engine/timeline/timeEngine";
import { formatRange, speciesStatus, speciesVisible } from "@/engine/species/speciesModel";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { animateYearTo } from "@/stores/yearTween";

const kyrShort = (y: number) => (y >= 1_000_000 ? `${Math.round(y / 100_000) / 10} Ma` : `${Math.round(y / 1000)} ka`);

/** Open a species: panel, camera, and (if needed) a year when it existed. */
export function openSpecies(sp: Species) {
  const s = useHistoryStore.getState();
  s.select({ kind: "species", id: sp.id }, sp.camera);
  if (s.mode === "historical" && speciesStatus(sp, s.yearsBP) !== "present") {
    s.pause();
    animateYearTo(sp.focusYear, 1.4);
  }
}

/**
 * Species visible under the current filter, with their status at the
 * selected year: who existed, and who coexisted, at this moment.
 */
export function SpeciesList() {
  const mode = useHistoryStore((s) => s.mode);
  const filter = useHistoryStore((s) => s.speciesFilter);
  const selected = useHistoryStore((s) => (s.selection?.kind === "species" ? s.selection.id : null));
  // Re-render only when a status bucket changes.
  const statusKey = useHistoryStore((s) => species.map((sp) => speciesStatus(sp, displayYear(s.yearsBP))).join("|"));
  const statuses = statusKey.split("|");
  const shown = species.filter((sp) => speciesVisible(filter, sp));
  const presentCount = shown.filter((sp) => statuses[sp.index] === "present").length;

  return (
    <div>
      <div className="label mb-2 flex items-baseline justify-between">
        <span>Hominins</span>
        {mode === "historical" && (
          <span className="normal-case tracking-normal text-white/40">
            {presentCount === 0 ? "none in the record" : presentCount === 1 ? "1 present" : `${presentCount} present · coexisting`}
          </span>
        )}
      </div>
      <ul className="space-y-px">
        {shown.map((sp) => {
          const st = statuses[sp.index];
          const inactive = mode === "historical" && st !== "present";
          return (
            <li key={sp.id}>
              <button
                className="legend-item legend-item--compact"
                data-selected={selected === sp.id}
                data-inactive={inactive}
                onClick={() => (selected === sp.id ? useHistoryStore.getState().select(null) : openSpecies(sp))}
                aria-pressed={selected === sp.id}
                title={sp.genus === "Homo" ? `${sp.name} (genus Homo)` : `${sp.name} (genus ${sp.genus}, not Homo)`}
              >
                <span className="legend-swatch" style={{ background: sp.color, boxShadow: `0 0 8px ${sp.color}` }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-left text-[12px] text-white/85">
                  {sp.scientificName === sp.name ? <em className="font-serif text-[13.5px]">{sp.name}</em> : sp.name}
                </span>
                <span className="shrink-0 text-[10.5px] tabular-nums text-white/40">
                  {mode === "historical"
                    ? st === "present"
                      ? "present"
                      : st === "not-yet"
                        ? "not yet"
                        : `last ~${kyrShort(sp.timeRange.younger)}`
                    : formatRange(sp)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
