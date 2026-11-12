"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  ShaderMaterial,
  Sphere,
  Vector3,
  Vector4,
} from "three";
import { useIntroStore, prefersReducedMotion } from "@/components/intro/introState";
import { mulberry32 } from "@/engine/particles/clusterGenerator";

/**
 * Environmental decoration: rare comet flybys and faint shooting stars.
 *
 * - Two draw calls for every comet: a fixed pool of slots, each a continuous
 *   tapering tail line (LineSegments) plus a head glow and scattered dust
 *   (Points). Geometry and materials are built once and share one uniforms
 *   object; spawning only rewrites a few uniforms.
 * - Positions are computed on the GPU: a tail sample is the head as it was
 *   `t × tailSeconds` ago, so tails follow the (gently curved) path.
 * - Real 3D: comets fly beyond the globe's centre plane as seen from the
 *   camera, so they never pass in front of the Earth or the migration
 *   streams, and the Earth's depth buffer hides them as they cross behind it.
 * - Deliberately dim: only a rare large comet's head approaches the bloom
 *   threshold. They run after the intro and are off for reduced motion.
 */

const SLOTS = 4;
const LINE = 72; // continuous tail: samples per comet (LineSegments)
const DUST = 128; // scattered tail particles per comet (Points): half dust, half haze
const PTS = 1 + DUST; // head glow + dust

type Kind = "shooting" | "distant" | "standard" | "grand";

interface KindSpec {
  /** Seconds to cross the view. */
  cross: [number, number];
  /** Seconds of path history drawn as the tail. */
  tail: [number, number];
  /** Distance beyond the camera's view of the globe centre (world units). */
  depth: [number, number];
  /** Head size on screen at spawn, device px. */
  headPx: [number, number];
  brightness: [number, number];
  /** Lateral dust spread as a fraction of tail length. */
  spread: number;
  /** Soft tail haze (0 = none): wide, faint sprites that make a comet's glow. */
  haze: number;
}

const KINDS: Record<Kind, KindSpec> = {
  shooting: { cross: [1.1, 2.0], tail: [0.18, 0.3], depth: [30, 60], headPx: [1.6, 2.2], brightness: [0.35, 0.5], spread: 0.01, haze: 0 },
  distant: { cross: [7, 11], tail: [0.7, 1.1], depth: [34, 60], headPx: [1.8, 2.6], brightness: [0.32, 0.45], spread: 0.03, haze: 0.35 },
  standard: { cross: [10, 15], tail: [1.3, 1.9], depth: [18, 34], headPx: [3.0, 4.2], brightness: [0.55, 0.72], spread: 0.05, haze: 1 },
  grand: { cross: [15, 22], tail: [2.4, 3.4], depth: [12, 20], headPx: [5.0, 6.5], brightness: [0.85, 1.0], spread: 0.08, haze: 1.6 },
};

const DEMO_ORDER: Kind[] = ["grand", "standard", "distant"];

