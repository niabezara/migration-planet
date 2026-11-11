"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import type { ArchaeologicalSite } from "@/types/migration";
import { haversineKm, latLngToVector3 } from "@/engine/geo/coordinates";
import { formatYearShort } from "@/engine/timeline/timeEngine";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { useIntroStore } from "@/components/intro/introState";

const _cam = new Vector3();
const LABEL_STACK_KM = 150;

/**
 * Archaeological sites: faint rings with a label. They appear once history
 * reaches the older bound of their date range. Visibility is updated per
 * frame through refs, never through React state.
 */
export function SiteMarkers({ sites }: { sites: ArchaeologicalSite[] }) {
  const items = useMemo(
    () =>
      sites.map((site, i) => {
        const pos = latLngToVector3(site.location.lat, site.location.lng, 1.004);
        // Stack labels of sites that sit almost on top of each other.
        const stack = sites
          .slice(0, i)
          .filter((o) => haversineKm(o.location, site.location) < LABEL_STACK_KM).length;
        return { site, pos, normal: pos.clone().normalize(), stack };
      }),
    [sites],
  );
  const groups = useRef<(Group | null)[]>([]);
  const rings = useRef<(Mesh | null)[]>([]);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const introFade = useRef(0);

  useFrame((state) => {
    const { yearsBP: years, mode } = useHistoryStore.getState();
    // Sites stay out of the cinematic; they fade in with the interface.
    const live = useIntroStore.getState().stage === "done";
    introFade.current += ((live ? 1 : 0) - introFade.current) * Math.min(1, 0.03 + (live ? 0.02 : 0.3));
    _cam.copy(state.camera.position).normalize();
    const dist = state.camera.position.length();
    const t = state.clock.elapsedTime;

    items.forEach(({ site, normal }, i) => {
      const [older] = site.dateRange;
      // Fade in over ~3% of the site's age.
      // Overview shows every site; historical mode only those already dated.
      const appear =
        introFade.current * (mode === "overview" ? 1 : Math.min(1, Math.max(0, (older - years) / (older * 0.03))));
      // Labels only near the centre of view; rings stay visible to the limb.
      const facing = Math.min(1, Math.max(0, (normal.dot(_cam) - 0.8) / 0.1));
      const g = groups.current[i];
      if (g) g.visible = appear > 0.001;

      const ring = rings.current[i];
      if (ring) {
        const pulse = 1 + 0.35 * Math.sin(t * 1.6 + i);
        ring.scale.setScalar(pulse * Math.min(1.8, dist / 2.2));
        (ring.material as MeshBasicMaterial).opacity = 0.55 * appear;
      }
      const label = labels.current[i];
      if (label) {
        const near = Math.min(1, Math.max(0, (4.2 - dist) / 1.2));
        label.style.opacity = String(appear * facing * near);
      }
    });
  });

  return (
    <group>
      {items.map(({ site, pos, normal, stack }, i) => (
        <group
          key={site.id}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position={pos}
          // Orient the ring flat on the surface
          onUpdate={(g) => g.lookAt(normal.clone().multiplyScalar(2))}
        >
          <mesh
            ref={(m) => {
              rings.current[i] = m;
            }}
            renderOrder={5}
          >
            <ringGeometry args={[0.0075, 0.0095, 48]} />
            <meshBasicMaterial
              color="#f3e6cf"
              transparent
              opacity={0}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <Html center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
            <div
              ref={(d) => {
                labels.current[i] = d;
              }}
              className="site-label"
              style={{ opacity: 0, ["--stack" as string]: stack }}
            >
              <span className="site-label__name">{site.name}</span>
              <span className="site-label__date">
                {formatYearShort(site.dateRange[0])}–{formatYearShort(site.dateRange[1])}
              </span>
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
