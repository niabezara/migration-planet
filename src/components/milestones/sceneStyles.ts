/**
 * Keyframes and layout for the milestone scenes (MilestoneScene.tsx).
 *
 * Shipped as a React-hoisted <style> (deduplicated by href) so the scenes are
 * self-contained. Conventions:
 *   - Base styles are the composed final frame: with animations off
 *     (data-animate="false" or prefers-reduced-motion) every scene is a
 *     complete still illustration.
 *   - `animation-fill-mode: both`, so staggered layers start hidden and build up.
 *   - Elements that carry an SVG transform attribute are never transform-
 *     animated themselves (a wrapper group is animated instead).
 */

/** Must match WRITING_WEDGES in MilestoneScene.tsx. */
const WEDGES: [number, number][] = [
  [62, 34], [74, 34], [86, 34], [62, 46], [74, 46], [90, 46], [62, 58], [78, 58],
];
const WRITING_CYCLE = 8;

function stylusKeyframes() {
  const frames: string[] = ["0% { transform: translate(112px, 16px); opacity: 0; }", "4% { opacity: 1; }"];
  WEDGES.forEach(([x, y], i) => {
    const p = ((0.5 + i * 0.75) / WRITING_CYCLE) * 100;
    frames.push(`${(p - 3.5).toFixed(2)}% { transform: translate(${x + 3}px, ${y - 5}px); opacity: 1; }`);
    frames.push(`${p.toFixed(2)}% { transform: translate(${x + 3}px, ${y}px); }`);
  });
  frames.push("86% { transform: translate(112px, 16px); opacity: 1; }", "94%, 100% { transform: translate(112px, 16px); opacity: 0; }");
  return `@keyframes ms-stylus { ${frames.join(" ")} }`;
}

