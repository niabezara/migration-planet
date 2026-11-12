import { AdditiveBlending, DataTexture, ShaderMaterial, Vector2, Vector4, type IUniform } from "three";
import { PARTICLE_CONSTANTS } from "@/engine/particles/constants";
import { POPULATION_CONSTANTS } from "@/engine/population/populationModel";

export { PARTICLE_CONSTANTS };

/** Upper bound on routes addressable by per-route uniforms (awakening times). */
export const MAX_ROUTES = 16;
/** Upper bound on population clusters addressable by the activity uniform. */
export const MAX_CLUSTERS = 32;
/** Upper bound on species addressable by the filter / focus uniforms. */
export const MAX_SPECIES = 16;

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
/**
 * Globe occlusion helper. The Earth writes depth, so particles behind it are
 * hidden per fragment, but a sprite centred just behind the limb would still
 * spill its edge into space. Fade those out as they cross the horizon.
 */
const horizon = /* glsl */ `
  float facing(vec3 unitPos) {
    vec3 wp = (modelMatrix * vec4(unitPos, 1.0)).xyz;
    return dot(normalize(wp), normalize(cameraPosition - wp));
  }
  float horizonFade(vec3 unitPos) { return smoothstep(-0.02, 0.1, facing(unitPos)); }
  // Near the limb, foreshortening packs sprites together; thin km-sized glows there.
  float limbThin(vec3 unitPos) { return mix(0.35, 1.0, smoothstep(0.0, 0.45, facing(unitPos))); }
`;

const common = /* glsl */ `
  uniform sampler2D uPath;
  uniform float uSamples;
  uniform float uYearBP;
  uniform float uClock;         // wall clock: cosmetic shimmer only
  uniform float uStoryClock;    // seconds since the intro started: awakening
  uniform float uLoopClock;     // warped story time (intro surge): overview loops
  uniform float uAwakenAt[MAX_ROUTES]; // story time each route bursts out of its origin
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
  uniform float uHero;          // intro emphasis 0..1
  uniform float uStreamVis;     // species filter: Homo sapiens streams shown 0..1

  attribute float aRow;
  attribute float aRoute;
  attribute vec4 aTiming;   // startYear, endYear, departure, duration
  attribute vec4 aShape;    // lateralKm, alongKm, wiggleKm, seed
  attribute vec2 aScatter;  // origin scatter (side, forward) km
  attribute vec2 aSplit;    // split start progress, split offset km
  attribute vec3 aTarget;   // dispersal target, unit vector
  attribute vec3 aColor;
  attribute vec4 aLook;     // size, brightness, LOD rank, softness (0 core … 1 fringe)
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
    float vis;       // window visibility (mode-dependent) × awakening
    float moving;    // 1 while travelling
    float settle;    // 0..1 arrival blend
    float flash;     // 1 at the instant a route awakens, decaying
  };

  // Position of this particle \`lag\` (route-window fraction) in the past.
  State particleState(float lag) {
    float elapsed;
    float vis;
    if (uMode < 0.5) {
      float c = fract(uLoopClock / aLoop.x + aLoop.y);
      elapsed = mix(uOverviewRange.x, uOverviewRange.y, c) - lag;
      vis = ramp(c, 0.0, 0.04) * (1.0 - ramp(c, 0.9, 1.0));
    } else {
      elapsed = (aTiming.x - uYearBP) / (aTiming.x - aTiming.y) - lag;
      vis = ramp(elapsed, uWindow.x, uWindow.x + 0.04) * (1.0 - ramp(elapsed, uWindow.y, uWindow.z));
    }

    // Awakening (intro Scene 3): dark until the route's moment, then a burst.
    float since = uStoryClock - uAwakenAt[int(aRoute + 0.5)];
    vis *= ramp(since, 0.0, 0.5);
    float flash = since > 0.0 ? exp(-since * 1.1) : 0.0;

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
    // Burst: the origin crowd starts as a concentrated point and blooms outward.
    float burst = mix(0.12, 1.0, 1.0 - flash) + 1.1 * flash * (1.0 - flash);
    vec2 off = mix(aScatter * burst, travelOff, smoothstep(0.0, uFormIn, t));
    vec3 pos = normalize(p + (side * off.x + fwd * off.y) / EARTH_KM);

    float settle = smoothstep(1.0, 1.0 + uSettle, u);
    pos = slerpUnit(pos, aTarget, settle);

    // Cosmetic shimmer (wall clock, a few km). Never changes historical state.
    vec2 sh = vec2(sin(uClock * 0.7 + seed * 40.0), cos(uClock * 0.53 + seed * 23.0)) * 3.0;
    pos = normalize(pos + (side * sh.x + fwd * sh.y) / EARTH_KM);

    float moving = smoothstep(0.0, 0.02, u) * (1.0 - smoothstep(1.0, 1.0 + uSettle * 0.6, u));
    return State(pos, vis, moving, settle, flash);
  }

  float isSelected() { return 1.0 - step(0.5, abs(aRoute - uSelected)); }
  // Selected route dominant, others dimmed but never hidden.
  float selectionAlpha() { return mix(1.0, mix(0.16, 1.0, isSelected()), uSelectMix) * uStreamVis; }
  float selectionGain() { return mix(1.0, mix(0.75, 1.3, isSelected()), uSelectMix); }
  // 0 close-up … 1 full globe.
  float farFactor() { return smoothstep(1.7, 4.3, uCamDist); }
  ${horizon}
  // Detail particles thin out slightly with distance and under load; streams stay.
  float lodMask() { return step(aLook.z, uDensity * mix(1.0, 0.8, farFactor())); }
`;

