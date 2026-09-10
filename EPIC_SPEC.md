# EPIC SPEC — Loop Room and staging deploy scaffold

## Quality differentiator (read first)

**Trustworthy verification.** Needle Drop wins on one dimension: a note-by-note
verdict the player believes, on their own records, where every competitor either
never listens or listens only to its own catalog.

**What it demands of THIS EPIC:** this EPIC does not verify anything yet. It
builds the room the verdict will one day live in, so its job toward the
differentiator is to earn trust at the input stage. Two things carry that
weight here:

1. **The audio the user hears must be exactly the audio they loaded, looped
   truthfully.** No resampling artifacts, no clicks at the loop seam, no drift
   between the waveform they see and the sound they hear. A player who cannot
   trust that the loop plays the real record back accurately will never trust a
   verdict about it later. Gapless, sample-accurate looping and a waveform that
   matches the audio are trust primitives, not cosmetics.
2. **Their file never leaves their machine, and the app says so plainly.** The
   whole premise is "on music you chose, on your own machine." No audio may
   touch the network. This must be true and visibly true.

Everything else in this EPIC is held to the standard QUALITY BAR.

---

## Scope

### In scope
- A Vite + React + TypeScript single-page app, scaffolded from empty repo.
- Static production build served by nginx in a `Dockerfile`, orchestrated by
  `docker-compose.staging.yml` at the repo root.
- Runtime observability wiring that is fully optional: `SENTRY_DSN` (GlitchTip /
  Sentry-compatible) and Umami (`UMAMI_WEBSITE_ID`, `UMAMI_URL`), injected at
  container start, no-op when unset.
- The **Loop Room** surface (the app home):
  - Load a local audio file (`mp3`, `wav`, `ogg`, `flac`) with **no upload**;
    all decoding happens in-browser.
  - Render a waveform of the loaded file.
  - Drag a loop region across the waveform.
  - Snap the region to a musical length via a **tempo (BPM)** and **bars** input
    (default two bars).
  - Adjust playback speed from **50% to 100%**.
  - Loop the region **gaplessly**.
  - A **sample entry point**: a button that loads a short bundled audio clip so
    the Loop Room is demonstrable without the user hunting for a file.
- Designed **empty, loading, and error** states for the Loop Room.
- Mobile-first layout usable at a **390px** viewport.
- A **stranger-facing README** (understand, run, contribute).
- Accessibility basics and keyboard reach for every Loop Room control.

### Out of scope (do not build — later EPICs own these)
- **Stem separation / Demucs** (EPIC 6).
- **Transcription / target chart** (Basic Pitch, piano-roll, note editing) —
  EPIC 2.
- **Mic capture, pitch tracking, call-and-response grading, the verdict** —
  EPIC 3.
- **Riff-book, IndexedDB persistence, streaks, review decay, export** — EPIC 4.
- **The bundled *demo riff* with a baked-in chart and the guided first-run
  walkthrough** — EPIC 5. This EPIC ships only a plain *sample audio clip* for
  the Loop Room (see "Sample entry point vs. demo riff" below). Do not build a
  multi-step walkthrough, do not bake in a chart, do not gate anything on
  `SEED_DEMO` here.
- **Accounts, backend endpoints, any server-side logic beyond serving static
  files.**
- **Pitch-preserving time-stretch.** Slowdown in this EPIC uses playback rate,
  which lowers pitch as it slows (see Technical design → Audio engine). This is
  the honest, in-scope behavior for EPIC 1. If pitch-preserved slowdown is
  wanted, it is a separate future task, requested via `requested_tasks`, not
  built here.

### Sample entry point vs. demo riff (scope boundary — read carefully)
The planner's acceptance criterion for this EPIC says the empty state "shows the
demo entry point." In EPIC 1 that entry point is a **sample audio clip only**: a
short, self-produced or clearly-licensed monophonic audio file bundled in the
app that, when loaded, behaves exactly like a user-dropped file (waveform, loop
region, snap, speed, gapless loop). It exists so a first-time visitor reaches the
Loop Room's core action in seconds without a file hunt, satisfying QUALITY BAR §4
first-run at the level EPIC 1 can.

The **full demo riff** (a phrase with a baked-in chart that can be taken all the
way to a green-note verdict) and the **2-to-4-step guided walkthrough** are
EPIC 5. Do not build them now. Do not add a chart or verdict affordance to the
sample. When EPIC 5 lands, it may replace or extend this sample; keep the sample
loading path simple and swappable.

---

## Non-goals (binding — from the product plan)
- No stem separation.
- No transcription or mic features.
- No accounts or backend endpoints.
- No polyphonic handling of any kind (not relevant yet, but do not build UI that
  implies chords).
