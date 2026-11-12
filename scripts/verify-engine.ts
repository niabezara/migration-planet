/* Numerical checks for the deterministic particle engine. Run: npm run verify */
import { Color, Vector3 } from "three";
import { milestones, populations, routes, sites, siteById, species, speciesById } from "@/data";
import { speciesAt } from "@/engine/species/speciesModel";
import { generatePopulationBuffers } from "@/engine/particles/populationGenerator";
import { clusterContains, particlePresence, populationState, routeArrivals } from "@/engine/population/populationModel";
import { ROUTE_COLORS } from "@/config/routeColors";
import { CORE_ATTRIBUTES, generateParticleBuffers } from "@/engine/particles/clusterGenerator";
import { PARTICLE_CONSTANTS } from "@/engine/particles/constants";
import { particlePosition, routeFocusPoint } from "@/engine/particles/particleSimulation";
import { haversineKm, latLngToVector3, vector3ToLatLng } from "@/engine/geo/coordinates";
import { routeState, timelineToYear, visibleRoutes, yearToTimeline } from "@/engine/timeline/timeEngine";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
  if (!ok) failures++;
};

const t0 = performance.now();
const b = generateParticleBuffers(routes, { particleScale: 1, trailShare: 0.35, glowShare: 0.06 });
const genMs = performance.now() - t0;
console.log(
  `routes ${routes.length} · core ${b.particleCount} · trail vertices ${b.trail.vertexCount} · glow sprites ${b.glowIndex.length} · path rows ${b.pathRows} · generated in ${genMs.toFixed(0)} ms`,
);

console.log("\nGeometry & time mapping");
let roundTrip = true;
for (const [lat, lng] of [[0, 0], [32.4, 35.6], [-33.9, 151.2], [64, -150]]) {
  const r = vector3ToLatLng(latLngToVector3(lat, lng));
  roundTrip &&= Math.abs(r.lat - lat) < 1e-9 && Math.abs(r.lng - lng) < 1e-9;
}
check(roundTrip, "lat/lng ↔ vector round-trip");
check([3_500_000, 1_800_000, 300000, 70000, 45000, 8000, 0].every((y) => Math.abs(timelineToYear(yearToTimeline(y)) - y) < 1e-3), "timeline scale is invertible");

console.log("\nColours (scenarios 2–4)");
const colours = routes.map((r) => r.color.toLowerCase());
check(routes.length >= 3, `at least three routes (${routes.length})`);
check(new Set(colours).size === routes.length, "every route has a distinct colour");
check(routes.every((r) => ROUTE_COLORS[r.id] === r.color), "every route colour comes from the central palette");
let consistent = true;
const c = new Color();
const colourOk = (arr: { aRoute: Float32Array; aColor: Float32Array }, v: number) => {
  c.set(routes[arr.aRoute[v]].color);
  return Math.abs(arr.aColor[v * 3] - c.r) < 1e-6 && Math.abs(arr.aColor[v * 3 + 1] - c.g) < 1e-6 && Math.abs(arr.aColor[v * 3 + 2] - c.b) < 1e-6;
};
for (let v = 0; v < b.particleCount; v++) consistent &&= colourOk(b.core, v);
for (let v = 0; v < b.trail.vertexCount; v++) consistent &&= colourOk(b.trail.attributes, v);
// Glow sprites index the core buffers, so they inherit the same colours.
consistent &&= b.glowIndex.every((i) => i < b.particleCount);
check(consistent, "every core dot, trail streak and glow sprite uses exactly its route's colour");

console.log("\nHistorical filtering (scenarios 7–8)");
const names = (y: number) => visibleRoutes(routes, y).map((r) => r.id);
for (const y of [100000, 70000, 45000, 20000, 0]) {
  const states = routes.map((r) => `${r.id}:${routeState(r, y).status}`).join("  ");
  console.log(`  ${String(y).padStart(6)} BP → visible [${names(y).join(", ")}]\n           ${states}`);
}
check(names(70000).join() === "out-of-africa-south", "70,000 years ago: only the main out-of-Africa dispersal");
check(
  ["levant-europe", "levant-caucasus", "sunda-sahul"].every((id) => names(45000).includes(id)) &&
    !names(45000).includes("africa-levant") &&
    !names(45000).includes("beringia-americas"),
  "45,000 years ago: Europe, Caucasus, Sahul (arriving); not Levant-I or Americas",
);

