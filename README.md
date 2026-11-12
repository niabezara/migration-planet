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
    particles/populationGenerator Population clusters → static GPU buffers (organic lobes + camps, land-masked)
    population/populationModel  Cluster presence f(yearsBP), source/destination roles, departure activity
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

## Human history: species, milestones, sites

The timeline runs from **3.5 million years ago to the present** on a logarithmic scale (`timeEngine.ts`): early hominins, sapiens dispersals and the last 15,000 years each get roughly a third of the track. Deep-time dates read "1.8 million years ago" / `−1.8M`.

**Species filter** (left column): *All · Homo sapiens · Other hominins*. It defaults to *Homo sapiens*, so the intro and overview are unchanged. Filtering is done on the GPU with per-species visibility uniforms, eased for smooth transitions and never rebuilt. Migration streams are *Homo sapiens* and fade with it. Site markers, timeline spans and milestone lists follow the filter. In historical mode the species list shows who is in the record at the selected year, so coexistence is visible.

**Data model** (all JSON in `src/data/`, validated by `index.ts`; relationships are explicit ids):

| Entity | File | Links |
|---|---|---|
| Species | `species.json` | genus (*Homo*, *Australopithecus*, *Paranthropus*), `scientificName` (null for Denisovans), key `siteIds`, sources |
| Population cluster | `populations.json` | `speciesId`, `relatedRouteIds`, `siteIds` (archaic species ranges are population clusters too) |
| Migration route | `migrations.json` | all *Homo sapiens* (`ROUTE_SPECIES_ID`) |
| Historical milestone | `milestones.json` | `relatedSpeciesIds` (empty = maker unknown), optional `relatedRouteIds` / `relatedSiteIds` |
| Archaeological site | `events.json` | `speciesIds` (empty = maker unknown) |
| Sources | `migrations.json` + `sources.json` | referenced by id everywhere |

**Milestones** date the *earliest known evidence at one place*. Each has an `originNote` explaining how that differs from the origin. A route is linked only where the evidence itself connects them (e.g. Sahul seafaring). Route panels list other milestones of the same period as "Same period, not connected". Each milestone has an animated miniature scene (`components/milestones/MilestoneScene.tsx`, keyframes in `sceneStyles.ts`). Scenes are layered SVG on a 16:10 stage: atmosphere, lighting and glow, independently animated layers, and particles such as sparks, smoke, motes, droplets and bubbles. There are 19 distinct scenes (fire, cooking, turning stone tools, spear flight, engraving, cave painting, shell beads, seafaring, stitching, pottery, dog, goat herd, a growing crop, wine and a qvevri, settlement, copper pouring, cuneiform writing and more). Each is shown as a full-width hero in the detail panel, a 72px thumbnail in lists and an 84px card on the globe. Thumbnails animate on hover. The styles are a React-hoisted `<style>` that ships with the component. Base styles are a composed final frame, so with reduced motion every scene is a complete still image. Pure SVG and CSS, with no animation library and no extra WebGL context.

**Milestones on the timeline** (`MilestoneTicks`): diamonds at each milestone's earliest-evidence year, above the period bands. Hollow means later than the selected year; filled means reached. They follow the species filter, and clicking one opens its detail panel. Inside panels, clicking a milestone also opens its full detail panel, with "← Back" to the panel you came from. The globe marker dims when you scrub before the evidence date.

**Panel** (`InfoPanel`): route · species · milestone · site · population region · period, plus a browsable milestone timeline ("Milestones" button). Selecting a milestone jumps the timeline to just after its evidence, flies the camera there, shows its animated marker on the globe, widens the filter if needed and highlights related species and routes (`stores/selectionFocus.ts`). Clicking the globe picks sites first, then routes, then the population region under the pointer.

