/**
 * CPU mirror of the particle vertex shader (historical mode).
 *
 * The GPU is the source of truth for rendering. This module reproduces the
 * same deterministic maths on the CPU for things that need positions outside
 * the shader: camera follow, route picking, and tests.
 */
import { Vector3 } from "three";
import type { LatLng, MigrationRoute } from "@/types/migration";
import { EARTH_RADIUS_KM, latLngToVector3, vector3ToLatLng } from "@/engine/geo/coordinates";
import { samplePath, sphericalInterpolation } from "@/engine/geo/greatCircle";
import { PARTICLE_CONSTANTS } from "./constants";
import type { ParticleBuffers } from "./clusterGenerator";

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const _p = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _fwd = new Vector3();
const _side = new Vector3();
const _target = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Travel progress `u` for a timing tuple at a given year (unclamped). */
export function travelProgress(
  startYear: number,
  endYear: number,
  departure: number,
  duration: number,
  yearsBP: number,
): number {
  const elapsed = (startYear - yearsBP) / (startYear - endYear);
  return (elapsed - departure) / duration;
}

/**
 * Exact (minus cosmetic shimmer) head position of a particle at `yearsBP`
 * on the unit sphere. Mirrors the vertex shader line by line.
 */
export function particlePosition(
  buffers: ParticleBuffers,
  particleIndex: number,
  yearsBP: number,
  out: Vector3 = new Vector3(),
): Vector3 {
  const v = particleIndex;
  const c = buffers.core;
  const path = buffers.paths[c.aRow[v]];
  const [startYear, endYear, departure, duration] = c.aTiming.subarray(v * 4, v * 4 + 4);
  const [lateral, along, wiggleKm, seed] = c.aShape.subarray(v * 4, v * 4 + 4);
  const [sx, sf] = c.aScatter.subarray(v * 2, v * 2 + 2);
  const [splitStart, splitKm] = c.aSplit.subarray(v * 2, v * 2 + 2);

  const u = travelProgress(startYear, endYear, departure, duration, yearsBP);
  const t = Math.min(1, Math.max(0, u));

  samplePath(path, t, _p);
  samplePath(path, t + 0.02, _a);
  samplePath(path, t - 0.02, _b);
  _fwd.subVectors(_a, _b);
  _fwd.addScaledVector(_p, -_fwd.dot(_p));
  if (_fwd.lengthSq() > 1e-14) _fwd.normalize();
  else _fwd.crossVectors(UP, _p).normalize();
  _side.crossVectors(_p, _fwd).normalize();

  const bulge = 0.6 + 0.4 * Math.sin(Math.PI * t);
  const wiggle = Math.sin(t * 17 + seed * 6.2831) * 0.7 + Math.sin(t * 43 + seed * 19) * 0.3;
  const split = splitKm * smoothstep(splitStart, splitStart + 0.2, t);
  const form = smoothstep(0, PARTICLE_CONSTANTS.formIn, t);
  const offSide = sx + (lateral * bulge + wiggle * wiggleKm + split - sx) * form;
  const offFwd = sf + (along - sf) * form;

  out
    .copy(_p)
    .addScaledVector(_side, offSide / EARTH_RADIUS_KM)
    .addScaledVector(_fwd, offFwd / EARTH_RADIUS_KM)
    .normalize();

  const settle = smoothstep(1, 1 + PARTICLE_CONSTANTS.settle, u);
  _target.fromArray(c.aTarget, v * 3);
  return sphericalInterpolation(out, _target, settle, out).normalize();
}

/**
 * Where a route's "story" is at a given year: the mean of its main-path
 * group centres. Used by the camera to follow a wave.
 */
export function routeFocusPoint(buffers: ParticleBuffers, route: MigrationRoute, yearsBP: number): LatLng {
  const rows = buffers.routeRows[route.id];
  const last = route.path[route.path.length - 1];
  const dest = latLngToVector3(last.lat, last.lng);
  const acc = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < rows.count; i++) {
    const row = buffers.rows[rows.first + i];
    if (row.branch !== -1) continue;
    const u = travelProgress(route.startYear, route.endYear, row.departure, row.duration, yearsBP);
    samplePath(buffers.paths[rows.first + i], u, c);
    sphericalInterpolation(c, dest, smoothstep(1, 1 + PARTICLE_CONSTANTS.settle, u), c);
    acc.add(c.normalize());
  }
  return vector3ToLatLng(acc.normalize());
}

/**
 * Route under a point on the globe: nearest canonical path within
 * `maxDistanceKm`. Only `candidates` are considered (e.g. visible routes).
 */
export function pickRoute(
  buffers: ParticleBuffers,
  candidates: MigrationRoute[],
  point: Vector3,
  maxDistanceKm: number,
): MigrationRoute | null {
  const p = _a.copy(point).normalize();
  const minDot = Math.cos(maxDistanceKm / EARTH_RADIUS_KM);
  let best: MigrationRoute | null = null;
  let bestDot = minDot;
  for (const route of candidates) {
    for (const path of buffers.routePaths[route.id]) {
      for (let i = 0; i < path.length; i += 3) {
        const d = p.x * path[i] + p.y * path[i + 1] + p.z * path[i + 2];
        if (d > bestDot) {
          bestDot = d;
          best = route;
        }
      }
    }
    // Also the arrival areas (main + branches), which sit off the path line.
    const spreadAngle =
      Math.max(route.particleConfig.dispersalKm.north, route.particleConfig.dispersalKm.east) / EARTH_RADIUS_KM;
    const ends = [route.path, ...(route.branches ?? []).map((b) => b.path)].map((w) => w[w.length - 1]);
    for (const last of ends) {
      const dest = latLngToVector3(last.lat, last.lng, 1, _b);
      // Arrival area as a disc: distance = max(0, distance to centre - radius).
      const angle = Math.acos(Math.min(1, Math.max(-1, p.dot(dest))));
      const effective = Math.cos(Math.max(0, angle - spreadAngle));
      if (effective > bestDot) {
        bestDot = effective;
        best = route;
      }
    }
  }
  return best;
}
