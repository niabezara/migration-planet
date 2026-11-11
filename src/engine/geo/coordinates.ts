import { Vector3 } from "three";
import type { LatLng } from "@/types/migration";

export const EARTH_RADIUS_KM = 6371;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/**
 * Geographic -> 3D, matching three.js SphereGeometry's equirectangular UV
 * layout (u = 0 at lng -180, u = 0.5 at lng 0 which faces +X, lng +90 faces -Z).
 */
export function latLngToVector3(
  lat: number,
  lng: number,
  radius = 1,
  target: Vector3 = new Vector3(),
): Vector3 {
  const phi = lat * DEG2RAD;
  const lambda = lng * DEG2RAD;
  const c = Math.cos(phi);
  return target.set(
    radius * c * Math.cos(lambda),
    radius * Math.sin(phi),
    -radius * c * Math.sin(lambda),
  );
}

export function vector3ToLatLng(v: Vector3): LatLng {
  const r = v.length() || 1;
  return {
    lat: Math.asin(Math.min(1, Math.max(-1, v.y / r))) * RAD2DEG,
    lng: Math.atan2(-v.z, v.x) * RAD2DEG,
  };
}

/**
 * Offset a geographic point by a distance in km to the north and east.
 * Good to a few percent for offsets of a few hundred km, which is all we use.
 */
export function offsetLatLngKm(origin: LatLng, northKm: number, eastKm: number): LatLng {
  const kmPerDeg = (EARTH_RADIUS_KM * Math.PI) / 180;
  const lat = origin.lat + northKm / kmPerDeg;
  const cosLat = Math.max(0.01, Math.cos(origin.lat * DEG2RAD));
  const lng = origin.lng + eastKm / (kmPerDeg * cosLat);
  return { lat, lng };
}

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG2RAD;
  const dLng = (b.lng - a.lng) * DEG2RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG2RAD) * Math.cos(b.lat * DEG2RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}
