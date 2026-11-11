# The Human Journey: Cinematic 3D Migration Explorer

An interactive 3D explorer of the dispersal of *Homo sapiens*, from ~300,000 years ago to the present.
It shows six illustrative migration routes, each in its own colour.

**See the migration waves → select a route → discover its story → explore a historical year.**

- **Overview** (default): every route loops at once as a visual summary. It does not claim the waves happened at the same time.
- **Historical**: pick a year on the timeline. Only routes active at that moment are shown, at exactly their computed positions.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production
npm run verify     # numerical checks of the particle engine (determinism, surface, arrival)
```

URL parameters: `?year=-45000` opens historical mode at that moment (signed years: negative = years before present) · `?route=levant-europe` opens a route · `?quality=low|medium|high` overrides device detection · `?scale=1.7` overrides the particle multiplier (≈80k at 1.7).
Keyboard: `Space` play/pause · `←/→` scrub (`Shift` for larger steps) · `Esc` closes the route panel.
Leva dev controls appear in development only.

## Opening sequence

A real-time cinematic opening (~9 s, then the title hands over to the interface), played in the live scene:

1. **Emergence (0–3 s):** black, then a back-lit crescent of atmosphere ignites; the camera approaches as the planet turns into the light.
2. **The origin (3–4.6 s):** the camera settles on East Africa and a warm light rises over the terrain.
3. **Awakening (4.3–6.8 s):** an amber stream bursts out of Africa; the other routes awaken in turn, each from its own origin.
4. **Reveal (5–9 s):** the camera pulls back to the whole planet with every stream alive; "The Human Journey · 300,000 years. One species."

Controls:
- Skip with any key, a click, or the *Skip intro* button.
- Replay with the *Intro* button next to the title.
- `prefers-reduced-motion` and deep links (`?year=`, `?route=`) start directly in the interactive state.

Code layout:
- **Choreography data:** `src/config/intro.ts`.
- **Director** (one GSAP timeline in the R3F scene): `src/components/intro/IntroSequence.tsx`.
- **Title and skip:** `src/components/intro/IntroOverlay.tsx`.
- **How the streams awaken:** the particle shader reads a shared *story clock*. Each route bursts out of its origin at its scheduled time; a smooth time warp makes the first loop surge and then settle to normal speed; an *emphasis* uniform adds extra glow during the climax. None of this adds per-frame CPU work.

## Architecture

```
src/
  types/migration.ts            Domain types (MigrationRoute, ParticleConfig, EvidenceItem, ArchaeologicalSite, HistoricalPeriod)
  config/routeColors.ts         THE route colour palette (single source)
  config/camera.ts              Overview / intro camera framings
  data/                         JSON datasets; index.ts validates routes and attaches colours and time bounds
  engine/                       Framework-free logic (no React)
    geo/coordinates.ts          latLngToVector3, vector3ToLatLng, offsetLatLngKm, haversineKm
    geo/greatCircle.ts          sphericalInterpolation (SLERP), greatCircleInterpolate, buildSphericalPath
    geo/greatCircle.ts          …plus buildTimedPath (samples evenly in time, so waypoint years set pacing)
    particles/clusterGenerator  Routes → GPU buffers + path texture (deterministic, seeded)
    particles/particleSimulation CPU mirror of the shader: camera follow, route picking, tests
    particles/constants.ts      Values shared by the shader, its mirror and the time engine
    timeline/timeEngine.ts      Non-linear timeline mapping, route status, playback rate
    quality.ts                  Adaptive quality tiers
  stores/useHistoryStore.ts     Zustand: mode, yearsBP, playback, selected route, camera requests
  components/globe/             R3F scene (Earth, atmosphere, particles, route picker, route path, sites, camera)
  components/timeline/          Timeline, playback + Overview control, period bands, route lanes, site ticks
  components/information/       Date header, route legend, route panel
```

**In historical mode, time is the single source of truth.** `yearsBP` lives in the store and only `PlaybackDriver` advances it.
Jumping to a year gives exactly the same frame as playing or scrubbing to it.

**Particles** are one `THREE.Points` draw call, built once. Each travelling group's path is baked into a row of a float `DataTexture`.
The vertex shader computes position from a progress value plus static per-particle attributes: timing, lane, split sub-group, origin scatter and landing point.
Progress is `f(uYearBP)` in historical mode and a looping clock in overview.
Mode, year and selection are all uniforms, so changing them never rebuilds geometry.

**Three render layers share one position function** (`ParticleShader.ts`):

| Layer | Primitive | What it is |
|---|---|---|
| Core | `Points`, every particle (~47k on high) | Crisp dots. Each route corridor mixes a dense bright centre with a sparse dimmer fringe. |
| Trails | `LineSegments`, ~35% of particles | Head-to-tail streaks. The tail is the same particle ~95 km earlier on its path, so a streak always points along the direction of travel. |
| Glow | `Points`, ~6% of particles via an index into the core buffers | Soft sprites sized in kilometres. Where they overlap they form a coloured haze whose strength follows stream density. |

**Zoom adaptation.** Dot size attenuates more gently than true perspective and never drops below ~1.6 device px. When zoomed out, glow strengthens and streaks fade; when zoomed in, streaks and fine detail come forward. A level-of-detail rank (`uDensity`) also lets the performance monitor thin particles at runtime without rebuilding anything.

**Branches.** Where the literature discusses an alternative route, a share of a route's particles follow a separate branch path: Sahul (northern route via Sulawesi) and the Americas (interior route).

**Adding a route** means adding an entry to `src/data/migrations.json` and a colour to `src/config/routeColors.ts`. No engine changes are needed.

## Data honesty

Route geometry, cluster origins and wave timing are **illustrative** and are labelled that way in the UI.
Fossil-site dates and the cited literature are the evidence layer. Review them with a domain specialist before publishing.

Earth textures: three.js example assets (NASA Blue Marble / Black Marble derived).
