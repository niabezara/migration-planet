"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import type { MilestoneIcon as SceneName } from "@/types/migration";
import { milestoneAccent } from "./MilestoneIcon";
import { SCENE_CSS } from "./sceneStyles";

/**
 * Animated miniature scenes for historical milestones.
 *
 * Each scene is a layered SVG illustration on a 160×100 stage: an
 * atmospheric backdrop, a lit subject, independently animated layers and
 * particles (sparks, smoke, motes, droplets). Motion is pure CSS keyframes,
 * so there is no animation library and no extra WebGL context.
 *
 *   variant "hero"   – full-width banner in the detail panel (16:10)
 *   variant "thumb"  – square crop of the scene's centre (lists)
 *   variant "marker" – square crop for the globe marker
 *
 * The subject of every scene sits in the central 100×100 so square crops
 * keep it whole. Base (non-animated) styles are the composed final frame, so
 * `animate={false}` and prefers-reduced-motion show a complete still image.
 */

type Uid = string;
type Scene = (uid: Uid, accent: string) => ReactNode;

/** Deterministic pseudo-random in [0, 1). */
const rnd = (i: number, seed = 1) => {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const v = (o: Record<string, string | number>) => o as CSSProperties;

// ---------------------------------------------------------------------------
// Shared layers

function Backdrop({
  uid,
  accent,
  gx = 80,
  gy = 55,
  strength = 0.55,
  top = "#06080d",
  bottom = "#0b0e16",
}: {
  uid: Uid;
  accent: string;
  gx?: number;
  gy?: number;
  strength?: number;
  top?: string;
  bottom?: string;
}) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx={gx / 160} cy={gy / 100} r="0.55" fx={gx / 160} fy={gy / 100}>
          <stop offset="0" stopColor={accent} stopOpacity={strength} />
          <stop offset="0.45" stopColor={accent} stopOpacity={strength * 0.25} />
          <stop offset="1" stopColor={accent} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${uid}-vig`} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.75} />
        </radialGradient>
        <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id={`${uid}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" />
        </filter>
      </defs>
      <rect width="160" height="100" fill={`url(#${uid}-bg)`} />
      <rect className="ms-breath" width="160" height="100" fill={`url(#${uid}-glow)`} />
    </>
  );
}

function Vignette({ uid }: { uid: Uid }) {
  return <rect width="160" height="100" fill={`url(#${uid}-vig)`} pointerEvents="none" />;
}

/** Slow drifting dust motes in the light. */
function Motes({ n = 8, color = "#f6e6c8", seed = 1, x0 = 35, x1 = 125, y0 = 20, y1 = 80 }: { n?: number; color?: string; seed?: number; x0?: number; x1?: number; y0?: number; y1?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <circle
          key={i}
          className="ms-mote"
          cx={x0 + rnd(i, seed) * (x1 - x0)}
          cy={y0 + rnd(i + 9, seed) * (y1 - y0)}
          r={0.35 + rnd(i + 3, seed) * 0.5}
          fill={color}
          style={v({ animationDelay: `${-rnd(i + 5, seed) * 9}s`, animationDuration: `${7 + rnd(i + 7, seed) * 6}s` })}
        />
      ))}
    </g>
  );
}

/** Layered, independently flickering flames with a pulsing halo. */
function Flames({ uid, x, y, s = 1, sparks = 10 }: { uid: Uid; x: number; y: number; s?: number; sparks?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) translate(-80 -78)`}>
      <defs>
        <linearGradient id={`${uid}-fo`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff6a1a" />
          <stop offset="0.6" stopColor="#ff8c2e" />
          <stop offset="1" stopColor="#ffb347" stopOpacity={0.6} />
        </linearGradient>
        <linearGradient id={`${uid}-fm`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffb13b" />
          <stop offset="1" stopColor="#ffd36b" stopOpacity={0.85} />
        </linearGradient>
        <radialGradient id={`${uid}-halo`}>
          <stop offset="0" stopColor="#ffb054" stopOpacity={0.75} />
          <stop offset="1" stopColor="#ff7a2a" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle className="ms-halo" cx="80" cy="60" r="30" fill={`url(#${uid}-halo)`} />
      <path className="ms-flame ms-flame--a" d="M80 78 C64 78 60 64 68 52 C70 58 74 60 74 60 C72 48 78 38 84 30 C84 40 92 46 94 56 C96 50 96 46 96 46 C102 58 98 78 80 78 Z" fill={`url(#${uid}-fo)`} filter={`url(#${uid}-soft)`} />
      <path className="ms-flame ms-flame--side" d="M70 78 C62 76 62 68 66 62 C68 68 71 70 72 72 C72 75 72 77 70 78 Z" fill="#ff7b26" opacity={0.85} />
      <path className="ms-flame ms-flame--side2" d="M91 78 C97 76 99 69 96 63 C94 68 91 70 90 72 C89 75 89 77 91 78 Z" fill="#ff7b26" opacity={0.85} />
      <path className="ms-flame ms-flame--b" d="M80 78 C69 78 67 67 73 59 C74 64 77 65 77 65 C77 56 81 50 85 44 C85 52 91 58 90 66 C93 62 93 60 93 60 C95 70 91 78 80 78 Z" fill={`url(#${uid}-fm)`} />
      <path className="ms-flame ms-flame--c" d="M80 78 C74 78 72 72 75 67 C76 70 78 70 78 70 C78 65 81 61 83 58 C84 64 87 68 86 72 C86 76 84 78 80 78 Z" fill="#fff1c9" />
      {Array.from({ length: sparks }, (_, i) => (
        <circle
          key={i}
          className="ms-spark"
          cx={72 + rnd(i, 4) * 16}
          cy={62 + rnd(i, 6) * 8}
          r={0.6 + rnd(i, 8) * 0.8}
          fill="#ffe0a8"
          style={v({ "--dx": `${(rnd(i, 2) - 0.5) * 22}px`, "--dy": `${-26 - rnd(i, 3) * 22}px`, animationDelay: `${-rnd(i, 5) * 2.6}s`, animationDuration: `${1.8 + rnd(i, 7) * 1.4}s` })}
        />
      ))}
    </g>
  );
}

