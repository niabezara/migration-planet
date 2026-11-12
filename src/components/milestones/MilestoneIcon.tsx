"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import type { MilestoneIcon as IconName } from "@/types/migration";

/**
 * Custom animated line icons for historical milestones.
 *
 * Pure SVG + CSS keyframes (globals.css, `mi-` prefix): no canvas, no extra
 * WebGL cost. Icons are drawn in a warm ivory line with one accent colour.
 * Animation runs only when `animate` is true (featured or hovered), and never
 * under prefers-reduced-motion.
 */

const ACCENT: Record<IconName, string> = {
  "stone-tool": "#d9c8a8",
  handaxe: "#d9c8a8",
  fire: "#ff9a4a",
  cooking: "#ffb36b",
  ornament: "#f0c6a0",
  spear: "#d8b98a",
  engraving: "#e0884f",
  "cave-art": "#d9603b",
  voice: "#9fc7e8",
  needle: "#8fd0c4",
  boat: "#8cc4ff",
  pottery: "#d8925f",
  animal: "#e6c58f",
  herd: "#e2c27e",
  sprout: "#9fd27e",
  wine: "#b05aa8",
  settlement: "#ffd08a",
  metal: "#ff8a3d",
  writing: "#e8d3a6",
};

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const ICONS: Record<IconName, ReactNode | ((uid: string) => ReactNode)> = {
  // A knapped flake turning slowly, a sheen sweeping across its facets.
  "stone-tool": (
    <Svg>
      <g className="mi-turn">
        <path d="M14 34 L19 13 L31 11 L36 22 L30 36 Z" fill="var(--mi-accent)" fillOpacity={0.12} />
        <path d="M19 13 L24 24 L14 34 M24 24 L31 11 M24 24 L36 22 M24 24 L30 36" strokeOpacity={0.55} />
        <path className="mi-sheen" d="M17 20 L29 14" stroke="#fff" strokeWidth={2.2} strokeOpacity={0.6} />
      </g>
    </Svg>
  ),
  handaxe: (
    <Svg>
      <g className="mi-turn">
        <path d="M24 8 C31 14 34 24 31 33 C29 39 19 39 17 33 C14 24 17 14 24 8 Z" fill="var(--mi-accent)" fillOpacity={0.12} />
        <path d="M24 8 L22 18 L27 25 L23 32 M22 18 L18 25 M27 25 L31 30" strokeOpacity={0.5} />
        <path className="mi-sheen" d="M20 16 L28 12" stroke="#fff" strokeWidth={2.2} strokeOpacity={0.6} />
      </g>
    </Svg>
  ),
  // Layered flames flickering at different rates; sparks drifting up.
  fire: (
    <Svg>
      <path d="M15 40 L33 40 M18 37 L30 37" strokeOpacity={0.5} />
      <path className="mi-flame mi-flame--a" d="M24 36 C16 33 16 24 22 18 C22 23 25 24 25 24 C25 18 28 14 28 10 C34 17 34 30 24 36 Z" fill="var(--mi-accent)" fillOpacity={0.35} stroke="var(--mi-accent)" />
      <path className="mi-flame mi-flame--b" d="M24 36 C20 34 20 29 23 26 C23 29 25 29 25 29 C26 26 27 24 27 22 C30 26 30 33 24 36 Z" fill="#ffe2a8" fillOpacity={0.8} stroke="none" />
      <circle className="mi-spark mi-spark--1" cx={20} cy={16} r={0.9} fill="#ffd18a" stroke="none" />
      <circle className="mi-spark mi-spark--2" cx={29} cy={12} r={0.8} fill="#ffd18a" stroke="none" />
      <circle className="mi-spark mi-spark--3" cx={25} cy={9} r={0.7} fill="#ffd18a" stroke="none" />
    </Svg>
  ),
  // A fish above glowing embers; heat shimmers rising.
  cooking: (
    <Svg>
      <path d="M12 23 C17 17 27 17 32 23 C27 29 17 29 12 23 Z M32 23 L38 18 L37 23 L38 28 Z" fill="var(--mi-accent)" fillOpacity={0.12} />
      <circle cx={17} cy={22} r={0.9} fill="currentColor" stroke="none" />
      <path className="mi-wave mi-wave--1" d="M18 33 C17 31 19 30 18 28" stroke="var(--mi-accent)" strokeOpacity={0.7} />
      <path className="mi-wave mi-wave--2" d="M24 33 C23 31 25 30 24 28" stroke="var(--mi-accent)" strokeOpacity={0.7} />
      <path className="mi-wave mi-wave--3" d="M30 33 C29 31 31 30 30 28" stroke="var(--mi-accent)" strokeOpacity={0.7} />
      <path className="mi-glow" d="M12 38 C16 35 20 37 24 35 C28 37 32 35 36 38 Z" fill="var(--mi-accent)" fillOpacity={0.6} stroke="var(--mi-accent)" />
    </Svg>
  ),
  // Perforated shell beads on a cord, swaying gently.
  ornament: (
    <Svg>
      <path d="M8 12 C14 30 34 30 40 12" strokeOpacity={0.5} />
      <g className="mi-bob">
        {[[14, 23], [20, 26.5], [28, 26.5], [34, 23]].map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x - 3} ${y} C${x - 3} ${y - 4} ${x + 3} ${y - 4} ${x + 3} ${y} C${x + 3} ${y + 4.5} ${x - 3} ${y + 4.5} ${x - 3} ${y} Z`} fill="var(--mi-accent)" fillOpacity={0.3} stroke="var(--mi-accent)" />
            <circle cx={x} cy={y - 0.6} r={0.9} fill="#0b0f18" stroke="none" />
          </g>
        ))}
        <path className="mi-sheen" d="M26 24 L30 22" stroke="#fff" strokeWidth={1.6} strokeOpacity={0.7} />
      </g>
    </Svg>
  ),
  spear: (
    <Svg>
      <path className="mi-draw" pathLength={1} d="M10 40 L36 12" />
      <path className="mi-draw mi-draw--late" pathLength={1} d="M36 12 L39 7 L33 10 Z" fill="var(--mi-accent)" fillOpacity={0.35} />
      <path d="M8 42 L40 42" strokeOpacity={0.25} />
    </Svg>
  ),
  // Cross-hatched lines appearing stroke by stroke on an ochre piece.
  engraving: (
    <Svg>
      <path d="M9 30 L14 16 L38 13 L40 27 L31 35 L13 36 Z" fill="var(--mi-accent)" fillOpacity={0.16} strokeOpacity={0.6} />
      {["M15 22 L37 19", "M14 28 L37 25", "M17 18 L22 33", "M24 17 L29 32", "M31 16 L35 30", "M16 32 L36 18"].map((d, i) => (
        <path key={d} className="mi-draw" pathLength={1} d={d} stroke="var(--mi-accent)" style={{ animationDelay: `${i * 0.35}s` }} />
      ))}
    </Svg>
  ),
  // A hand stencil emerging on rock as if pigment were blown around it.
  "cave-art": (
    <Svg>
      <rect x={6} y={6} width={36} height={36} rx={6} strokeOpacity={0.18} />
      <g className="mi-spray">
        <path
          d="M19 38 L18 27 L14 21 C13 19 15 18 16 19.5 L19 23 L19 11 C19 9 21.6 9 21.6 11 L22 20 L22.5 9 C22.6 7 25.3 7 25.3 9 L25.4 20 L26.6 10.5 C26.9 8.6 29.4 9 29.2 11 L28.5 21 L30.8 14 C31.4 12.2 33.7 13 33.2 14.9 L31 26 C30.5 31 29 34 28 38 Z"
          fill="var(--mi-accent)"
          fillOpacity={0.45}
          stroke="var(--mi-accent)"
        />
      </g>
    </Svg>
  ),
  // Soft arcs radiating from a point: capacity for speech (uncertain).
  voice: (
    <Svg>
      <circle cx={14} cy={24} r={2.2} fill="var(--mi-accent)" stroke="none" />
      <path className="mi-wave mi-wave--1" d="M20 17 C24 21 24 27 20 31" stroke="var(--mi-accent)" />
      <path className="mi-wave mi-wave--2" d="M26 12 C33 19 33 29 26 36" stroke="var(--mi-accent)" />
      <path className="mi-wave mi-wave--3" d="M32 8 C42 17 42 31 32 40" stroke="var(--mi-accent)" />
    </Svg>
  ),
  // A thread being drawn through fibres.
  needle: (
    <Svg>
      <path d="M12 38 L35 11" strokeWidth={1.8} />
      <ellipse cx={34} cy={12.2} rx={1.2} ry={2.4} transform="rotate(40 34 12.2)" />
      <path className="mi-draw" pathLength={1} d="M34 12 C40 20 22 22 26 30 C29 36 40 32 40 40" stroke="var(--mi-accent)" />
    </Svg>
  ),
  // A small boat riding gentle swell.
  boat: (
    <Svg>
      <g className="mi-bob">
        <path d="M12 29 L36 29 L32 35 L16 35 Z" fill="var(--mi-accent)" fillOpacity={0.18} />
        <path d="M24 29 L24 12 L33 26 Z" fill="var(--mi-accent)" fillOpacity={0.12} strokeOpacity={0.8} />
      </g>
      <g className="mi-swell">
        <path d="M-8 38 Q-2 35 4 38 T16 38 T28 38 T40 38 T52 38 T64 38" stroke="var(--mi-accent)" strokeOpacity={0.8} />
        <path d="M-14 42 Q-8 39 -2 42 T10 42 T22 42 T34 42 T46 42 T58 42" stroke="var(--mi-accent)" strokeOpacity={0.4} />
      </g>
    </Svg>
  ),
  // A vessel turning on its axis (decoration bands slide across).
  pottery: (uid) => (
    <Svg>
      <defs>
        <clipPath id={`${uid}-pot`}>
          <path d="M18 10 L30 10 L29 14 C36 18 37 30 31 37 L17 37 C11 30 12 18 19 14 Z" />
        </clipPath>
      </defs>
      <path d="M18 10 L30 10 L29 14 C36 18 37 30 31 37 L17 37 C11 30 12 18 19 14 Z" fill="var(--mi-accent)" fillOpacity={0.16} />
      <g clipPath={`url(#${uid}-pot)`}>
        <g className="mi-spin-bands" stroke="var(--mi-accent)" strokeOpacity={0.75}>
          {[-6, 2, 10, 18, 26, 34, 42, 50].map((x) => (
            <path key={x} d={`M${x} 20 L${x + 4} 27 L${x + 8} 20`} />
          ))}
        </g>
      </g>
      <path d="M14 40 L34 40" strokeOpacity={0.3} />
    </Svg>
  ),
  // A paw print warming into view.
  animal: (
    <Svg>
      <g className="mi-glow" fill="var(--mi-accent)" fillOpacity={0.35} stroke="var(--mi-accent)">
        <path d="M24 26 C19 26 15 31 16 34 C17 37 21 35 24 35 C27 35 31 37 32 34 C33 31 29 26 24 26 Z" />
        <ellipse cx={15} cy={21} rx={2.6} ry={3.4} />
        <ellipse cx={20.5} cy={15.5} rx={2.6} ry={3.6} />
        <ellipse cx={27.5} cy={15.5} rx={2.6} ry={3.6} />
        <ellipse cx={33} cy={21} rx={2.6} ry={3.4} />
      </g>
    </Svg>
  ),
  herd: (
    <Svg>
      <path d="M10 34 C16 26 30 26 34 30 L38 26 L40 30 L36 34 L34 40 L32 40 L31 35 L18 35 L17 40 L15 40 L14 35 C11 35 10 35 10 34 Z" fill="var(--mi-accent)" fillOpacity={0.35} stroke="var(--mi-accent)" />
    </Svg>
  ),
  // A seed sprouting: the stem grows, leaves unfold.
  sprout: (
    <Svg>
      <path d="M10 40 L38 40" strokeOpacity={0.4} />
      <ellipse cx={24} cy={40} rx={3} ry={1.6} fill="var(--mi-accent)" fillOpacity={0.3} strokeOpacity={0.6} />
      <path className="mi-grow-stem" pathLength={1} d="M24 39 C24 31 23 24 24 14" stroke="var(--mi-accent)" />
      <path className="mi-leaf mi-leaf--l" d="M24 27 C18 27 15 23 15 19 C20 19 23 22 24 27 Z" fill="var(--mi-accent)" fillOpacity={0.3} stroke="var(--mi-accent)" />
      <path className="mi-leaf mi-leaf--r" d="M24 21 C29 21 33 17 33 13 C28 13 25 16 24 21 Z" fill="var(--mi-accent)" fillOpacity={0.3} stroke="var(--mi-accent)" />
    </Svg>
  ),
  // Grapes appear one by one; a qvevri outline warms; wine moves inside it.
  wine: (uid) => (
    <Svg>
      <defs>
        <clipPath id={`${uid}-qvevri`}>
          <path d="M28 14 L38 14 C43 20 43 32 33 41 C23 32 23 20 28 14 Z" />
        </clipPath>
      </defs>
      <path className="mi-glow" d="M28 14 L38 14 C43 20 43 32 33 41 C23 32 23 20 28 14 Z" stroke="var(--mi-accent)" fill="var(--mi-accent)" fillOpacity={0.08} />
      <g clipPath={`url(#${uid}-qvevri)`}>
        <path className="mi-liquid" d="M14 27 Q18 25 22 27 T30 27 T38 27 T46 27 T54 27 L54 48 L14 48 Z" fill="var(--mi-accent)" fillOpacity={0.55} stroke="none" />
      </g>
      <path d="M12 9 C13 12 14 13 15 14" strokeOpacity={0.6} />
      {[
        [11, 17], [16, 17], [13.5, 21], [8.5, 21], [18.5, 21], [11, 25], [16, 25], [13.5, 29],
      ].map(([cx, cy], i) => (
        <circle key={i} className="mi-grape" cx={cx} cy={cy} r={2.3} fill="var(--mi-accent)" fillOpacity={0.4} stroke="var(--mi-accent)" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </Svg>
  ),
  // Mud-brick houses; windows light one after another.
  settlement: (
    <Svg>
      <path d="M8 38 L8 26 L17 26 L17 20 L28 20 L28 24 L40 24 L40 38 Z" fill="var(--mi-accent)" fillOpacity={0.08} />
      <path d="M17 26 L17 38 M28 24 L28 38" strokeOpacity={0.45} />
      {[[11, 30], [20, 24], [24, 29], [32, 28], [36, 32]].map(([x, y], i) => (
        <rect key={i} className="mi-window" x={x} y={y} width={2.6} height={2.6} fill="var(--mi-accent)" stroke="none" style={{ animationDelay: `${i * 0.5}s` }} />
      ))}
      <path d="M6 40 L42 40" strokeOpacity={0.3} />
    </Svg>
  ),
  // A crucible with molten copper glowing; a drop forms and falls.
  metal: (
    <Svg>
      <path d="M14 20 L34 20 L31 33 L17 33 Z" fill="var(--mi-accent)" fillOpacity={0.1} />
      <path className="mi-glow" d="M16 22 L32 22 L31 26 L17 26 Z" fill="var(--mi-accent)" stroke="none" />
      <path d="M31 21 L37 18" />
      <circle className="mi-drip" cx={37.5} cy={20} r={1.4} fill="var(--mi-accent)" stroke="none" />
      <path d="M12 38 L36 38" strokeOpacity={0.3} />
    </Svg>
  ),
  // Wedge-shaped signs pressed into a clay tablet one by one.
  writing: (
    <Svg>
      <rect x={10} y={8} width={28} height={32} rx={4} fill="var(--mi-accent)" fillOpacity={0.1} />
      {[
        [15, 15], [22, 15], [29, 15], [15, 23], [22, 23], [15, 31], [24, 31], [30, 27],
      ].map(([x, y], i) => (
        <path key={i} className="mi-wedge" d={`M${x} ${y} L${x + 4} ${y - 1.8} L${x + 4} ${y + 1.8} Z`} fill="var(--mi-accent)" fillOpacity={0.7} stroke="none" style={{ animationDelay: `${i * 0.3}s` }} />
      ))}
    </Svg>
  ),
};

export function MilestoneIcon({
  icon,
  size = 40,
  animate = true,
  className,
}: {
  icon: IconName;
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const node = ICONS[icon];
  return (
    <span
      className={`mi ${className ?? ""}`}
      data-animate={animate}
      data-icon={icon}
      style={{ width: size, height: size, ["--mi-accent" as string]: ACCENT[icon] } as CSSProperties}
    >
      {typeof node === "function" ? node(uid) : node}
    </span>
  );
}

export const milestoneAccent = (icon: IconName) => ACCENT[icon];
