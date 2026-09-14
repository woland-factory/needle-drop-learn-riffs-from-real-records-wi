# EPIC SPEC — Target chart: transcribe, audition, edit

## Quality differentiator (read first)

**Trustworthy verification.** Needle Drop wins on one dimension: a note-by-note
verdict the player believes, on their own records, where every competitor either
never listens or listens only to its own catalog.

**What it demands of THIS EPIC:** this is the EPIC where the differentiator is
won or lost. The verdict in EPIC 3 grades the player against *this chart*. If the
target the machine derived is wrong, no honest verdict is possible: a false
"wrong note" at the moment of triumph destroys the product. So this EPIC's whole
job is to make the target **believable before practice** by making it
**auditionable and editable**. Concretely:

1. **The chart must be honestly derived and never faked.** A region with no clear
   pitch shows a designed "pick a clearer part" state. It NEVER presents zero
   notes, or a guessed note, as a successful transcription. Silence graded as
   success is the exact failure that kills trust.
2. **The player can hear the target and fix it before committing.** Auditioning
   the detected notes (alone and against the record) and editing them (pitch,
   timing, delete, add) is how the player converts "the machine thinks this" into
   "I agree this is the phrase." That agreement is what makes the later verdict
   believable.
3. **The scope of belief is stated plainly.** Single note at a time only. The UI
   says so, so the player never distrusts the tool for failing at a chord it was
   never claiming to read.

Everything else in this EPIC is held to the standard QUALITY BAR.

---

## Scope

### In scope
Building on the EPIC 1 Loop Room (a loaded song, a snapped loop region, gapless
looping), add the **target chart** step:

- **Transcribe** the current loop region (full mix) with
  `@spotify/basic-pitch`, entirely in-browser, and reduce the polyphonic model
  output to a **monophonic** note list: one note per moment, overlaps dropped.
- **Piano-roll timeline** rendering the detected notes, horizontally aligned to
  the loop region (time) and vertically by pitch.
- **Audition:** play the detected notes back as synthesized tones, both **alone**
  and **over the loop** (time-aligned to the region).
- **Edit:** change a note's **pitch**, **nudge its timing**, **delete** a note,
  and **add** a missed note. Edits update the chart that the practice step will
  consume.
- **Designed progress state** during transcription that holds the layout steady
  and never freezes the loop transport controls.
- **Designed "no clear pitch" state** when a region yields no usable
  monophonic line, asking for a clearer region, never a crash and never zero
  notes shown as success.
- A plain, always-visible statement of the **single-note scope** (riffs and
  basslines, not chords).

### Out of scope (do not build — later EPICs own these)
- **Stem separation / Demucs.** Transcribe the **full mix only**. Do not add a
  stem picker or any "isolate instrument" affordance (EPIC 6).
- **Chord or polyphonic transcription.** The reduction to one note per moment is
  mandatory, not optional. Do not surface simultaneous notes even if the model
  emits them.
- **Tab or standard music notation.** The chart is a piano-roll only. No staves,
  no clefs, no tablature.
- **Mic capture, pitch tracking, call-and-response grading, the verdict** — EPIC
  3. Do NOT build a "Practice" screen, a mic prompt, or a grading path here. The
  edited chart is retained in app state as the contract EPIC 3 will read; that is
  the extent of the forward wiring. Do not add a dead or "coming soon" Practice
  button (that is drift).
- **Riff-book / IndexedDB persistence** — EPIC 4. The chart lives in in-memory
  app state only this EPIC. No persistence, no export.
- **The guided first-run walkthrough and the baked-in demo chart** — EPIC 5.
  Reuse EPIC 1's bundled sample clip as-is; do not bake a chart into it.
- **Pitch-preserving time-stretch.** Unchanged from EPIC 1: the slow-down slider
  uses playback rate and lowers pitch. Audition-against-loop sidesteps this by
  playing at true tempo (see Technical design).

---

## Non-goals (binding — from the product plan)
- No chord or polyphonic transcription.
- No tab or standard notation rendering.
- No transcription over an isolated stem yet. Full mix only.
- No accounts, no backend, no audio ever leaving the machine (the model runs
  client-side and its weights load same-origin as static assets).

---

## Technical design