/** Rising, expanding, fading smoke puffs. */
function Smoke({ uid, x, y, n = 5, color = "#9aa0a8", spread = 8 }: { uid: Uid; x: number; y: number; n?: number; color?: string; spread?: number }) {
  return (
    <g filter={`url(#${uid}-blur)`}>
      {Array.from({ length: n }, (_, i) => (
        <circle
          key={i}
          className="ms-smoke"
          cx={x + (rnd(i, 11) - 0.5) * 4}
          cy={y}
          r={3 + rnd(i, 12) * 2}
          fill={color}
          style={v({ "--dx": `${(rnd(i, 13) - 0.3) * spread}px`, animationDelay: `${-(i / n) * 4.5}s` })}
        />
      ))}
    </g>
  );
}

const Ground = ({ y = 78, color = "#15110d", edge = "#2a2118" }: { y?: number; color?: string; edge?: string }) => (
  <>
    <rect x="0" y={y} width="160" height={100 - y} fill={color} />
    <path d={`M0 ${y} L160 ${y}`} stroke={edge} strokeWidth="0.6" />
  </>
);

// ---------------------------------------------------------------------------
// Scenes

const fire: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gy={64} strength={0.75} />
    <Ground />
    <ellipse className="ms-pool" cx="80" cy="81" rx="44" ry="7" fill="#ff8a3a" opacity={0.35} filter={`url(#${uid}-blur)`} />
    {[[60, 79], [68, 83], [92, 83], [100, 79], [80, 84.5]].map(([cx, cy], i) => (
      <ellipse key={i} cx={cx} cy={cy} rx="5" ry="3" fill="#2b241e" stroke="#4a3b2c" strokeWidth="0.5" />
    ))}
    <rect x="63" y="74.5" width="34" height="4.2" rx="2" fill="#4a2f1c" transform="rotate(-12 80 76)" />
    <rect x="63" y="74.5" width="34" height="4.2" rx="2" fill="#5a3820" transform="rotate(14 80 76)" />
    {[[72, 77], [86, 76.5], [79, 79]].map(([cx, cy], i) => (
      <circle key={i} className="ms-ember" cx={cx} cy={cy} r="1.3" fill="#ffb15a" style={v({ animationDelay: `${i * 0.4}s` })} />
    ))}
    <Flames uid={uid} x={80} y={78} s={1.05} sparks={14} />
    <Motes n={6} color="#ffd29a" seed={2} />
    <Vignette uid={uid} />
  </>
);

const cooking: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gy={70} strength={0.6} />
    <Ground y={86} />
    <ellipse className="ms-pool" cx="80" cy="87" rx="34" ry="5" fill="#ff8a3a" opacity={0.3} filter={`url(#${uid}-blur)`} />
    {[[66, 86], [94, 86]].map(([cx, cy], i) => (
      <ellipse key={i} cx={cx} cy={cy} rx="5" ry="2.6" fill="#2b241e" stroke="#4a3b2c" strokeWidth="0.5" />
    ))}
    <Flames uid={uid} x={80} y={86} s={0.62} sparks={10} />
    {/* Heat shimmer */}
    {[68, 76, 84, 92].map((x, i) => (
      <path key={x} className="ms-shimmer" d={`M${x} 68 C${x - 2} 64 ${x + 2} 61 ${x} 57`} stroke="#ffd7a3" strokeWidth="0.7" fill="none" style={v({ animationDelay: `${i * 0.35}s` })} />
    ))}
    {/* Stick and fish */}
    <path d="M30 55 L130 50" stroke="#6b4a2c" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M44 84 L52 53 M116 84 L108 51" stroke="#5a3e25" strokeWidth="1.4" strokeLinecap="round" />
    <g className="ms-fish">
      <path d="M58 52 C66 42 88 42 98 51 C88 60 66 61 58 52 Z" fill="#b98a5a" stroke="#e7c08a" strokeWidth="0.5" />
      <path d="M98 51 L108 44 L106 51 L108 58 Z" fill="#9e7247" />
      <path d="M66 49 C70 52 70 52 66 55 M73 47 C77 51 77 52 73 56 M80 47 C84 51 84 52 80 56 M87 48 C90 51 90 52 87 55" stroke="#7a5332" strokeWidth="0.45" fill="none" />
      <circle cx="63.5" cy="50.5" r="1" fill="#1c140e" />
      <path className="ms-sheen-line" d="M68 46 C76 44 86 44 92 47" stroke="#fff3d6" strokeWidth="0.8" fill="none" />
    </g>
    <Smoke uid={uid} x={82} y={44} n={6} color="#a3a7ad" />
    <Vignette uid={uid} />
  </>
);

