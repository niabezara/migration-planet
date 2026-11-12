"use client";

import type { ReactNode } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { MigrationRoute } from "@/types/migration";
import type { ParticleBuffers } from "@/engine/particles/clusterGenerator";
import { pickRoute } from "@/engine/particles/particleSimulation";
import { visibleRoutes } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { populations, sites, speciesById } from "@/data";
import { pickPopulation, pickSite } from "@/engine/picking";

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

  /** Sites first (small targets), then routes, then the population region under the pointer. */
  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const s = useHistoryStore.getState();
    const ctx = { mode: s.mode, yearsBP: s.yearsBP, filter: s.speciesFilter };
    const zoom = Math.max(0, camera.position.length() - 1);
    const site = pickSite(sites, speciesById, e.point, 45 + 110 * zoom, ctx);
    if (site) return { kind: "site" as const, id: site.id };
    // Routes are Homo sapiens dispersals: not pickable when the filter hides them.
    const candidates = s.speciesFilter === "other" ? [] : s.mode === "overview" ? routes : visibleRoutes(routes, s.yearsBP);
    // Tolerance grows with distance so routes stay clickable when zoomed out.
    const route = pickRoute(buffers, candidates, e.point, 120 + 300 * zoom);
    if (route) return { kind: "route" as const, id: route.id };
    const pop = pickPopulation(populations, speciesById, e.point, ctx);
    if (pop) return { kind: "population" as const, id: pop.id };
    return null;
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_TOLERANCE_PX) return; // it was a drag (orbit), not a click
    const hit = pick(e);
    if (!hit) return;
    e.stopPropagation();
    if (hit.kind === "route") useHistoryStore.getState().selectRoute(hit.id);
    else useHistoryStore.getState().select(hit);
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