The app stays **fully client-side**. There are **no HTTP API endpoints** and **no
persisted data-model migrations** in this EPIC. The "data model" below is
in-memory React state, shaped forward-compatibly with the plan's `Riff.notes` so
EPIC 4 can persist it without reshaping.

### The note data model (in-memory)
Add `src/audio/note.ts`:
```ts
export interface Note {
  id: string;        // stable UI id for editing/keys; EPIC 4 may drop it on persist
  midi: number;      // MIDI number, integer, clamped to [MIDI_MIN, MIDI_MAX]
  startSec: number;  // seconds RELATIVE TO REGION START (0 = region start)
  durSec: number;    // seconds, > 0
  confidence: number;// 0..1, from the model; edited/added notes use 1
  edited: boolean;   // true if the user changed or added this note
}
export const MIDI_MIN = 28; // E1, below a 4-string bass low E, generous floor
export const MIDI_MAX = 96; // C7, generous ceiling for guitar
```
Times are **relative to the region start**, so a chart is portable and aligns to
the region regardless of where in the song the region sits. Helpers
(`midiToFreq`, `midiToName`) go in `src/audio/pitch.ts` as pure functions:
`midiToFreq(m) = 440 * 2 ** ((m - 69) / 12)`.

### Files / modules to touch

New:
- `src/audio/pitch.ts` — pure: `midiToFreq`, `midiToName` (e.g. `40 -> "E2"`).
- `src/audio/note.ts` — the `Note` type and constants above.
- `src/audio/monophonic.ts` — **pure** reduction of poly note events to a
  monophonic, non-overlapping `Note[]`. Unit-tested. See algorithm below.
- `src/audio/transcribe.ts` — the transcription boundary. Extracts the region
  samples from the source `AudioBuffer`, downmixes to mono, resamples to 22050
  Hz, runs Basic Pitch, maps raw events to `Note[]`, then applies the monophonic
  reduction. Exposes a small `Transcriber` interface so tests can inject a fake
  (see Test plan).
- `src/audio/transcribe.worker.ts` — Web Worker that runs the Basic Pitch / tfjs
  inference off the main thread and posts progress + results. (Rationale under
  "Keeping controls alive.")
- `src/audio/note-synth.ts` — schedule a `Note[]` as synthesized tones over Web
  Audio. Split into a **pure** `planSchedule(notes, startTimeSec, opts)` that
  returns `{freq, startAt, stopAt}[]` (unit-tested) and a thin shell that wires
  `OscillatorNode` + `GainNode` per planned tone. Supports "play alone" and
  "play against the loop", plus stop.
- `src/components/ChartPanel.tsx` — the chart surface: piano-roll, audition
  controls, edit controls, the scope statement, and the two designed states.
- `src/components/PianoRoll.tsx` — canvas or SVG render of the notes over a
  region-length time axis and a pitch axis; supports selecting a note and the
  edit interactions (keyboard-reachable).
- `src/components/states/TranscribingState.tsx` — layout-stable progress state.
- `src/components/states/NoPitchState.tsx` — the "pick a clearer part" state.

Changed:
- `src/components/LoopRoom.tsx` — hold the decoded `AudioBuffer` in a ref (today
  it lives only inside `LoopPlayer`), add a chart step to the state machine, add
  the primary action that starts transcription, own the `Note[]` chart state and
  the region snapshot the chart was transcribed from, and pass `LoopPlayer` to
  the chart panel for audition-against-loop.
- `src/styles/global.css` — piano-roll, chart panel, and new-state styles, still
  mobile-first and reusing the existing CSS variables and control classes.
- `package.json` — add `@spotify/basic-pitch` and its `@tensorflow/tfjs` peer.
  Both are **dynamically imported** inside the worker so they stay out of the
  initial bundle (QUALITY BAR §1).
- Build config (`vite.config.ts` and/or a copy step) — make the Basic Pitch model
  assets available **same-origin** under a static path (e.g.
  `public/models/basic-pitch/`) and load the model from that path. Verify the
  installed package's actual model location and export names at implement time
  and load from the local copy, so no audio and no model request goes to a third
  party.