/** A stone artefact turning under a spotlight, with knapping chips. */
function turningTool(shape: string, scars: [string, string][]): Scene {
  return function TurningTool(uid, accent) {
    return (
  <>
    <Backdrop uid={uid} accent={accent} gy={52} strength={0.35} top="#050608" bottom="#0c0d12" />
    <defs>
      <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff4dc" stopOpacity={0.28} />
        <stop offset="1" stopColor="#fff4dc" stopOpacity={0} />
      </linearGradient>
      <linearGradient id={`${uid}-stone`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#c9b394" />
        <stop offset="0.55" stopColor="#8d7a62" />
        <stop offset="1" stopColor="#4f4436" />
      </linearGradient>
      <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity={0} />
        <stop offset="0.5" stopColor="#fff" stopOpacity={0.75} />
        <stop offset="1" stopColor="#fff" stopOpacity={0} />
      </linearGradient>
      <clipPath id={`${uid}-clip`}>
        <path d={shape} />
      </clipPath>
    </defs>
    <path className="ms-beam" d="M64 0 L96 0 L122 92 L38 92 Z" fill={`url(#${uid}-beam)`} />
    <ellipse cx="80" cy="86" rx="30" ry="4" fill="#1a1712" />
    <ellipse className="ms-turn-shadow" cx="80" cy="85" rx="20" ry="2.6" fill="#000" opacity={0.6} filter={`url(#${uid}-soft)`} />
    <g className="ms-float">
      <g className="ms-turn">
        <path d={shape} fill={`url(#${uid}-stone)`} stroke="#e6d4b4" strokeOpacity={0.5} strokeWidth="0.6" />
        {scars.map(([d, fill], i) => (
          <path key={i} d={d} fill={fill} opacity={0.75} stroke="#2b241c" strokeOpacity={0.4} strokeWidth="0.4" />
        ))}
        <g clipPath={`url(#${uid}-clip)`}>
          <g transform="rotate(18 48 50)">
            <rect className="ms-sweep" x="40" y="10" width="16" height="80" fill={`url(#${uid}-sweep)`} />
          </g>
          <rect className="ms-turn-dark" x="40" y="10" width="80" height="80" fill="#000" />
        </g>
      </g>
    </g>
    {Array.from({ length: 5 }, (_, i) => (
      <g key={i} transform={`translate(${96 + rnd(i, 21) * 4} ${46 + rnd(i, 22) * 10})`}>
        <path
          className="ms-chip"
          d="M0 0 L2.4 -0.8 L1.6 1.4 Z"
          fill="#cbb79a"
          style={v({ "--dx": `${10 + rnd(i, 23) * 16}px`, "--dy": `${-8 + rnd(i, 24) * 22}px`, animationDelay: `${-rnd(i, 25) * 4}s` })}
        />
      </g>
    ))}
    <Motes n={10} seed={3} x0={56} x1={104} y0={6} y1={80} />
    <Vignette uid={uid} />
  </>
    );
  };
}

const stoneTool = turningTool("M60 68 L64 42 L78 30 L96 35 L102 54 L92 70 L72 74 Z", [
  ["M64 42 L78 30 L80 46 L68 52 Z", "#b5a185"],
  ["M78 30 L96 35 L88 48 L80 46 Z", "#9c8a70"],
  ["M96 35 L102 54 L90 56 L88 48 Z", "#7c6c58"],
  ["M68 52 L80 46 L88 48 L90 56 L80 64 L70 62 Z", "#a89478"],
]);

const handaxe = turningTool("M80 18 C93 30 100 50 96 66 C93 78 67 78 64 66 C60 50 67 30 80 18 Z", [
  ["M80 18 C86 26 88 32 86 38 L78 40 C76 32 77 25 80 18 Z", "#b9a588"],
  ["M78 40 L86 38 L92 50 L82 56 Z", "#9b896f"],
  ["M68 44 L78 40 L82 56 L70 58 Z", "#ad9a7d"],
  ["M70 58 L82 56 L90 66 L80 72 L70 68 Z", "#857460"],
]);

const spear: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gy={30} gx={120} strength={0.45} top="#0b0d14" bottom="#141218" />
    <circle cx="128" cy="26" r="9" fill="#f6d6a2" opacity={0.25} filter={`url(#${uid}-blur)`} />
    <path d="M0 70 C30 64 60 68 90 64 C120 60 140 66 160 62 L160 100 L0 100 Z" fill="#141a12" />
    <path d="M0 78 C40 74 80 80 120 74 C140 72 150 76 160 74 L160 100 L0 100 Z" fill="#0e120c" />
    {Array.from({ length: 16 }, (_, i) => (
      <path key={i} className="ms-grass" d={`M${8 + i * 9.5} 92 q${1 + rnd(i, 31) * 2} -6 ${rnd(i, 32) * 3} -${8 + rnd(i, 33) * 6}`} stroke="#3c4a2c" strokeWidth="0.8" fill="none" style={v({ animationDelay: `${-rnd(i, 34) * 3}s` })} />
    ))}
    <g className="ms-spear">
      <path d="M-26 0 L-48 0" stroke="#fff3d6" strokeWidth="0.6" opacity={0.35} />
      <path d="M-22 -2 L-40 -2 M-22 2 L-36 2" stroke="#fff3d6" strokeWidth="0.4" opacity={0.25} />
      <path d="M-24 0 L18 0" stroke="#b58552" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 -1.5 L28 0 L18 1.5 Z" fill="#e2c9a0" />
    </g>
    <ellipse className="ms-puff" cx="118" cy="80" rx="9" ry="3" fill="#8d7c63" filter={`url(#${uid}-blur)`} />
    <Motes n={6} color="#e8d9b0" seed={4} y0={30} y1={70} />
    <Vignette uid={uid} />
  </>
);

