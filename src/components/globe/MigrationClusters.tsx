"use client";

import { useControls } from "leva";
import type { MigrationRoute } from "@/types/migration";
import type { ParticleBuffers } from "@/engine/particles/clusterGenerator";
import { ParticleSystem } from "./ParticleSystem";

/**
 * Binds the migration particle buffers to the renderer and exposes
 * development tuning (Leva). Visual-only knobs; history stays deterministic.
 */
export function MigrationClusters({
  buffers,
  routes,
  density,
}: {
  buffers: ParticleBuffers;
  routes: MigrationRoute[];
  density: number;
}) {
  const look = useControls("Particles", {
    size: { value: 2.9, min: 0.5, max: 8, step: 0.1 },
    intensity: { value: 0.95, min: 0.2, max: 5, step: 0.05 },
    trailAlpha: { value: 0.38, min: 0, max: 1.5, step: 0.05 },
    glowAlpha: { value: 0.085, min: 0, max: 0.3, step: 0.005 },
    glowKm: { value: 140, min: 20, max: 400, step: 5 },
  });
  return <ParticleSystem buffers={buffers} look={look} density={density} routes={routes} />;
}
