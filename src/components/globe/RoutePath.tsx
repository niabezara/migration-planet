"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { Line2, LineMaterial, LineSegments2 } from "three-stdlib";
import { Vector3 } from "three";
import type { MigrationRoute } from "@/types/migration";
import type { ParticleBuffers } from "@/engine/particles/clusterGenerator";
import { routeState } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";

const LINE_RADIUS = 1.0012;

/**
 * A faint flowing dashed line along the selected route, so its full
 * geography reads even while particles are elsewhere on it. Particles stay
 * the primary visual; this is a supporting highlight.
 */
export function RoutePath({ buffers, routes }: { buffers: ParticleBuffers; routes: MigrationRoute[] }) {
  const selectedId = useHistoryStore((s) => s.selectedRouteId);
  const route = routes.find((r) => r.id === selectedId) ?? null;

  // Main path plus any branches.
  const lines = useMemo(() => {
    if (!route) return [];
    return buffers.routePaths[route.id].map((path) => {
      const pts: Vector3[] = [];
      for (let i = 0; i < path.length; i += 3) {
        pts.push(new Vector3(path[i], path[i + 1], path[i + 2]).multiplyScalar(LINE_RADIUS));
      }
      return pts;
    });
  }, [route, buffers]);

  const refs = useRef<(Line2 | LineSegments2 | null)[]>([]);
  useFrame((_, delta) => {
    if (!route) return;
    const s = useHistoryStore.getState();
    const visible = s.mode === "overview" || routeState(route, s.yearsBP).visible;
    refs.current.forEach((line, i) => {
      if (!line) return;
      const m = line.material as LineMaterial;
      // Branches are drawn fainter: they are alternatives, not the main path.
      const target = (visible ? 0.6 : 0.16) * (i === 0 ? 1 : 0.6);
      m.opacity += (target - m.opacity) * (1 - Math.exp(-Math.min(delta, 0.1) * 5));
      m.dashOffset -= delta * 0.015;
    });
  });

  if (!route) return null;
  return (
    <group key={route.id}>
      {lines.map((points, i) => (
        <Line
          key={i}
          ref={(l) => {
            refs.current[i] = l;
          }}
          points={points}
          color={route.color}
          lineWidth={i === 0 ? 1.5 : 1.1}
          transparent
          opacity={0}
          dashed
          dashSize={0.014}
          gapSize={i === 0 ? 0.01 : 0.018}
          depthWrite={false}
          toneMapped={false}
          renderOrder={7}
        />
      ))}
    </group>
  );
}