const engraving: Scene = (uid, accent) => {
  const lines = ["M58 44 L104 38", "M57 52 L106 46", "M58 60 L104 55", "M64 36 L72 66", "M78 34 L86 64", "M92 33 L99 61", "M60 64 L102 36"];
  return (
    <>
      <Backdrop uid={uid} accent={accent} gy={50} strength={0.45} />
      <defs>
        <linearGradient id={`${uid}-ochre`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b5552f" />
          <stop offset="0.6" stopColor="#8a3a20" />
          <stop offset="1" stopColor="#4d2013" />
        </linearGradient>
      </defs>
      <ellipse cx="82" cy="80" rx="40" ry="6" fill="#000" opacity={0.5} filter={`url(#${uid}-blur)`} />
      <path d="M46 62 L54 30 L108 24 L118 52 L104 74 L56 76 Z" fill={`url(#${uid}-ochre)`} stroke="#d27a4a" strokeOpacity={0.35} strokeWidth="0.6" />
      {Array.from({ length: 18 }, (_, i) => (
        <circle key={i} cx={56 + rnd(i, 41) * 54} cy={32 + rnd(i, 42) * 40} r={0.3 + rnd(i, 43) * 0.7} fill="#3a170c" opacity={0.6} />
      ))}
      {lines.map((d, i) => (
        <g key={d}>
          <path className="ms-groove" d={d} pathLength={1} stroke="#2a0f07" strokeWidth="1.3" strokeLinecap="round" style={v({ animationDelay: `${0.3 + i * 0.55}s` })} />
          <path className="ms-hot" d={d} pathLength={1} stroke="#ffd9a8" strokeWidth="0.9" strokeLinecap="round" style={v({ animationDelay: `${0.3 + i * 0.55}s` })} />
        </g>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <circle key={i} className="ms-dust" cx={60 + rnd(i, 44) * 44} cy={46 + rnd(i, 45) * 10} r="0.5" fill="#e09060" style={v({ animationDelay: `${-rnd(i, 46) * 4.5}s` })} />
      ))}
      <Motes n={6} color="#f0b48a" seed={5} />
      <Vignette uid={uid} />
    </>
  );
};

const caveArt: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent="#ffb066" gx={20} gy={40} strength={0.55} top="#130c08" bottom="#1d130c" />
    <defs>
      <radialGradient id={`${uid}-torch`} cx="0.12" cy="0.4" r="0.7">
        <stop offset="0" stopColor="#ffb469" stopOpacity={0.5} />
        <stop offset="1" stopColor="#ffb469" stopOpacity={0} />
      </radialGradient>
    </defs>
    {Array.from({ length: 14 }, (_, i) => (
      <ellipse key={i} cx={rnd(i, 51) * 160} cy={rnd(i, 52) * 100} rx={8 + rnd(i, 53) * 18} ry={5 + rnd(i, 54) * 10} fill={i % 2 ? "#2a1a10" : "#3a2616"} opacity={0.55} filter={`url(#${uid}-blur)`} />
    ))}
    <rect className="ms-torch" width="160" height="100" fill={`url(#${uid}-torch)`} />
    {/* Hand stencil: pigment cloud, then the hand left in negative */}
    <g filter={`url(#${uid}-blur)`}>
      <ellipse className="ms-spray" cx="66" cy="50" rx="21" ry="27" fill={accent} opacity={0.8} />
    </g>
    {Array.from({ length: 26 }, (_, i) => {
      const a = rnd(i, 55) * Math.PI * 2;
      const r = 17 + rnd(i, 56) * 9;
      return (
        <circle key={i} className="ms-spatter" cx={66 + Math.cos(a) * r * 0.85} cy={50 + Math.sin(a) * r} r={0.4 + rnd(i, 57) * 0.7} fill={accent} style={v({ animationDelay: `${0.2 + rnd(i, 58) * 1.6}s` })} />
      );
    })}
    <path
      className="ms-hand"
      d="M60 74 L59 58 L53 50 C51.5 47.6 54.6 46 56.2 48 L60 52.6 L60 33 C60 30 64 30 64 33 L64.6 47 L65.4 30 C65.6 27 69.6 27 69.6 30 L69.8 47 L71.6 32 C72 29 75.8 29.6 75.5 32.6 L74.4 48 L77.6 38.6 C78.6 36 82.2 37.2 81.4 40 L78 56 C77.2 63 75 68 73.4 74 Z"
      fill="#2b1b11"
    />
    {/* Droplets blown from the right */}
    {Array.from({ length: 10 }, (_, i) => (
      <circle key={i} className="ms-droplet" cx="104" cy={44 + rnd(i, 59) * 12} r="0.6" fill={accent} style={v({ "--dx": `${-22 - rnd(i, 60) * 16}px`, "--dy": `${(rnd(i, 61) - 0.5) * 18}px`, animationDelay: `${rnd(i, 62) * 1.8}s` })} />
    ))}
    {/* A pig drawn in ochre afterwards */}
    <path
      className="ms-paint"
      pathLength={1}
      d="M98 60 C100 50 118 48 126 54 C130 52 134 54 134 57 C131 58 130 60 128 62 C126 68 108 70 100 66 Z M104 66 L103 74 M110 68 L110 75 M120 67 L121 74 M125 65 L127 72 M100 60 L96 57"
      stroke={accent}
      strokeWidth="1.3"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Motes n={8} color="#ffcf9a" seed={6} />
    <Vignette uid={uid} />
  </>
);

const voice: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gy={50} strength={0.45} />
    {[0, 1, 2, 3].map((i) => (
      <g key={i}>
        <path className="ms-ring" d="M98 26 C112 38 112 62 98 74" stroke={accent} strokeWidth="1.2" fill="none" style={v({ animationDelay: `${i * 0.6}s` })} />
        <path className="ms-ring ms-ring--l" d="M62 26 C48 38 48 62 62 74" stroke={accent} strokeWidth="1.2" fill="none" style={v({ animationDelay: `${i * 0.6}s` })} />
      </g>
    ))}
    <g className="ms-wavepath">
      <path d="M-40 50 q5 -6 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0" stroke={accent} strokeOpacity={0.35} strokeWidth="0.7" fill="none" />
    </g>
    <g className="ms-float">
      <path d="M66 44 C66 60 94 60 94 44 L90 43 C90 53 70 53 70 43 Z" fill="#e8dcc4" stroke="#fff6e4" strokeWidth="0.5" />
      <ellipse cx="68" cy="43.5" rx="3.4" ry="2.4" fill="#e8dcc4" />
      <ellipse cx="92" cy="43.5" rx="3.4" ry="2.4" fill="#e8dcc4" />
      <path d="M71 52 C77 56 83 56 89 52" stroke="#fff" strokeOpacity={0.6} strokeWidth="0.6" fill="none" />
    </g>
    <Motes n={8} color="#cfe6ff" seed={7} />
    <Vignette uid={uid} />
  </>
);

const needle: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gy={55} strength={0.4} />
    {/* Woven fibre cloth */}
    <g opacity={0.7}>
      {Array.from({ length: 9 }, (_, i) => (
        <path key={`h${i}`} d={`M28 ${58 + i * 4} C60 ${56 + i * 4} 100 ${60 + i * 4} 132 ${57 + i * 4}`} stroke="#6f6656" strokeWidth="1.1" fill="none" />
      ))}
      {Array.from({ length: 14 }, (_, i) => (
        <path key={`v${i}`} d={`M${32 + i * 7.5} 56 L${31 + i * 7.5} 92`} stroke="#857a66" strokeWidth="0.8" strokeDasharray="2 2" />
      ))}
    </g>
    {/* Dyed flax fibres drifting */}
    {[
      ["#3fc7c0", 34], ["#e48aa8", 50], ["#cfd2d6", 112], ["#1f1f24", 126], ["#3fc7c0", 98],
    ].map(([c, x], i) => (
      <path key={i} className="ms-fibre" d={`M${x} 14 C${(x as number) + 6} 22 ${(x as number) - 6} 30 ${x} 40`} stroke={c as string} strokeWidth="0.9" fill="none" style={v({ animationDelay: `${-i * 0.9}s` })} />
    ))}
    {/* Thread stitched behind the needle */}
    <path className="ms-thread" pathLength={1} d="M30 62 C40 50 48 50 54 62 C60 74 68 74 74 62 C80 50 88 50 94 62 C100 74 108 74 114 62" stroke="#3fc7c0" strokeWidth="1" fill="none" />
    <g className="ms-needle">
      <path d="M-14 0 L12 0" stroke="#efe3c8" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 -0.9 L17 0 L12 0.9 Z" fill="#efe3c8" />
      <ellipse cx="-11" cy="0" rx="1.6" ry="0.6" fill="#1a1a1a" />
    </g>
    <Motes n={6} seed={8} />
    <Vignette uid={uid} />
  </>
);

