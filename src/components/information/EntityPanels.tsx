"use client";

import {
  milestoneById,
  milestoneNote,
  milestones,
  periods,
  populationById,
  populationsBySpecies,
  routeById,
  routes,
  siteById,
  species,
  speciesById,
  speciesNote,
} from "@/data";
import type { ArchaeologicalSite, HistoricalMilestone, PopulationCluster, Species } from "@/types/migration";
import { MILESTONE_CATEGORY_LABEL } from "@/types/migration";
import { displayYear, formatYear } from "@/engine/timeline/timeEngine";
import { formatRange, speciesAt, speciesStatus, speciesVisible } from "@/engine/species/speciesModel";
import { populationState } from "@/engine/population/populationModel";
import {
  milestonesAround,
  milestonesForPeriod,
  milestonesForPopulation,
  milestonesForSite,
  milestonesForSpecies,
} from "@/engine/milestones/milestoneQueries";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { animateYearTo } from "@/stores/yearTween";
import { milestoneAccent } from "@/components/milestones/MilestoneIcon";
import { MilestoneScene } from "@/components/milestones/MilestoneScene";
import { MilestoneTimeline } from "@/components/milestones/MilestoneTimeline";
import { goToMilestone, milestoneReached, milestoneVisible } from "@/components/milestones/milestoneNav";
import { openSpecies } from "./SpeciesList";
import { ConfidenceChip, EntityLink, Field, PanelShell, Section, SourcesBlock, SpeciesName } from "./panelParts";

const when = (y: number) => {
  const f = formatYear(y);
  return `${f.value} ${f.unit}`.trim();
};
const approx = (y: number) => (y >= 1_000_000 ? `~${when(y)}` : `~${Math.round(y).toLocaleString("en-US")} years ago`);

function useYear() {
  return useHistoryStore((s) => displayYear(s.yearsBP));
}

function openSite(site: ArchaeologicalSite) {
  const s = useHistoryStore.getState();
  s.select({ kind: "site", id: site.id }, { lat: site.location.lat, lng: site.location.lng, distance: 2.1 });
  if (s.mode === "historical" && s.yearsBP > site.dateRange[0]) {
    s.pause();
    animateYearTo(site.dateRange[0] * 0.98, 1.4);
  }
}

function openPopulation(c: PopulationCluster) {
  const s = useHistoryStore.getState();
  s.select({ kind: "population", id: c.id }, { ...c.coordinates, distance: 2.6 });
  if (s.mode === "historical" && populationState(c, s.yearsBP).presence < 0.5) {
    s.pause();
    animateYearTo(c.establishedYear, 1.4);
  }
}

