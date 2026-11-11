import { AdditiveBlending, DataTexture, ShaderMaterial, Vector2, Vector4, type IUniform } from "three";
import { PARTICLE_CONSTANTS } from "@/engine/particles/constants";

export { PARTICLE_CONSTANTS };

/**
 * Three render layers share ONE position function:
 *
 *   LAYER core  – crisp glowing dots, every particle            (THREE.Points)
 *   LAYER trail – head→tail streaks for a subset; the tail is the
 *                 same particle a moment earlier, so streaks always
 *                 point along the direction of travel          (THREE.LineSegments)
 *   LAYER glow  – large soft sprites for a sparse subset, sized in
 *                 kilometres; overlapping sprites form a coloured
 *                 haze proportional to stream density           (THREE.Points)
 *
 * Two clocks drive the position function:
 *   HISTORICAL (uMode = 1): progress = f(uYearBP). Fully deterministic.
 *   OVERVIEW   (uMode = 0): progress = looping wall clock, per-route period/phase.
 *
 * Year, mode, selection, zoom and runtime density are uniforms: nothing here
 * ever requires rebuilding geometry.
 */
const common = /* glsl */ `
  uniform sampler2D uPath;
  uniform float uSamples;
  uniform float uYearBP;
  uniform float uClock;
  uniform float uMode;          // 0 overview, 1 historical
  uniform float uFade;          // mode transition fade
  uniform float uSelected;      // selected route index, -1 = none
  uniform float uSelectMix;     // eased selection strength
  uniform float uRadius;
  uniform float uFormIn;
  uniform float uSettle;
  uniform vec4 uWindow;         // visibleFrom, holdUntil, hiddenAfter, -
  uniform vec2 uOverviewRange;
  uniform float uCamDist;       // camera distance from globe centre (radii)
  uniform float uDensity;       // runtime LOD 0..1 (adaptive performance)
  uniform float uIntensity;

  attribute float aRow;
  attribute float aRoute;
  attribute vec4 aTiming;   // startYear, endYear, departure, duration
  attribute vec4 aShape;    // lateralKm, alongKm, wiggleKm, seed
  attribute vec2 aScatter;  // origin scatter (side, forward) km
  attribute vec2 aSplit;    // split start progress, split offset km
  attribute vec3 aTarget;   // dispersal target, unit vector
  attribute vec3 aColor;
  attribute vec3 aLook;     // size, brightness, LOD rank
  attribute vec3 aLoop;     // overview period (s), phase, trail lag (window fraction)

  varying vec3 vColor;
  varying float vAlpha;

  const float EARTH_KM = 6371.0;
  const float PI = 3.141592653589793;

  float ramp(float x, float a, float b) { return clamp((x - a) / (b - a), 0.0, 1.0); }

  vec3 pathAt(float t) {
    float f = clamp(t, 0.0, 1.0) * (uSamples - 1.0);
    float i0 = floor(f);
    float i1 = min(i0 + 1.0, uSamples - 1.0);
    int row = int(aRow + 0.5);
    vec3 a = texelFetch(uPath, ivec2(int(i0), row), 0).xyz;
    vec3 b = texelFetch(uPath, ivec2(int(i1), row), 0).xyz;
    return normalize(mix(a, b, f - i0));
  }

  vec3 slerpUnit(vec3 a, vec3 b, float t) {
    float d = clamp(dot(a, b), -1.0, 1.0);
    float th = acos(d);
    if (th < 1e-5) return normalize(mix(a, b, t));
    return (sin((1.0 - t) * th) * a + sin(t * th) * b) / sin(th);
  }

  struct State {
    vec3 pos;        // unit sphere
    float vis;       // window visibility (mode-dependent)
    float moving;    // 1 while travelling
    float settle;    // 0..1 arrival blend
  };

  // Position of this particle \`lag\` (route-window fraction) in the past.
  State particleState(float lag) {
    float elapsed;
    float vis;
    if (uMode < 0.5) {
      float c = fract(uClock / aLoop.x + aLoop.y);
      elapsed = mix(uOverviewRange.x, uOverviewRange.y, c) - lag;
      vis = ramp(c, 0.0, 0.04) * (1.0 - ramp(c, 0.9, 1.0));
    } else {
      elapsed = (aTiming.x - uYearBP) / (aTiming.x - aTiming.y) - lag;
      vis = ramp(elapsed, uWindow.x, uWindow.x + 0.04) * (1.0 - ramp(elapsed, uWindow.y, uWindow.z));
    }

    float u = (elapsed - aTiming.z) / aTiming.w;
    float t = clamp(u, 0.0, 1.0);

    vec3 p = pathAt(t);
    vec3 fwd = pathAt(t + 0.02) - pathAt(t - 0.02);
    fwd -= dot(fwd, p) * p;
    fwd = length(fwd) > 1e-7 ? normalize(fwd) : normalize(cross(vec3(0.0, 1.0, 0.0), p));
    vec3 side = normalize(cross(p, fwd));

    float seed = aShape.w;
    float bulge = 0.6 + 0.4 * sin(PI * t);
    float wiggle = sin(t * 17.0 + seed * 6.2831) * 0.7 + sin(t * 43.0 + seed * 19.0) * 0.3;
    float split = aSplit.y * smoothstep(aSplit.x, aSplit.x + 0.2, t);
    vec2 travelOff = vec2(aShape.x * bulge + wiggle * aShape.z + split, aShape.y);
    vec2 off = mix(aScatter, travelOff, smoothstep(0.0, uFormIn, t));
    vec3 pos = normalize(p + (side * off.x + fwd * off.y) / EARTH_KM);

    float settle = smoothstep(1.0, 1.0 + uSettle, u);
    pos = slerpUnit(pos, aTarget, settle);

    // Cosmetic shimmer (wall clock, a few km). Never changes historical state.
    vec2 sh = vec2(sin(uClock * 0.7 + seed * 40.0), cos(uClock * 0.53 + seed * 23.0)) * 3.0;
    pos = normalize(pos + (side * sh.x + fwd * sh.y) / EARTH_KM);

    float moving = smoothstep(0.0, 0.02, u) * (1.0 - smoothstep(1.0, 1.0 + uSettle * 0.6, u));
    return State(pos, vis, moving, settle);
  }

  float isSelected() { return 1.0 - step(0.5, abs(aRoute - uSelected)); }
  // Selected route dominant, others dimmed but never hidden.
  float selectionAlpha() { return mix(1.0, mix(0.16, 1.0, isSelected()), uSelectMix); }
  float selectionGain() { return mix(1.0, mix(0.75, 1.3, isSelected()), uSelectMix); }
  // 0 close-up … 1 full globe.
  float farFactor() { return smoothstep(1.7, 4.3, uCamDist); }
  // Detail particles thin out slightly with distance and under load; streams stay.
  float lodMask() { return step(aLook.z, uDensity * mix(1.0, 0.8, farFactor())); }
`;