/** Cool white, pale blue, restrained warm. */
const PALETTE: [Color, number][] = [
  [new Color(0.86, 0.92, 1.0), 0.45],
  [new Color(0.66, 0.8, 1.0), 0.35],
  [new Color(1.0, 0.86, 0.7), 0.2],
];

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uProjScale;
  uniform vec3 uStart[${SLOTS}];
  uniform vec3 uVel[${SLOTS}];
  uniform vec3 uAcc[${SLOTS}];
  uniform vec3 uSide[${SLOTS}];
  uniform vec3 uColor[${SLOTS}];
  uniform vec4 uParams[${SLOTS}]; // birth, life, tailSeconds, brightness
  uniform vec3 uLook[${SLOTS}];   // head size (world units), dust spread (world units), haze

  attribute vec4 aComet; // slot, t (0 head … 1 tail end), kind (0 core/head, 1 dust, 2 haze), seed
  attribute vec2 aOff;   // dust lateral offset (unit-ish)

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    int i = int(aComet.x + 0.5);
    float t = aComet.y;
    vec4 p = uParams[i];
    float age = uTime - p.x;
    float tau = age - t * p.z;              // when this sample was the head
    float alive = step(0.0, tau) * step(tau, p.y);
    // Dust drifts slightly behind the core and spreads with age along the tail.
    vec3 vel = uVel[i];
    vec3 pos = uStart[i] + vel * tau + 0.5 * uAcc[i] * tau * tau;
    vec3 up2 = normalize(cross(normalize(vel), uSide[i]));
    float isDust = step(0.5, aComet.z);
    float isHaze = step(1.5, aComet.z);
    pos += (uSide[i] * aOff.x + up2 * aOff.y) * uLook[i].y * t * isDust * mix(1.0, 0.5, isHaze);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float fade = smoothstep(0.0, 0.08, tau / p.y) * (1.0 - smoothstep(0.92, 1.0, tau / p.y));
    float taper = pow(1.0 - t, 1.7);
    float twinkle = isDust * (1.0 - isHaze) > 0.5 ? 0.6 + 0.4 * sin(uTime * 7.0 + aComet.w * 50.0) : 1.0;
    vAlpha = alive * fade * taper * p.w * mix(1.0, 0.45, isDust) * twinkle;
    // White-hot head cooling into the comet's tint along the tail.
    vColor = mix(uColor[i], vec3(1.0), pow(1.0 - t, 6.0) * 0.7);

  #ifdef POINTS
    // Head: a soft glow; dust: small fading specks.
    float head = isDust < 0.5 ? 2.4 : 1.0;
    vAlpha *= isDust < 0.5 ? 1.2 : 1.0;
    float unit = uLook[i].x * uProjScale / max(0.1, -mv.z);
    float px = unit * mix(1.0, 0.3, t) * head * mix(1.0, 0.55, isDust);
    if (isHaze > 0.5) {
      // Wide, faint, overlapping sprites broadening along the tail: the glow.
      // Kinds without haze (shooting stars) simply skip them.
      px = unit * (2.6 + 7.0 * t) * uLook[i].z;
      vAlpha *= 0.34 / (1.0 + 1.5 * t) * step(0.01, uLook[i].z);
      vColor = mix(vColor, uColor[i], 0.6);
    }
    gl_PointSize = vAlpha < 0.003 ? 0.0 : clamp(px, 1.0, 48.0);
  #else
    vAlpha *= 0.85; // the continuous tail itself
  #endif
  }
`;

const lineFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(vColor, vAlpha); }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;
    float g = exp(-d2 * 18.0);
    gl_FragColor = vec4(vColor * g, vAlpha * g);
  }
`;

/** Decoration only: plain Math.random (history stays deterministic elsewhere). */
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function pickColor(): Color {
  let r = Math.random();
  for (const [c, w] of PALETTE) {
    if ((r -= w) <= 0) return c;
  }
  return PALETTE[0][0];
}

const _right = new Vector3();
const _up = new Vector3();
const _fwd = new Vector3();
const _mid = new Vector3();
const _dir = new Vector3();

