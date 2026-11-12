/**
 * Turns population clusters into GPU-ready buffers. Unlike route particles
 * these do not travel: each has a fixed position on the unit sphere. Time
 * (formation, fade, evidence basis) is evaluated in the vertex shader from
 * static per-particle attributes, so year changes never rebuild geometry.
 *
 * Distribution is organic: each cluster is a set of lobes (ellipses on the
 * surface); most particles gather in small seeded "camps" inside a lobe, the
 * rest form a diffuse haze. Optionally rejection-sampled onto land.
 */
import { Color, Vector3 } from "three";
import type { LatLng, MigrationRoute, PopulationCluster } from "@/types/migration";
import { haversineKm, latLngToVector3, offsetLatLngKm } from "@/engine/geo/coordinates";
import { fadeWindow } from "@/engine/population/populationModel";
import { gaussian, mulberry32 } from "./clusterGenerator";

export const POP_ATTRIBUTES = {
  aPopTime: 4, // startYear, establishedYear, fadeStartYear, endYear
  aPopLook: 4, // size, brightness, formation rank (0..1), LOD rank
  aPopMeta: 4, // attestedYear (-1 = inferred only), cluster index, overview awaken (story s), seed
  aPopExtra: 3, // proximity to a departure point (0..1), overview gain, related-route bitmask
  aColor: 3, // linear RGB
  aPopSpecies: 1, // species index (filter / focus uniforms)
} as const;
export type PopAttributeName = keyof typeof POP_ATTRIBUTES;

export interface PopulationGeneratorOptions {
  particleScale: number;
  /** Fraction of particles that also draw a soft glow sprite. */
  glowShare: number;
  /** Present-day land test; when given, clusters with landOnly !== false stay on land. */
  isLand?: (lat: number, lng: number) => boolean;
  /** Story-clock second at which each cluster appears in overview (intro). */
  awakenAt?: Record<string, number>;
  /** GPU index per species id. */
  speciesIndex?: Record<string, number>;
  seed?: number;
}

export interface PopulationBuffers {
  particleCount: number;
  /** Unit-sphere positions (static). */
  position: Float32Array;
  attributes: Record<PopAttributeName, Float32Array>;
  glowIndex: Uint32Array;
  /** Particle range per cluster id. */
  clusterRanges: Record<string, { first: number; count: number }>;
}

/** Nominal particles for a cluster of visualDensity 1 at particleScale 1. */
const BASE_COUNT = 2600;
const CAMP_SHARE = 0.68;
const DEPARTURE_KM = 380;
/**
 * Reference surface density (particles per 10,000 km²) of a typical regional
 * cluster. Compact clusters (small lobes) pack particles far more densely and
 * would bloom additively; their per-particle energy is scaled down so every
 * region glows with a similar intensity.
 */
const REFERENCE_DENSITY = 28e-4;

interface Camp {
  n: number;
  e: number;
  sigma: number;
  weight: number;
}