- No uploading audio anywhere, ever.

---

## Technical design

The app is **fully client-side**. There are **no HTTP API endpoints** and **no
data-model migrations** in this EPIC (persistence arrives in EPIC 4). "Data
model" below is in-memory app state only.

### Stack and tooling
- **Build:** Vite + React 18 + TypeScript (strict mode on).
- **Styling:** plain CSS (CSS modules or a single global stylesheet with CSS
  variables). Do not add a component/design-system framework for these screens
  (that would be gold-plating past the bar).
- **Testing:** Vitest + React Testing Library (jsdom) for unit/component;
  Playwright for end-to-end and the network/no-upload assertion.
- **Node:** pin a current LTS in `.nvmrc` and in the Docker build stage.

### Directory layout (target)
```
/                         repo root
  Dockerfile
  docker-compose.staging.yml
  nginx.conf
  docker-entrypoint.sh          # generates runtime config.js from env, then execs nginx
  .dockerignore
  .env.example                  # placeholders only, never real secrets
  .gitignore                    # .env is ignored
  .nvmrc
  index.html                    # includes a critical app-shell (see below)
  package.json
  tsconfig.json
  vite.config.ts
  README.md
  public/
    config.js                   # dev placeholder; in the container it is regenerated at start
    sample/                      # bundled sample audio clip for the sample entry point
  src/
    main.tsx
    App.tsx
    runtime-config.ts           # reads window.__NEEDLE_DROP_ENV__ with safe defaults
    observability/
      sentry.ts                 # init only if a DSN is present; no-op otherwise
      umami.ts                  # inject script only if configured; no-op otherwise
    audio/
      decode.ts                 # File/ArrayBuffer -> AudioBuffer (decodeAudioData)
      peaks.ts                  # AudioBuffer -> downsampled peak array for the waveform
      loop-player.ts            # gapless looping + speed via Web Audio
      timing.ts                 # bars/tempo <-> seconds math, snap helpers
    components/
      LoopRoom.tsx
      DropZone.tsx
      Waveform.tsx              # canvas render + draggable region handles
      LoopControls.tsx          # tempo, bars, snap toggle, speed, transport
      states/
        EmptyState.tsx
        LoadingState.tsx        # layout-stable skeleton
        ErrorState.tsx          # product-voice message + next step
    styles/
      global.css
  tests/
    unit/                        # vitest
    e2e/                         # playwright
    fixtures/                    # a tiny audio file for tests
```

### Runtime config and observability (graceful absence)
Because the SPA is static, environment values are injected **at container
start**, not baked into the bundle:
- `docker-entrypoint.sh` reads `SENTRY_DSN`, `UMAMI_WEBSITE_ID`, `UMAMI_URL` from
  the environment and writes `/usr/share/nginx/html/config.js` as:
  ```js
  window.__NEEDLE_DROP_ENV__ = {
    SENTRY_DSN: "<value or empty>",
    UMAMI_WEBSITE_ID: "<value or empty>",
    UMAMI_URL: "<value or empty>"
  };
  ```
  Then it `exec`s nginx. Values are written safely (empty string when unset; no
  shell-injection of unescaped content).
- `index.html` loads `/config.js` **before** the app bundle.
- `src/runtime-config.ts` reads `window.__NEEDLE_DROP_ENV__` with an empty-object
  fallback so the app works in dev where `public/config.js` may define nothing.
- `observability/sentry.ts` initializes the Sentry/GlitchTip client **only** when
  `SENTRY_DSN` is a non-empty string. Otherwise it is a no-op and the app runs
  normally. No PII in any captured event (do not attach file names or audio to
  Sentry context).
- `observability/umami.ts` injects the Umami script tag **only** when both
  `UMAMI_URL` and `UMAMI_WEBSITE_ID` are non-empty. Otherwise no script is added.

### Audio engine
- **Decode (`decode.ts`):** read the `File` via `arrayBuffer()` and call
  `AudioContext.decodeAudioData`. No `fetch`/`XHR`/upload. Accept `mp3`, `wav`,
  `ogg`, `flac`; when the browser cannot decode a format, surface the designed
  error state (see below). Guard against oversized files with a sensible cap
  (for example reject > ~60 MB) and say so in the product voice.
- **Peaks (`peaks.ts`):** downsample the decoded buffer to a fixed number of
  min/max peak pairs sized to the canvas width. Pure function, unit-tested.
