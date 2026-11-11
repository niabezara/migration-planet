/**
 * Turns migration routes into GPU-ready buffers for three render layers:
 *
 *   core  – every particle, one vertex each (THREE.Points)
 *   trail – a subset, two vertices each: head + tail (THREE.LineSegments)
 *   glow  – a sparse subset of the core, addressed by an index buffer that
 *           re-uses the core attribute buffers (no duplication on the GPU)
 *
 * Output is plain typed arrays (no three.js objects, no React). It is built
 * ONCE per quality setting; year, mode, selection, zoom and runtime density
 * are all uniforms.
 *
 * Path rows: one per travelling group and per branch it may take. Each row
 * is the group's own origin followed by the route (or branch) waypoints,
 * sampled evenly in TIME (buildTimedPath), uploaded as a float texture.
 */
import { Color } from "three";
import type { MigrationRoute, RouteWaypoint } from "@/types/migration";
import { haversineKm, latLngToVector3, offsetLatLngKm } from "@/engine/geo/coordinates";
import { buildTimedPath } from "@/engine/geo/greatCircle";
import { PARTICLE_CONSTANTS } from "./constants";

/** Per-vertex attributes shared by all layers, with their item sizes. */
export const CORE_ATTRIBUTES = {
  aRow: 1, // path-texture row
  aRoute: 1, // route index (selection)
  aTiming: 4, // startYear, endYear, departure, duration
  aShape: 4, // lateralKm, alongKm, wiggleKm, seed
  aScatter: 2, // origin scatter (side, forward) km
  aSplit: 2, // split start (progress), split lateral offset km
  aTarget: 3, // dispersal target (unit vector)
  aColor: 3, // linear RGB of the route colour
  aLook: 3, // size, brightness, LOD rank (0..1)
  aLoop: 3, // overview loop period (s), phase (0..1), trail lag (window fraction)
} as const;
export type AttributeName = keyof typeof CORE_ATTRIBUTES;

export interface GeneratorOptions {
  /** Multiplier on every route's nominal count (adaptive quality). */
  particleScale: number;
  /** Fraction of particles that draw a motion streak. */
  trailShare: number;
  /** Fraction of particles that also draw a soft glow sprite. */
  glowShare: number;
  /** Samples per path row. */
  pathSamples?: number;
  seed?: number;
}

export interface RowInfo {
  routeIndex: number;
  departure: number;
  duration: number;
  /** -1 = main path, otherwise index into route.branches. */
  branch: number;
}

export interface ParticleBuffers {
  particleCount: number;
  pathSamples: number;
  pathRows: number;
  /** RGBA float texture data, width = pathSamples, height = pathRows. */
  pathTexture: Float32Array;
  /** Per-row unit-vector paths, for CPU-side queries. */
  paths: Float32Array[];
  rows: RowInfo[];
  /** Row range per route id (main and branch rows). */
  routeRows: Record<string, { first: number; count: number }>;
  /** Canonical paths per route id: [main, ...branches]. Picking + path line. */
  routePaths: Record<string, Float32Array[]>;

  core: Record<AttributeName, Float32Array>;
  trail: { vertexCount: number; attributes: Record<AttributeName | "aTrail", Float32Array> };
  /** Core particle indices that also render as glow sprites. */
  glowIndex: Uint32Array;
}

/** Deterministic PRNG so every load produces the same population. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function pathLengthKm(path: RouteWaypoint[]): number {
  let km = 0;
  for (let i = 1; i < path.length; i++) km += haversineKm(path[i - 1], path[i]);
  return km;
}

export function routeLengthKm(route: MigrationRoute): number {
  return pathLengthKm(route.path);
}

/** Full waypoint list of a branch, from the route origin. */
export function branchWaypoints(route: MigrationRoute, branchIndex: number): RouteWaypoint[] {
  const b = route.branches![branchIndex];
  return [...route.path.slice(0, b.fromWaypoint + 1), ...b.path];
}

interface ClusterPlan {
  /** Row per option: [main, ...branches]. */
  rows: number[];
  count: number;
  departure: number;
  duration: number;
  laneKm: number;
  groupLengthKm: number;
}

