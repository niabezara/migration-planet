"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { RepeatWrapping, ShaderMaterial, SRGBColorSpace, Texture, Vector3 } from "three";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { sceneRefs } from "./sceneRefs";
import { introState } from "@/components/intro/introState";
import { INTRO } from "@/config/intro";
import { latLngToVector3 } from "@/engine/geo/coordinates";

const ORIGIN_DIR = latLngToVector3(INTRO.origin.location.lat, INTRO.origin.location.lng);

const SEGMENTS = 128;
const CLOUD_RADIUS = 1.009;

const surfaceVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uBRC;        // G: roughness (ocean mask), B: clouds
  uniform vec3 uSunDir;
  uniform float uNightLights;    // 0 before the electric era, 1 at present
  uniform float uCloudOffset;
  uniform float uExposure;       // intro: emerge from darkness
  uniform vec3 uOriginDir;       // intro: East-African origin light
  uniform float uOriginGlow;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 geoN = normalize(vNormalW);
    vec3 sun = normalize(uSunDir);
    vec3 viewDir = normalize(cameraPosition - vPosW);

    vec4 brc = texture2D(uBRC, vUv);
    vec3 n = geoN;

    float geoNdl = dot(geoN, sun);
    float ndl = max(dot(n, sun), 0.0);
    float dayMix = smoothstep(-0.12, 0.3, geoNdl);

    // Day side
    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 lit = day * (0.04 + 1.15 * ndl);

    // Cloud shadows: same texture as the cloud shell, nudged away from the sun.
    vec2 shadowUv = vec2(vUv.x - uCloudOffset + sun.x * 0.002, vUv.y);
    float cloudShadow = texture2D(uBRC, shadowUv).b;
    lit *= 1.0 - cloudShadow * 0.42 * smoothstep(0.0, 0.35, geoNdl);

    // Ocean glint
    float ocean = 1.0 - smoothstep(0.2, 0.55, brc.g);
    vec3 h = normalize(sun + viewDir);
    // Tight, restrained glint: it must not compete with the streams.
    float spec = pow(max(dot(n, h), 0.0), 120.0) * ocean;
    lit += vec3(1.0, 0.93, 0.82) * spec * 0.18 * ndl;

    // Night side: faint cool "moonlit" continents (still readable), city
    // lights only in the modern era.
    vec3 night = texture2D(uNight, vUv).rgb;
    vec3 dark = day * vec3(0.022, 0.034, 0.06) + night * night * uNightLights * 2.2;

    vec3 color = mix(dark, lit, dayMix);

    // Warm band along the terminator: low sun through a thick atmosphere.
    float band = smoothstep(-0.1, 0.02, geoNdl) * (1.0 - smoothstep(0.02, 0.24, geoNdl));
    color += day * vec3(1.0, 0.5, 0.22) * band * 0.3;

    // Origin light: warm illumination of the terrain around East Africa.
    float originAng = dot(geoN, normalize(uOriginDir));
    float origin = exp(-(1.0 - originAng) * 38.0) * uOriginGlow;
    color += (day * 1.3 + vec3(0.22, 0.1, 0.02)) * vec3(1.0, 0.62, 0.26) * origin;

    // Atmospheric scattering on the disk near the limb
    float fres = pow(1.0 - max(dot(viewDir, geoN), 0.0), 2.6);
    vec3 atmoDay = vec3(0.32, 0.58, 1.0);
    vec3 atmoTwilight = vec3(1.0, 0.5, 0.25);
    vec3 atmo = mix(atmoTwilight, atmoDay, smoothstep(-0.02, 0.3, geoNdl));
    color += atmo * fres * smoothstep(-0.12, 0.35, geoNdl) * 0.85;
    // A thin blue haze over the whole lit face
    color = mix(color, atmoDay * 0.6, 0.06 * dayMix);

    gl_FragColor = vec4(color * uExposure, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const cloudFragment = /* glsl */ `
  uniform sampler2D uBRC;
  uniform vec3 uSunDir;
  uniform float uCloudOffset;
  uniform float uOpacity;
  uniform float uExposure;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    float c = texture2D(uBRC, vec2(vUv.x - uCloudOffset, vUv.y)).b;
    c = smoothstep(0.15, 1.0, c);
    vec3 n = normalize(vNormalW);
    float ndl = dot(n, normalize(uSunDir));
    float light = smoothstep(-0.15, 0.35, ndl);
    vec3 twilight = vec3(1.0, 0.62, 0.42);
    vec3 col = mix(twilight * 0.6, vec3(1.0), smoothstep(0.05, 0.5, ndl)) * (0.03 + light * 0.95);
    gl_FragColor = vec4(col * uExposure, c * uOpacity * (0.25 + 0.75 * light) * uExposure);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface EarthProps {
  /** Angle between camera and sun, radians. Larger = more terminator visible. */
  sunAngle?: number;
  cloudSpeed?: number;
  cloudOpacity?: number;
}

const Y = new Vector3(0, 1, 0);
const _c = new Vector3();
const _right = new Vector3();

export function Earth({ sunAngle = 0.85, cloudSpeed = 0.0025, cloudOpacity = 0.85 }: EarthProps) {
  const gl = useThree((s) => s.gl);
  const [day, night, brc] = useTexture(
    [
      "/textures/earth_day_4096.jpg",
      "/textures/earth_night_4096.jpg",
      "/textures/earth_bump_roughness_clouds_4096.jpg",
    ],
    (loaded) => {
      const list = loaded as Texture[];
      const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
      list.forEach((t, i) => {
        if (i < 2) t.colorSpace = SRGBColorSpace; // colour maps; BRC is data
        t.anisotropy = aniso;
        t.wrapS = RepeatWrapping;
        t.needsUpdate = true;
      });
    },
  );
  const earthRef = useRef<ShaderMaterial>(null);
  const cloudRef = useRef<ShaderMaterial>(null);

  const earthMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: surfaceVertex,
        fragmentShader: earthFragment,
        uniforms: {
          uDay: { value: day },
          uNight: { value: night },
          uBRC: { value: brc },
          uSunDir: { value: sceneRefs.sunDirection },
          uNightLights: { value: 0 },
          uCloudOffset: { value: 0 },
          uExposure: { value: 0 },
          uOriginDir: { value: ORIGIN_DIR },
          uOriginGlow: { value: 0 },
        },
      }),
    [day, night, brc],
  );

  const cloudMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: surfaceVertex,
        fragmentShader: cloudFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uBRC: { value: brc },
          uSunDir: { value: sceneRefs.sunDirection },
          uCloudOffset: { value: 0 },
          uOpacity: { value: cloudOpacity },
          uExposure: { value: 0 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brc],
  );

  useEffect(
    () => () => {
      earthMaterial.dispose();
      cloudMaterial.dispose();
    },
    [earthMaterial, cloudMaterial],
  );

  useFrame((state, delta) => {
    // Documentary lighting: the sun follows the camera at a fixed angle, so
    // the viewed hemisphere is lit and a terminator is always on one limb.
    // The intro may override the light angle (back-lit emergence → three-quarter light).
    const angle = introState.sunAngle ?? sunAngle;
    _c.copy(state.camera.position).normalize();
    _right.crossVectors(Y, _c);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    sceneRefs.sunDirection
      .copy(_c)
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(_right, Math.sin(angle))
      .addScaledVector(Y, 0.18)
      .normalize();

    sceneRefs.cloudOffset = (sceneRefs.cloudOffset + delta * cloudSpeed * 0.1) % 1;

    const { yearsBP: years, mode } = useHistoryStore.getState();
    // Electric city lights only exist in the last ~150 years (none in overview).
    const lights = mode === "overview" ? 0 : 1 - Math.min(1, Math.max(0, (years - 150) / 250));

    const earth = earthRef.current;
    const clouds = cloudRef.current;
    if (!earth || !clouds) return;
    earth.uniforms.uNightLights.value = lights;
    earth.uniforms.uExposure.value = introState.exposure;
    earth.uniforms.uOriginGlow.value = introState.originGlow;
    clouds.uniforms.uExposure.value = introState.exposure;
    earth.uniforms.uCloudOffset.value = sceneRefs.cloudOffset;
    clouds.uniforms.uCloudOffset.value = sceneRefs.cloudOffset;
    clouds.uniforms.uOpacity.value = cloudOpacity;
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[1, SEGMENTS, SEGMENTS]} />
        <primitive object={earthMaterial} attach="material" ref={earthRef} />
      </mesh>
      <mesh renderOrder={1}>
        <sphereGeometry args={[CLOUD_RADIUS, SEGMENTS, SEGMENTS]} />
        <primitive object={cloudMaterial} attach="material" ref={cloudRef} />
      </mesh>
    </group>
  );
}