const coreVertex = /* glsl */ `
  ${common}
  uniform float uSize;
  uniform float uPxScale;   // device px scale for sizes
  uniform float uMinPx;     // device px: dots never shrink below this

  void main() {
    State s = particleState(0.0);
    vec4 mv = modelViewMatrix * vec4(s.pos * uRadius, 1.0);
    gl_Position = projectionMatrix * mv;

    float far = farFactor();
    float headAlpha = mix(0.6, 1.0, s.moving) * mix(1.0, 0.8, s.settle);
    vAlpha = s.vis * uFade * selectionAlpha() * headAlpha * lodMask();
    float modeGain = 1.0;
    vColor = aColor * aLook.y * uIntensity * selectionGain() * modeGain
      * mix(1.0, 1.2, s.moving) * mix(1.0, 0.8, far);

    // Softer-than-perspective attenuation + floor: legible at any zoom.
    float px = uSize * aLook.x * uPxScale / pow(max(0.1, -mv.z), 0.65);
    px *= mix(1.0, 1.15, isSelected() * uSelectMix);
    gl_PointSize = vAlpha < 0.002 ? 0.0 : max(px, uMinPx);
  }
`;

const coreFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0, 0.24, d);
    float halo = 1.0 - smoothstep(0.0, 0.5, d);
    halo = halo * halo * halo;
    // Energy kept modest: thousands overlap additively, and the route hue must
    // survive tone mapping instead of blowing out to white.
    gl_FragColor = vec4(vColor * (core * 1.1 + halo * 0.3), vAlpha * clamp(core + halo * 0.6, 0.0, 1.0));
  }