- **Gapless loop (`loop-player.ts`):** use a single `AudioBufferSourceNode` with
  `loop = true`, `loopStart` and `loopEnd` set to the region bounds. This gives
  **sample-accurate, click-free** looping natively. `playbackRate` sets speed in
  `[0.5, 1.0]`. Changing region bounds or speed while playing must not introduce
  a gap or a click (recreate the source node started at the correct offset, or
  update `loopStart`/`loopEnd`/`playbackRate` live). Expose play, pause, stop,
  set-region, set-rate. Slowing playback lowers pitch (documented, in scope).
- **Timing (`timing.ts`):** pure helpers.
  - `barsToSeconds(bars, bpm, beatsPerBar) = bars * beatsPerBar * (60 / bpm)`.
  - `snapRegionToBars(startSec, bars, bpm, beatsPerBar, duration)` returns a
    region whose length equals `barsToSeconds(...)`, clamped to the buffer
    duration, optionally quantizing `startSec` to the nearest beat.
  - Default `beatsPerBar = 4`, default `bars = 2`, default `bpm = 120` (editable).
    Beats-per-bar may be a fixed 4/4 assumption for this EPIC; if exposed, keep
    it a secondary control subordinate to tempo and bars.

### Loop Room UI and interaction
- One screen. **One obvious primary action** at each moment:
  - Empty: the primary action is "load a song" (the drop zone / file picker).
  - Loaded: the primary action is play/loop.
- **Drop zone / file input:** drag-and-drop plus a visible file button (drag-drop
  alone is not keyboard-reachable, so the button is required). No network call on
  load.
- **Waveform:** canvas; draggable region with two handles; the region is also
  adjustable by keyboard (focusable handles, arrow keys nudge, with visible
  focus). Region reflects snap when snap is on.
- **Loop controls:** tempo (numeric), bars (numeric, default 2), snap toggle,
  speed control (slider or stepped control across 50%–100% with the current
  percentage shown), and transport (play/pause/stop). Every control has a
  `<label>` or `aria-label`, a visible focus state, and a ~44px touch target.
- **Feedback within 100ms:** pressed/active states on all controls; the play
  button reflects state immediately; dragging the region updates the visible
  region in real time.

### Designed states (QUALITY BAR §3)
- **Empty:** explains what the Loop Room is for and the first action, and shows
  the sample entry point. Positive phrasing. Example copy (already swept):
  - Heading: `Drop in a song to start`
  - Body: `Pick a track from your own files. It stays on your machine.`
  - Primary: `Choose a song` (opens file picker) / drop target
  - Secondary: `Play a sample loop` (loads the bundled sample clip)
- **Loading:** while decoding, hold the layout steady with a skeleton where the
  waveform and controls will appear. No white screen, no unbounded spinner.
  Example: `Reading your song…`
- **Error:** product voice, says what happened and the next step, no stack trace,
  no error code. Examples (already swept):
  - Unsupported/undecodable file: `That file would not open. Try an mp3, wav,
    ogg, or flac.`
  - Too large: `That file is large. Try a shorter clip or a smaller file.`

### First-paint / perceived speed (QUALITY BAR §1)
- `index.html` includes a small **critical app shell** in the body: the product
  name and the empty-state heading/primary action, styled inline so the user
  sees real, branded content immediately, even before the JS bundle parses.
  React mounts and replaces it. This guarantees "real content within about a
  second, never a blank page" including on the container root.
- Keep the initial bundle lean; audio and any heavy work load on demand.

### Deploy: Dockerfile, nginx, compose
- **Dockerfile** (multi-stage): stage 1 builds with Node LTS
  (`npm ci && npm run build` → `dist/`); stage 2 is `nginx:alpine`, copies `dist`
  to `/usr/share/nginx/html`, copies `nginx.conf` and `docker-entrypoint.sh`,
  sets the entrypoint to generate `config.js` then run nginx in the foreground.
- **nginx.conf:** serve static assets with gzip and sensible cache headers;
  SPA fallback `try_files $uri /index.html;`; **`config.js` must not be cached**
  (so runtime env changes take effect); listen on port **80** inside the
  container.
- **docker-compose.staging.yml** at repo root: builds from the Dockerfile, maps a
  documented host port to container 80, and passes `SENTRY_DSN`,
  `UMAMI_WEBSITE_ID`, `UMAMI_URL` through from the environment (default empty).
  Documented port: **`${NEEDLE_DROP_PORT:-8080}` → 80** (host 8080 by default).
  Document this exact port in the README. If the factory staging deploy contract
  mandates a specific port, set it here and in the README to match.
- **.env.example:** placeholders only for `SENTRY_DSN`, `UMAMI_WEBSITE_ID`,
  `UMAMI_URL`, `NEEDLE_DROP_PORT`. `.env` stays in `.gitignore`.