const coreVertex = /* glsl */ `
  ${common}
  uniform float uSize;
  uniform float uPxScale;   // device px scale for sizes
  uniform float uMinPx;     // device px: dots never shrink below this
  varying float vSoft;
  varying float vHot;

  void main() {
    State s = particleState(0.0);
    vec4 mv = modelViewMatrix * vec4(s.pos * uRadius, 1.0);
    gl_Position = projectionMatrix * mv;

    float far = farFactor();
    float soft = aLook.w;
    float headAlpha = mix(0.6, 1.0, s.moving) * mix(1.0, 0.8, s.settle);
    vAlpha = s.vis * uFade * selectionAlpha() * headAlpha * lodMask() * horizonFade(s.pos);
    // Moving streams are the brightest thing on screen; at full-globe distance
    // dots are tiny, so they gain energy rather than lose it.
    // Before departure the whole group is packed into a small area; keep it
    // from blowing out to white so it brightens as it separates and moves off.
    float gathering = (1.0 - s.moving) * (1.0 - s.settle);
    vColor = aColor * aLook.y * uIntensity * selectionGain() * mix(1.0, 0.5, gathering)
      * mix(1.0, 1.3, s.moving) * mix(1.0, 1.15, far) * (1.0 + 1.8 * s.flash) * (1.0 + 0.45 * uHero);
    vSoft = soft;
    // Small white-hot centre on bright core particles: pushes them past the
    // bloom threshold (selective bloom) without bleaching the route hue.
    vHot = 0.32 * smoothstep(0.8, 1.25, aLook.y) * (1.0 - soft) * s.moving * uIntensity * selectionGain();

    // Softer-than-perspective attenuation + floor: legible at any zoom.
    float px = uSize * aLook.x * uPxScale / pow(max(0.1, -mv.z), 0.65);
    px *= mix(1.0, 1.15, isSelected() * uSelectMix) * (1.0 + 0.6 * s.flash) * (1.0 + 0.3 * uHero);
    float minPx = uMinPx * mix(1.0, 1.2, far) * mix(1.0, 0.8, soft);
    gl_PointSize = vAlpha < 0.002 ? 0.0 : max(px, minPx);
  }
`;

const coreFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSoft;
  varying float vHot;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float crisp = 1.0 - smoothstep(0.0, 0.22, d);
    float halo = 1.0 - smoothstep(0.0, 0.5, d);
    halo = halo * halo * halo;
    float soft = exp(-d * d * 16.0);
    // Core particles: crisp, dense dot. Fringe particles: a soft, dim speck.
    // Hue energy stays moderate (thousands overlap additively); only the tiny
    // hot centre exceeds the bloom threshold.
    float shape = mix(crisp * 1.35 + halo * 0.3, soft * 0.75, vSoft);
    vec3 col = vColor * shape + vec3(vHot * crisp * crisp);
    gl_FragColor = vec4(col, vAlpha * clamp(mix(crisp + halo * 0.6, soft, vSoft), 0.0, 1.0));
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
    // Streaks shorten on screen with distance; keep them readable as direction cues.
    float near = 1.0 - 0.35 * farFactor();
    vAlpha = s.vis * uFade * selectionAlpha() * s.moving * (1.0 - aTrail) * uTrailAlpha * near * lodMask()
      * horizonFade(s.pos) * mix(1.0, 0.6, aLook.w);
    vColor = aColor * aLook.y * uIntensity * selectionGain() * 1.25 * (1.0 + 0.6 * uHero);
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
    float gathering = (1.0 - s.moving) * (1.0 - s.settle);
    vAlpha = s.vis * uFade * selectionAlpha() * uGlowAlpha * mix(0.55, 1.3, far) * mix(1.0, 0.7, s.settle) * mix(1.0, 0.45, gathering)
      * (1.0 + 3.0 * s.flash) * (1.0 + 1.8 * uHero) * horizonFade(s.pos) * limbThin(s.pos);
    vColor = aColor * selectionGain();
    float px = (uGlowKm / EARTH_KM) * (1.0 + 0.5 * uHero) * uProjScale / max(0.1, -mv.z);
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

/**
 * POPULATION CLUSTERS: stationary particles that show where people live at a
 * given time. Deliberately the opposite of the streams: soft specks instead of
 * crisp dots, no trails, low energy (never reaches the bloom threshold), a
 * gentle haze. They share the stream uniforms (year, mode, selection, zoom).
 *
 *   presence  – per-particle formation / fade, staggered by formation rank
 *               (mirrors particlePresence() in engine/population)
 *   attested  – archaeological evidence vs inferred presence: inferred
 *               presence is drawn dimmer and hazier
 *   activity  – a source cluster brightens near the departure point while
 *               a stream separates from it
 */
