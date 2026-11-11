/**
 * Constants shared by the GLSL particle shaders, their CPU mirror and the
 * time engine's route-status logic. Keep them here so all three agree.
 *
 * "Progress" values below are fractions of a route's window
 * (0 = startYear, 1 = endYear).
 */
export const PARTICLE_CONSTANTS = {
  /** Portion of travel over which the origin scatter morphs into corridor formation. */
  formIn: 0.15,
  /** Extra travel progress used to settle into the dispersal target. */
  settle: 0.45,
  /** Globe-relative altitude of particles: ~6 km, clear of the surface, never "floating". */
  radius: 1.001,
  /** Historical mode: a route becomes visible (gathering) at this progress… */
  visibleFrom: -0.05,
  /** …stays fully visible until here (arrival + settling)… */
  holdUntil: 1.3,
  /** …and has faded out completely by here. */
  hiddenAfter: 1.45,
  /** Overview mode: loop progress range [start, end] covering gather → travel → settle → hold. */
  overviewRange: [-0.03, 1.32] as const,
  /**
   * Overview choreography: seconds after start at which every route should be
   * mid-journey (roughly when the intro camera flight lands).
   */
  overviewCueSeconds: 6,
  /** Target on-ground length of a motion streak, km. Converted per route to a time lag. */
  trailKm: 95,
} as const;