### Getting the region audio to the model
`LoopRoom` already decodes to an `AudioBuffer` (currently only stored inside
`LoopPlayer`). Keep a `bufferRef` to that `AudioBuffer`. On transcribe:
1. Slice `[region.startSec, region.endSec]` from the buffer, downmixing all
   channels to mono.
2. Resample to **22050 Hz** using an `OfflineAudioContext(1, ceil(len*22050),
   22050)` render (Basic Pitch expects 22050 Hz mono).
3. Hand the mono Float32Array (transferable) to the worker.

Region times are absolute in the buffer; the resulting note `startSec` values are
made **relative to the region start** (subtract `region.startSec` equivalent, i.e.
the model sees only the slice so its times already start at 0).

### Basic Pitch usage (verify against the installed version)
Use `@spotify/basic-pitch`'s model + the `outputToNotesPoly` /
`noteFramesToTime` / `addPitchBendsToNoteEvents` helpers to produce note events
`{ startTimeSeconds, durationSeconds, pitchMidi, amplitude }`, then map to `Note`
(`midi = pitchMidi`, `startSec = startTimeSeconds`, `durSec = durationSeconds`,
`confidence = amplitude` clamped to 0..1, `edited = false`). `evaluateModel`
reports progress `0..1` via its callback; forward that to the UI. Treat the exact
import names and thresholds as version-specific: confirm them against the package
actually installed, do not hardcode from memory. Choose onset/frame thresholds
that favor **clean, confident** notes over completeness (a missed note the user
adds by hand is better than a phantom note that erodes trust).

### Monophonic reduction (the mandatory core — pure and tested)
`reduceToMonophonic(events): Note[]` MUST guarantee the output notes **never
overlap in time** — one note per moment. Specify and implement it deterministically:
1. Sort events by `startSec` (tie-break by higher `confidence`, then lower
   `midi`).
2. Walk left to right maintaining the last kept note's end. When an incoming
   event starts before the current kept note ends (overlap):
   - keep the note with higher confidence; if the incoming note wins and its
     onset is clearly later, truncate the previous note to end at the incoming
     onset rather than dropping it, so the timeline stays continuous;
   - otherwise drop the incoming (lower-confidence) overlapping note.
3. Drop notes shorter than a minimum audible length (e.g. < ~40 ms) and notes
   outside `[MIDI_MIN, MIDI_MAX]`.
4. Assign stable `id`s.
The exact tie-break/truncate policy is the implementer's to tune, but the
**post-condition is testable and binding**: for all `i`, `notes[i].startSec +
notes[i].durSec <= notes[i+1].startSec` (no overlaps), and notes are sorted by
`startSec`. Unit tests assert this on hand-built overlapping inputs.

### "No clear pitch" detection
After reduction, treat the region as having no clear line when the result is
empty OR the total voiced duration is a negligible fraction of the region (e.g.
kept-note duration sums to < ~10% of region length, tune to the sample). In that
case render `NoPitchState` (not the piano-roll). This is the guard against
"zero notes presented as success". The threshold is defined in one place and
unit-tested via `isClearEnough(notes, regionLen)`.

### Audition (`note-synth.ts`)
- **Play alone:** schedule each note as a short tone (e.g. `triangle` oscillator
  through a per-note gain envelope to avoid clicks), `startAt = ctx.currentTime +
  note.startSec`, `stopAt = startAt + note.durSec`, `freq = midiToFreq(midi)`.
- **Play against the loop:** start the existing `LoopPlayer` at the region start
  and schedule the synth notes time-aligned to that same start, so the player
  hears their notes over the record. Audition plays at **true tempo and pitch**
  (100%), independent of the slow-down slider, so the pitch comparison is honest
  (the slider lowers the record's pitch, which would make an aligned comparison
  misleading). A single aligned pass is sufficient; looping the synth in sync is
  allowed but not required.
- Provide **stop**; auditioning must be interruptible and must not leave
  oscillators running. Auditioning and the Loop Room's own transport must not
  fight over the audio graph (stopping one stops its own nodes only).
- The pure `planSchedule` is unit-tested; the oscillator shell is thin.

### Editing interactions (piano-roll)
All edits mutate the owned `Note[]` and set `edited: true` on the touched note:
- **Change pitch:** move a selected note up/down by a semitone (buttons and
  Arrow Up/Down when focused), clamped to `[MIDI_MIN, MIDI_MAX]`. Dragging
  vertically is a nice-to-have, not required; the keyboard path is required.
