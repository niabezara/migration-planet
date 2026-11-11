import type { Camera } from "three";
import type { CameraFocus } from "@/types/migration";
import { latLngToVector3, vector3ToLatLng } from "@/engine/geo/coordinates";

/**
 * The camera always orbits the globe centre and is animated in geographic
 * space (lat, lng, distance), so every flight arcs around the planet instead
 * of cutting through it. Shared by the intro director and CameraController.
 */
interface UpdatableControls {
  update: () => void;
}

export function applyCameraFocus(camera: Camera, controls: UpdatableControls | null | undefined, f: CameraFocus) {
  latLngToVector3(f.lat, f.lng, f.distance, camera.position);
  camera.lookAt(0, 0, 0);
  controls?.update();
}

export function readCameraFocus(camera: Camera): CameraFocus {
  return { ...vector3ToLatLng(camera.position), distance: camera.position.length() };
}

/** Shortest signed longitude delta, so flights never take the long way round. */
export const wrapDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/** `to` with its longitude unwrapped next to `from` (for tweening). */
export function unwrapTarget(from: CameraFocus, to: CameraFocus): CameraFocus {
  return { lat: to.lat, lng: from.lng + wrapDelta(from.lng, to.lng), distance: to.distance };
}
