/**
 * Rough device-tier detection for adaptive quality. Runs client-side only.
 * Runtime frame-rate monitoring (PerformanceMonitor) refines DPR further.
 */
export interface QualityProfile {
  tier: "low" | "medium" | "high";
  /** Multiplier on each route's nominal particle count. */
  particleScale: number;
  /** Fraction of particles drawing motion streaks. */
  trailShare: number;
  /** Fraction of particles drawing glow sprites. */
  glowShare: number;
  dpr: [number, number];
  multisampling: number;
}

export function detectQuality(): QualityProfile {
  if (typeof window === "undefined") return PROFILES.medium;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  const params = new URLSearchParams(window.location.search);
  const forced = params.get("quality");
  const profile =
    forced === "low" || forced === "medium" || forced === "high"
      ? PROFILES[forced]
      : mobile || cores <= 4 || memory <= 4
        ? PROFILES.low
        : cores <= 8
          ? PROFILES.medium
          : PROFILES.high;
  // ?scale=1.7 overrides the particle multiplier (benchmarking / tuning).
  const scale = Number(params.get("scale"));
  return Number.isFinite(scale) && scale > 0 ? { ...profile, particleScale: Math.min(4, scale) } : profile;
}

const PROFILES: Record<QualityProfile["tier"], QualityProfile> = {
  // ~47k particles at high; glow sprites are kept sparse because they are fill-rate heavy.
  low: { tier: "low", particleScale: 0.3, trailShare: 0.2, glowShare: 0.1, dpr: [1, 1.25], multisampling: 0 },
  medium: { tier: "medium", particleScale: 0.6, trailShare: 0.3, glowShare: 0.08, dpr: [1, 1.75], multisampling: 0 },
  high: { tier: "high", particleScale: 1, trailShare: 0.35, glowShare: 0.06, dpr: [1, 2], multisampling: 0 },
};