- **Nudge timing:** move a selected note's `startSec` earlier/later by a small
  step (e.g. 10 ms, larger with a modifier), clamped to `[0, regionLen - durSec]`
  (buttons and Arrow Left/Right when focused).
- **Delete:** remove the selected note (button and Delete/Backspace key).
- **Add:** add a note at a chosen time/pitch (e.g. click/tap an empty spot on the
  roll, or an "Add note" button that inserts at the playhead/region start at a
  default pitch), then it is editable like any other. Added notes get
  `confidence: 1`, `edited: true`, and the reduction's non-overlap invariant is
  preserved on add (adding into an occupied moment either shifts or is rejected
  with feedback, never creates an overlap).
- Every edit gives feedback within 100ms (selection highlight, immediate re-render
  of the moved/added note).

### Keeping the loop controls alive during transcription (QUALITY BAR §1)
Basic Pitch / tfjs inference is heavy and would jank the main thread. Run it in
`transcribe.worker.ts` so:
- The main thread stays responsive: the loop transport (play/pause/stop, speed,
  region) keeps working while transcription runs. This is a **binding, testable**
  requirement ("never freezes the loop controls").
- Web Audio playback already runs on the audio thread, so the loop keeps sounding
  regardless; the requirement here is that the *controls* stay interactive.
- The `TranscribingState` shows honest progress (the model's `0..1` callback,
  forwarded from the worker) with the layout held steady, and offers a way out
  (a cancel/back control), never an unbounded spinner with no exit.

### Chart step in the Loop Room state machine
Extend `LoopRoom`'s status beyond `empty | loading | loaded | error`:
- In `loaded`, the **primary action** becomes **"Find the notes"** (transcribe
  the current region). Looping stays available as a secondary reference control;
  keep exactly one visually dominant primary action per QUALITY BAR §7.
- Transcribing → `TranscribingState` overlay/panel (controls still live).
- On result: if clear, show `ChartPanel` (piano-roll + audition + edit + scope
  statement); if not, show `NoPitchState` with a "pick a clearer part" path back
  to the region controls.
- The chart is transcribed for a **specific region snapshot**. If the user
  changes the region afterward, the chart is stale: offer "Find the notes again"
  rather than silently keeping a mismatched chart. Do not auto-retranscribe on
  every drag (expensive); re-run only on explicit action.
- Chart `Note[]` and the region snapshot live in `LoopRoom` state (lifted), so
  edits survive leaving and re-entering the chart panel and are the single source
  of truth EPIC 3's practice step will read.

### Copy (already swept — no em/en dashes, positive, plain)
- Primary action (loaded): `Find the notes`
- Scope statement (always visible on the chart): `Needle Drop reads one note at a
  time. Best on single-note riffs and basslines.`
- Transcribing state heading: `Reading the notes` with a progress indicator and a
  `Cancel` control.
- No-clear-pitch state: heading `This part is hard to read`, body `Pick a part
  with one clear note at a time, like a bassline or a single-string riff.`,
  action `Pick another part`.
- Audition controls: `Play the notes` (alone), `Play with the song` (against the
  loop), `Stop`.
- Edit controls: `Up`, `Down` (pitch), `Nudge left`, `Nudge right` (timing),
  `Delete`, `Add note`.
- Empty chart after edits (user deleted everything): `Add a note, or read the
  notes again.` (positive, actionable).
Sweep every string added or edited in this EPIC before finishing.

### Security / hygiene (static client app)
- No new network surface. The model weights load from the app's own origin as
  static assets; no audio and no model fetch goes to a third party (verifiable in
  the network panel, same trust primitive as EPIC 1).
- Validate all edits at the boundary: clamp `midi` to `[MIDI_MIN, MIDI_MAX]`,
  clamp timing into the region, reject non-finite inputs.
- No PII in Sentry: never attach file names, audio, or note data to captured
  events (unchanged from EPIC 1).

---

## Ordered task list (each with acceptance criteria)

### T1 — Note model, pitch helpers, monophonic reduction (pure core)
Add `note.ts`, `pitch.ts`, `monophonic.ts`.
- **AC:** `midiToFreq`/`midiToName` are pure and unit-tested (A4 = 69 → 440 Hz;
  40 → "E2").
