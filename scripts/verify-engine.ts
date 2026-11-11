/* Numerical checks for the deterministic particle engine. Run: npm run verify */
import { Color, Vector3 } from "three";
import { routes } from "@/data";
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
check([300000, 70000, 45000, 0].every((y) => Math.abs(timelineToYear(yearToTimeline(y)) - y) < 1e-6), "timeline scale is invertible");

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

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
