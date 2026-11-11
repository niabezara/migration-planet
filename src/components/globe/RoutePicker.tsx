"use client";

import type { ReactNode } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { MigrationRoute } from "@/types/migration";
import type { ParticleBuffers } from "@/engine/particles/clusterGenerator";
import { pickRoute } from "@/engine/particles/particleSimulation";
import { visibleRoutes } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";

/** Pixels the pointer may move between down and up and still count as a click. */
const CLICK_TOLERANCE_PX = 5;

/** The DOM element the pointer is over (the canvas). */
const setCursor = (e: ThreeEvent<PointerEvent>, cursor: string) => {
  const el = e.nativeEvent.target;
  if (el instanceof HTMLElement) el.style.cursor = cursor;
};

/**
 * Route picking on the globe. Wraps the Earth meshes; R3F bubbles their
 * pointer events here. Hit-testing is analytic (nearest route path on the
 * sphere), so there is no per-particle raycasting.
 */
export function RoutePicker({
  buffers,
  routes,
  children,
}: {
  buffers: ParticleBuffers;
  routes: MigrationRoute[];
  children: ReactNode;
}) {
  const camera = useThree((s) => s.camera);

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const s = useHistoryStore.getState();
    const candidates = s.mode === "overview" ? routes : visibleRoutes(routes, s.yearsBP);
    // Tolerance grows with distance so routes stay clickable when zoomed out.
    const toleranceKm = 120 + 300 * Math.max(0, camera.position.length() - 1);
    return pickRoute(buffers, candidates, e.point, toleranceKm);
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_TOLERANCE_PX) return; // it was a drag (orbit), not a click
    const route = pick(e);
    if (!route) return;
    e.stopPropagation();
    useHistoryStore.getState().selectRoute(route.id);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.buttons !== 0) return; // dragging
    setCursor(e, pick(e) ? "pointer" : "");
  };

  const onPointerOut = (e: ThreeEvent<PointerEvent>) => setCursor(e, "");

  return (
    <group onClick={onClick} onPointerMove={onPointerMove} onPointerOut={onPointerOut}>
      {children}
    </group>
  );
}