**Georgia & the Caucasus:**
- **Sites:** Dmanisi (~1.85–1.77 Ma, early *Homo*, explicitly not *H. sapiens*), Dzudzuana, Satsurblia, Kotias Klde, Ortvale Klde, Gadachrili Gora.
- **Milestones:** dyed flax fibres at Dzudzuana (~30 ka) and the earliest chemical evidence of grape wine at Gadachrili Gora (~6000–5800 BCE). The wine milestone is presented as a local Neolithic development, not as the result of a migration.

`npm run verify` also checks:
- every species has a population on the globe;
- archaic populations stay within their species' record;
- milestones are linked only to species alive at the time;
- Dmanisi is not attributed to *H. sapiens*;
- coexistence at 60 ka and 1.8 Ma.

## Population clusters

Migration does not empty a region. Streams show *groups moving*; **population clusters** show *people living somewhere* at a given time. Source populations stay after groups leave, and new populations form gradually where groups arrive.

- **Data:** `src/data/populations.json`, kept separate from routes and linked by `relatedRouteIds`. Each cluster has lobes (an organic footprint), `startYear` → `establishedYear` (gradual formation), an optional `endYear`/`fadeYears`, `colorFrom` (a route's palette colour, or `"ancestral"`), `visualDensity`, `confidence`, `attestedYear` and a `basisNote`.
- **No population sizes.** `visualDensity` only sets how many particles draw the region.
- **Evidence vs inference.** Before `attestedYear`, or always if it is absent, presence is *inferred* and drawn dimmer and hazier. From `attestedYear` on it is backed by archaeological/fossil evidence and drawn as crisper specks. The legend and route panel label both states.
- **Roles are derived, not hand-written.** A cluster is the *source* of a related route if the route's origin lies inside its footprint, and the *destination* if an arrival point (main or branch) does. `npm run verify` checks that every route departs from an established source population that persists, and arrives where a destination population forms gradually, never before departure.
- **Time.** Presence is a pure function of `yearsBP`, evaluated per particle in the shader: particles appear in order of distance from `growthOrigin`, so a cluster grows outward. Scrubbing in either direction gives identical results. An `endYear` marks where evidence of continuity stops (e.g. the early Levant presence). It is not a claim of extinction.
- **Rendering.** Two extra draw calls (soft specks + km-sized haze) share the stream uniforms. They never reach the bloom threshold, so the streams stay dominant. Per-particle energy is normalised by cluster surface density so compact regions do not glow brighter than large ones.

**Visual hierarchy.** The Earth shader desaturates slightly and compresses highlights (deserts, ice, clouds) so the surface stays below the bloom threshold. Stream cores carry a small HDR centre, which makes bloom effectively selective. Fringe particles are smaller, dimmer and softer than the dense core. All point layers fade at the horizon so nothing on the far side spills around the limb.

**Deep space (`Comets.tsx`).** Decoration only: rare comet flybys (every ~15–35 s, irregular; mostly distant and faint, occasionally a larger one with a soft glowing tail) and faint shooting stars. They are real 3D objects, depth-tested against the Earth. Paths always lie beyond the globe's centre plane, so a comet can slip behind the planet but can never cross in front of it or the streams. Most paths are aimed through the dark space beside the globe and away from the HUD. The whole system is two draw calls over a fixed pool of 4 slots, and positions are computed on the GPU, so spawning only rewrites a few uniforms. It starts after the intro and is off under `prefers-reduced-motion`. `?comets=demo` spawns every few seconds for review, and the Leva `Scene → comets` knob scales the brightness (0 turns comets off).

**Adding a route** means adding an entry to `src/data/migrations.json` and a colour to `src/config/routeColors.ts`. No engine changes are needed.

## Data honesty

Route geometry, cluster origins and wave timing are **illustrative** and are labelled that way in the UI.
Population periods and earliest-evidence years are approximate summaries for orientation.
Fossil-site dates and the cited literature are the evidence layer. Review them with a domain specialist before publishing.

Earth textures: three.js example assets (NASA Blue Marble / Black Marble derived).