function SpeciesChipLinks({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <span className="text-white/50">Maker unknown</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {ids.map((id) => {
        const sp = speciesById[id];
        return (
          <EntityLink key={id} color={sp.color} onClick={() => openSpecies(sp)}>
            <SpeciesName name={sp.name} scientificName={sp.scientificName} />
          </EntityLink>
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function SpeciesPanel({ sp }: { sp: Species }) {
  const mode = useHistoryStore((s) => s.mode);
  const year = useYear();
  const status = speciesStatus(sp, year);
  const coexisting = speciesAt(species, year).filter((o) => o.id !== sp.id);
  const pops = populationsBySpecies[sp.id] ?? [];

  return (
    <PanelShell
      accent={sp.color}
      ariaLabel={`${sp.name} details`}
      kicker={sp.genus === "Homo" ? "Human species · genus Homo" : `Hominin · genus ${sp.genus} (not Homo)`}
      title={<SpeciesName name={sp.name} scientificName={sp.scientificName} />}
      subtitle={
        <>
          {sp.scientificName && sp.scientificName !== sp.name && <em className="font-serif text-[13px]">{sp.scientificName} · </em>}
          {!sp.scientificName && "No formal species name · "}
          {formatRange(sp)}
        </>
      }
      chips={<ConfidenceChip confidence={sp.confidence} />}
    >
      <div className="status-line" data-tone={mode === "historical" && status !== "present" ? "inactive" : "active"}>
        {mode === "overview" ? (
          <>Shown with other species as a summary. Its record spans {formatRange(sp)}.</>
        ) : status === "present" ? (
          <>
            <strong>Present {when(year)}.</strong>{" "}
            {coexisting.length > 0 ? (
              <>
                Coexisting with{" "}
                {coexisting.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && (i === coexisting.length - 1 ? " and " : ", ")}
                    <EntityLink color={o.color} onClick={() => openSpecies(o)}>
                      <SpeciesName name={o.name} scientificName={o.scientificName} />
                    </EntityLink>
                  </span>
                ))}
                .
              </>
            ) : (
              "No other hominin is known from this time."
            )}
          </>
        ) : (
          <>
            <strong>{status === "not-yet" ? "Not yet in the record" : "No longer in the record"} {when(year)}.</strong>{" "}
            <button className="inline-link" onClick={() => animateYearTo(sp.focusYear, 1.4)}>
              Go to {approx(sp.focusYear)} →
            </button>
          </>
        )}
      </div>

      <p className="text-[13px] text-white/70">{sp.timeNote}</p>

      <Section title="Classification">
        <dl>
          <Field label="Taxonomy">{sp.classification}</Field>
          <Field label="Note">{sp.taxonomyNote}</Field>
        </dl>
      </Section>

      <Section title="Where and how they lived">
        <dl>
          <Field label="Distribution">{sp.distribution}</Field>
          <Field label="Body">{sp.physical}</Field>
          <Field label="Technology">{sp.technology}</Field>
          <Field label="Relations">{sp.relationships}</Field>
        </dl>
      </Section>

      {pops.length > 0 && (
        <Section title="Populations on the globe">
          <ul className="space-y-1.5">
            {pops.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3">
                <EntityLink color={sp.id === "homo-sapiens" ? c.color : sp.color} onClick={() => openPopulation(c)}>
                  {c.region}
                </EntityLink>
                <span className="shrink-0 text-[10.5px] text-white/40">from {approx(c.startYear)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {sp.siteIds.length > 0 && (
        <Section title="Key discoveries">
          <ul className="space-y-1.5">
            {sp.siteIds.map((id) => {
              const site = siteById[id];
              return (
                <li key={id}>
                  <EntityLink onClick={() => openSite(site)}>{site.name}</EntityLink>
                  <span className="text-white/40"> · {site.region}</span>
                  <p className="text-[11.5px] text-white/50">{site.description}</p>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Milestones">
        <MilestoneTimeline
          items={milestonesForSpecies(milestones, sp.id)}
          empty="No milestones are attributed to this species with confidence."
        />
      </Section>

      <SourcesBlock ids={sp.sources} note={speciesNote} />
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

const KIND_LABEL: Record<string, string> = {
  route: "route",
  species: "species",
  site: "site",
  population: "population",
  period: "period",
  milestones: "all milestones",
};

const coord = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? "E" : "W"}`;

export function MilestonePanel({ m }: { m: HistoricalMilestone }) {
  const accent = milestoneAccent(m.visualIcon);
  const previous = useHistoryStore((s) => s.previousSelection);
  const mode = useHistoryStore((s) => s.mode);
  const year = useYear();
  const reached = milestoneReached(m, year);
  return (
    <PanelShell
      accent={accent}
      ariaLabel={`${m.title} details`}
      kicker={MILESTONE_CATEGORY_LABEL[m.category]}
      title={m.title}
      subtitle={m.dateLabel}
      hero={<MilestoneScene key={m.id} icon={m.visualIcon} variant="hero" label={`Animated illustration: ${m.title}`} />}
      chips={
        <>
          <ConfidenceChip confidence={m.confidence} />
          <span className="chip" data-tone="illustrative">
            {m.evidenceType === "fossil" ? "Fossil evidence" : m.evidenceType === "genetic" ? "Genetic evidence" : "Archaeological evidence"}
          </span>
        </>
      }
    >
      {previous && (
        <button className="inline-link -mt-1 text-[11.5px]" onClick={() => useHistoryStore.getState().select(previous)}>
          ← Back to {KIND_LABEL[previous.kind] ?? "previous"}
        </button>
      )}
      {mode === "historical" && (
        <div className="status-line" data-tone={reached ? "active" : "inactive"}>
          {reached ? (
            <>
              <strong>Evidence exists by {when(year)}.</strong> The globe marks where it was found.
            </>
          ) : (
            <>
              <strong>Not yet at {when(year)}.</strong> The earliest evidence dates to {m.dateLabel}.{" "}
              <button className="inline-link" onClick={() => goToMilestone(m, { openPanel: true })}>
                Go there →
              </button>
            </>
          )}
        </div>
      )}
      <p className="text-[13px] text-white/75">{m.shortDescription}</p>
      <dl>
        <Field label="When">{m.dateLabel}</Field>
        <Field label="Where">
          {m.geographicLocation.label}
          <span className="block text-[11px] text-white/40">
            {coord(m.geographicLocation.lat, m.geographicLocation.lng)}
            {m.geographicLocation.approximate && " · location approximate"}
          </span>
        </Field>
        <Field label="Who">
          <SpeciesChipLinks ids={m.relatedSpeciesIds} />
          {m.relatedSpeciesIds.length === 0 && (
            <span className="block text-[11px] text-white/40">No fossils are associated; see the note below.</span>
          )}
        </Field>
        {m.relatedRouteIds && m.relatedRouteIds.length > 0 && (
          <Field label="Route">
            {m.relatedRouteIds.map((id) => (
              <EntityLink key={id} color={routeById[id].color} onClick={() => useHistoryStore.getState().selectRoute(id, routeById[id].camera)}>
                {routeById[id].name}
              </EntityLink>
            ))}
          </Field>
        )}
        {m.relatedSiteIds && m.relatedSiteIds.length > 0 && (
          <Field label="Site">
            <span className="flex flex-wrap gap-x-2">
              {m.relatedSiteIds.map((id) => (
                <EntityLink key={id} onClick={() => openSite(siteById[id])}>
                  {siteById[id].name}
                </EntityLink>
              ))}
            </span>
          </Field>
        )}
      </dl>

      <Section title="What the evidence shows">
        <p className="text-white/70">{m.detailedDescription}</p>
        <p className="mt-2 text-white/55">
          <span className="text-white/40">Evidence: </span>
          {m.evidence}
        </p>
      </Section>

      <Section title="Earliest evidence is not the origin">
        <p className="text-white/60">{m.originNote}</p>
      </Section>

      <Section title="Why it matters">
        <p className="text-white/70">{m.significance}</p>
      </Section>

      <Section title="Around this time">
        <MilestoneTimeline items={milestonesAround(milestones, m).filter((x) => x.id !== m.id)} />
      </Section>

      <SourcesBlock ids={m.sources} note={milestoneNote} />
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

export function SitePanel({ site }: { site: ArchaeologicalSite }) {
  const year = useYear();
  const mode = useHistoryStore((s) => s.mode);
  const [older, younger] = site.dateRange;
  const related = milestonesForSite(milestones, site);
  return (
    <PanelShell
      accent="#f3e6cf"
      ariaLabel={`${site.name} details`}
      kicker={`Archaeological site · ${site.region}`}
      title={site.name}
      subtitle={`${approx(older)} – ${approx(younger)}`}
      chips={<ConfidenceChip confidence={site.confidence} />}
    >
      {mode === "historical" && year > older && (
        <div className="status-line" data-tone="inactive">
          <strong>Not yet {when(year)}.</strong>{" "}
          <button className="inline-link" onClick={() => animateYearTo(older * 0.98, 1.4)}>
            Go to its period →
          </button>
        </div>
      )}
      <p className="text-[13px] text-white/75">{site.description}</p>
      {site.details && <p className="text-white/65">{site.details}</p>}
      <dl>
        <Field label="Attributed to">
          <SpeciesChipLinks ids={site.speciesIds ?? []} />
        </Field>
      </dl>
      {related.length > 0 && (
        <Section title="Milestones">
          <MilestoneTimeline items={related} />
        </Section>
      )}
      <SourcesBlock ids={site.sources} />
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

export function PopulationPanel({ c }: { c: PopulationCluster }) {
  const year = useYear();
  const mode = useHistoryStore((s) => s.mode);
  const sp = speciesById[c.speciesId];
  const st = populationState(c, year);
  const STATUS: Record<string, string> = {
    absent: "Not yet present",
    forming: "Becoming established",
    established: "Present",
    fading: "Evidence of continuity fades",
    ended: "No longer shown",
  };
  return (
    <PanelShell
      accent={c.color}
      ariaLabel={`${c.region} population details`}
      kicker={
        <>
          Population · <SpeciesName name={sp.name} scientificName={sp.scientificName} />
        </>
      }
      title={c.region}
      subtitle={`Modelled from ${approx(c.startYear)}${c.endYear !== undefined ? ` to ${approx(c.endYear)}` : ""}`}
      chips={
        <>
          <ConfidenceChip confidence={c.confidence} />
          <span className="chip" data-tone="illustrative">
            {c.attestedYear !== undefined ? `Evidence from ${approx(c.attestedYear)}` : "Presence inferred"}
          </span>
        </>
      }
    >
      {mode === "historical" && (
        <div className="status-line" data-tone={st.presence > 0.05 ? "active" : "inactive"}>
          <strong>{STATUS[st.status]}</strong> {when(year)}
          {st.status !== "absent" && st.status !== "ended" && <> · {st.attested ? "archaeological evidence" : "inferred"}</>}
        </div>
      )}
      <p className="text-white/70">{c.basisNote}</p>
      <dl>
        <Field label="Species">
          <SpeciesChipLinks ids={[c.speciesId]} />
        </Field>
        {c.sourceOf.length > 0 && (
          <Field label="Groups left for">
            <span className="flex flex-wrap gap-x-2">
              {c.sourceOf.map((id) => (
                <EntityLink key={id} color={routeById[id].color} onClick={() => useHistoryStore.getState().selectRoute(id, routeById[id].camera)}>
                  {routeById[id].destination}
                </EntityLink>
              ))}
            </span>
          </Field>
        )}
        {c.destinationOf.length > 0 && (
          <Field label="Formed by">
            <span className="flex flex-wrap gap-x-2">
              {c.destinationOf.map((id) => (
                <EntityLink key={id} color={routeById[id].color} onClick={() => useHistoryStore.getState().selectRoute(id, routeById[id].camera)}>
                  {routeById[id].name}
                </EntityLink>
              ))}
            </span>
          </Field>
        )}
      </dl>
      {c.sourceOf.length > 0 && (
        <p className="text-[11.5px] text-white/45">This population remained after groups departed from it.</p>
      )}
      <p className="text-[11px] text-white/35">
        Particle density is a visual parameter, not a population size. No population counts are modelled.
      </p>
      <Section title="Milestones in this region">
        <MilestoneTimeline items={milestonesForPopulation(milestones, c)} empty="No milestones recorded in this region during this population's period." />
      </Section>
      {c.siteIds.length > 0 && (
        <Section title="Sites">
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {c.siteIds.map((id) => (
              <EntityLink key={id} onClick={() => openSite(siteById[id])}>
                {siteById[id].name}
              </EntityLink>
            ))}
          </span>
        </Section>
      )}
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

export function PeriodPanel({ id }: { id: string }) {
  const p = periods.find((x) => x.id === id);
  const filter = useHistoryStore((s) => s.speciesFilter);
  if (!p) return null;
  const living = species.filter((sp) => sp.timeRange.older >= p.endYear && sp.timeRange.younger <= p.startYear);
  const waves = routes.filter((r) => r.startYear > p.endYear && r.endYear < p.startYear);
  return (
    <PanelShell
      accent="#ffc888"
      ariaLabel={`${p.name} details`}
      kicker="Period"
      title={p.name}
      subtitle={`${approx(p.startYear)} – ${p.endYear === 0 ? "present" : approx(p.endYear)}`}
      chips={<ConfidenceChip confidence={p.confidence} />}
    >
      <p className="text-[13px] text-white/70">{p.description}</p>
      <Section title="Hominins in this period">
        <SpeciesChipLinks ids={living.filter((sp) => speciesVisible(filter, sp)).map((sp) => sp.id)} />
      </Section>
      {waves.length > 0 && filter !== "other" && (
        <Section title="Homo sapiens migrations">
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {waves.map((r) => (
              <EntityLink key={r.id} color={r.color} onClick={() => useHistoryStore.getState().selectRoute(r.id, r.camera)}>
                {r.name}
              </EntityLink>
            ))}
          </span>
        </Section>
      )}
      <Section title="Milestones">
        <MilestoneTimeline items={milestonesForPeriod(milestones, p).filter((m) => milestoneVisible(filter, m))} />
      </Section>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

export function MilestonesBrowse() {
  const filter = useHistoryStore((s) => s.speciesFilter);
  const items = milestones.filter((m) => milestoneVisible(filter, m));
  const hidden = milestones.length - items.length;
  return (
    <PanelShell
      accent="#ffd59a"
      ariaLabel="Historical milestones"
      kicker={filter === "sapiens" ? "Homo sapiens" : filter === "other" ? "Other hominins" : "All hominins"}
      title="Milestones"
      subtitle={`${items.length} developments, by their earliest known evidence`}
    >
      <p className="text-[11.5px] text-white/45">
        Each date marks the earliest known evidence at one place, not the moment of invention, and nothing happened
        everywhere at once. Select a milestone to travel there in time and space.
      </p>
      {hidden > 0 && (
        <p className="text-[11.5px] text-white/50">
          {hidden} more {hidden === 1 ? "milestone is" : "milestones are"} hidden by the species filter (other hominins or
          unknown makers).{" "}
          <button className="inline-link" onClick={() => useHistoryStore.getState().setSpeciesFilter("all")}>
            Show all →
          </button>
        </p>
      )}
      <MilestoneTimeline items={items} />
      <SourcesBlock ids={items.flatMap((m) => m.sources)} note={milestoneNote} />
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

export function resolveEntity(kind: string, id: string) {
  switch (kind) {
    case "species":
      return speciesById[id] ? <SpeciesPanel key={id} sp={speciesById[id]} /> : null;
    case "milestone":
      return milestoneById[id] ? <MilestonePanel key={id} m={milestoneById[id]} /> : null;
    case "site":
      return siteById[id] ? <SitePanel key={id} site={siteById[id]} /> : null;
    case "population":
      return populationById[id] ? <PopulationPanel key={id} c={populationById[id]} /> : null;
    case "period":
      return <PeriodPanel key={id} id={id} />;
    case "milestones":
      return <MilestonesBrowse key="milestones" />;
    default:
      return null;
  }
}