console.log("\nDeterminism & scrubbing (scenario 9)");
const idx = [0, 1234, 3000, b.particleCount - 1];
const fresh = idx.map((i) => particlePosition(b, i, 45000, new Vector3()));
// Scrub forward past 45k, then backwards to it.
for (let y = 70000; y > 20000; y -= 613) idx.forEach((i) => particlePosition(b, i, y));
for (let y = 20000; y < 45000; y += 389) idx.forEach((i) => particlePosition(b, i, y));
const restored = idx.map((i) => particlePosition(b, i, 45000, new Vector3()));
check(fresh.every((p, k) => p.equals(restored[k])), "scrubbing away and back restores identical positions");

let maxDev = 0;
for (const y of [130000, 60000, 45000, 25000, 15000]) {
  for (let i = 0; i < b.particleCount; i += 7) maxDev = Math.max(maxDev, Math.abs(particlePosition(b, i, y).length() - 1));
}
check(maxDev < 1e-6, `particles stay on the sphere surface (max |r−1| = ${maxDev.toExponential(1)})`);

console.log("\nDensity, surface, arrival, branches");
check(b.particleCount >= 20000 && b.particleCount <= 80000, `desktop particle budget within 20k–80k (${b.particleCount})`);
check(Object.keys(CORE_ATTRIBUTES).every((n) => b.trail.attributes[n as keyof typeof CORE_ATTRIBUTES].length > 0), "trail layer carries the full attribute set");
// Particles ride ~6 km above the surface: never inside, never floating.
const altKm = (PARTICLE_CONSTANTS.radius - 1) * 6371;
check(altKm > 2 && altKm < 15, `render altitude ${altKm.toFixed(1)} km above the surface`);
let settledOk = true;
const tgt = new Vector3();
for (let p = 0; p < b.particleCount; p += 11) {
  const [start, end] = b.core.aTiming.subarray(p * 4, p * 4 + 2);
  const late = end - (start - end) * 2; // well past any particle's settle phase (maths defined beyond the UI window)
  tgt.fromArray(b.core.aTarget, p * 3);
  settledOk &&= particlePosition(b, p, late).distanceTo(tgt) < 1e-6;
}
check(settledOk, "after arrival every particle sits exactly on its own dispersal point");
for (const r of routes) {
  for (let bi = 0; bi < (r.branches ?? []).length; bi++) {
    const branch = r.branches![bi];
    const rowsOfBranch = new Set(b.rows.map((row, i) => (row.routeIndex === r.index && row.branch === bi ? i : -1)).filter((i) => i >= 0));
    let n = 0;
    let total = 0;
    let near = 0;
    const end = branch.path[branch.path.length - 1];
    for (let p = 0; p < b.particleCount; p++) {
      if (b.core.aRoute[p] !== r.index) continue;
      total++;
      if (!rowsOfBranch.has(b.core.aRow[p])) continue;
      n++;
      const d = haversineKm(vector3ToLatLng(particlePosition(b, p, r.endYear - (r.startYear - r.endYear) * 0.3)), end);
      if (d < 3 * Math.max(r.particleConfig.dispersalKm.north, r.particleConfig.dispersalKm.east)) near++;
    }
    check(
      Math.abs(n / total - branch.share) < 0.03 && near / n > 0.97,
      `${r.name} branch "${branch.name}": ${((n / total) * 100).toFixed(0)}% of particles, ${((near / n) * 100).toFixed(0)}% arrive at its end`,
    );
  }
}
// Trails point backwards along the direction of travel.
{
  const europe = routes.find((r) => r.id === "levant-europe")!;
  const year = europe.startYear - (europe.startYear - europe.endYear) * 0.5;
  let good = 0;
  let n = 0;
  for (let p = 0; p < b.particleCount && n < 400; p++) {
    if (b.core.aRoute[p] !== europe.index) continue;
    const lag = b.core.aLoop[p * 3 + 2];
    const span = europe.startYear - europe.endYear;
    const head = particlePosition(b, p, year);
    const tail = particlePosition(b, p, year + lag * span);
    const ahead = particlePosition(b, p, year - lag * span);
    if (head.distanceTo(tail) < 1e-9) continue; // waiting or settled
    n++;
    if (tail.distanceTo(ahead) > head.distanceTo(ahead)) good++;
  }
  check(good / n > 0.95, `trail tails lie behind the head (${good}/${n} moving particles)`);
}

const americas = routes.find((r) => r.id === "beringia-americas")!;
const front = routeFocusPoint(b, americas, 20000);
check(front.lat > 60 && (front.lng > 160 || front.lng < -140), `Beringian standstill: wave centre at 20k BP is in Beringia (${front.lat.toFixed(1)}, ${front.lng.toFixed(1)})`);

