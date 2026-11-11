"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import gsap from "gsap";
import type { CameraFocus, MigrationRoute } from "@/types/migration";
import type { ParticleBuffers } from "@/engine/particles/clusterGenerator";
import { latLngToVector3, vector3ToLatLng } from "@/engine/geo/coordinates";
import { routeFocusPoint } from "@/engine/particles/particleSimulation";
import { routeState } from "@/engine/timeline/timeEngine";
import { INTRO_CAMERA, OVERVIEW_CAMERA } from "@/config/camera";
import { useHistoryStore } from "@/stores/useHistoryStore";

const MIN_DISTANCE = 1.25;
/** Overview auto-rotation resumes this long after the user lets go. */
const IDLE_BEFORE_ROTATE_MS = 4000;
const MAX_DISTANCE = 9;

/** Shortest signed longitude delta, so flights never take the long way round. */
const wrapDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

interface Props {
  routes: MigrationRoute[];
  buffers: ParticleBuffers;
}

/**
 * Which route the director camera should follow while playing: the selected
 * one if it is on screen, otherwise the most recently started active route.
 */
function directorTarget(routes: MigrationRoute[], yearsBP: number, selectedId: string | null) {
  const selected = selectedId ? routes.find((r) => r.id === selectedId) : undefined;
  if (selected && routeState(selected, yearsBP).visible) return selected;
  const active = routes.filter((r) => routeState(r, yearsBP).status === "active");
  return active.sort((a, b) => a.startYear - b.startYear)[0] ?? null;
}

/**
 * Cinematic camera. The camera always orbits the globe centre; we animate it
 * in geographic space (lat, lng, distance) so flights arc around the planet
 * instead of cutting through it.
 */
export function CameraController({ routes, buffers }: Props) {
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const proxy = useRef({ ...INTRO_CAMERA });
  const tween = useRef<gsap.core.Tween | null>(null);
  const lastInteraction = useRef(0);
  const lastTarget = useRef<string | null>(null);

  const apply = (f: CameraFocus) => {
    latLngToVector3(f.lat, f.lng, f.distance, camera.position);
    camera.lookAt(0, 0, 0);
    controls.current?.update();
  };

  const readCamera = (): CameraFocus => {
    const ll = vector3ToLatLng(camera.position);
    return { ...ll, distance: camera.position.length() };
  };

  const flyTo = (to: CameraFocus, duration = 3.2, ease = "power2.inOut") => {
    tween.current?.kill();
    const from = readCamera();
    Object.assign(proxy.current, from);
    const target = { lat: to.lat, lng: from.lng + wrapDelta(from.lng, to.lng), distance: to.distance };
    tween.current = gsap.to(proxy.current, {
      ...target,
      duration,
      ease,
      onUpdate: () => apply(proxy.current),
      onComplete: () => {
        tween.current = null;
      },
    });
  };

  // Intro flight
  useEffect(() => {
    apply(INTRO_CAMERA);
    flyTo(OVERVIEW_CAMERA, 5.5, "power3.inOut");
    return () => {
      tween.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Explicit camera requests from the UI (jump to period / event)
  useEffect(
    () =>
      useHistoryStore.subscribe((state, prev) => {
        if (state.cameraRequest && state.cameraRequest.nonce !== prev.cameraRequest?.nonce) {
          flyTo(state.cameraRequest.focus, state.cameraRequest.duration);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // User grabbing the globe hands control back to them.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const onStart = () => {
      lastInteraction.current = performance.now();
      tween.current?.kill();
      tween.current = null;
      useHistoryStore.getState().setFollowCamera(false);
    };
    const onEnd = () => {
      lastInteraction.current = performance.now();
    };
    c.addEventListener("start", onStart);
    c.addEventListener("end", onEnd);
    return () => {
      c.removeEventListener("start", onStart);
      c.removeEventListener("end", onEnd);
    };
  }, []);

  useFrame((_, delta) => {
    const c = controls.current;
    const { mode, yearsBP, playing, followCamera, selectedRouteId } = useHistoryStore.getState();

    // Overview: the Earth turns slowly unless the user is exploring or a route is open.
    const idle = performance.now() - lastInteraction.current > IDLE_BEFORE_ROTATE_MS;
    if (c) c.autoRotate = mode === "overview" && !selectedRouteId && !tween.current && idle;

    if (mode !== "historical" || !playing || !followCamera) {
      lastTarget.current = null;
      return;
    }

    // Director: a newly followed route gets an establishing flight…
    const target = directorTarget(routes, yearsBP, selectedRouteId);
    if (target && target.id !== lastTarget.current) {
      lastTarget.current = target.id;
      flyTo(target.camera, 3.5);
      return;
    }
    lastTarget.current = target?.id ?? null;

    // …then the camera drifts along with the wave.
    if (target && !tween.current) {
      const focus = routeFocusPoint(buffers, target, yearsBP);
      const cur = readCamera();
      const k = 1 - Math.exp(-delta * 0.7);
      apply({
        lat: cur.lat + (focus.lat - 3 - cur.lat) * k,
        lng: cur.lng + wrapDelta(cur.lng, focus.lng) * k,
        distance: cur.distance + (target.camera.distance - cur.distance) * k,
      });
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.35}
      zoomSpeed={0.6}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      autoRotateSpeed={0.25}
    />
  );
}