export function Comets({ intensity = 1 }: { intensity?: number }) {
  const demo = useMemo(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("comets") === "demo",
    [],
  );

  const { lines, points, lineMaterial, material } = useMemo(() => {
    const rand = mulberry32(2718); // static tail layout: seeded, render-pure
    const build = (per: number, layout: (k: number) => { t: number; dust: number }) => {
      const n = SLOTS * per;
      const aComet = new Float32Array(n * 4);
      const aOff = new Float32Array(n * 2);
      for (let s = 0; s < SLOTS; s++) {
        for (let k = 0; k < per; k++) {
          const v = s * per + k;
          const { t, dust } = layout(k);
          aComet.set([s, t, dust, rand()], v * 4);
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand());
          aOff.set([Math.cos(a) * r, Math.sin(a) * r * 0.6], v * 2);
        }
      }
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aComet", new BufferAttribute(aComet, 4));
      g.setAttribute("aOff", new BufferAttribute(aOff, 2));
      g.boundingSphere = new Sphere(new Vector3(), 1e4);
      return g;
    };
    // Tail line: consecutive samples joined into segments.
    const lines = build(LINE, (k) => ({ t: k / (LINE - 1), dust: 0 }));
    const index: number[] = [];
    for (let s = 0; s < SLOTS; s++) for (let k = 0; k < LINE - 1; k++) index.push(s * LINE + k, s * LINE + k + 1);
    lines.setIndex(index);
    // Head glow (k = 0) + dust biased toward the head.
    // Haze (odd k) is stratified along the tail so the sprites merge into one glow.
    const points = build(PTS, (k) =>
      k === 0 ? { t: 0, dust: 0 } : k % 2 ? { t: ((k - 1) / 2 + rand()) / (DUST / 2), dust: 2 } : { t: Math.pow(rand(), 1.4), dust: 1 },
    );

    const vec3s = () => Array.from({ length: SLOTS }, () => new Vector3());
    const material = new ShaderMaterial({
      defines: { POINTS: 1 },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uProjScale: { value: 1000 },
        uStart: { value: vec3s() },
        uVel: { value: vec3s() },
        uAcc: { value: vec3s() },
        uSide: { value: vec3s().map((v) => v.set(1, 0, 0)) },
        uColor: { value: vec3s() },
        uParams: { value: Array.from({ length: SLOTS }, () => new Vector4(-1e6, 1, 1, 0)) },
        uLook: { value: Array.from({ length: SLOTS }, () => new Vector3()) },
      },
    });
    // Same uniforms object: one spawn write updates both layers.
    const lineMaterial = new ShaderMaterial({
      vertexShader,
      fragmentShader: lineFragment,
      uniforms: material.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
    });
    return { lines, points, lineMaterial, material };
  }, []);

  useEffect(
    () => () => {
      lines.dispose();
      points.dispose();
      lineMaterial.dispose();
      material.dispose();
    },
    [lines, points, lineMaterial, material],
  );

  // Scheduling state (refs: never React state).
  const sched = useRef({ nextComet: -1, nextShooting: -1, demoIndex: 0, busyUntil: new Float64Array(SLOTS) });

  const matRef = useRef<ShaderMaterial>(null);

  useFrame((state) => {
    if (!matRef.current) return;
    const now = state.clock.elapsedTime;
    const u = matRef.current.uniforms;
    const cam = state.camera as PerspectiveCamera;
    const dpr = state.gl.getPixelRatio();
    u.uTime.value = now;
    u.uProjScale.value = (state.size.height * dpr) / (2 * Math.tan(((cam.fov ?? 35) * Math.PI) / 360));

    const s = sched.current;
    const live = useIntroStore.getState().stage === "done" && intensity > 0 && !prefersReducedMotion();
    if (!live) {
      s.nextComet = -1;
      s.nextShooting = -1;
      return;
    }
    // First appearances after the intro, then irregular intervals.
    if (s.nextComet < 0) s.nextComet = now + (demo ? 1 : rnd(6, 16));
    if (s.nextShooting < 0) s.nextShooting = now + (demo ? 2 : rnd(10, 24));

    const spawn = (kind: Kind) => {
      const slot = s.busyUntil.findIndex((t) => t < now);
      if (slot < 0) return; // pool full: skip, never allocate
      const spec = KINDS[kind];

      // Camera frame. The camera orbits the globe centre, so "beyond the
      // centre plane" = behind the Earth: comets can be hidden by it but
      // never drawn over it.
      _right.setFromMatrixColumn(cam.matrixWorld, 0);
      _up.setFromMatrixColumn(cam.matrixWorld, 1);
      cam.getWorldDirection(_fwd);
      const camDist = cam.position.length();
      const depth = Math.max(rnd(...spec.depth), camDist + 3);
      const halfH = depth * Math.tan(((cam.fov ?? 35) * Math.PI) / 360);
      const halfW = halfH * cam.aspect;

      // Choose a line across the view. Most pass through the dark space
      // around the globe (outside its projected disc, inside the frame);
      // about one in four is allowed to slip behind the Earth.
      const discR = depth * Math.tan(Math.asin(Math.min(0.999, 1.08 / camDist)));
      const behindOk = Math.random() < 0.25;
      let dx = 1;
      let dy = 0;
      let offset = 0;
      for (let attempt = 0; attempt < 16; attempt++) {
        const theta = rnd(0, Math.PI * 2);
        dx = Math.cos(theta);
        dy = Math.sin(theta);
        // Extent of the frame along the line's normal (-dy, dx).
        const reach = (halfW * Math.abs(dy) + halfH * Math.abs(dx)) * 0.9;
        offset = rnd(behindOk ? 0.15 : 0, 1) * reach * (Math.random() < 0.5 ? -1 : 1);
        // Closest point to the frame centre, in view-plane units. Keep it off
        // the left HUD column and the timeline band at the bottom.
        const mx = -dy * offset;
        const my = dx * offset;
        const clearOfHud = mx > -0.2 * halfW && my > -0.62 * halfH;
        if (behindOk || (Math.abs(offset) > discR * 1.05 && clearOfHud)) break;
      }
      _mid
        .copy(cam.position)
        .addScaledVector(_fwd, depth)
        .addScaledVector(_right, -dy * offset)
        .addScaledVector(_up, dx * offset);
      _dir
        .set(0, 0, 0)
        .addScaledVector(_right, dx)
        .addScaledVector(_up, dy)
        .addScaledVector(_fwd, rnd(-0.2, 0.25))
        .normalize();

      const cross = rnd(...spec.cross);
      const tail = rnd(...spec.tail);
      // Start and end well outside the frame (plus the tail's length).
      const half = Math.hypot(halfW, halfH) * 1.15;
      const speed = (2 * half) / cross;
      const life = cross + tail;

      const start = u.uStart.value[slot] as Vector3;
      start.copy(_mid).addScaledVector(_dir, -half);
      (u.uVel.value[slot] as Vector3).copy(_dir).multiplyScalar(speed);
      // A gentle arc: slight sideways acceleration.
      (u.uAcc.value[slot] as Vector3)
        .copy(_right)
        .multiplyScalar(-dy)
        .addScaledVector(_up, dx)
        .multiplyScalar(rnd(-0.12, 0.12) * speed / life);
      (u.uSide.value[slot] as Vector3).crossVectors(_dir, _fwd).normalize();
      const color = u.uColor.value[slot] as Vector3;
      if (kind === "shooting") color.set(0.9, 0.94, 1);
      else {
        const c = pickColor();
        color.set(c.r, c.g, c.b);
      }
      const p = u.uParams.value[slot] as Vector4;
      p.x = now;
      p.y = life + 0.01;
      p.z = tail;
      p.w = rnd(...spec.brightness) * intensity;
      const look = u.uLook.value[slot] as Vector3;
      look.x = (rnd(...spec.headPx) * dpr * depth) / u.uProjScale.value;
      look.y = speed * tail * spec.spread;
      look.z = spec.haze;
      s.busyUntil[slot] = now + life + tail + 0.1;
    };

    if (now >= s.nextComet) {
      const r = Math.random();
      // Demo (?comets=demo) cycles through every kind for review.
      spawn(demo ? DEMO_ORDER[s.demoIndex++ % DEMO_ORDER.length] : r < 0.15 ? "grand" : r < 0.5 ? "distant" : "standard");
      s.nextComet = now + (demo ? rnd(2.5, 5) : rnd(15, 35));
    }
    if (now >= s.nextShooting) {
      spawn("shooting");
      s.nextShooting = now + (demo ? rnd(2, 4) : rnd(9, 26));
    }
  });

  // Depth-tested against the Earth; drawn before the globe's transparent layers.
  return (
    <group>
      <lineSegments geometry={lines} frustumCulled={false} renderOrder={0}>
        <primitive object={lineMaterial} attach="material" />
      </lineSegments>
      <points geometry={points} frustumCulled={false} renderOrder={0}>
        <primitive object={material} attach="material" ref={matRef} />
      </points>
    </group>
  );
}
