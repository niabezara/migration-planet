import { CatmullRomCurve3, Vector3 } from "three";
import type { LatLng } from "@/types/migration";
import { latLngToVector3, vector3ToLatLng } from "./coordinates";

/**
 * Spherical linear interpolation between two (unit) vectors.
 * Moves along the great circle at constant angular speed.
 */
export function sphericalInterpolation(
  a: Vector3,
  b: Vector3,
  t: number,
  target: Vector3 = new Vector3(),
): Vector3 {
  const ra = a.length();
  const rb = b.length();
  const d = Math.min(1, Math.max(-1, a.dot(b) / (ra * rb)));
  const theta = Math.acos(d);
  const radius = ra + (rb - ra) * t;
  if (theta < 1e-6) return target.copy(a).lerp(b, t).setLength(radius);
  const s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s / ra;
  const wb = Math.sin(t * theta) / s / rb;
  return target
    .set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb)
    .multiplyScalar(radius);
}

/** Point at fraction `t` along the great circle from `a` to `b`. */
export function greatCircleInterpolate(a: LatLng, b: LatLng, t: number): LatLng {
  const va = latLngToVector3(a.lat, a.lng);
  const vb = latLngToVector3(b.lat, b.lng);
  return vector3ToLatLng(sphericalInterpolation(va, vb, t));
}

/**
 * Build a smooth path through geographic waypoints that stays on the unit
 * sphere, resampled to `samples` points evenly spaced by arc length.
 *
 * Each leg is first densified with SLERP (so long legs follow great circles,
 * not chords through the planet), then a centripetal Catmull-Rom spline rounds
 * the corners, and finally every point is projected back onto the sphere.
 *
 * Returns a flat Float32Array [x0,y0,z0, x1,y1,z1, ...].
 */
export function buildSphericalPath(points: LatLng[], samples: number): Float32Array {
  if (points.length < 2) throw new Error("A path needs at least two points");
  const units = points.map((p) => latLngToVector3(p.lat, p.lng));

  const dense: Vector3[] = [];
  const perLeg = 12;
  for (let i = 0; i < units.length - 1; i++) {
    for (let k = 0; k < perLeg; k++) {
      dense.push(sphericalInterpolation(units[i], units[i + 1], k / perLeg));
    }
  }
  dense.push(units[units.length - 1].clone());

  const curve = new CatmullRomCurve3(dense, false, "centripetal");
  const spaced = curve.getSpacedPoints(samples - 1);
  const out = new Float32Array(samples * 3);
  spaced.forEach((p, i) => {
    p.normalize();
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  });
  return out;
}

/**
 * Like buildSphericalPath, but samples are evenly spaced in *time* rather
 * than distance: sample i is where the wave front is at fraction i/(n-1) of
 * the way from the first waypoint's year to the last one's.
 *
 * Waypoint years therefore control pacing (e.g. a slow "standstill" leg),
 * while the shader still just reads `path(progress)`.
 */
export function buildTimedPath(
  points: Array<LatLng & { year: number }>,
  samples: number,
): Float32Array {
  if (points.length < 2) throw new Error("A path needs at least two points");
  const units = points.map((p) => latLngToVector3(p.lat, p.lng));
  const perLeg = 12;
  const dense: Vector3[] = [];
  for (let i = 0; i < units.length - 1; i++) {
    for (let k = 0; k < perLeg; k++) {
      dense.push(sphericalInterpolation(units[i], units[i + 1], k / perLeg));
    }
  }
  dense.push(units[units.length - 1].clone());
  const curve = new CatmullRomCurve3(dense, false, "centripetal");

  const y0 = points[0].year;
  const span = Math.max(1e-6, y0 - points[points.length - 1].year);
  const tf = points.map((p) => (y0 - p.year) / span); // time fraction at each waypoint

  const out = new Float32Array(samples * 3);
  const p = new Vector3();
  let leg = 0;
  for (let i = 0; i < samples; i++) {
    const f = i / (samples - 1);
    while (leg < points.length - 2 && f > tf[leg + 1]) leg++;
    const legSpan = tf[leg + 1] - tf[leg];
    const local = legSpan > 1e-9 ? Math.min(1, Math.max(0, (f - tf[leg]) / legSpan)) : 1;
    // Within a leg the dense SLERP points are evenly spaced, so the curve
    // parameter is ~proportional to distance along that leg.
    const u = ((leg + local) * perLeg) / (dense.length - 1);
    curve.getPoint(Math.min(1, u), p).normalize();
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}

/** Linear lookup into a path produced by buildSphericalPath (CPU mirror of the shader). */
export function samplePath(
  path: Float32Array,
  t: number,
  target: Vector3 = new Vector3(),
): Vector3 {
  const n = path.length / 3;
  const f = Math.min(1, Math.max(0, t)) * (n - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, n - 1);
  const w = f - i0;
  return target
    .set(
      path[i0 * 3] + (path[i1 * 3] - path[i0 * 3]) * w,
      path[i0 * 3 + 1] + (path[i1 * 3 + 1] - path[i0 * 3 + 1]) * w,
      path[i0 * 3 + 2] + (path[i1 * 3 + 2] - path[i0 * 3 + 2]) * w,
    )
    .normalize();
}