- **AC:** `reduceToMonophonic` on overlapping inputs returns notes sorted by
  `startSec` with **no overlaps** (`notes[i].startSec + notes[i].durSec <=
  notes[i+1].startSec`), drops sub-minimum and out-of-range notes, and is
  deterministic. Unit-tested with hand-built overlaps.
- **AC:** `isClearEnough(notes, regionLen)` returns false for empty and
  negligible-voicing inputs, true for a real line. Unit-tested.

### T2 — Transcription boundary + worker (in-browser, off main thread)
Add `transcribe.ts` (region slice → mono → 22050 Hz resample → Basic Pitch →
`Note[]` → reduction) and `transcribe.worker.ts`. Add the deps, dynamically
imported in the worker; make the model assets same-origin.
- **AC:** Running transcription on a loop region produces a monophonic `Note[]`
  whose times are within `[0, regionLen]`, computed **entirely in-browser** with
  no audio and no model request leaving the origin. (Maps to planner AC 1.)
- **AC:** Transcription runs in a worker; the loop transport controls remain
  interactive throughout (main thread not blocked). (Maps to planner AC 4.)
- **AC:** Initial app bundle does not include tfjs/basic-pitch (they load on
  demand); first paint is unaffected.

### T3 — Piano-roll render + chart step wiring
Add `PianoRoll.tsx` and `ChartPanel.tsx`; wire `LoopRoom` to hold the buffer,
the chart state, and the region snapshot; add the `Find the notes` primary action.
- **AC:** The detected notes render on a piano-roll aligned to the region (time
  on X, pitch on Y), with the single-note scope statement visible. (Maps to
  planner AC 5, scope-statement half.)
- **AC:** Exactly one dominant primary action per state; looping stays available
  as reference during and after transcription.

### T4 — Audition (alone and against the loop)
Add `note-synth.ts` and the audition controls.
- **AC:** The user plays the detected notes back as tones **alone**, and **over
  the loop** time-aligned to the region, at true pitch; `Stop` halts audition
  cleanly. (Maps to planner AC 2.)
- **AC:** `planSchedule` is pure and unit-tested (correct freqs and start/stop
  times for a known note list and start time).

### T5 — Editing (pitch, timing, delete, add) carried into the chart state
Wire the edit interactions to the owned `Note[]`.
- **AC:** The user can delete a note, change a note's pitch (± semitone,
  clamped), nudge a note's timing (clamped to the region), and add a missed note;
  each edit is reflected immediately and sets `edited: true`. (Maps to planner
  AC 3.)
- **AC:** Edits persist in `LoopRoom`'s chart state across leaving and
  re-entering the chart panel (they are the source of truth the practice step
  will read). No overlap is ever created by an add/nudge. (Maps to planner AC 3,
  "carry into the practice step".)

### T6 — Designed transcribing and no-clear-pitch states
Add `TranscribingState.tsx` and `NoPitchState.tsx`; wire both into the state
machine.
- **AC:** During transcription a designed progress state shows honest progress
  with the layout held steady and a way out, and the loop controls never freeze.
  (Maps to planner AC 4.)
- **AC:** A region with no clear pitch shows the designed "pick a clearer part"
  state, never a crash and never zero notes presented as a successful chart.
  (Maps to planner AC 6.)

### T7 — Mobile, accessibility, and copy sweep
Make the chart panel and piano-roll usable at 390px; every control labeled,
keyboard-reachable, with visible focus; run the QUALITY BAR §8 sweep.
- **AC:** At 390px there is no horizontal scroll; the piano-roll is usable; edit
  and audition controls are ~44px and keyboard-operable with visible focus.
- **AC:** No user-visible string added or edited in this EPIC contains `—`, `–`,
  banned vocabulary, or negative empty-state phrasing.

---

## Test plan (which tests prove each criterion)

### Unit (Vitest)
- `pitch.ts`: `midiToFreq`, `midiToName` correctness. → T1.
- `monophonic.ts`: on hand-built overlapping event lists, output is sorted and
  **non-overlapping**, sub-minimum and out-of-range notes dropped, deterministic
  across runs. This is the core proof of "monophonic enforcement is real". →
  planner AC 5.