const boat: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gx={120} gy={24} strength={0.45} top="#070b18" bottom="#0b1a2c" />
    <circle cx="122" cy="22" r="6" fill="#e9f1ff" opacity={0.85} />
    <circle cx="122" cy="22" r="14" fill="#cfe2ff" opacity={0.25} filter={`url(#${uid}-blur)`} />
    {Array.from({ length: 10 }, (_, i) => (
      <circle key={i} className="ms-twinkle" cx={rnd(i, 71) * 160} cy={rnd(i, 72) * 34} r={0.3 + rnd(i, 73) * 0.4} fill="#fff" style={v({ animationDelay: `${-rnd(i, 74) * 3}s` })} />
    ))}
    {/* Distant islands: the far shore is the goal */}
    <path d="M118 50 C124 44 134 44 140 50 Z M132 50 C138 46 146 46 152 50 Z" fill="#0f2238" />
    <path d="M4 50 C10 46 18 46 24 50 Z" fill="#0d1d30" />
    <rect x="0" y="50" width="160" height="50" fill="#0b2034" />
    {[0, 1, 2, 3, 4].map((i) => (
      <path key={i} className="ms-glint" d={`M${116 + i * 1.5} ${54 + i * 4} l${8 - i} 0`} stroke="#dbe9ff" strokeWidth="0.5" style={v({ animationDelay: `${i * 0.3}s` })} />
    ))}
    <g className="ms-sea ms-sea--3">
      <path d="M-160 60 q10 -3 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 V100 H-160 Z" fill="#0e2840" />
    </g>
    <g className="ms-voyage">
      <g transform="scale(1.7)">
      <g className="ms-bob">
        <path d="M-16 0 C-10 6 10 6 16 0 L13 -1.4 L-13 -1.4 Z" fill="#5a3b22" stroke="#a37446" strokeWidth="0.4" />
        <circle cx="-5" cy="-5.4" r="1.6" fill="#1a1612" />
        <path d="M-5 -4 L-5 -1.4" stroke="#1a1612" strokeWidth="2" />
        <circle cx="6" cy="-5.6" r="1.6" fill="#1a1612" />
        <path d="M6 -4 L6 -1.4" stroke="#1a1612" strokeWidth="2" />
        <path className="ms-paddle" d="M-5 -4 L-11 6" stroke="#8d6239" strokeWidth="0.8" />
        <path className="ms-paddle ms-paddle--b" d="M6 -4 L0 6" stroke="#8d6239" strokeWidth="0.8" />
        <path d="M-17 1.5 l-6 0 M-17 3 l-9 0" stroke="#cfe2ff" strokeWidth="0.4" opacity={0.6} />
      </g>
      </g>
    </g>
    <g className="ms-sea ms-sea--2">
      <path d="M-160 66 q8 -3 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 V100 H-160 Z" fill="#103352" />
      <path d="M-160 66 q8 -3 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" stroke={accent} strokeOpacity={0.45} strokeWidth="0.6" fill="none" />
    </g>
    <g className="ms-sea ms-sea--1">
      <path d="M-160 76 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 V100 H-160 Z" fill="#0a2236" />
      <path d="M-160 76 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke={accent} strokeOpacity={0.3} strokeWidth="0.6" fill="none" />
    </g>
    <Vignette uid={uid} />
  </>
);

const pottery: Scene = (uid, accent) => {
  const body = "M70 26 L90 26 L89 32 C102 38 106 56 99 72 C96 78 64 78 61 72 C54 56 58 38 71 32 Z";
  const band = (x: number) => `M${x} 46 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6`;
  return (
    <>
      <Backdrop uid={uid} accent={accent} gy={50} strength={0.5} />
      <defs>
        <linearGradient id={`${uid}-clay`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3b2416" />
          <stop offset="0.35" stopColor="#a8653a" />
          <stop offset="0.5" stopColor="#c47d4b" />
          <stop offset="0.75" stopColor="#7d4627" />
          <stop offset="1" stopColor="#2b190f" />
        </linearGradient>
        <clipPath id={`${uid}-pot`}>
          <path d={body} />
        </clipPath>
      </defs>
      <ellipse cx="80" cy="82" rx="30" ry="4.5" fill="#1d1712" />
      <ellipse cx="80" cy="79" rx="20" ry="2.5" fill="#000" opacity={0.55} filter={`url(#${uid}-soft)`} />
      <path d={body} fill={`url(#${uid}-clay)`} />
      <g clipPath={`url(#${uid}-pot)`}>
        <g className="ms-pot-spin">
          <path d={band(20)} stroke="#2b160b" strokeWidth="0.9" fill="none" opacity={0.75} />
          <path d={band(20).replace(/M20 46/, "M20 60")} stroke="#2b160b" strokeWidth="0.7" fill="none" opacity={0.6} />
          {Array.from({ length: 13 * 4 }, (_, i) => {
            const k = i % 4; // 4 speckles per 8-unit tile, repeated: seamless loop
            return <circle key={i} cx={20 + Math.floor(i / 4) * 8 + rnd(k, 81) * 8} cy={30 + rnd(k + Math.floor(i / 4) % 3, 82) * 46} r="0.4" fill="#e0a77a" opacity={0.5} />;
          })}
        </g>
        <rect x="56" y="20" width="48" height="60" fill={`url(#${uid}-clay)`} opacity={0.35} />
      </g>
      <path d="M74 34 C70 44 70 60 74 70" stroke="#ffe0c0" strokeOpacity={0.45} strokeWidth="1.4" fill="none" filter={`url(#${uid}-soft)`} />
      <ellipse cx="80" cy="26" rx="10" ry="2" fill="#2a170c" stroke="#d99a6a" strokeWidth="0.5" />
      <Motes n={8} color="#ffd2a8" seed={9} />
      <Vignette uid={uid} />
    </>
  );
};

const ornament: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gy={46} strength={0.5} />
    <g className="ms-string">
      <path d="M36 18 C50 62 110 62 124 18" stroke="#8c6b4c" strokeWidth="0.8" fill="none" />
      {[[50, 42], [63, 52], [80, 55], [97, 52], [110, 42]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <g className="ms-bead" style={v({ animationDelay: `${-i * 0.7}s` })}>
            <path d="M0 -6 C5 -5 6 1 3.5 5 C1.5 7.5 -1.5 7.5 -3.5 5 C-6 1 -5 -5 0 -6 Z" fill="#e9cfae" stroke="#fff3e2" strokeWidth="0.4" />
            <path d="M0 -6 C2 -3 2 1 0 4 M-2.4 -3.2 C-1 -1 1 -1 2.6 -2.6" stroke="#b38a64" strokeWidth="0.5" fill="none" />
            <ellipse cx="0" cy="-2.2" rx="1.3" ry="1" fill="#2a1a10" />
            <path d="M-3 2 C-2 4 0 5 2 4" stroke="#b5552f" strokeWidth="0.8" fill="none" opacity={0.7} />
            <path className="ms-bead-sheen" d="M-2.6 -3.4 C-2 -4.6 -0.6 -5.2 0.6 -5" stroke="#fff" strokeWidth="0.9" fill="none" />
          </g>
        </g>
      ))}
    </g>
    {Array.from({ length: 12 }, (_, i) => (
      <circle key={i} className="ms-mote" cx={30 + rnd(i, 91) * 100} cy={20 + rnd(i, 92) * 60} r="0.5" fill="#d26a3e" style={v({ animationDelay: `${-rnd(i, 93) * 9}s` })} />
    ))}
    <Vignette uid={uid} />
  </>
);