const popCommon = /* glsl */ `
  uniform float uYearBP;
  uniform float uClock;
  uniform float uStoryClock;
  uniform float uMode;
  uniform float uFade;
  uniform float uSelected;
  uniform float uSelectMix;
  uniform float uRadius;
  uniform float uCamDist;
  uniform float uDensity;
  uniform float uPopWindow;
  uniform float uPopActivity[MAX_CLUSTERS];
  uniform float uSpeciesVis[MAX_SPECIES];   // species filter, eased 0..1
  uniform float uSpeciesFocus[MAX_SPECIES]; // emphasised species (selection)
  uniform float uFocusCluster;              // emphasised cluster index, -1 none
  uniform float uFocusMix;                  // eased strength of the emphasis
  attribute float aPopSpecies;

  attribute vec4 aPopTime;   // startYear, establishedYear, fadeStartYear, endYear
  attribute vec4 aPopLook;   // size, brightness, formation rank, LOD rank
  attribute vec4 aPopMeta;   // attestedYear (-1 none), cluster index, overview awaken (s), seed
  attribute vec3 aPopExtra;  // departure proximity, overview gain, related-route bitmask
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlpha;

  const float EARTH_KM = 6371.0;

  float ramp(float x, float a, float b) { return clamp((x - a) / (b - a), 0.0, 1.0); }
  float farFactor() { return smoothstep(1.7, 4.3, uCamDist); }
  ${horizon}

  float presence() {
    if (uMode < 0.5) return ramp(uStoryClock - aPopMeta.z, 0.0, 2.5) * aPopExtra.y;
    float r = aPopLook.z;
    float w = uPopWindow;
    float form = (aPopTime.x - uYearBP) / max(1.0, aPopTime.x - aPopTime.y);
    float a = clamp((form - r * (1.0 - w)) / w, 0.0, 1.0);
    float dissolve = (aPopTime.z - uYearBP) / max(1.0, aPopTime.z - aPopTime.w);
    a *= 1.0 - clamp((dissolve - (1.0 - r) * (1.0 - w)) / w, 0.0, 1.0);
    return a;
  }
  float attested() {
    if (aPopMeta.x < 0.0) return 0.0;
    if (uMode < 0.5) return 1.0;
    return ramp(uYearBP, aPopMeta.x * 1.03, aPopMeta.x * 0.97);
  }
  float related() {
    if (uSelected < 0.0) return 0.0;
    return mod(floor(aPopExtra.z / exp2(uSelected) + 0.001), 2.0);
  }
  // Selected route's populations come forward; the rest stay as context.
  // Species / cluster selections (and milestones) work the same way, and the
  // species filter fades whole species in and out.
  float popSelection() {
    int sp = int(aPopSpecies + 0.5);
    float focused = max(uSpeciesFocus[sp], 1.0 - step(0.5, abs(aPopMeta.y - uFocusCluster)));
    return mix(1.0, mix(0.4, 1.3, related()), uSelectMix)
      * mix(1.0, mix(0.3, 1.35, focused), uFocusMix)
      * uSpeciesVis[sp];
  }
  float activity() {
    if (uMode < 0.5) return 0.0;
    return uPopActivity[int(aPopMeta.y + 0.5)] * aPopExtra.x;
  }
  // Nearly stationary: a slow drift of a few km, never a migration.
  vec3 popPosition() {
    vec3 p = normalize(position);
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), p) + vec3(1e-4, 0.0, 0.0));
    vec3 fwd = cross(p, side);
    float seed = aPopMeta.w;
    vec2 sh = vec2(sin(uClock * 0.21 + seed * 40.0), cos(uClock * 0.17 + seed * 23.0)) * 2.5;
    return normalize(p + (side * sh.x + fwd * sh.y) / EARTH_KM);
  }
`;

const popDotVertex = /* glsl */ `
  ${popCommon}
  uniform float uSize;
  uniform float uPxScale;
  uniform float uMinPx;
  uniform float uPopIntensity;

  void main() {
    vec3 p = popPosition();
    vec4 mv = modelViewMatrix * vec4(p * uRadius, 1.0);
    gl_Position = projectionMatrix * mv;

    float a = presence();
    float att = attested();
    float act = activity();
    float far = farFactor();
    // Newly forming populations: each particle glints briefly as it appears.
    float glint = uMode > 0.5 ? 4.0 * a * (1.0 - a) : 0.0;
    float twinkle = 0.86 + 0.14 * sin(uClock * (0.4 + aPopMeta.w * 0.5) + aPopMeta.w * 60.0);
    float lod = step(aPopLook.w, uDensity * mix(1.0, 0.85, far));

    vAlpha = a * uFade * popSelection() * horizonFade(p) * limbThin(p) * lod * mix(0.5, 1.0, att);
    // Paler than the stream hue: "people living here", not "people moving".
    vec3 hue = mix(aColor, vec3(dot(aColor, vec3(0.3, 0.55, 0.15))), 0.12);
    vColor = hue * aPopLook.y * uPopIntensity * twinkle * mix(0.7, 1.0, att)
      * (1.0 + 1.1 * glint + 1.3 * act) * mix(1.0, 1.15, far);

    float px = uSize * 0.72 * aPopLook.x * uPxScale / pow(max(0.1, -mv.z), 0.65);
    px *= mix(0.85, 1.0, att) * (1.0 + 0.35 * act);
    gl_PointSize = vAlpha < 0.002 ? 0.0 : max(px, uMinPx * 0.85);
  }
`;

const popDotFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;
    float soft = exp(-d2 * 14.0);
    gl_FragColor = vec4(vColor * soft, vAlpha * soft);
  }
`;

const popGlowVertex = /* glsl */ `
  ${popCommon}
  uniform float uPopGlowKm;
  uniform float uPopGlowAlpha;
  uniform float uProjScale;
  uniform vec2 uGlowPxRange;

  void main() {
    vec3 p = popPosition();
    vec4 mv = modelViewMatrix * vec4(p * uRadius, 1.0);
    gl_Position = projectionMatrix * mv;
    float a = presence();
    float att = attested();
    float far = farFactor();
    // Inferred presence leans on haze; attested presence on discrete specks.
    vAlpha = a * uFade * popSelection() * horizonFade(p) * limbThin(p) * uPopGlowAlpha
      * mix(1.3, 0.85, att) * mix(0.6, 1.15, far) * (1.0 + 1.5 * activity());
    vColor = mix(aColor, vec3(dot(aColor, vec3(0.3, 0.55, 0.15))), 0.3);
    float px = (uPopGlowKm / EARTH_KM) * uProjScale / max(0.1, -mv.z);
    gl_PointSize = vAlpha < 0.0005 ? 0.0 : clamp(px, uGlowPxRange.x, uGlowPxRange.y);
  }
`;

export type ParticleUniforms = Record<string, IUniform>;

export interface ParticleLayers {
  uniforms: ParticleUniforms;
  core: ShaderMaterial;
  trail: ShaderMaterial;
  glow: ShaderMaterial;
  popDots: ShaderMaterial;
  popGlow: ShaderMaterial;
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
    uStoryClock: { value: 1e6 },
    uLoopClock: { value: 1e6 },
    uAwakenAt: { value: new Float32Array(MAX_ROUTES) },
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
    uHero: { value: 0 },
    uSize: { value: 2.6 },
    uPxScale: { value: 1 },
    uMinPx: { value: 1.5 },
    uTrailAlpha: { value: 0.5 },
    uGlowKm: { value: 120 },
    uGlowAlpha: { value: 0.05 },
    uProjScale: { value: 1000 },
    uGlowPxRange: { value: new Vector2(8, 200) },
    uPopWindow: { value: POPULATION_CONSTANTS.particleWindow },
    uPopActivity: { value: new Float32Array(MAX_CLUSTERS) },
    uPopIntensity: { value: 0.4 },
    uPopGlowKm: { value: 170 },
    uPopGlowAlpha: { value: 0.03 },
    uStreamVis: { value: 1 },
    uSpeciesVis: { value: new Float32Array(MAX_SPECIES).fill(1) },
    uSpeciesFocus: { value: new Float32Array(MAX_SPECIES) },
    uFocusCluster: { value: -1 },
    uFocusMix: { value: 0 },
  };
  const base = {
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
  };
  const defines = { MAX_ROUTES, MAX_CLUSTERS, MAX_SPECIES };
  return {
    uniforms,
    core: new ShaderMaterial({ ...base, defines, vertexShader: coreVertex, fragmentShader: coreFragment }),
    trail: new ShaderMaterial({ ...base, defines, vertexShader: trailVertex, fragmentShader: trailFragment }),
    glow: new ShaderMaterial({ ...base, defines, vertexShader: glowVertex, fragmentShader: glowFragment }),
    popDots: new ShaderMaterial({ ...base, defines, vertexShader: popDotVertex, fragmentShader: popDotFragment }),
    popGlow: new ShaderMaterial({ ...base, defines, vertexShader: popGlowVertex, fragmentShader: glowFragment }),
  };
}