function pickWeighted<T extends { weight: number }>(items: T[], total: number, r: number): T {
  let x = r * total;
  for (const it of items) {
    x -= it.weight;
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

export function generatePopulationBuffers(
  clusters: PopulationCluster[],
  routes: MigrationRoute[],
  { particleScale, glowShare, isLand, awakenAt = {}, speciesIndex = {}, seed = 4242 }: PopulationGeneratorOptions,
): PopulationBuffers {
  const rand = mulberry32(seed);
  const pos: number[] = [];
  const cols: Record<PopAttributeName, number[]> = { aPopTime: [], aPopLook: [], aPopMeta: [], aPopExtra: [], aColor: [], aPopSpecies: [] };
  const clusterRanges: PopulationBuffers["clusterRanges"] = {};
  const glow: number[] = [];
  const color = new Color();
  const v = new Vector3();

  for (const cluster of clusters) {
    const target = Math.max(120, Math.round(BASE_COUNT * cluster.visualDensity * particleScale));
    const landOnly = cluster.landOnly !== false && !!isLand;
    const lobes = cluster.lobes.map((lobe) => {
      const mean = (lobe.radiusKm.north + lobe.radiusKm.east) / 2;
      const k = Math.min(14, Math.max(4, Math.round(4 + mean / 45)));
      const camps: Camp[] = Array.from({ length: k }, () => ({
        n: Math.max(-1.9, Math.min(1.9, gaussian(rand) * 0.85)) * lobe.radiusKm.north,
        e: Math.max(-1.9, Math.min(1.9, gaussian(rand) * 0.85)) * lobe.radiusKm.east,
        sigma: mean * (0.1 + 0.22 * rand()),
        weight: 0.35 + rand() * 1.3,
      }));
      // Low-frequency warp so lobes are not perfect ellipses.
      const warp = [rand() * 6.28, rand() * 6.28, 0.18 + rand() * 0.15];
      return { lobe, camps, campTotal: camps.reduce((a, c) => a + c.weight, 0), warp, weight: lobe.weight };
    });
    const lobeTotal = lobes.reduce((a, l) => a + l.weight, 0);
    const surfaceDensity =
      cluster.lobes.reduce(
        (a, l) => a + (target * l.weight / lobeTotal) ** 2 / (Math.PI * l.radiusKm.north * l.radiusKm.east),
        0,
      ) / target;
    const energy = Math.min(1, Math.max(0.35, Math.sqrt((REFERENCE_DENSITY * particleScale) / surfaceDensity)));

    // Sample points (rejection onto land where requested).
    const points: { p: LatLng; camp: boolean }[] = [];
    let attempts = 0;
    while (points.length < target && attempts < target * 30) {
      attempts++;
      const L = pickWeighted(lobes, lobeTotal, rand());
      const { north: rn, east: re } = L.lobe.radiusKm;
      const camp = rand() < CAMP_SHARE;
      let n: number;
      let e: number;
      if (camp) {
        const c = pickWeighted(L.camps, L.campTotal, rand());
        n = c.n + gaussian(rand) * c.sigma;
        e = c.e + gaussian(rand) * c.sigma;
      } else {
        n = Math.max(-2.4, Math.min(2.4, gaussian(rand))) * rn;
        e = Math.max(-2.4, Math.min(2.4, gaussian(rand))) * re;
      }
      const [p1, p2, amp] = L.warp;
      const n2 = n + Math.sin((e / re) * 2.1 + p1) * amp * rn;
      const e2 = e + Math.sin((n / rn) * 1.7 + p2) * amp * re;
      const p = offsetLatLngKm({ lat: L.lobe.lat, lng: L.lobe.lng }, n2, e2);
      if (landOnly && !isLand!(p.lat, p.lng)) continue;
      points.push({ p, camp });
    }

    // Formation rank: distance from the growth origin, jittered, then
    // converted to a percentile so formation progresses evenly in time.
    const origin = cluster.growthOrigin ?? cluster.coordinates;
    const raw = points.map(({ p }) => haversineKm(origin, p));
    const maxD = Math.max(1, ...raw);
    const keyed = raw.map((d, i) => ({ i, k: d / maxD + gaussian(rand) * 0.07 }));
    keyed.sort((a, b) => a.k - b.k);
    const rank = new Float32Array(points.length);
    keyed.forEach(({ i }, order) => (rank[i] = points.length > 1 ? order / (points.length - 1) : 0));

    const departures = routes.filter((r) => cluster.sourceOf.includes(r.id)).map((r) => r.path[0]);
    let routeMask = 0;
    for (const id of cluster.relatedRouteIds) {
      const r = routes.find((x) => x.id === id);
      if (r && r.index < 24) routeMask += 2 ** r.index;
    }
    const { fadeStart, end } = fadeWindow(cluster);
    color.set(cluster.color);

    clusterRanges[cluster.id] = { first: pos.length / 3, count: points.length };
    points.forEach(({ p, camp }, i) => {
      // Haze comes mostly from the diffuse particles, so it reads as a smooth
      // regional glow while camps stay as crisp specks (no blotches).
      if (rand() < glowShare * energy * (camp ? 0.35 : 2.4)) glow.push(pos.length / 3);
      latLngToVector3(p.lat, p.lng, 1, v);
      pos.push(v.x, v.y, v.z);
      const s = rand();
      const size = (0.55 + s * s * s * 1.1) * (camp ? 1.12 : 0.9);
      const brightness = (0.55 + 0.45 * rand()) * (camp ? 1.12 : 0.8) * energy;
      const near = departures.reduce((m, d) => Math.max(m, Math.exp(-((haversineKm(d, p) / DEPARTURE_KM) ** 2))), 0);
      cols.aPopTime.push(cluster.startYear, cluster.establishedYear, fadeStart, end);
      cols.aPopLook.push(size, brightness, rank[i], rand());
      cols.aPopMeta.push(cluster.attestedYear ?? -1, cluster.index, awakenAt[cluster.id] ?? 0, rand());
      cols.aPopExtra.push(near, cluster.endYear !== undefined ? 0.45 : 1, routeMask);
      cols.aColor.push(color.r, color.g, color.b);
      cols.aPopSpecies.push(speciesIndex[cluster.speciesId] ?? 0);
    });
  }

  const particleCount = pos.length / 3;

  return {
    particleCount,
    position: Float32Array.from(pos),
    attributes: Object.fromEntries(Object.entries(cols).map(([k, a]) => [k, Float32Array.from(a)])) as Record<
      PopAttributeName,
      Float32Array
    >,
    glowIndex: Uint32Array.from(glow),
    clusterRanges,
  };
}
