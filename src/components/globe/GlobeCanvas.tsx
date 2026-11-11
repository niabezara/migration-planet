"use client";

import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, Stars } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useControls } from "leva";
import { routes, sites } from "@/data";
import { generateParticleBuffers } from "@/engine/particles/clusterGenerator";
import { detectQuality } from "@/engine/quality";
import { CameraController } from "./CameraController";
import { Earth } from "./Earth";
import { EarthAtmosphere } from "./EarthAtmosphere";
import { MigrationClusters } from "./MigrationClusters";
import { PlaybackDriver } from "./PlaybackDriver";
import { RoutePath } from "./RoutePath";
import { RoutePicker } from "./RoutePicker";
import { SiteMarkers } from "./SiteMarkers";

/** The single WebGL scene. Client-only (loaded with ssr: false). */
export default function GlobeCanvas({ onReady }: { onReady?: () => void }) {
  const quality = useMemo(() => detectQuality(), []);
  const [dpr, setDpr] = useState(quality.dpr[1]);
  // Runtime LOD: thinned (never rebuilt) when the frame rate drops.
  const [density, setDensity] = useState(1);

  const buffers = useMemo(
    () =>
      generateParticleBuffers(routes, {
        particleScale: quality.particleScale,
        trailShare: quality.trailShare,
        glowShare: quality.glowShare,
      }),
    [quality],
  );

  const scene = useControls("Scene", {
    sunAngle: { value: 0.85, min: 0, max: 1.6, step: 0.01 },
    clouds: { value: 0.8, min: 0, max: 1, step: 0.01 },
    atmosphere: { value: 1.1, min: 0, max: 3, step: 0.05 },
    bloom: { value: 0.7, min: 0, max: 4, step: 0.05 },
    bloomThreshold: { value: 0.95, min: 0, max: 2, step: 0.01 },
  });

  return (
    <Canvas
      dpr={dpr}
      camera={{ fov: 35, near: 0.01, far: 200, position: [0, 0, 9] }}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      onCreated={() => onReady?.()}
    >
      <color attach="background" args={["#02040a"]} />
      <PerformanceMonitor
        onDecline={() => {
          setDensity((v) => Math.max(0.45, v - 0.15));
          setDpr((d) => Math.max(quality.dpr[0], d - 0.25));
        }}
        onIncline={() => {
          setDensity((v) => Math.min(1, v + 0.1));
          setDpr((d) => Math.min(quality.dpr[1], d + 0.25));
        }}
      />

      <Stars radius={80} depth={40} count={quality.tier === "low" ? 2500 : 5000} factor={2.2} saturation={0} fade speed={0.2} />

      <Suspense fallback={null}>
        <RoutePicker buffers={buffers} routes={routes}>
          <Earth sunAngle={scene.sunAngle} cloudOpacity={scene.clouds} />
        </RoutePicker>
        <EarthAtmosphere intensity={scene.atmosphere} />
        <RoutePath buffers={buffers} routes={routes} />
        <MigrationClusters buffers={buffers} routes={routes} density={density} />
        <SiteMarkers sites={sites} />
      </Suspense>

      <PlaybackDriver routes={routes} />
      <CameraController routes={routes} buffers={buffers} />

      <EffectComposer multisampling={quality.multisampling} enableNormalPass={false}>
        <Bloom
          mipmapBlur
          intensity={scene.bloom}
          luminanceThreshold={scene.bloomThreshold}
          luminanceSmoothing={0.25}
          radius={0.72}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.28} darkness={0.72} />
      </EffectComposer>
    </Canvas>
  );
}