---

## Ordered task list (each with acceptance criteria)

### T1 — Scaffold the SPA and tooling
Scaffold Vite + React + TS (strict), the directory layout above, `global.css`
with mobile-first CSS variables, `index.html` with the critical app shell, and
Vitest + Playwright configured with npm scripts (`dev`, `build`, `preview`,
`test`, `test:e2e`). Add `.nvmrc`, `.gitignore` (ignores `.env`, `node_modules`,
`dist`).
- **AC:** `npm ci && npm run build` produces `dist/` with an `index.html` that
  contains visible app-shell content (product name + primary action) in the HTML
  body before any script runs.
- **AC:** `npm run test` and `npm run test:e2e` are wired and runnable.

### T2 — Runtime config + optional observability
Implement `runtime-config.ts`, `observability/sentry.ts`, `observability/umami.ts`,
`public/config.js` (dev placeholder), and load `config.js` before the bundle.
- **AC:** With `SENTRY_DSN`, `UMAMI_WEBSITE_ID`, `UMAMI_URL` all unset, the app
  loads and the Loop Room works with no console errors and no attempt to reach
  Sentry or Umami. (Maps to planner AC: runs correctly when env unset.)
- **AC:** When a DSN is present, Sentry initializes once; when both Umami values
  are present, exactly one Umami script tag is injected. No PII (no file names,
  no audio) is sent.

### T3 — Audio engine
Implement `decode.ts`, `peaks.ts`, `timing.ts`, `loop-player.ts`.
- **AC:** `barsToSeconds` and `snapRegionToBars` are pure and unit-tested,
  including two-bars-at-a-given-tempo and clamping to buffer duration.
- **AC:** `peaks.ts` returns a deterministic downsampled array for a known
  buffer (unit-tested).
- **AC:** `loop-player.ts` loops a region with `loop=true` and correct
  `loopStart`/`loopEnd`, supports `playbackRate` in `[0.5, 1.0]`, and changing
  region or speed while playing produces no gap or click (verified by test where
  feasible and by the e2e/manual loop check).

### T4 — Loop Room: load file (no upload), waveform, sample entry point
Implement `DropZone.tsx`, `Waveform.tsx`, wire decode → peaks → render, and the
"Play a sample loop" button loading `public/sample/`.
- **AC:** Loading a local file shows its waveform, and **no network request
  carries the audio** (verifiable in the network panel and asserted in e2e).
  (Maps to planner AC: waveform + no upload.)
- **AC:** The sample button loads the bundled clip into the same path and renders
  its waveform.

### T5 — Loop region drag + tempo/bars snap + speed + gapless loop
Implement `LoopControls.tsx`, region dragging, snap-to-bars, speed control, and
transport wired to `loop-player.ts`.
- **AC:** The user drags a loop region, sets tempo and bars to snap it to two
  bars, and hears it loop **with no gap** at a chosen speed between **50% and
  100%**. (Maps to planner AC: drag/snap/gapless/speed.)
- **AC:** Snap sets the region length to exactly `bars` bars at the given tempo;
  turning snap off restores free dragging.

### T6 — Designed states, mobile-first, accessibility
Implement `EmptyState`, `LoadingState`, `ErrorState`; make the whole screen
mobile-first at 390px; ensure keyboard reach, focus states, labels, contrast.
- **AC:** Empty state tells the user to drop a song and shows the sample entry
  point; loading holds layout steady; errors speak in the product voice with a
  next step. (Maps to planner AC: designed states.)
- **AC:** At a 390px viewport there is no horizontal scroll; touch targets are
  ~44px; there is one obvious primary action; focus states are visible; every
  control is reachable and operable by keyboard. (Maps to planner AC: mobile +
  a11y.)

### T7 — Deploy scaffold
Add `Dockerfile`, `nginx.conf`, `docker-entrypoint.sh`, `.dockerignore`,
`docker-compose.staging.yml`, `.env.example`.
- **AC:** `docker compose -f docker-compose.staging.yml up` builds the image and
  serves the SPA on the documented port (`8080` by default); the root shows real
  content within about a second, never a blank page. (Maps to planner AC: compose
  builds + serves + fast first paint.)
- **AC:** `Dockerfile` and `docker-compose.staging.yml` exist at the repo root
  and are the path staging uses. (Maps to planner AC.)
- **AC:** With observability env unset, the served app runs correctly; with it
  set, `config.js` reflects the values and is served uncached.