`;

const trailVertex = /* glsl */ `
  ${common}
  attribute float aTrail;   // 0 = head, 1 = tail
  uniform float uTrailAlpha;

  void main() {
    State s = particleState(aTrail * aLoop.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(s.pos * uRadius, 1.0);
    // Head opaque → tail transparent (interpolated along the segment).
    // Streaks matter most close-up; at full-globe scale the glow carries motion.
    float near = 1.0 - 0.65 * farFactor();
    vAlpha = s.vis * uFade * selectionAlpha() * s.moving * (1.0 - aTrail) * uTrailAlpha * near * lodMask();
    vColor = aColor * aLook.y * uIntensity * selectionGain();
  }
`;

const trailFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(vColor, vAlpha); }
`;

const glowVertex = /* glsl */ `
  ${common}
  uniform float uGlowKm;        // world radius of one glow sprite
  uniform float uGlowAlpha;
  uniform float uProjScale;     // device px per world unit at distance 1
  uniform vec2 uGlowPxRange;    // device px clamp

  void main() {
    State s = particleState(0.0);
    vec4 mv = modelViewMatrix * vec4(s.pos * uRadius, 1.0);
    gl_Position = projectionMatrix * mv;
    float far = farFactor();
    // Glow carries the stream at full-globe distance, steps back close-up.
    vAlpha = s.vis * uFade * selectionAlpha() * uGlowAlpha * mix(0.55, 1.3, far) * mix(1.0, 0.7, s.settle);
    vColor = aColor * selectionGain();
    float px = (uGlowKm / EARTH_KM) * uProjScale / max(0.1, -mv.z);
    gl_PointSize = vAlpha < 0.001 ? 0.0 : clamp(px, uGlowPxRange.x, uGlowPxRange.y);
  }
`;

const glowFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;
    gl_FragColor = vec4(vColor, vAlpha * exp(-d2 * 16.0));
  }
`;

export type ParticleUniforms = Record<string, IUniform>;

export interface ParticleLayers {
  uniforms: ParticleUniforms;
  core: ShaderMaterial;
  trail: ShaderMaterial;
  glow: ShaderMaterial;
}

export function createParticleLayers({
  pathTexture,
  pathSamples,
}: {
  pathTexture: DataTexture;
  pathSamples: number;
}): ParticleLayers {
  const c = PARTICLE_CONSTANTS;
  // One uniforms object referenced by all three materials: written once per frame.
  const uniforms: ParticleUniforms = {
    uPath: { value: pathTexture },
    uSamples: { value: pathSamples },
    uYearBP: { value: 300000 },
    uClock: { value: 0 },
    uMode: { value: 0 },
    uFade: { value: 1 },
    uSelected: { value: -1 },
    uSelectMix: { value: 0 },
    uRadius: { value: c.radius },
    uFormIn: { value: c.formIn },
    uSettle: { value: c.settle },
    uWindow: { value: new Vector4(c.visibleFrom, c.holdUntil, c.hiddenAfter, 0) },
    uOverviewRange: { value: new Vector2(c.overviewRange[0], c.overviewRange[1]) },
    uCamDist: { value: 4 },
    uDensity: { value: 1 },
    uIntensity: { value: 1.4 },
    uSize: { value: 2.6 },
    uPxScale: { value: 1 },
    uMinPx: { value: 1.5 },
    uTrailAlpha: { value: 0.5 },
    uGlowKm: { value: 120 },
    uGlowAlpha: { value: 0.05 },
    uProjScale: { value: 1000 },
    uGlowPxRange: { value: new Vector2(8, 200) },
  };
  const base = {
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
  };
  return {
    uniforms,
    core: new ShaderMaterial({ ...base, vertexShader: coreVertex, fragmentShader: coreFragment }),
    trail: new ShaderMaterial({ ...base, vertexShader: trailVertex, fragmentShader: trailFragment }),
    glow: new ShaderMaterial({ ...base, vertexShader: glowVertex, fragmentShader: glowFragment }),
  };
}
