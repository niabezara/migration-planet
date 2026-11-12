"use client";

import { useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
import { useControls } from "leva";
import type { MigrationRoute, PopulationCluster, Species } from "@/types/migration";
import type { ParticleBuffers } from "@/engine/particles/clusterGenerator";
import { generatePopulationBuffers } from "@/engine/particles/populationGenerator";
import type { QualityProfile } from "@/engine/quality";
import { INTRO } from "@/config/intro";
import { ParticleSystem } from "./ParticleSystem";

/** Same texture the Earth uses (G channel: roughness, low over oceans). */
const MASK_URL = "/textures/earth_bump_roughness_clouds_4096.jpg";
const MASK_W = 1024;
const MASK_H = 512;

/** Present-day land test from the roughness map (equirectangular, north up). */
function buildLandMask(image: CanvasImageSource): ((lat: number, lng: number) => boolean) | undefined {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = MASK_W;
    canvas.height = MASK_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(image, 0, 0, MASK_W, MASK_H);
    const data = ctx.getImageData(0, 0, MASK_W, MASK_H).data;
    return (lat, lng) => {
      const x = Math.min(MASK_W - 1, Math.max(0, Math.floor((((lng + 180) % 360) + 360) % 360 / 360 * MASK_W)));
      const y = Math.min(MASK_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MASK_H)));
      return data[(y * MASK_W + x) * 4 + 1] > 96; // G channel; matches the Earth shader's ocean mask
    };
  } catch {
    return undefined; // tainted canvas etc.: fall back to unmasked clusters
  }
}

/**
 * Intro timing for overview: a source population is there just before its
 * stream bursts out of it; destination populations follow their streams;
 * other African populations appear with the origin light.
 */
function clusterAwakenTimes(clusters: PopulationCluster[]): Record<string, number> {
  const at = (id: string) => INTRO.routeAwakenAt[id] ?? INTRO.defaultAwakenAt;
  return Object.fromEntries(
    clusters.map((c) => {
      if (c.sourceOf.length) return [c.id, Math.min(...c.sourceOf.map(at)) - 0.9];
      if (c.destinationOf.length) return [c.id, Math.min(...c.destinationOf.map(at)) + 1.6];
      // Other hominins (shown when the filter includes them) appear with the reveal.
      if (c.speciesId !== "homo-sapiens") return [c.id, INTRO.titleAt];
      return [c.id, INTRO.origin.peakAt + 0.2];
    }),
  );
}

/**
 * Binds migration streams and population clusters to the renderer and
 * exposes development tuning (Leva). Visual-only knobs; history stays deterministic.
 */
export function MigrationClusters({
  buffers,
  routes,
  clusters,
  species,
  quality,
  density,
}: {
  buffers: ParticleBuffers;
  routes: MigrationRoute[];
  clusters: PopulationCluster[];
  species: Species[];
  quality: QualityProfile;
  density: number;
}) {
  const mask = useLoader(TextureLoader, MASK_URL);
  const populations = useMemo(() => {
    const isLand = buildLandMask(mask.image as CanvasImageSource);
    const pb = generatePopulationBuffers(clusters, routes, {
      particleScale: quality.particleScale,
      glowShare: quality.glowShare * 1.4,
      isLand,
      awakenAt: clusterAwakenTimes(clusters),
      speciesIndex: Object.fromEntries(species.map((sp) => [sp.id, sp.index])),
    });
    return { buffers: pb, clusters, species };
  }, [mask, clusters, routes, species, quality]);

  const look = useControls("Particles", {
    size: { value: 3.0, min: 0.5, max: 8, step: 0.1 },
    intensity: { value: 1.35, min: 0.2, max: 5, step: 0.05 },
    trailAlpha: { value: 0.62, min: 0, max: 1.5, step: 0.05 },
    glowAlpha: { value: 0.1, min: 0, max: 0.3, step: 0.005 },
    glowKm: { value: 115, min: 20, max: 400, step: 5 },
  });
  const pop = useControls("Populations", {
    popIntensity: { value: 2.1, min: 0, max: 4, step: 0.02 },
    popGlowAlpha: { value: 0.13, min: 0, max: 0.2, step: 0.002 },
    popGlowKm: { value: 240, min: 30, max: 500, step: 5 },
  });
  return (
    <ParticleSystem
      buffers={buffers}
      populations={populations}
      look={{ ...look, ...pop }}
      density={density}
      routes={routes}
    />
  );
}