export const SCENE_CSS = `
.ms { display: block; position: relative; overflow: hidden; flex-shrink: 0; isolation: isolate; background: #06080d; }
.ms svg { display: block; width: 100%; height: 100%; }
/* Only animated layers get a fill-box origin: SVG transform attributes elsewhere keep their default 0 0 pivot. */
.ms [class*="ms-"] { transform-box: fill-box; transform-origin: center; animation-fill-mode: both; }
.ms .ms-cycle, .ms .ms-paw { transform-box: view-box; transform-origin: 0 0; }
.ms--hero {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 14px;
  border: 1px solid rgb(255 255 255 / 0.08);
  box-shadow: 0 18px 40px -18px color-mix(in srgb, var(--ms-accent) 45%, transparent), inset 0 0 0 1px rgb(0 0 0 / 0.4);
}
.ms--thumb { width: 72px; height: 72px; border-radius: 14px; border: 1px solid rgb(255 255 255 / 0.08); }
.ms--marker { width: 84px; height: 84px; border-radius: 16px; border: 1px solid color-mix(in srgb, var(--ms-accent) 45%, transparent); box-shadow: 0 0 28px color-mix(in srgb, var(--ms-accent) 35%, transparent); }
@media (max-width: 640px) {
  .ms--thumb { width: 60px; height: 60px; border-radius: 12px; }
  .ms--marker { width: 68px; height: 68px; }
}

/* Panel list rows: room for the larger thumbnails. */
.milestone-timeline .milestone-row__icon { width: 72px; height: 72px; margin-top: 0; border-radius: 14px; background: none; border: none; }
.milestone-timeline::before { left: 42px !important; }
.milestone-timeline .milestone-row__head { gap: 14px; align-items: center; }
@media (max-width: 640px) {
  .milestone-timeline .milestone-row__icon { width: 60px; height: 60px; }
  .milestone-timeline::before { left: 36px !important; }
}

/* Globe marker card */
.ms-marker-card { display: flex; flex-direction: column; align-items: center; gap: 6px; transform: translateY(-62px); transition: opacity 0.2s linear; }
.ms-marker-card__label {
  padding: 3px 10px; border-radius: 999px; white-space: nowrap; font-size: 11.5px; color: rgb(255 255 255 / 0.88);
  background: rgb(6 9 16 / 0.75); border: 1px solid color-mix(in srgb, var(--ms-accent) 35%, transparent); backdrop-filter: blur(8px);
}
.ms-marker-card__stem { width: 1px; height: 14px; background: linear-gradient(var(--ms-accent), transparent); opacity: 0.8; }

/* ---------------- Shared atmosphere ---------------- */
.ms-breath { animation: ms-breath 6s ease-in-out infinite; }
@keyframes ms-breath { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }
.ms-mote { opacity: 0.45; animation: ms-mote 9s linear infinite; }
@keyframes ms-mote { 0% { transform: translate(0, 4px); opacity: 0; } 20% { opacity: 0.8; } 80% { opacity: 0.6; } 100% { transform: translate(5px, -16px); opacity: 0; } }
.ms-twinkle { animation: ms-twinkle 3s ease-in-out infinite; }
@keyframes ms-twinkle { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }

/* ---------------- Fire ---------------- */
.ms-flame { transform-origin: 50% 100%; }
.ms-flame--a { animation: ms-flick 1.7s ease-in-out infinite; }
.ms-flame--b { animation: ms-flick 1.15s ease-in-out infinite reverse; }
.ms-flame--c { animation: ms-flick 0.8s ease-in-out infinite; }
.ms-flame--side { animation: ms-flick 1.3s ease-in-out infinite; animation-delay: -0.4s; }
.ms-flame--side2 { animation: ms-flick 1.5s ease-in-out infinite reverse; }
@keyframes ms-flick {
  0%, 100% { transform: scale(1, 1) skewX(0deg); }
  20% { transform: scale(0.94, 1.1) skewX(3deg); }
  45% { transform: scale(1.05, 0.92) skewX(-3deg); }
  70% { transform: scale(0.97, 1.06) skewX(2deg); }
}
.ms-halo { animation: ms-halo 2.2s ease-in-out infinite; }
@keyframes ms-halo { 0%, 100% { transform: scale(0.92); opacity: 0.75; } 50% { transform: scale(1.1); opacity: 1; } }
.ms-spark { opacity: 0.6; animation: ms-spark 2.4s ease-out infinite; }
@keyframes ms-spark { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)); opacity: 0; } }
.ms-ember { animation: ms-ember 1.6s ease-in-out infinite; }
@keyframes ms-ember { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
.ms-pool { animation: ms-pool 1.8s ease-in-out infinite; }
@keyframes ms-pool { 0%, 100% { opacity: 0.22; transform: scaleX(0.96); } 50% { opacity: 0.45; transform: scaleX(1.04); } }
.ms-smoke { opacity: 0.25; animation: ms-smoke 4.5s linear infinite; }
@keyframes ms-smoke { 0% { transform: translate(0, 0) scale(0.6); opacity: 0; } 20% { opacity: 0.5; } 100% { transform: translate(var(--dx), -36px) scale(2.4); opacity: 0; } }
.ms-shimmer { opacity: 0.35; animation: ms-shimmer 1.6s ease-in-out infinite; }
@keyframes ms-shimmer { 0% { transform: translateY(5px) scaleX(1); opacity: 0; } 50% { transform: translateY(-1px) scaleX(1.8); opacity: 0.85; } 100% { transform: translateY(-8px) scaleX(1); opacity: 0; } }
.ms-fish { animation: ms-fish 3s ease-in-out infinite; }
@keyframes ms-fish { 0%, 100% { transform: translateY(0); filter: brightness(1); } 50% { transform: translateY(-0.6px); filter: brightness(1.15) saturate(1.1); } }
.ms-sheen-line { animation: ms-ember 2.4s ease-in-out infinite; }

/* ---------------- Turning stone tools ---------------- */
.ms-beam { animation: ms-breath 4s ease-in-out infinite; }
.ms-float { animation: ms-float 4.2s ease-in-out infinite; }
@keyframes ms-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
.ms-turn { animation: ms-turn 7s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
@keyframes ms-turn { 0% { transform: scaleX(1); } 25% { transform: scaleX(0.06); } 50% { transform: scaleX(-1); } 75% { transform: scaleX(-0.06); } 100% { transform: scaleX(1); } }
.ms-turn-dark { opacity: 0; animation: ms-turn-dark 7s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
@keyframes ms-turn-dark { 0%, 100% { opacity: 0; } 25%, 75% { opacity: 0.35; } 50% { opacity: 0.5; } }
.ms-turn-shadow { animation: ms-turn-shadow 7s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
@keyframes ms-turn-shadow { 0%, 50%, 100% { transform: scaleX(1); } 25%, 75% { transform: scaleX(0.4); } }
.ms-sweep { opacity: 0.35; animation: ms-sweep 3.5s ease-in-out infinite; }
@keyframes ms-sweep { 0% { transform: translateX(-8px); opacity: 0; } 15% { opacity: 1; } 70% { opacity: 1; } 100% { transform: translateX(66px); opacity: 0; } }
.ms-chip { opacity: 0; animation: ms-chip 4s ease-out infinite; }
@keyframes ms-chip { 0% { transform: translate(0, 0) rotate(0deg); opacity: 0; } 4% { opacity: 1; } 55% { transform: translate(var(--dx), var(--dy)) rotate(220deg); opacity: 0; } 100% { opacity: 0; } }

/* ---------------- Hunting ---------------- */
.ms-grass { transform-origin: 50% 100%; animation: ms-grass 3.2s ease-in-out infinite; }
@keyframes ms-grass { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(6deg); } }
.ms-spear { transform-box: view-box; transform-origin: 0 0; transform: translate(118px, 79px) rotate(34deg); animation: ms-spear 4.2s linear infinite; }
@keyframes ms-spear {
  0% { transform: translate(-30px, 66px) rotate(-32deg); opacity: 0; }
  6% { opacity: 1; }
  40% { transform: translate(60px, 24px) rotate(-4deg); animation-timing-function: ease-in; }
  70% { transform: translate(118px, 79px) rotate(34deg); }
  73% { transform: translate(118px, 79px) rotate(29deg); }
  76% { transform: translate(118px, 79px) rotate(37deg); }
  79% { transform: translate(118px, 79px) rotate(32deg); }
  82% { transform: translate(118px, 79px) rotate(35deg); }
  93% { transform: translate(118px, 79px) rotate(34deg); opacity: 1; }
  100% { transform: translate(118px, 79px) rotate(34deg); opacity: 0; }
}
.ms-puff { opacity: 0; animation: ms-puff 4.2s ease-out infinite; }
@keyframes ms-puff { 0%, 69% { transform: scale(0.3); opacity: 0; } 72% { opacity: 0.75; } 92% { transform: scale(1.8); opacity: 0; } 100% { opacity: 0; } }

/* ---------------- Engraving ---------------- */
.ms-groove { stroke-dasharray: 1; stroke-dashoffset: 0; animation: ms-groove 7.5s ease-out infinite; }
@keyframes ms-groove { 0% { stroke-dashoffset: 1; opacity: 1; } 10% { stroke-dashoffset: 0; } 70% { opacity: 1; } 80%, 100% { stroke-dashoffset: 0; opacity: 0; } }
.ms-hot { stroke-dasharray: 1; opacity: 0; animation: ms-hot 7.5s ease-out infinite; filter: drop-shadow(0 0 1.5px #ffb070); }
@keyframes ms-hot { 0% { stroke-dashoffset: 1; opacity: 1; } 10% { stroke-dashoffset: 0; opacity: 1; } 24%, 100% { stroke-dashoffset: 0; opacity: 0; } }
.ms-dust { opacity: 0; animation: ms-dust 4.5s ease-in infinite; }
@keyframes ms-dust { 0% { transform: translateY(0); opacity: 0; } 10% { opacity: 0.9; } 40% { transform: translateY(18px); opacity: 0; } 100% { opacity: 0; } }

/* ---------------- Cave art ---------------- */
.ms-torch { animation: ms-torch 2.3s steps(1, end) infinite, ms-breath 4.6s ease-in-out infinite; }
@keyframes ms-torch { 0% { opacity: 0.85; } 17% { opacity: 1; } 31% { opacity: 0.78; } 46% { opacity: 0.95; } 62% { opacity: 0.82; } 80% { opacity: 1; } }
.ms-spray { opacity: 0.8; animation: ms-spray 9s ease-out infinite; }
@keyframes ms-spray { 0% { transform: scale(0.45); opacity: 0; } 20% { transform: scale(1); opacity: 0.8; } 88% { opacity: 0.8; } 100% { opacity: 0; } }
.ms-spatter { animation: ms-spatter 9s ease-out infinite; }
@keyframes ms-spatter { 0% { transform: scale(0); opacity: 0; } 4% { transform: scale(1); opacity: 1; } 88% { opacity: 1; } 100% { opacity: 0; } }
.ms-droplet { opacity: 0; animation: ms-droplet 9s ease-out infinite; }
@keyframes ms-droplet { 0% { transform: translate(0, 0); opacity: 0; } 2% { opacity: 1; } 12% { transform: translate(var(--dx), var(--dy)); opacity: 0; } 100% { opacity: 0; } }
.ms-paint { stroke-dasharray: 1; stroke-dashoffset: 0; animation: ms-paint 9s ease-in-out infinite; filter: drop-shadow(0 0 1px var(--ms-accent)); }
@keyframes ms-paint { 0%, 26% { stroke-dashoffset: 1; opacity: 1; } 56% { stroke-dashoffset: 0; } 88% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }

/* ---------------- Voice (speech anatomy) ---------------- */
.ms-ring { transform-box: view-box; transform-origin: 80px 50px; opacity: 0.35; animation: ms-ring 2.4s ease-out infinite; }
@keyframes ms-ring { 0% { transform: scale(0.45); opacity: 0; } 15% { opacity: 0.95; } 100% { transform: scale(1.55); opacity: 0; } }
.ms-wavepath { animation: ms-wavepath 1.6s linear infinite; }
@keyframes ms-wavepath { from { transform: translateX(0); } to { transform: translateX(-20px); } }

/* ---------------- Fibres & needle ---------------- */
.ms-fibre { transform-origin: 50% 0%; animation: ms-fibre 5s ease-in-out infinite; }
@keyframes ms-fibre { 0%, 100% { transform: rotate(-8deg) translateY(0); } 50% { transform: rotate(8deg) translateY(4px); } }
.ms-thread { stroke-dasharray: 1; stroke-dashoffset: 0; animation: ms-thread 6s linear infinite; filter: drop-shadow(0 0 1.2px #3fc7c0); }
@keyframes ms-thread { 0% { stroke-dashoffset: 1; opacity: 1; } 80% { stroke-dashoffset: 0; } 92% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }
.ms-needle { transform-box: view-box; transform-origin: 0 0; transform: translate(114px, 62px) rotate(-40deg); animation: ms-needle 6s linear infinite; }
@keyframes ms-needle {
  0% { transform: translate(30px, 62px) rotate(-50deg); opacity: 1; }
  10% { transform: translate(42px, 52px) rotate(0deg); }
  20% { transform: translate(54px, 62px) rotate(55deg); }
  30% { transform: translate(64px, 72px) rotate(0deg); }
  40% { transform: translate(74px, 62px) rotate(-55deg); }
  50% { transform: translate(84px, 52px) rotate(0deg); }
  60% { transform: translate(94px, 62px) rotate(55deg); }
  70% { transform: translate(104px, 72px) rotate(0deg); }
  80% { transform: translate(114px, 62px) rotate(-50deg); opacity: 1; }
  92%, 100% { transform: translate(122px, 54px) rotate(-50deg); opacity: 0; }
}

/* ---------------- Seafaring ---------------- */
.ms-sea--1 { animation: ms-sea40 5s linear infinite; }
.ms-sea--2 { animation: ms-sea32 6.5s linear infinite; }
.ms-sea--3 { animation: ms-sea40 11s linear infinite; }
@keyframes ms-sea40 { from { transform: translateX(0); } to { transform: translateX(40px); } }
@keyframes ms-sea32 { from { transform: translateX(0); } to { transform: translateX(32px); } }
.ms-voyage { transform-box: view-box; transform-origin: 0 0; transform: translate(80px, 61px); animation: ms-voyage 16s linear infinite; }
@keyframes ms-voyage { 0% { transform: translate(18px, 61px); opacity: 0; } 6% { opacity: 1; } 90% { transform: translate(138px, 61px); opacity: 1; } 100% { transform: translate(148px, 61px); opacity: 0; } }
.ms-bob { animation: ms-bob 2.6s ease-in-out infinite; }
@keyframes ms-bob { 0%, 100% { transform: translateY(-0.8px) rotate(-4deg); } 50% { transform: translateY(1px) rotate(4deg); } }
.ms-paddle { transform-origin: 100% 0%; animation: ms-paddle 1.4s ease-in-out infinite; }
.ms-paddle--b { animation-delay: -0.7s; }
@keyframes ms-paddle { 0%, 100% { transform: rotate(-22deg); } 50% { transform: rotate(18deg); } }
.ms-glint { animation: ms-twinkle 1.6s ease-in-out infinite; }

/* ---------------- Pottery ---------------- */
.ms-pot-spin { animation: ms-pot-spin 3.2s linear infinite; }
@keyframes ms-pot-spin { from { transform: translateX(0); } to { transform: translateX(-8px); } }

/* ---------------- Ornaments ---------------- */
.ms-string { transform-origin: 50% 0%; animation: ms-string 6s ease-in-out infinite; }
@keyframes ms-string { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
.ms-bead { animation: ms-bead 3.6s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
@keyframes ms-bead { 0%, 100% { transform: scaleX(1); filter: brightness(1.15); } 25%, 75% { transform: scaleX(0.15); } 50% { transform: scaleX(-1); filter: brightness(0.7); } }
.ms-bead-sheen { animation: ms-bead-sheen 3.6s ease-in-out infinite; }
@keyframes ms-bead-sheen { 0%, 100% { opacity: 1; } 20%, 80% { opacity: 0; } }

/* ---------------- Domestication ---------------- */
.ms-tail { transform-origin: 100% 100%; animation: ms-tail 0.7s ease-in-out infinite alternate; }
@keyframes ms-tail { from { transform: rotate(-16deg); } to { transform: rotate(16deg); } }
.ms-breathe { transform-origin: 50% 100%; animation: ms-breathe 3s ease-in-out infinite; }
@keyframes ms-breathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.025); } }
.ms-paw { animation: ms-paw 5s ease-in-out infinite; }
@keyframes ms-paw { 0% { opacity: 0; } 8% { opacity: 1; } 65% { opacity: 1; } 85%, 100% { opacity: 0; } }
.ms-graze { transform-origin: 0% 100%; animation: ms-graze 4s ease-in-out infinite; }
@keyframes ms-graze { 0%, 100% { transform: rotate(0deg); } 35%, 65% { transform: rotate(32deg); } 50% { transform: rotate(28deg); } }

/* ---------------- Agriculture ---------------- */
.ms-rays { opacity: 0.08; animation: ms-rays 5s ease-in-out infinite; }
@keyframes ms-rays { 0%, 100% { opacity: 0.05; } 50% { opacity: 0.11; } }
.ms-cycle { animation: ms-cycle 10s linear infinite; }
@keyframes ms-cycle { 0% { opacity: 0; } 3% { opacity: 1; } 94% { opacity: 1; } 100% { opacity: 0; } }
.ms-seed { animation: ms-seed 10s ease-in-out infinite; }
@keyframes ms-seed { 0% { transform: scale(0.6); filter: brightness(1.8) drop-shadow(0 0 3px #ffd27a); } 12% { transform: scale(1.1); } 30%, 100% { transform: scale(1); filter: none; } }
.ms-root { stroke-dasharray: 1; stroke-dashoffset: 0; animation: ms-root 10s ease-out infinite; }
@keyframes ms-root { 0%, 8% { stroke-dashoffset: 1; } 30%, 100% { stroke-dashoffset: 0; } }
.ms-stem { stroke-dasharray: 1; stroke-dashoffset: 0; animation: ms-stem 10s ease-out infinite; }
@keyframes ms-stem { 0%, 18% { stroke-dashoffset: 1; } 48%, 100% { stroke-dashoffset: 0; } }
.ms-leaf { animation: ms-leaf 10s ease-out infinite; }
.ms-leaf--l { transform-origin: 100% 100%; }
.ms-leaf--r { transform-origin: 0% 100%; animation-delay: 0.6s; }
@keyframes ms-leaf { 0%, 36% { transform: scale(0) rotate(-20deg); opacity: 0; } 52% { transform: scale(1.06) rotate(3deg); opacity: 0.9; } 58%, 100% { transform: scale(1) rotate(0deg); opacity: 0.9; } }
.ms-grain { animation: ms-grain 10s ease-out infinite; }
@keyframes ms-grain { 0% { transform: scale(0); opacity: 0; } 5% { transform: scale(1.2); opacity: 1; } 8%, 38% { transform: scale(1); opacity: 1; } 44%, 100% { opacity: 0; } }

/* ---------------- Wine ---------------- */
.ms-vine { stroke-dasharray: 1; stroke-dashoffset: 0; animation: ms-vine 9s ease-out infinite; }
@keyframes ms-vine { 0% { stroke-dashoffset: 1; opacity: 1; } 14% { stroke-dashoffset: 0; } 90% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }
.ms-grape { animation: ms-grape 9s ease-out infinite; }
@keyframes ms-grape { 0% { transform: scale(0); opacity: 0; } 4% { transform: scale(1.18); opacity: 1; } 7% { transform: scale(1); } 88% { opacity: 1; } 100% { opacity: 0; } }
.ms-drop { opacity: 0; animation: ms-drop 9s ease-in infinite; }
@keyframes ms-drop { 0%, 30% { transform: translate(0, 0); opacity: 0; } 32% { opacity: 1; } 38% { transform: translate(24px, -5px); } 45% { transform: translate(46px, 5px); opacity: 1; } 47%, 100% { transform: translate(46px, 5px); opacity: 0; } }
.ms-qvevri { stroke-dasharray: 1; stroke-dashoffset: 0; animation: ms-qvevri 9s ease-in-out infinite; }
@keyframes ms-qvevri {
  0%, 20% { stroke-dashoffset: 1; opacity: 1; filter: none; }
  44% { stroke-dashoffset: 0; filter: drop-shadow(0 0 0 transparent); }
  56% { filter: drop-shadow(0 0 4px #ffb27a) brightness(1.4); }
  72% { filter: drop-shadow(0 0 1.5px #ffb27a); }
  90% { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}
.ms-liquid { animation: ms-liquid 3s linear infinite; }
@keyframes ms-liquid { 0% { transform: translate(0, 0.6px); } 50% { transform: translate(-12px, -0.6px); } 100% { transform: translate(-24px, 0.6px); } }
.ms-bubble { opacity: 0; animation: ms-bubble 2.8s ease-in infinite; }
@keyframes ms-bubble { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: 0.9; } 100% { transform: translateY(-28px); opacity: 0; } }

/* ---------------- Settlements ---------------- */
.ms-house { transform-origin: 50% 100%; animation: ms-house 10s ease-out infinite; }
@keyframes ms-house { 0% { transform: translateY(8px) scaleY(0.3); opacity: 0; } 8% { transform: translateY(0) scaleY(1); opacity: 1; } 92% { opacity: 1; } 100% { opacity: 0; } }
.ms-window { animation: ms-window 10s ease-in-out infinite; filter: drop-shadow(0 0 1.5px #ffb347); }
@keyframes ms-window { 0% { opacity: 0; } 8% { opacity: 1; } 30% { opacity: 0.75; } 45% { opacity: 1; } 88% { opacity: 1; } 100% { opacity: 0; } }

/* ---------------- Metallurgy ---------------- */
.ms-tilt { transform-box: view-box; transform-origin: 84px 44px; animation: ms-tilt 8s ease-in-out infinite; }
@keyframes ms-tilt { 0%, 22% { transform: rotate(0deg); } 36%, 70% { transform: rotate(24deg); } 84%, 100% { transform: rotate(0deg); } }
.ms-pour { stroke-dasharray: 1; stroke-dashoffset: 0; opacity: 0; animation: ms-pour 8s ease-in infinite; filter: drop-shadow(0 0 2px #ff9a3c); }
@keyframes ms-pour { 0%, 34% { stroke-dashoffset: 1; opacity: 0; } 36% { opacity: 1; } 44% { stroke-dashoffset: 0; } 68% { opacity: 1; } 74%, 100% { stroke-dashoffset: 0; opacity: 0; } }
.ms-ingot { transform-origin: 0% 50%; filter: brightness(0.7) saturate(0.7); animation: ms-ingot 8s ease-in-out infinite; }
@keyframes ms-ingot { 0%, 40% { transform: scaleX(0); filter: brightness(1.4); } 70% { transform: scaleX(1); filter: brightness(1.4); } 96% { transform: scaleX(1); filter: brightness(0.6) saturate(0.6); } 100% { transform: scaleX(1); opacity: 0; } }
.ms-molten { animation: ms-molten 1.2s ease-in-out infinite; }
@keyframes ms-molten { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }

/* ---------------- Writing ---------------- */
.ms-wedge { animation: ms-wedge ${WRITING_CYCLE}s ease-out infinite; }
@keyframes ms-wedge { 0% { transform: scale(1.8); opacity: 0; } 2% { transform: scale(0.9); opacity: 1; filter: brightness(1.8); } 5% { transform: scale(1); filter: none; } 88% { opacity: 1; } 100% { opacity: 0; } }
.ms-stylus { transform-box: view-box; transform-origin: 0 0; transform: translate(112px, 16px); animation: ms-stylus ${WRITING_CYCLE}s ease-in-out infinite; }
${stylusKeyframes()}

/* ---------------- Still frames ---------------- */
.ms[data-animate="false"] * { animation: none !important; }
@media (prefers-reduced-motion: reduce) { .ms * { animation: none !important; } }
`;