const dogPath =
  "M68 82 L68 68 C66 60 68 52 74 48 L76 39 L79.5 45 L83 38 L85 46 C89 48 91 51 90 54 L96 56 C97.4 58 95.4 60 92 60 L86 60 C85.6 65 88 71 90 75 L91 82 L85 82 L83.6 74 C80 76 77.6 78 77.6 82 Z";

const animal: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent="#ff9d4d" gx={30} gy={72} strength={0.55} top="#060912" bottom="#0e0d12" />
    {Array.from({ length: 12 }, (_, i) => (
      <circle key={i} className="ms-twinkle" cx={rnd(i, 101) * 160} cy={rnd(i, 102) * 40} r={0.3 + rnd(i, 103) * 0.4} fill="#fff" style={v({ animationDelay: `${-rnd(i, 104) * 3}s` })} />
    ))}
    <Ground y={82} color="#110e0b" />
    <ellipse className="ms-pool" cx="40" cy="84" rx="40" ry="5" fill="#ff9d4d" opacity={0.35} filter={`url(#${uid}-blur)`} />
    <Flames uid={uid} x={36} y={83} s={0.5} sparks={8} />
    <g transform="translate(86 82) scale(1.3) translate(-80 -82)">
    <path className="ms-tail" d="M69 76 C62 74 58 70 57 64" stroke="#1a140e" strokeWidth="3.2" strokeLinecap="round" fill="none" />
    <path className="ms-tail" d="M69 76 C62 74 58 70 57 64" stroke={accent} strokeOpacity={0.5} strokeWidth="0.6" fill="none" />
    <g className="ms-breathe">
      <path d={dogPath} fill="#1a140e" stroke={accent} strokeOpacity={0.55} strokeWidth="0.7" />
      <path d="M74 48 C71 54 70 62 70 70" stroke={accent} strokeOpacity={0.5} strokeWidth="0.8" fill="none" />
      <path d="M85 46 C88 48 90 51 90 54" stroke={accent} strokeOpacity={0.6} strokeWidth="0.8" fill="none" />
      <circle cx="84" cy="50" r="0.7" fill="#ffcf8a" className="ms-ember" />
    </g>
    </g>
    {[[150, 90], [140, 92], [130, 90], [120, 92], [110, 90]].map(([x, y], i) => (
      <g key={i} className="ms-paw" transform={`translate(${x} ${y}) scale(0.55)`} style={v({ animationDelay: `${i * 0.5}s` })}>
        <ellipse cx="0" cy="1.6" rx="2.2" ry="1.7" fill={accent} opacity={0.75} />
        <circle cx="-2.1" cy="-1.4" r="0.8" fill={accent} opacity={0.75} />
        <circle cx="0" cy="-2.4" r="0.8" fill={accent} opacity={0.75} />
        <circle cx="2.1" cy="-1.4" r="0.8" fill={accent} opacity={0.75} />
      </g>
    ))}
    <Vignette uid={uid} />
  </>
);

const goat = (x: number, y: number, s: number, delay: number, flip = false) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
    <path d="M-16 -6 C-16 -12 -6 -14 4 -13 L8 -13 L8 -6 C6 -2 2 0 -2 0 L-2 8 L-4 8 L-5 1 L-11 1 L-12 8 L-14 8 L-14 0 C-16 -1 -16 -3 -16 -6 Z" fill="#191612" stroke="#e2c27e" strokeOpacity={0.55} strokeWidth="0.5" />
    <path d="M-16 -9 C-19 -10 -20 -7 -18 -5" stroke="#1d1a14" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    <g className="ms-graze" style={v({ animationDelay: `${delay}s` })}>
      <path d="M5 -12 C8 -14 12 -12 13 -8 C14 -5 12 -3 10 -4 L8 -6 Z" fill="#191612" stroke="#e2c27e" strokeOpacity={0.55} strokeWidth="0.5" />
      <path d="M8 -13 C6 -19 2 -20 0 -18" stroke="#b89a62" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M12 -5 L12.5 -2" stroke="#1d1a14" strokeWidth="1" />
    </g>
  </g>
);

const herd: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gx={110} gy={40} strength={0.75} top="#141420" bottom="#2a2216" />
    <circle cx="112" cy="34" r="8" fill="#ffd79a" opacity={0.65} filter={`url(#${uid}-blur)`} />
    <path d="M0 58 L22 40 L38 52 L58 32 L82 54 L104 38 L126 56 L146 42 L160 52 L160 100 L0 100 Z" fill="#14161a" />
    <path d="M0 72 C30 66 60 70 90 66 C120 62 140 68 160 66 L160 100 L0 100 Z" fill="#1c1a13" />
    {Array.from({ length: 18 }, (_, i) => (
      <path key={i} className="ms-grass" d={`M${4 + i * 9} 92 q1 -4 ${rnd(i, 111) * 3} -${6 + rnd(i, 112) * 4}`} stroke="#4a4630" strokeWidth="0.7" fill="none" style={v({ animationDelay: `${-rnd(i, 113) * 3}s` })} />
    ))}
    {goat(60, 80, 1.7, 0)}
    {goat(104, 78, 1.35, 1.3, true)}
    {goat(128, 84, 1, 2.1)}
    <Motes n={8} color="#ffe3b0" seed={11} y0={40} y1={80} />
    <Vignette uid={uid} />
  </>
);