console.log("\nPopulation clusters");
{
  const span = (r: (typeof routes)[number]) => r.startYear - r.endYear;
  const at = (r: (typeof routes)[number], progress: number) => r.startYear - span(r) * progress;
  const pres = (id: string, y: number) => populationState(populations.find((c) => c.id === id)!, y).presence;
  console.log(`  ${populations.length} clusters: ${populations.map((c) => c.id).join(", ")}`);

  for (const r of routes) {
    // 1. Departure: a source population is established where the stream starts…
    const sources = populations.filter((c) => c.sourceOf.includes(r.id));
    const atDeparture = Math.max(0, ...sources.map((c) => pres(c.id, at(r, PARTICLE_CONSTANTS.visibleFrom))));
    // 2. …and it remains after the groups leave (through the stream's whole lifetime).
    const remains = sources.length > 0 && sources.every((c) => [0.5, 1, PARTICLE_CONSTANTS.hiddenAfter].every((p) => pres(c.id, at(r, p)) > 0.9));
    check(
      sources.length > 0 && atDeparture > 0.85 && remains,
      `${r.name}: source population (${sources.map((c) => c.region).join(", ") || "none"}) present at departure (${(atDeparture * 100).toFixed(0)}%) and remains afterwards`,
    );
    // 3. Destination: a new population forms only after departure, gradually,
    //    and is established by the time the stream has faded out.
    for (const arrival of routeArrivals(r)) {
      const dest = populations.find((c) => c.destinationOf.includes(r.id) && clusterContains(c, arrival));
      const before = dest ? pres(dest.id, r.startYear) : 1;
      const after = dest ? pres(dest.id, at(r, PARTICLE_CONSTANTS.hiddenAfter)) : 0;
      const gradual = dest ? dest.startYear - dest.establishedYear >= 3000 : false;
      check(
        !!dest && before === 0 && after > 0.9 && gradual,
        `${r.name} → ${dest?.region ?? "no destination cluster"}: absent before departure, forms over ${dest ? (dest.startYear - dest.establishedYear).toLocaleString("en-US") : "?"} years, ${(after * 100).toFixed(0)}% when the stream fades`,
      );
    }
  }

  // Smooth in time: no abrupt appearance or disappearance (100-year steps).
  let maxJump = 0;
  for (const c of populations) {
    for (let y = 320000; y > 0; y -= 100) {
      maxJump = Math.max(maxJump, Math.abs(populationState(c, y).presence - populationState(c, y - 100).presence));
    }
  }
  check(maxJump < 0.06, `presence changes smoothly (max change per 100 years ${(maxJump * 100).toFixed(1)}%)`);

  // Nothing before its modelled start; ended clusters really end.
  check(populations.every((c) => particlePresence(c, 0, c.startYear) === 0 && particlePresence(c, 1, c.startYear + 1) === 0), "no particle is visible before its cluster's start year");
  check(
    populations.filter((c) => c.endYear !== undefined).every((c) => populationState(c, c.endYear! - 1).presence === 0),
    "clusters with an end year are fully gone by it",
  );
  // Scrubbing: a pure function of the year.
  const ys = [90000, 60000, 45000, 30000, 14000];
  const snap = () => populations.map((c) => ys.map((y) => populationState(c, y).presence).join()).join("|");
  const first = snap();
  for (let y = 100000; y > 10000; y -= 777) populations.forEach((c) => populationState(c, y));
  check(snap() === first, "scrubbing back and forth gives identical cluster states");

  const opts = { particleScale: 1, glowShare: 0.08 };
  const pa = generatePopulationBuffers(populations, routes, opts);
  const pb = generatePopulationBuffers(populations, routes, opts);
  check(pa.position.every((v, i) => v === pb.position[i]) && pa.attributes.aPopLook.every((v, i) => v === pb.attributes.aPopLook[i]), `population buffers deterministic (${pa.particleCount} particles, ${pa.glowIndex.length} haze sprites)`);
  let maxR = 0;
  for (let i = 0; i < pa.particleCount; i++) maxR = Math.max(maxR, Math.abs(Math.hypot(pa.position[i * 3], pa.position[i * 3 + 1], pa.position[i * 3 + 2]) - 1));
  check(maxR < 1e-6, "population particles lie on the sphere surface");
  check(pa.particleCount + b.particleCount < 110000, `total particle budget (${b.particleCount} stream + ${pa.particleCount} population)`);
  // Formation ranks spread evenly so clusters grow at a steady pace.
  const ranks = pa.attributes.aPopLook.filter((_, i) => i % 4 === 2);
  const mean = ranks.reduce((a, r) => a + r, 0) / ranks.length;
  check(Math.abs(mean - 0.5) < 0.02, `formation ranks evenly distributed (mean ${mean.toFixed(3)})`);
}

