import { Vector3 } from "three";

/**
 * Small mutable scene values shared between 3D components without going
 * through React state (they change every frame).
 */
export const sceneRefs = {
  /** World-space unit vector pointing at the sun. */
  sunDirection: new Vector3(1, 0.3, 0.5).normalize(),
  /** Horizontal offset (in UV units) applied to the cloud layer. */
  cloudOffset: 0,
};