### T8 — Stranger-facing README
Rewrite `README.md`: what Needle Drop is (2–3 plain sentences), how to run it
(dev commands and the exact `docker compose` command with the documented port,
**verified against the actual compose file**), and how to contribute (where code
lives, how to run tests). No factory internals (no agent/task/pipeline jargon,
no factory paths or services).
- **AC:** A stranger can understand, run, and contribute from the README, and the
  run commands match the real compose files. (Maps to planner AC: README.)

### T9 — Tests and copy sweep
Write the tests in the test plan below and run the QUALITY BAR §8 copy sweep over
every user-visible string added in this EPIC.
- **AC:** All automated tests pass under `npm test` / `npm run test:e2e`.
- **AC:** No user-visible string contains `—` or `–`, any banned vocabulary, or
  negative empty-state phrasing.

---

## Test plan (which tests prove each criterion)

### Unit (Vitest)
- `timing.ts`: `barsToSeconds` correctness; `snapRegionToBars` produces a
  two-bar-length region at a given BPM and clamps to buffer duration. → proves T3
  and the snap half of the drag/snap AC.
- `peaks.ts`: deterministic downsampling for a synthetic buffer. → proves
  waveform data path.
- `runtime-config.ts`: returns safe empty defaults when
  `window.__NEEDLE_DROP_ENV__` is absent or partial. → proves graceful-absence
  AC.
- `observability/sentry.ts` + `umami.ts`: init is skipped when values are empty,
  runs once when present, and no PII fields are attached. → proves env-unset and
  no-PII ACs.

### Component (Vitest + React Testing Library, jsdom)
- `EmptyState`: renders the drop instruction and the sample entry point; copy is
  positive. → proves empty-state AC.
- `LoadingState`: renders a layout-stable skeleton (waveform/control placeholders
  present). → proves loading-state AC.
- `ErrorState`: given an unsupported-file error, renders product-voice message
  with a next step, no stack trace/error code. → proves error-state AC.
- `LoopControls`: tempo, bars, snap, speed, transport are all present, labeled,
  and keyboard-focusable; speed is constrained to 50%–100%. → proves a11y +
  speed-range ACs.

### End-to-end (Playwright)
- **Load + waveform + no upload:** load a fixture audio file from
  `tests/fixtures`; assert the waveform canvas renders; intercept all requests
  and assert none carries the audio (no outbound request is triggered by loading
  the file; no request body contains the file bytes; no external-host request).
  → proves waveform + no-upload AC (the differentiator's trust primitive #2).
- **Drag / snap / speed / gapless:** load the fixture, drag a region, set tempo
  and bars, enable snap, set speed within 50%–100%, start playback; assert the
  region length equals two bars at the tempo and that playback is active and
  looping. (Gapless/click-free is verified by test assertions where feasible and
  by the manual loop check below.) → proves drag/snap/gapless/speed AC.
- **390px viewport:** set viewport to 390px wide; assert no horizontal overflow
  (`document.scrollWidth <= innerWidth`); assert primary action is visible and
  focusable; tab through controls and assert each receives visible focus. →
  proves mobile + a11y AC.
- **Env-unset run:** run the built app (via `vite preview` or the container) with
  no observability env; assert no console errors and no requests to Sentry/Umami.
  → proves graceful-absence AC.

### Build / deploy verification
- **Automated:** an e2e or CI step runs `npm run build` then serves `dist/` (via
  `vite preview` or the built container) and asserts the root returns HTML whose
  body contains the app-shell content (fast, non-blank first paint) and that the
  SPA fallback route serves `index.html`.
- **Documented manual check** (state in the README/run notes, since Docker may
  not run in the unit CI): `docker compose -f docker-compose.staging.yml up`
  builds and serves on `http://localhost:8080`, the root shows the branded empty
  state within about a second, and toggling `SENTRY_DSN`/Umami env changes
  `config.js` while the app still runs when they are unset. → proves the compose
  ACs.

### Copy sweep (QUALITY BAR §8) — part of DONE
Mechanically search every user-visible string added in this EPIC (components,
`index.html`, empty/loading/error copy, README, any sample metadata) for: the
characters `—` and `–`; the banned vocabulary ("seamlessly", "effortlessly",
"unlock", "elevate", "empower", "leverage", "robust", "dive in", and kin); and
negative empty-state phrasing ("You don't have", "No … yet", "Nothing … here",
"Unable to", "Something went wrong"). Every hit is a defect fixed in the same
run.

---

## Definition of done
All planner acceptance criteria are provable via the tests above, the QUALITY BAR
is met for the Loop Room (perceived speed, mobile-first, designed states,
first-run reachability via the sample, security hygiene appropriate to a
static client-only app, accessibility, radically simple interface, human copy,
stranger README), no non-goal was built, and the copy sweep is clean.
