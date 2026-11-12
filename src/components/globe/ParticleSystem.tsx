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
import type { MigrationRoute, PopulationCluster, Species } from "@/types/migration";
import { speciesVisible } from "@/engine/species/speciesModel";
import { focusTargets } from "@/stores/selectionFocus";
import { routeState } from "@/engine/timeline/timeEngine";
import { POP_ATTRIBUTES, type PopAttributeName, type PopulationBuffers } from "@/engine/particles/populationGenerator";
import { departureActivity } from "@/engine/population/populationModel";
import { createParticleLayers, MAX_CLUSTERS, MAX_ROUTES, MAX_SPECIES } from "./ParticleShader";
import { introState } from "@/components/intro/introState";
import { INTRO, loopTime } from "@/config/intro";

export interface ParticleLook {
  /** Core dot size. */
  size: number;
  intensity: number;
  trailAlpha: number;
  glowAlpha: number;
  /** World radius of one glow sprite, km. */
  glowKm: number;
  /** Population clusters: dot energy, haze strength and haze sprite radius (km). */
  popIntensity: number;
  popGlowAlpha: number;
  popGlowKm: number;
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
 * GPU renderer for ParticleBuffers (streams: glow, trails, core) and
 * PopulationBuffers (stationary clusters: haze, specks). Five draw calls,
 * built once, all sharing one uniforms object. Per frame the CPU writes a
 * handful of uniforms.
 */
export function ParticleSystem({
  buffers,
  populations,
  look,
  density,
  routes,
}: {
  buffers: ParticleBuffers;
  populations: { buffers: PopulationBuffers; clusters: PopulationCluster[]; species: Species[] };
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

    // Population clusters: static positions, time evaluated in the shader.
    const pb = populations.buffers;
    const popNames = Object.keys(POP_ATTRIBUTES) as PopAttributeName[];
    const popDots = new BufferGeometry();
    popDots.setAttribute("position", new BufferAttribute(pb.position, 3));
    for (const n of popNames) popDots.setAttribute(n, new BufferAttribute(pb.attributes[n], POP_ATTRIBUTES[n]));
    popDots.boundingSphere = new Sphere(new Vector3(), 1.1);
    const popGlow = new BufferGeometry();
    popGlow.setAttribute("position", popDots.getAttribute("position"));
    for (const n of popNames) popGlow.setAttribute(n, popDots.getAttribute(n));
    popGlow.setIndex(new BufferAttribute(pb.glowIndex, 1));
    popGlow.boundingSphere = popDots.boundingSphere;
    if (populations.clusters.length > MAX_CLUSTERS) console.warn(`Only the first ${MAX_CLUSTERS} clusters get departure activity.`);

    const layers = createParticleLayers({ pathTexture: texture, pathSamples: buffers.pathSamples });
    const awaken = layers.uniforms.uAwakenAt.value as Float32Array;
    if (routes.length > MAX_ROUTES) console.warn(`Only the first ${MAX_ROUTES} routes get intro awakening times.`);
    for (const r of routes) {
      if (r.index < MAX_ROUTES) awaken[r.index] = INTRO.routeAwakenAt[r.id] ?? INTRO.defaultAwakenAt;
    }
    return { texture, geometries: { core, glow, trail, popDots, popGlow }, layers };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routes/clusters are static data tied to buffers
  }, [buffers, populations]);

  useEffect(
    () => () => {
      built.texture.dispose();
      Object.values(built.geometries).forEach((g) => g.dispose());
      built.layers.core.dispose();
      built.layers.trail.dispose();
      built.layers.glow.dispose();
      built.layers.popDots.dispose();
      built.layers.popGlow.dispose();
    },
    [built],
  );

  // Uniform writes go through a material ref; the uniforms object is shared by all layers.
  const coreRef = useRef<ShaderMaterial>(null);
  // Transition state lives in a ref: it changes every frame, never via React.
  const anim = useRef({ shownMode: "overview" as ViewMode, fade: 0, selected: -1, selectMix: 0, focusMix: 0, focusCluster: -1 });

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

    // Selection → emphasis (routes, species, clusters; milestones map to both).
    const focus = focusTargets(s.selection, s.highlightMilestoneId);
    const routeId = s.selectedRouteId ?? focus.routeId;
    // Selection: only emphasise a route that is actually on screen.
    const route = routeId ? routes.find((r) => r.id === routeId) : undefined;
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
    const story = state.clock.elapsedTime - introState.storyStart;
    u.uStoryClock.value = story;
    u.uLoopClock.value = loopTime(story);
    u.uHero.value = introState.hero;
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
    u.uPopIntensity.value = look.popIntensity;
    u.uPopGlowAlpha.value = look.popGlowAlpha;
    u.uPopGlowKm.value = look.popGlowKm;

    // Species filter: each species fades in/out; streams follow Homo sapiens.
    const k = 1 - Math.exp(-dt * 4);
    const vis = u.uSpeciesVis.value as Float32Array;
    const spFocus = u.uSpeciesFocus.value as Float32Array;
    for (const sp of populations.species) {
      if (sp.index >= MAX_SPECIES) continue;
      vis[sp.index] += ((speciesVisible(s.speciesFilter, sp) ? 1 : 0) - vis[sp.index]) * k;
      spFocus[sp.index] = focus.speciesIds.includes(sp.id) ? 1 : 0;
      if (sp.id === "homo-sapiens") u.uStreamVis.value = vis[sp.index];
    }
    const focusCluster = focus.clusterId ? (populations.clusters.find((c) => c.id === focus.clusterId)?.index ?? -1) : -1;
    if (focusCluster >= 0) a.focusCluster = focusCluster;
    a.focusMix += ((focus.speciesIds.length || focusCluster >= 0 ? 1 : 0) - a.focusMix) * (1 - Math.exp(-dt * 5));
    u.uFocusMix.value = a.focusMix;
    u.uFocusCluster.value = focusCluster >= 0 ? focusCluster : a.focusMix > 0.01 ? a.focusCluster : -1;

    // Source clusters brighten where a stream separates from them (pure in yearsBP).
    const activity = u.uPopActivity.value as Float32Array;
    for (const c of populations.clusters) {
      if (c.index < MAX_CLUSTERS) activity[c.index] = c.sourceOf.length ? departureActivity(c, routes, s.yearsBP) : 0;
    }
  });

  return (
    <group>
      {/* Populations first: subtle context beneath the streams. */}
      <points geometry={built.geometries.popGlow} frustumCulled={false} renderOrder={6}>
        <primitive object={built.layers.popGlow} attach="material" />
      </points>
      <points geometry={built.geometries.popDots} frustumCulled={false} renderOrder={7}>
        <primitive object={built.layers.popDots} attach="material" />
      </points>
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