const sprout: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent="#ffd27a" gx={110} gy={14} strength={0.45} top="#0b0e10" bottom="#141812" />
    <g className="ms-rays" opacity={0.07} filter={`url(#${uid}-blur)`}>
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M118 0 L${56 + i * 22} 62 L${68 + i * 22} 62 Z`} fill="#ffe7a8" />
      ))}
    </g>
    <rect x="0" y="62" width="160" height="38" fill="#2a1d12" />
    <path d="M0 62 C30 60 60 63 90 61 C120 59 140 62 160 61" stroke="#4a3420" strokeWidth="1" fill="none" />
    {Array.from({ length: 14 }, (_, i) => (
      <ellipse key={i} cx={rnd(i, 121) * 160} cy={66 + rnd(i, 122) * 30} rx={0.8 + rnd(i, 123) * 1.6} ry={0.6 + rnd(i, 124)} fill="#3e2c1c" />
    ))}
    <g className="ms-cycle" transform="translate(80 74) scale(1.25) translate(-80 -74)">
      <path className="ms-root" pathLength={1} d="M80 76 C79 82 76 86 72 92 M80 78 C82 84 86 88 90 94 M79 82 C78 88 80 92 79 98" stroke="#d9c49a" strokeWidth="0.7" fill="none" />
      <ellipse className="ms-seed" cx="80" cy="74" rx="3.4" ry="2.2" fill="#c99a52" />
      <path className="ms-stem" pathLength={1} d="M80 72 C80 60 78 46 80 26" stroke={accent} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path className="ms-leaf ms-leaf--l" d="M80 54 C70 54 64 48 63 40 C72 40 78 46 80 54 Z" fill={accent} opacity={0.85} />
      <path className="ms-leaf ms-leaf--r" d="M80 44 C90 44 96 38 97 30 C88 30 82 36 80 44 Z" fill={accent} opacity={0.85} />
      {Array.from({ length: 7 }, (_, i) => {
        const cx = i % 2 ? 82.3 : 77.7;
        const cy = 27 - i * 2.4;
        return (
          <g key={i} transform={`rotate(${i % 2 ? 30 : -30} ${cx} ${cy})`}>
            <ellipse className="ms-grain" cx={cx} cy={cy} rx="1.9" ry="1.2" fill="#e8c46a" style={v({ animationDelay: `${5.4 + i * 0.22}s` })} />
          </g>
        );
      })}
    </g>
    <Motes n={6} color="#fff0c0" seed={12} y0={10} y1={58} />
    <Vignette uid={uid} />
  </>
);

const wine: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gx={98} gy={66} strength={0.5} top="#0b0910" bottom="#130d0f" />
    <defs>
      <clipPath id={`${uid}-qv`}>
        <path d="M89 50 L107 50 C119 60 120 78 98 96 C76 78 77 60 89 50 Z" />
      </clipPath>
      <linearGradient id={`${uid}-wine`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c0396f" />
        <stop offset="1" stopColor="#4a0c2a" />
      </linearGradient>
    </defs>
    {/* Ground: a qvevri is buried up to its rim */}
    <rect x="0" y="50" width="160" height="50" fill="#1d140e" />
    <path d="M0 50 L160 50" stroke="#3b2a1c" strokeWidth="0.8" />
    {/* Vine with grapes */}
    <path className="ms-vine" pathLength={1} d="M10 8 C30 12 40 6 52 14 C58 18 56 22 52 24" stroke="#6b5a2c" strokeWidth="1.2" fill="none" />
    <path className="ms-vine" pathLength={1} d="M30 10 C34 4 42 6 40 12 M46 14 C50 8 58 10 56 16" stroke="#7d8b3c" strokeWidth="0.8" fill="none" />
    {[[48, 26], [54, 26], [45, 31], [51, 31], [57, 31], [48, 36], [54, 36], [51, 41], [57, 40], [45, 40]].map(([cx, cy], i) => (
      <g key={i}>
        <circle className="ms-grape" cx={cx} cy={cy} r="3" fill="#7c2a6e" stroke="#c25ab0" strokeWidth="0.4" style={v({ animationDelay: `${0.2 + i * 0.16}s` })} />
        <circle className="ms-grape" cx={cx - 1} cy={cy - 1.1} r="0.7" fill="#f1c7ea" opacity={0.8} style={v({ animationDelay: `${0.2 + i * 0.16}s` })} />
      </g>
    ))}
    <circle className="ms-drop" cx="52" cy="46" r="1.2" fill="#c0396f" />
    {/* Qvevri */}
    <g clipPath={`url(#${uid}-qv)`}>
      <rect x="76" y="50" width="46" height="48" fill="#5a3422" />
      <rect x="76" y="50" width="46" height="48" fill="#000" opacity={0.35} />
      <g className="ms-liquid">
        <path d="M40 68 q6 -2.5 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 V100 H40 Z" fill={`url(#${uid}-wine)`} />
      </g>
      {Array.from({ length: 6 }, (_, i) => (
        <circle key={i} className="ms-bubble" cx={90 + rnd(i, 131) * 16} cy="88" r={0.5 + rnd(i, 132) * 0.6} fill="#f4a6c8" style={v({ animationDelay: `${-rnd(i, 133) * 3}s` })} />
      ))}
    </g>
    <path d="M96 52 C90 60 88 74 96 90" stroke="#ffd9b8" strokeOpacity={0.25} strokeWidth="1.6" fill="none" filter={`url(#${uid}-soft)`} />
    <path className="ms-qvevri" pathLength={1} d="M89 50 L107 50 C119 60 120 78 98 96 C76 78 77 60 89 50 Z" stroke="#e7a36e" strokeWidth="1.3" fill="none" />
    <path d="M87 50 L109 50" stroke="#e7a36e" strokeWidth="2" strokeLinecap="round" />
    <Motes n={8} color="#f6c3df" seed={13} />
    <Vignette uid={uid} />
  </>
);

