"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BackSide, ShaderMaterial } from "three";
import { sceneRefs } from "./sceneRefs";

const ATMOSPHERE_RADIUS = 1.14;

/**
 * Outer atmospheric glow. For each pixel we compute how close the view ray
 * passes to the planet centre (impact parameter). Rays grazing the surface
 * glow most, fading out with altitude, tinted by the local sun angle.
 */
const vertexShader = /* glsl */ `
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uOuter;
  uniform float uIntensity;
  varying vec3 vPosW;

  void main() {
    vec3 ray = normalize(vPosW - cameraPosition);
    vec3 closest = cameraPosition + ray * dot(-cameraPosition, ray);
    float d = length(closest);
    float h = clamp((d - 1.0) / (uOuter - 1.0), 0.0, 1.0);
    float glow = pow(1.0 - h, 3.2);
    // Inside the planet's silhouette the earth occludes us anyway; fade
    // smoothly so the limb has no hard edge.
    glow *= smoothstep(0.985, 1.0, d);

    float sunSide = dot(normalize(closest), normalize(uSunDir));
    vec3 day = vec3(0.30, 0.60, 1.0);
    vec3 twilight = vec3(0.95, 0.42, 0.2);
    vec3 col = mix(twilight * 0.7, day, smoothstep(-0.05, 0.35, sunSide));
    float lit = smoothstep(-0.3, 0.3, sunSide);

    gl_FragColor = vec4(col * glow * lit * uIntensity, 1.0);
  }
`;

export function EarthAtmosphere({ intensity = 1.1 }: { intensity?: number }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: BackSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uSunDir: { value: sceneRefs.sunDirection },
          uOuter: { value: ATMOSPHERE_RADIUS },
          uIntensity: { value: intensity },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const ref = useRef<ShaderMaterial>(null);
  useFrame(() => {
    if (ref.current) ref.current.uniforms.uIntensity.value = intensity;
  });

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh renderOrder={2}>
      <sphereGeometry args={[ATMOSPHERE_RADIUS, 96, 96]} />
      <primitive object={material} attach="material" ref={ref} />
    </mesh>
  );
}
