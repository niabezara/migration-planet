"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  NearestFilter,
  PerspectiveCamera,
  RGBAFormat,
  ShaderMaterial,
  Sphere,
  Vector3,
} from "three";
import { CORE_ATTRIBUTES, type AttributeName, type ParticleBuffers } from "@/engine/particles/clusterGenerator";
import { useHistoryStore, type ViewMode } from "@/stores/useHistoryStore";
import type { MigrationRoute } from "@/types/migration";
import { routeState } from "@/engine/timeline/timeEngine";
import { createParticleLayers } from "./ParticleShader";

export interface ParticleLook {
  /** Core dot size. */
  size: number;
  intensity: number;
  trailAlpha: number;
  glowAlpha: number;
  /** World radius of one glow sprite, km. */
  glowKm: number;
}

const MODE_FADE_OUT = 4; // per second
const MODE_FADE_IN = 2.5;

/** Geometry whose real positions are computed in the vertex shader. */
function shaderGeometry(vertexCount: number) {
  const g = new BufferGeometry();
  // `position` is required by three for draw bookkeeping only.
  g.setAttribute("position", new BufferAttribute(new Float32Array(vertexCount * 3), 3));
  g.boundingSphere = new Sphere(new Vector3(), 1.1);
  return g;
}

/**
 * GPU renderer for ParticleBuffers: three draw calls (glow, trails, core)
 * built once. Per frame the CPU writes a handful of shared uniforms.
 */
export function ParticleSystem({
  buffers,
  look,
  density,
  routes,
}: {
  buffers: ParticleBuffers;
  look: ParticleLook;
  /** Runtime LOD 0..1 from the performance monitor. */
  density: number;
  routes: MigrationRoute[];
}) {
  const built = useMemo(() => {
    const texture = new DataTexture(
      buffers.pathTexture,
      buffers.pathSamples,
      Math.max(1, buffers.pathRows),
      RGBAFormat,
      FloatType,
    );
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.needsUpdate = true;

    const names = Object.keys(CORE_ATTRIBUTES) as AttributeName[];

    const core = shaderGeometry(buffers.particleCount);
    for (const n of names) core.setAttribute(n, new BufferAttribute(buffers.core[n], CORE_ATTRIBUTES[n]));

    // Glow re-uses the very same attribute objects (one GPU upload) via an index.
    const glow = shaderGeometry(buffers.particleCount);
    for (const n of names) glow.setAttribute(n, core.getAttribute(n));
    glow.setIndex(new BufferAttribute(buffers.glowIndex, 1));

    const trail = shaderGeometry(buffers.trail.vertexCount);
    for (const n of names) trail.setAttribute(n, new BufferAttribute(buffers.trail.attributes[n], CORE_ATTRIBUTES[n]));
    trail.setAttribute("aTrail", new BufferAttribute(buffers.trail.attributes.aTrail, 1));

    const layers = createParticleLayers({ pathTexture: texture, pathSamples: buffers.pathSamples });
    return { texture, geometries: { core, glow, trail }, layers };
  }, [buffers]);

  useEffect(
    () => () => {
      built.texture.dispose();
      Object.values(built.geometries).forEach((g) => g.dispose());
      built.layers.core.dispose();
      built.layers.trail.dispose();
      built.layers.glow.dispose();
    },
    [built],
  );

  // Uniform writes go through a material ref; the uniforms object is shared by all layers.
  const coreRef = useRef<ShaderMaterial>(null);
  // Transition state lives in a ref: it changes every frame, never via React.
  const anim = useRef({ shownMode: "overview" as ViewMode, fade: 0, selected: -1, selectMix: 0 });

  useFrame((state, delta) => {
    if (!coreRef.current) return;
    const u = coreRef.current.uniforms;
    const s = useHistoryStore.getState();
    const a = anim.current;
    const dt = Math.min(delta, 0.1);

    // Mode crossfade: fade out, swap the clock, fade back in (alpha only).
    if (s.mode !== a.shownMode) {
      a.fade = Math.max(0, a.fade - dt * MODE_FADE_OUT);
      if (a.fade === 0) a.shownMode = s.mode;
    } else {
      a.fade = Math.min(1, a.fade + dt * MODE_FADE_IN);
    }

    // Selection: only emphasise a route that is actually on screen.
    const route = s.selectedRouteId ? routes.find((r) => r.id === s.selectedRouteId) : undefined;
    const onScreen = route && (a.shownMode === "overview" || routeState(route, s.yearsBP).visible);
    if (route) a.selected = route.index;
    a.selectMix += ((onScreen ? 1 : 0) - a.selectMix) * (1 - Math.exp(-dt * 6));

    const dpr = state.gl.getPixelRatio();
    const fov = (state.camera as PerspectiveCamera).fov ?? 35;
    u.uMode.value = a.shownMode === "overview" ? 0 : 1;
    u.uFade.value = a.fade;
    u.uSelected.value = a.selected;
    u.uSelectMix.value = a.selectMix;
    u.uYearBP.value = s.yearsBP;
    u.uClock.value = state.clock.elapsedTime;
    u.uCamDist.value = state.camera.position.length();
    u.uDensity.value = density;
    u.uPxScale.value = dpr * (state.size.height / 900);
    u.uMinPx.value = 1.6 * dpr;
    u.uProjScale.value = (state.size.height * dpr) / (2 * Math.tan((fov * Math.PI) / 360));
    u.uGlowPxRange.value.set(6 * dpr, 170 * dpr);
    u.uSize.value = look.size;
    u.uIntensity.value = look.intensity;
    u.uTrailAlpha.value = look.trailAlpha;
    u.uGlowAlpha.value = look.glowAlpha;
    u.uGlowKm.value = look.glowKm;
  });

  return (
    <group>
      <points geometry={built.geometries.glow} frustumCulled={false} renderOrder={8}>
        <primitive object={built.layers.glow} attach="material" />
      </points>
      <lineSegments geometry={built.geometries.trail} frustumCulled={false} renderOrder={9}>
        <primitive object={built.layers.trail} attach="material" />
      </lineSegments>
      <points geometry={built.geometries.core} frustumCulled={false} renderOrder={10}>
        <primitive object={built.layers.core} attach="material" ref={coreRef} />
      </points>
    </group>
  );
}