- `monophonic.ts` / `isClearEnough`: empty and negligible inputs → false; a real
  line → true. → planner AC 6 (the detection half).
- `note-synth.ts` `planSchedule`: correct freqs and start/stop offsets for a known
  `Note[]` and start time. → T4.
- Edit reducers (pure functions behind the panel, e.g. `applyPitch`, `applyNudge`,
  `applyDelete`, `applyAdd`): clamp to range/region, set `edited`, and preserve
  the non-overlap invariant. → planner AC 3.

### Component (Vitest + RTL, jsdom — with an injected fake `Transcriber`)
jsdom has no WebGL/Web Audio, so component tests inject a fake `Transcriber`
returning known events (real inference is proven in e2e). Tests:
- `ChartPanel` renders the piano-roll for a known chart and shows the single-note
  scope statement. → planner AC 5.
- Edit flow: delete removes a note; pitch up/down changes `midi` and clamps at
  the bounds; nudge changes `startSec` and clamps at the region edges; add
  inserts a note. Each updates the visible chart. → planner AC 3.
- Edits persist when the panel is unmounted and remounted from the same
  `LoopRoom` state (source-of-truth proof). → planner AC 3 ("carry into
  practice").
- `NoPitchState` renders (product voice, a next step) when the fake transcriber
  returns an empty/negligible result; the piano-roll is not shown and no crash
  occurs. → planner AC 6.
- `TranscribingState` renders a layout-stable progress surface with a cancel
  path. → planner AC 4.

### End-to-end (Playwright — real Basic Pitch in real Chromium)
- **Real in-browser transcription on the bundled sample:** load the bundled
  monophonic bass sample (`public/sample/riff.wav`, a clean single-note walking
  line), snap the region, run `Find the notes`. Assert (generous timeout): a
  piano-roll with **≥ 1 note** appears, the notes are **non-overlapping** and
  **within the region**, and no audio/model request left the origin (network
  panel assertion, as in EPIC 1). This proves planner AC 1 with the real model,
  in-browser, honoring the differentiator's honesty requirement. If the bundled
  sample proves flaky for the model, add a purpose-built clean monophonic fixture
  under `tests/fixtures/` (a synthesized single-note phrase) and transcribe that;
  do not weaken the assertion.
- **Controls stay alive during transcription:** start transcription and, while the
  progress state is showing, operate a loop transport control (e.g. toggle
  play/pause or move the region) and assert it responds. → planner AC 4.
- **Audition:** after a chart appears, click `Play the notes` and `Play with the
  song`; assert audition starts and `Stop` ends it (assert via state/UI, since
  audio output is not directly observable). → planner AC 2.
- **No-clear-pitch on a silent/noisy region:** drive a region known to yield no
  line (e.g. a near-silent fixture) and assert the `NoPitchState` appears and the
  app does not crash and shows no piano-roll. → planner AC 6.
- **390px:** at a 390px viewport, the chart panel has no horizontal overflow and
  the primary controls are visible and focusable. → T7.

### Copy sweep (QUALITY BAR §8) — part of DONE
Mechanically search every user-visible string added or edited in this EPIC
(`ChartPanel`, `PianoRoll`, `TranscribingState`, `NoPitchState`, the new
`LoopRoom` action, any labels) for `—`/`–`, banned vocabulary, and negative
empty-state phrasing. Every hit is a defect fixed in the same run.

---

## Definition of done
All six planner acceptance criteria are provable via the tests above:
transcription yields a monophonic in-browser note timeline within the region
(e2e, real model); the notes are auditionable alone and over the loop; pitch,
timing, delete, and add edits work and are retained as the practice step's source
of truth; a designed progress state shows during transcription and the loop
controls never freeze; the monophonic reduction is provably non-overlapping and
the single-note scope is stated plainly; a no-clear-pitch region shows a designed
state, never a crash and never zero-notes-as-success. The QUALITY BAR is met for
the chart surface (perceived speed and lazy-loaded model, mobile at 390px,
designed transcribing/no-pitch/empty-chart states, accessibility, one primary
action, human copy), no non-goal was built (no stem, no chords, no notation, no
mic/verdict, no persistence), and the copy sweep is clean.
