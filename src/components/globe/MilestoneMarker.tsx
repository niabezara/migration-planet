"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { AdditiveBlending, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { milestoneById } from "@/data";
import { latLngToVector3 } from "@/engine/geo/coordinates";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { milestoneAccent } from "@/components/milestones/MilestoneIcon";
import { MilestoneScene } from "@/components/milestones/MilestoneScene";
import { milestoneReached } from "@/components/milestones/milestoneNav";

const _cam = new Vector3();

/**
 * The selected (or expanded) milestone, placed at its location: a soft
 * pulsing ring on the surface and its animated icon. Only one at a time, so
 * the globe never fills with markers.
 */
export function MilestoneMarker() {
  const id = useHistoryStore((s) => s.highlightMilestoneId);
  const m = id ? milestoneById[id] : undefined;
  const { pos, normal } = useMemo(() => {
    if (!m) return { pos: new Vector3(), normal: new Vector3(0, 0, 1) };
    const p = latLngToVector3(m.geographicLocation.lat, m.geographicLocation.lng, 1.004);
    return { pos: p, normal: p.clone().normalize() };
  }, [m]);
  const ring = useRef<Mesh>(null);
  const label = useRef<HTMLDivElement>(null);
  const fade = useRef(0);

  useFrame((state, delta) => {
    if (!m) return;
    // Scrubbing before the earliest evidence dims the marker (the evidence does not exist yet).
    const { mode, yearsBP } = useHistoryStore.getState();
    const target = mode === "overview" || milestoneReached(m, yearsBP) ? 1 : 0.22;
    fade.current += (target - fade.current) * Math.min(1, delta * 4);
    _cam.copy(state.camera.position).normalize();
    const facing = Math.min(1, Math.max(0, (normal.dot(_cam) - 0.15) / 0.2));
    const t = state.clock.elapsedTime;
    if (ring.current) {
      const k = (t * 0.45) % 1;
      ring.current.scale.setScalar((0.6 + k * 1.6) * Math.min(1.6, state.camera.position.length() / 2.2));
      (ring.current.material as MeshBasicMaterial).opacity = (1 - k) * 0.7 * facing * fade.current;
    }
    if (label.current) label.current.style.opacity = String(facing * fade.current);
  });

  if (!m) return null;
  const accent = milestoneAccent(m.visualIcon);
  return (
    <group key={m.id} position={pos} onUpdate={(g) => g.lookAt(normal.clone().multiplyScalar(2))}>
      <mesh ref={ring} renderOrder={11}>
        <ringGeometry args={[0.011, 0.0135, 64]} />
        <meshBasicMaterial color={accent} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <Html center zIndexRange={[12, 0]} style={{ pointerEvents: "none" }}>
        <div ref={label} className="ms-marker-card" style={{ opacity: 0, ["--ms-accent" as string]: accent }}>
          <MilestoneScene icon={m.visualIcon} variant="marker" />
          <span className="ms-marker-card__label">{m.title}</span>
          <span className="ms-marker-card__stem" />
        </div>
      </Html>
    </group>
  );
}