export function generateParticleBuffers(
  routes: MigrationRoute[],
  { particleScale, trailShare, glowShare, pathSamples = 160, seed = 1337 }: GeneratorOptions,
): ParticleBuffers {
  const rand = mulberry32(seed);

  // --- Plan groups and bake paths ------------------------------------------
  const paths: Float32Array[] = [];
  const rows: RowInfo[] = [];
  const routeRows: ParticleBuffers["routeRows"] = {};
  const routePaths: ParticleBuffers["routePaths"] = {};
  const plans: ClusterPlan[][] = [];

  for (const route of routes) {
    const cfg = route.particleConfig;
    const branches = route.branches ?? [];
    const options = [route.path, ...branches.map((_, i) => branchWaypoints(route, i))];
    routePaths[route.id] = options.map((p) => buildTimedPath(p, pathSamples));

    const n = Math.max(1, cfg.clusterCount);
    const first = paths.length;
    const weights = Array.from({ length: n }, () => 0.7 + rand() * 0.6);
    const wSum = weights.reduce((a, b) => a + b, 0);
    const total = Math.max(n, Math.round(cfg.count * particleScale));
    // Overlapping lanes, shuffled so departure order is not spatially sorted.
    const lanes = Array.from({ length: n }, (_, k) => (n > 1 ? k / (n - 1) - 0.5 : 0));
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const duration = Math.max(0.5, 1 - cfg.stagger);

    const plan: ClusterPlan[] = [];
    for (let k = 0; k < n; k++) {
      const angle = (k / n) * Math.PI * 2 + rand() * 0.6;
      const dist = cfg.originSpreadKm * (0.3 + 0.7 * rand());
      const origin = { ...offsetLatLngKm(route.path[0], Math.sin(angle) * dist, Math.cos(angle) * dist), year: route.path[0].year };
      const departure = n > 1 ? (cfg.stagger * k) / (n - 1) : 0;
      const groupRows = options.map((opt, bi) => {
        paths.push(buildTimedPath([origin, ...opt.slice(1)], pathSamples));
        rows.push({ routeIndex: route.index, departure, duration, branch: bi - 1 });
        return paths.length - 1;
      });
      const [gMin, gMax] = cfg.groupLengthKm;
      plan.push({
        rows: groupRows,
        count: Math.max(1, Math.round((total * weights[k]) / wSum)),
        departure,
        duration,
        laneKm: lanes[k] * cfg.spreadKm * 1.2,
        groupLengthKm: gMin + rand() * (gMax - gMin),
      });
    }
    routeRows[route.id] = { first, count: paths.length - first };
    plans.push(plan);
  }

  const pathRows = paths.length;
  const pathTexture = new Float32Array(pathSamples * Math.max(1, pathRows) * 4);
  paths.forEach((path, row) => {
    for (let i = 0; i < pathSamples; i++) {
      const o = (row * pathSamples + i) * 4;
      pathTexture[o] = path[i * 3];
      pathTexture[o + 1] = path[i * 3 + 1];
      pathTexture[o + 2] = path[i * 3 + 2];
      pathTexture[o + 3] = 1;
    }
  });

  // --- Core particles -------------------------------------------------------
  const particleCount = plans.flat().reduce((a, c) => a + c.count, 0);
  const core = Object.fromEntries(
    Object.entries(CORE_ATTRIBUTES).map(([name, size]) => [name, new Float32Array(particleCount * size)]),
  ) as Record<AttributeName, Float32Array>;
  const { aRow, aRoute, aTiming, aShape, aScatter, aSplit, aTarget, aColor, aLook, aLoop } = core;

  const color = new Color();
  const target = latLngToVector3(0, 0);
  let p = 0;

  routes.forEach((route, ri) => {
    const cfg = route.particleConfig;
    const branches = route.branches ?? [];
    color.set(route.color); // sRGB hex -> linear working space
    const destinations = [route.path[route.path.length - 1], ...branches.map((b) => b.path[b.path.length - 1])];
    const { north, east } = cfg.dispersalKm;
    const G = Math.max(1, cfg.splitGroups);
    const lengthKm = routeLengthKm(route);

    // Overview loop: longer routes get a longer (bounded) cycle; phases are
    // choreographed so every route is mid-journey at the cue time.
    const loopSeconds = clamp(14 + (lengthKm / 1000) * 1.2, 16, 32);
    const cuePosition = 0.2 + ((route.index * 0.37) % 1) * 0.35;
    const loopPhase = (((cuePosition - PARTICLE_CONSTANTS.overviewCueSeconds / loopSeconds) % 1) + 1) % 1;
    // Streak length: a fixed ground distance, converted to a time lag for this route.
    const trailLag = (PARTICLE_CONSTANTS.trailKm / Math.max(500, lengthKm)) * (1 - cfg.stagger);

    plans[ri].forEach((cluster, ci) => {
      const subAngle = (ci / plans[ri].length) * Math.PI * 2 + 0.6;
      const subN = Math.sin(subAngle) * north * 0.45;
      const subE = Math.cos(subAngle) * east * 0.55;
      const scatterRadius = Math.min(cfg.originSpreadKm * 0.5, 160);

      for (let i = 0; i < cluster.count; i++, p++) {
        // Branch choice (where the data defines alternatives).
        let option = 0;
        let r = rand();
        for (let b = 0; b < branches.length; b++) {
          if (r < branches[b].share) {
            option = b + 1;
            break;
          }
          r -= branches[b].share;
        }

        // Lateral split sub-group: divergence plus a slight pace difference.
        const sub = G > 1 ? Math.floor(rand() * G) : 0;
        const subPos = G > 1 ? sub / (G - 1) - 0.5 : 0;

        // Corridor: dense core + sparse fringe (mixture of two gaussians).
        const edge = rand() < cfg.edgeShare;
        const latSigma = edge ? 1.1 : 0.42;
        const latNorm = clamp(gaussian(rand) * latSigma, -2.6, 2.6);
        const straggler = rand() < 0.08;
        const along = clamp(gaussian(rand), -3, 3) * cluster.groupLengthKm * (straggler ? 2.8 : 1);

        const departure = Math.max(0, cluster.departure + gaussian(rand) * 0.02);
        const duration =
          cluster.duration *
          (1 + clamp(gaussian(rand) * cfg.speedVariation, -0.22, 0.22)) *
          (1 + subPos * 0.08);

        const sr = scatterRadius * Math.sqrt(rand());
        const sa = rand() * Math.PI * 2;

        const dest = destinations[option];
        const dN = subN * (option ? 0.4 : 1) + clamp(gaussian(rand), -1.8, 1.8) * north;
        const dE = subE * (option ? 0.4 : 1) + subPos * east * 0.6 + clamp(gaussian(rand), -1.6, 1.6) * east;
        const t = offsetLatLngKm(dest, dN, dE);
        latLngToVector3(t.lat, t.lng, 1, target);

        // Look: bright dense centre, dimmer fringe; mostly small dots, rare beacons.
        const centre = 1 - Math.min(1, Math.abs(latNorm) / 1.2);
        const s = rand();
        const size = (0.5 + s * s * s * 1.6) * (edge ? 0.85 : 1);
        const beacon = rand() < 0.03 ? 1.8 : 1;
        const brightness = (0.55 + 0.35 * rand()) * (0.7 + 0.55 * centre) * beacon;

        aRow[p] = cluster.rows[option];
        aRoute[p] = route.index;
        aTiming.set([route.startYear, route.endYear, departure, duration], p * 4);
        aShape.set([cluster.laneKm + latNorm * cfg.spreadKm, along, 20 + rand() * 60, rand()], p * 4);
        aScatter[p * 2] = Math.cos(sa) * sr;
        aScatter[p * 2 + 1] = Math.sin(sa) * sr;
        aSplit[p * 2] = cfg.splitAt + rand() * 0.08;
        aSplit[p * 2 + 1] = subPos * cfg.spreadKm * 1.6;
        aTarget.set([target.x, target.y, target.z], p * 3);
        aColor.set([color.r, color.g, color.b], p * 3);
        aLook.set([size, brightness, rand()], p * 3);
        aLoop.set([loopSeconds, loopPhase, trailLag], p * 3);
      }
    });
  });

  // --- Trail subset: two vertices per streak (head, tail) --------------------
  const trailParticles: number[] = [];
  const glowParticles: number[] = [];
  for (let i = 0; i < particleCount; i++) {
    if (rand() < trailShare) trailParticles.push(i);
    if (rand() < glowShare) glowParticles.push(i);
  }
  const trailVerts = trailParticles.length * 2;
  const trailAttrs = Object.fromEntries(
    Object.entries(CORE_ATTRIBUTES).map(([name, size]) => [name, new Float32Array(trailVerts * size)]),
  ) as Record<AttributeName | "aTrail", Float32Array>;
  trailAttrs.aTrail = new Float32Array(trailVerts);
  trailParticles.forEach((src, k) => {
    for (const [name, size] of Object.entries(CORE_ATTRIBUTES) as [AttributeName, number][]) {
      const from = core[name].subarray(src * size, src * size + size);
      trailAttrs[name].set(from, k * 2 * size);
      trailAttrs[name].set(from, (k * 2 + 1) * size);
    }
    trailAttrs.aTrail[k * 2 + 1] = 1;
  });

  return {
    particleCount,
    pathSamples,
    pathRows,
    pathTexture,
    paths,
    rows,
    routeRows,
    routePaths,
    core,
    trail: { vertexCount: trailVerts, attributes: trailAttrs },
    glowIndex: Uint32Array.from(glowParticles),
  };
}
