"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, CanvasTexture, Sprite, SpriteMaterial } from "three";
import { latLngToVector3 } from "@/engine/geo/coordinates";
import { INTRO } from "@/config/intro";
import { introState } from "@/components/intro/introState";

/** Soft radial light: generated once on a small canvas, no image asset. */
function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,236,200,1)");
  g.addColorStop(0.18, "rgba(255,196,110,0.55)");
  g.addColorStop(0.5, "rgba(255,150,60,0.12)");
  g.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/**
 * The warm light that rises over East Africa before the first stream is
 * released (intro Scene 2). The same value also lights the terrain in the
 * Earth shader. Invisible outside the intro.
 */
export function OriginBeacon() {
  const { material, position } = useMemo(() => {
    const material = new SpriteMaterial({
      map: makeGlowTexture(),
      color: "#ffd9a0",
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      opacity: 0,
      toneMapped: false,
    });
    const { lat, lng } = INTRO.origin.location;
    return { material, position: latLngToVector3(lat, lng, 1.006) };
  }, []);

  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );

  const ref = useRef<Sprite>(null);
  useFrame((state) => {
    const sprite = ref.current;
    if (!sprite) return;
    const g = introState.originGlow;
    sprite.visible = g > 0.002;
    if (!sprite.visible) return;
    // A slow breath while it builds, like something gathering.
    const breath = 1 + 0.08 * Math.sin(state.clock.elapsedTime * 3.2);
    sprite.scale.setScalar((0.22 + 0.5 * g) * breath);
    (sprite.material as SpriteMaterial).opacity = Math.min(1, g * 1.4);
  });

  return <sprite ref={ref} material={material} position={position} renderOrder={11} />;
}