console.log("\nSpecies, sites and milestones");
{
  check(species.every((sp) => populations.some((c) => c.speciesId === sp.id)), "every species has at least one population on the globe");
  check(
    species.filter((sp) => sp.genus !== "Homo").every((sp) => sp.classification.includes("not genus Homo")),
    "non-Homo hominins are labelled as not belonging to the genus Homo",
  );
  // Archaic populations stay inside their species' known time range (±10%).
  const outside = populations
    .filter((c) => c.speciesId !== "homo-sapiens")
    .filter((c) => {
      const sp = speciesById[c.speciesId];
      return c.establishedYear > sp.timeRange.older * 1.1 || (c.endYear ?? 0) < sp.timeRange.younger * 0.9;
    })
    .map((c) => c.id);
  check(outside.length === 0, `archaic populations lie within their species' record${outside.length ? ` (outside: ${outside})` : ""}`);
  // A milestone's species must exist at the time of its evidence.
  const anachronisms = milestones.filter((m) =>
    m.relatedSpeciesIds.some((id) => {
      const r = speciesById[id].timeRange;
      return m.approximateStartYear > r.older * 1.05 || m.approximateStartYear < r.younger * 0.95;
    }),
  );
  check(anachronisms.length === 0, `milestones are only linked to species alive at the time${anachronisms.length ? ` (${anachronisms.map((m) => m.id)})` : ""}`);
  check(
    !siteById["dmanisi"].speciesIds!.includes("homo-sapiens") && siteById["dmanisi"].speciesIds!.includes("homo-erectus"),
    "Dmanisi is attributed to early Homo, not Homo sapiens",
  );
  const wine = milestones.find((m) => m.id === "gadachrili-wine")!;
  check(!wine.relatedRouteIds?.length, "Gadachrili Gora wine is a local Neolithic milestone, not tied to a migration route");
  check(["dzudzuana", "satsurblia", "kotias-klde", "gadachrili-gora", "dmanisi", "ortvale-klde"].every((id) => siteById[id]), "Georgian and Caucasus sites present");
  const at60k = speciesAt(species, 60000).map((sp) => sp.id);
  check(["homo-sapiens", "homo-neanderthalensis", "denisovans", "homo-floresiensis"].every((id) => at60k.includes(id)), `coexistence at 60,000 years ago: ${at60k.join(", ")}`);
  const at1_8M = speciesAt(species, 1_800_000).map((sp) => sp.id);
  check(["homo-erectus", "homo-habilis", "paranthropus-boisei"].every((id) => at1_8M.includes(id)) && !at1_8M.includes("homo-sapiens"), `coexistence at 1.8 million years ago: ${at1_8M.join(", ")}`);
  const themes: Record<string, (m: (typeof milestones)[number]) => boolean> = {
    "stone tools": (m) => m.category === "stone-tools",
    fire: (m) => m.category === "fire" && /fire/i.test(m.title),
    cooking: (m) => /cook/i.test(m.title),
    hunting: (m) => m.category === "hunting-gathering",
    ornaments: (m) => /bead|ornament/i.test(m.title),
    "cave art": (m) => m.visualIcon === "cave-art",
    clothing: (m) => m.category === "clothing",
    seafaring: (m) => m.category === "seafaring",
    agriculture: (m) => m.category === "agriculture",
    domestication: (m) => m.category === "domestication",
    pottery: (m) => m.category === "pottery",
    settlements: (m) => m.category === "settlement",
    metallurgy: (m) => m.category === "metallurgy",
    wine: (m) => m.id === "gadachrili-wine" && /6000–5800 BCE/.test(m.dateLabel),
    writing: (m) => m.category === "writing",
  };
  const missing = Object.entries(themes).filter(([, f]) => !milestones.some(f)).map(([k]) => k);
  check(missing.length === 0, `every requested milestone theme is covered${missing.length ? ` (missing: ${missing})` : ""}`);
  check(
    milestones.every((m) => m.sources.length > 0 && Math.abs(m.geographicLocation.lat) <= 90 && Math.abs(m.geographicLocation.lng) <= 180 && m.originNote.length > 0),
    "every milestone has sources, valid coordinates and an earliest-evidence-vs-origin note",
  );
  check(
    milestones.filter((m) => m.approximateStartYear > speciesById["homo-sapiens"].timeRange.older).every((m) => !m.relatedSpeciesIds.includes("homo-sapiens")),
    "no milestone older than Homo sapiens is attributed to it",
  );
  check(milestones.every((m, i) => i === 0 || m.approximateStartYear <= milestones[i - 1].approximateStartYear), `${milestones.length} milestones, ordered oldest first`);
  check(sites.every((s) => s.dateRange[0] >= s.dateRange[1]), `${sites.length} sites with valid date ranges`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