const settlement: Scene = (uid, accent) => {
  const houses: [string, number][] = [
    ["M38 80 C38 70 54 70 54 80 Z", 0.3],
    ["M56 80 L56 66 L76 66 L76 80 Z", 0.9],
    ["M78 80 L78 60 L100 60 L100 80 Z", 1.5],
    ["M102 80 C102 68 120 68 120 80 Z", 2.1],
    ["M120 80 L120 70 L134 70 L134 80 Z", 2.6],
  ];
  const windows: [number, number][] = [[45, 76], [63, 71], [70, 71], [86, 66], [93, 70], [110, 75], [126, 74]];
  return (
    <>
      <Backdrop uid={uid} accent={accent} gx={90} gy={78} strength={0.5} top="#0a0a1a" bottom="#2a1a14" />
      {Array.from({ length: 14 }, (_, i) => (
        <circle key={i} className="ms-twinkle" cx={rnd(i, 141) * 160} cy={rnd(i, 142) * 40} r={0.3 + rnd(i, 143) * 0.4} fill="#fff" style={v({ animationDelay: `${-rnd(i, 144) * 3}s` })} />
      ))}
      <path d="M0 66 C40 60 80 64 120 58 C140 56 150 60 160 58 L160 100 L0 100 Z" fill="#141019" />
      <Ground y={80} color="#17110c" edge="#2c2016" />
      <g transform="translate(86 80) scale(1.25) translate(-86 -80)">
      {houses.map(([d, delay], i) => (
        <path key={i} className="ms-house" d={d} fill="#3a281a" stroke="#b08458" strokeWidth="0.5" style={v({ animationDelay: `${delay}s` })} />
      ))}
      {windows.map(([x, y], i) => (
        <rect key={i} className="ms-window" x={x} y={y} width="2.6" height="2.6" fill="#ffc46e" style={v({ animationDelay: `${1 + i * 0.35}s` })} />
      ))}
      </g>
      <Flames uid={uid} x={80} y={88} s={0.22} sparks={4} />
      <Smoke uid={uid} x={80} y={80} n={6} color="#8f8a94" spread={14} />
      <Vignette uid={uid} />
    </>
  );
};

const metal: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gy={66} strength={0.65} />
    <defs>
      <linearGradient id={`${uid}-molten`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffe6a3" />
        <stop offset="0.5" stopColor="#ff9a3c" />
        <stop offset="1" stopColor="#d4501c" />
      </linearGradient>
    </defs>
    <Ground y={84} />
    {/* Mould on the ground fills and cools */}
    <rect x="96" y="78" width="30" height="6" rx="1" fill="#2b2420" stroke="#4d4038" strokeWidth="0.5" />
    <rect className="ms-ingot" x="98" y="79" width="26" height="4" rx="0.8" fill={`url(#${uid}-molten)`} />
    <path className="ms-pour" pathLength={1} d="M86 50 C92 56 100 66 104 79" stroke="#ffb35a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    {/* Crucible over coals, tilting to pour */}
    <Flames uid={uid} x={66} y={86} s={0.45} sparks={10} />
    <g className="ms-tilt">
      <path d="M50 44 L84 44 L80 62 L54 62 Z" fill="#3a302a" stroke="#6b5a4c" strokeWidth="0.6" />
      <path className="ms-molten" d="M53 46 L81 46 L80 50 L54 50 Z" fill={`url(#${uid}-molten)`} />
      <path d="M84 44 L89 41" stroke="#6b5a4c" strokeWidth="1.4" strokeLinecap="round" />
    </g>
    <Motes n={6} color="#ffc27a" seed={14} />
    <Vignette uid={uid} />
  </>
);

/** Wedge positions; the stylus visits each in turn (keyframes generated in sceneStyles). */
export const WRITING_WEDGES: [number, number][] = [
  [62, 34], [74, 34], [86, 34], [62, 46], [74, 46], [90, 46], [62, 58], [78, 58],
];

const writing: Scene = (uid, accent) => (
  <>
    <Backdrop uid={uid} accent={accent} gx={50} gy={30} strength={0.4} />
    <defs>
      <linearGradient id={`${uid}-clay`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#c9a87c" />
        <stop offset="1" stopColor="#7a5c3c" />
      </linearGradient>
    </defs>
    <rect x="54" y="24" width="56" height="58" rx="7" fill="#000" opacity={0.5} filter={`url(#${uid}-blur)`} transform="translate(3 4)" />
    <rect x="52" y="22" width="56" height="58" rx="7" fill={`url(#${uid}-clay)`} stroke="#e8d3a6" strokeOpacity={0.5} strokeWidth="0.6" />
    <path d="M56 40 L104 40 M56 52 L104 52 M56 64 L104 64" stroke="#5a4028" strokeOpacity={0.4} strokeWidth="0.4" />
    {WRITING_WEDGES.map(([x, y], i) => (
      <g key={i} className="ms-wedge" style={v({ animationDelay: `${0.5 + i * 0.75}s` })}>
        <path d={`M${x} ${y} L${x + 7} ${y - 2.6} L${x + 7} ${y + 2.6} Z`} fill="#4a3220" />
        <path d={`M${x} ${y} L${x + 7} ${y - 2.6}`} stroke="#f2dfb8" strokeWidth="0.4" opacity={0.6} />
      </g>
    ))}
    <g className="ms-stylus">
      <path d="M0 0 L22 -18" stroke="#a88b5a" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M0 0 L3 -0.8 L1.4 -3 Z" fill="#d9c49a" />
    </g>
    <Motes n={8} seed={15} />
    <Vignette uid={uid} />
  </>
);

const SCENES: Record<SceneName, Scene> = {
  "stone-tool": stoneTool,
  handaxe,
  fire,
  cooking,
  ornament,
  spear,
  engraving,
  "cave-art": caveArt,
  voice,
  needle,
  boat,
  pottery,
  animal,
  herd,
  sprout,
  wine,
  settlement,
  metal,
  writing,
};

export function MilestoneScene({
  icon,
  variant = "hero",
  animate = true,
  className,
  label,
}: {
  icon: SceneName;
  variant?: "hero" | "thumb" | "marker";
  animate?: boolean;
  className?: string;
  /** Accessible description; scenes are decorative by default. */
  label?: string;
}) {
  const uid = `ms${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const accent = milestoneAccent(icon);
  return (
    <span
      className={`ms ms--${variant} ${className ?? ""}`}
      data-animate={animate}
      data-scene={icon}
      style={v({ "--ms-accent": accent })}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* React 19 hoists and de-duplicates this by href (one copy for all scenes). */}
      <style href="milestone-scenes" precedence="medium">
        {SCENE_CSS}
      </style>
      <svg viewBox="0 0 160 100" preserveAspectRatio={variant === "hero" ? "xMidYMid meet" : "xMidYMid slice"}>
        {SCENES[icon](uid, accent)}
      </svg>
    </span>
  );
}
