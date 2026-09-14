# EPIC SPEC — Mic verdict: call-and-response grading and accuracy fixtures

## Quality differentiator (read first)

**Trustworthy verification.** Needle Drop wins on one dimension: a note-by-note
verdict the player believes, on their own records, where every competitor either
never listens or listens only to its own catalog.

**What it demands of THIS EPIC:** this is the EPIC where the differentiator
ships. EPIC 2 made the target believable before practice (auditionable,
editable). This EPIC delivers the verdict itself. The whole product lives or
dies on one moment: the player finishes a pass and the machine tells them,
honestly, whether they matched the record. Two failures are fatal and this spec
guards against both:

1. **A false "wrong" at the moment of triumph destroys the product.** If the
   player nailed it and the verdict says otherwise, they stop trusting the tool.
   So grading is **generous and configurable** (pitch in cents, a timing window,
   an octave-tolerant option), it **aligns the whole take** before judging so a
   player who starts a hair late is not punished, and every correct-take fixture
   must pass at a false-negative rate under about 1 in 10. Believability is
   measured, not asserted.
2. **A false "right" is just as fatal.** Silence, noise, or a wrong note must
   never light up green. A take with no clear line can never be a pass, and
   wrong-note fixtures must always be flagged wrong. The verdict earns trust by
   being right in both directions.

The verdict must also be **legible**: each note shows pass or try-again, and the
player can see which note fell short and why (heard the wrong pitch, or did not
hear it). A verdict the player can inspect is a verdict the player believes.

Everything else in this EPIC is held to the standard QUALITY BAR.

---

## Scope

### In scope
Building on EPIC 1 (Loop Room, gapless region looping) and EPIC 2 (the
auditionable, editable target chart held in `LoopRoom` state), add the
**call-and-response mic verdict**:

- **Mic permission** requested behind a designed prompt in the product voice,
  with a designed state for **denied** and for **no device available**, each
  giving the next step, never a dead end.
- **Monophonic pitch tracking on the mic input**, as a **pure** analysis path
  (autocorrelation / YIN class) that runs on a `Float32Array` take, so the exact
  same code grades a live mic take and a fixture file.
- **The call-and-response cycle**, as an explicit state machine:
  1. **Count-in** clicks at the target tempo.
  2. **Reference:** the loop plays once through (backing audible) as the call.
  3. **Count-in**, then **record** the player's pass for one loop length with
     the **backing muted** and no click, capturing only the mic.
  4. **Grade** the completed take against the target chart. Grading happens
     **after the pass, once, on the whole take** — never mid-note, never while
     any backing plays.
  5. **Verdict.**
- **Per-note verdict and per-pass score:** each target note lights **pass** or
  **try again**; a per-pass score (percent of notes matched) appears.
- **Generous, configurable tolerances:** pitch tolerance in **cents**, a
  **timing window** in milliseconds, and an **octave-tolerant** toggle, all
  editable from a small grading-settings surface, all with generous defaults.
- **Success confirmation and save offer:** on a matching pass (every target note
  passes) the app confirms success in the product voice and **offers to save**
  the phrase to the riff-book. The save action is real this EPIC via a
  session-held store (see the EPIC 4 boundary below); it is never a dead button.
- **Automated fixture harness** under `npm test`: synthesized and file-based
  monophonic takes (clean, detuned, rushed, wrong-note, plus realistic
  imperfections) fed through the real pitch-track and grading path, proving the
  false-negative and wrong-note criteria.

### Out of scope (do not build — later EPICs own these, or a Non-Goal forbids them)
- **Real-time / mid-note grading.** Grading is per completed pass only. Do not
  build a live pitch display that grades notes as they are played. A live input
  **level meter** during recording (loudness, not correctness) is allowed as
  feedback; a live *correctness* readout is not.
- **Grading while the backing loop plays.** The reference play and the recorded
  pass are separate phases. Never sample the mic for grading while any backing
  or click sounds.
- **Polyphonic / chord verification.** One note at a time, matching the
  monophonic target. Do not attempt to grade two simultaneous pitches.
- **The riff-book store, browsing screen, streaks, spaced-repetition review, or
  export** — EPIC 4. This EPIC only *offers* to save and holds saved phrases in
  an in-memory session store so the offer is truthful. No IndexedDB, no
  riff-book screen, no streaks, no review, no export.
- **The guided first-run walkthrough and the baked-in demo chart** — EPIC 5.
  Reuse EPIC 1's bundled sample and EPIC 2's transcription as-is to reach the
  verdict; do not add walkthrough overlays.
- **Stem separation** — EPIC 6. Grade against the full-mix chart from EPIC 2.
- **A full Settings screen or mic-device picker.** The AC requires configurable
  pitch/timing/octave tolerances only; build exactly that grading-settings
  surface. Choosing among multiple input devices is out of scope (use the
  browser default device). Do not build a tuning-reference control here.
- **Tab or standard notation.** The verdict renders on the existing piano-roll
  and note list, not on a staff.

---

## Non-goals (binding — from the product plan)
- No real-time mid-note grading. Grading is per completed pass.
- No grading while the backing loop plays. Call-and-response only.
- No polyphonic or chord verification. Monophonic riffs and basslines only.
- No accounts, no backend, no audio ever leaving the machine. Mic capture and
  all analysis are client-side; the take is never uploaded and never logged.

---

## Technical design

The app stays **fully client-side**. There are **no HTTP API endpoints** and
**no persisted data-model migrations** in this EPIC. New state is in-memory
React state plus, optionally, `localStorage` for the tolerance settings. No new
runtime dependency is required: pitch tracking is hand-written DSP over Web
Audio's native `Float32Array` and `getUserMedia`, so the initial bundle does not
grow (QUALITY BAR §1).

### The unifying idea: one pure path for mic and fixtures
The mic take and every fixture reach grading as the same shape:

```ts
export interface Take {
  samples: Float32Array; // mono PCM
  sampleRate: number;    // Hz
}
```

Capture (mic or WAV decode) is a thin, injectable shell. Everything that decides
the verdict is **pure and deterministic**, so the fixture harness exercises the
identical code the live mic uses. This is what makes the accuracy criterion
provable and the verdict believable.

### Files / modules to touch

New — pure analysis core (no Web Audio, no DOM; fully unit-tested):
- `src/audio/pitch-detect.ts` — single-frame monophonic pitch detection.
  `detectPitch(frame: Float32Array, sampleRate: number, opts?) => { hz: number;
  clarity: number } | null`. Recommended: **YIN** (difference function →
  cumulative mean normalized difference → absolute threshold → parabolic
  interpolation), which tracks bass and guitar reliably; plain autocorrelation
  with parabolic interpolation is acceptable if it meets the fixture bar. The
  analysis window MUST be long enough to resolve `MIDI_MIN` (E1, ~41 Hz, ~24 ms
  period): use a window of at least ~2048 samples at 22050 Hz (recommend ~93 ms,
  e.g. 2048 at 22050 or 4096 at 44100), so at least two periods of the lowest
  supported note fit. Also export `hzToMidi(hz) => number` (float MIDI) as the
  inverse of `midiToFreq`.
- `src/audio/pitch-track.ts` — walks a whole take.
  `trackPitch(take: Take, opts?) => PitchFrame[]` where
  `PitchFrame = { timeSec: number; midi: number | null; clarity: number }`.
  Hops a window across the take (recommend ~10 ms hop), calls `detectPitch` per
  hop, marks a frame **unvoiced** (`midi: null`) when clarity is below a
  threshold or the frame energy is below a noise floor. (Implementer may merge
  this file into `pitch-detect.ts`; keep the pure boundary either way.)
- `src/audio/grade.ts` — the heart. Pure grading of a pitch track against a
  target `Note[]`:
  ```ts
  export interface Tolerances {
    cents: number;         // pitch tolerance, +/- cents. Default 50.
    timingWindowSec: number; // +/- window around each note. Default 0.12.
    octaveTolerant: boolean;  // ignore octave errors. Default true.
  }
  export const DEFAULT_TOLERANCES: Tolerances;
  export type NoteStatus = "pass" | "wrong-pitch" | "not-heard";
  export interface NoteVerdict { noteId: string; status: NoteStatus; heardMidi: number | null; }
  export interface PassResult {
    perNote: NoteVerdict[];
    score: number;    // 0..100, round(100 * passed / total)
    matched: boolean; // true only when EVERY target note passes
    offsetSec: number; // the global alignment offset that was applied
    heardLine: boolean; // false when the take is silence/noise (never a pass)
  }
  export function gradePass(frames: PitchFrame[], target: Note[], tol: Tolerances): PassResult;
  export function estimateOffset(frames: PitchFrame[], target: Note[], tol: Tolerances): number;
  ```
  Algorithm (deterministic):
  1. **Heard-line guard.** If the voiced frames cover a negligible fraction of
     the take (reuse the spirit of `isClearEnough`), set `heardLine: false`,
     every note `not-heard`, `matched: false`, score 0. Silence and noise can
     never pass. This is the false-positive guard.
  2. **Global offset alignment.** Search a bounded offset (e.g. within ±0.3 s)
     for the value that maximizes the number of passing notes (tie-break by
     lowest total pitch error). Apply it before per-note grading, so a take that
     starts slightly late is not penalized. Bounded and pure.
  3. **Per-note grade.** For each target note, gather voiced frames whose time
     (after offset) lies in `[start - timingWindowSec, start + durSec +
     timingWindowSec]`. Take the **median** MIDI of the voiced frames in the
     note's core span (trim attack/release edges). Compare to the target MIDI:
     pass when `|heardMidi - targetMidi| <= cents/100` in MIDI units; when
     `octaveTolerant`, pass when that holds for `targetMidi + 12*k` for any
     integer `k`. Require a minimum voiced fraction of the note's span (e.g.
     ≥ ~40%) to count as heard at all; otherwise `not-heard`. If heard but the
     pitch is off, `wrong-pitch`.
  4. `matched` is true only when every note is `pass` AND `heardLine` is true.
- `src/audio/wav.ts` — pure `readWavPcm(bytes: Uint8Array) => Take` for the
  fixture harness to decode 16-bit PCM WAVs without Web Audio (the mirror of the
  writer in `scripts/gen-audio.mjs`). Reused by unit tests only, not shipped on
  a hot path.

New — thin Web Audio / DOM shells (kept minimal; behind injectable interfaces):
- `src/audio/mic.ts` — the capture boundary.
  ```ts
  export type MicPermission = "granted" | "denied" | "unavailable";
  export interface MicRecorder {
    requestPermission(): Promise<MicPermission>;
    record(durationSec: number, onLevel?: (rms: number) => void): Promise<Take>;
    dispose(): void;
  }
  ```
  Real `WebMicRecorder`: `getUserMedia({ audio: { echoCancellation: false,
  noiseSuppression: false, autoGainControl: false } })` (raw signal grades
  better), capture raw PCM via an `AudioWorklet` (preferred) or
  `ScriptProcessorNode` fallback into a `Float32Array` at the context sample
  rate, and emit RMS for the live meter. `requestPermission` maps a
  `NotAllowedError`/`SecurityError` to `denied` and a missing device / no
  `mediaDevices` to `unavailable`. Component tests inject a fake recorder, so
  they never touch `getUserMedia` (same pattern as `Transcriber`).
- `src/audio/metronome.ts` — the count-in. A pure `planClicks(count, bpm,
  startAt) => { at: number }[]` (unit-tested) plus a thin oscillator shell that
  schedules short clicks, mirroring `note-synth.ts`. Reuse for both count-ins.

New — UI:
- `src/components/PracticePanel.tsx` — the call-and-response surface and its
  state machine (`prompt | denied | unavailable | ready | countin | reference |
  recording | grading | verdict`). Renders the mic prompt/denied/unavailable
  states, the count-in, the reference-play indicator, the recording indicator
  with a live level meter, the per-note verdict lights over the target notes,
  the per-pass score, the success confirmation + save offer, and the grading
  tolerances controls. Takes the target `Note[]`, the source buffer + region
  (for reference play, reusing `LoopPlayer` or `Audition.playWithSong`), an
  injectable `MicRecorder`, `Tolerances` + a change handler, and `onSave`.
- `src/components/states/MicPrompt.tsx` — the designed permission request and
  the denied / unavailable variants (a small component with a `variant` prop, or
  three tiny components). Each states the next step; none is a dead end.

Changed:
- `src/components/ChartPanel.tsx` — add the primary action that enters practice
  once the player has agreed the chart is right: **`Check my take`**. Keep
  exactly one visually dominant primary action per state (QUALITY BAR §7): when
  the chart is ready and non-empty, `Check my take` is primary and audition
  drops to secondary; disable `Check my take` on an empty chart with a hint.
- `src/components/LoopRoom.tsx` — add a `practice` phase reachable from the
  ready chart; render `PracticePanel` with a path back to the chart. Own the
  `Tolerances` state (default `DEFAULT_TOLERANCES`, optionally persisted to
  `localStorage`), own the in-memory saved-phrases session store and the
  `onSave` handler, and construct/inject the `MicRecorder` (default
  `WebMicRecorder`, injectable for tests, disposed on unmount alongside the
  existing player/audition/transcriber cleanup).
- `src/styles/global.css` — practice panel, mic prompt/denied states, count-in,
  recording indicator + level meter, per-note verdict lights (pass/try-again),
  score, success confirmation, and the tolerances controls. Mobile-first at
  390px, reusing existing CSS variables and control classes.
- `scripts/gen-audio.mjs` (or a new `scripts/gen-takes.mjs`) — extend to
  synthesize the take battery into `tests/fixtures/takes/` (see Test plan) and,
  for e2e, a **correct-take capture WAV** matching the bundled sample phrase for
  Chromium's fake audio device. Document the command in the script header.
- `playwright.config.ts` — add Chromium launch args so getUserMedia is driven by
  a file: `--use-fake-device-for-media-stream`,
  `--use-file-for-fake-audio-capture=<abs path to the capture WAV>` (16-bit PCM
  WAV), and grant/deny the `microphone` permission per test via the Playwright
  context. Keep the existing run-scoped-port e2e setup intact.
- `package.json` — add a `gen:takes` script if a separate generator is used. No
  new runtime dependency.
- `README.md` — add the mic verdict step to the "How it works" / usage sections
  in the stranger-facing voice (drop a song, chart it, play it back, get a
  note-by-note verdict, everything on your machine), and document that
  `npm test` includes the accuracy fixture harness. Sweep the new copy.

### The call-and-response state machine (binding order)
`PracticePanel` progresses strictly:
`prompt → (permission) → ready → countin → reference → countin → recording →
grading → verdict`, with `denied`/`unavailable` reachable from the permission
step and a `Try again` returning to `ready`/`recording` from the verdict. Two
invariants are **testable and binding**:
- **Grading runs once, after recording ends, on the whole take.** `gradePass` is
  called exactly once per pass, in the `grading` phase, never during `reference`
  or `recording`.
- **No backing during the recorded pass.** In `recording`, no `LoopPlayer`,
  `Audition`, or metronome node is sounding. The reference play (backing
  audible) is a distinct earlier phase.

### Perceived speed and feedback (QUALITY BAR §1)
- Pressing the practice action, the count-in beats, and the recording indicator
  all render/respond within 100 ms (synchronous state updates; the count-in and
  recording indicator appear the instant the phase changes). The live level
  meter animates during recording so the surface is visibly alive.
- Grading is fast pure DSP over a few seconds of mono audio, so the verdict
  appears within a fraction of a second after recording ends. Show a brief,
  layout-stable `grading` state; never a spinner with no end.

### Security / hygiene (static client app)
- **No new network surface.** The mic take is analyzed locally and never
  uploaded (verifiable in the network panel: recording and grading issue no
  requests). getUserMedia is requested only on explicit user action.
- **No PII in logs.** Never attach the take, RMS levels, note data, or file
  names to Sentry events. The mic take exists only in memory for the pass.
- **Boundary validation.** Clamp tolerance inputs to sane ranges (e.g. cents
  1..200, timing 0..0.5 s); reject non-finite values. The grader tolerates a
  malformed/empty pitch track by returning a non-matching result, never
  throwing.

### Copy (already swept — no em/en dashes, positive, plain)
- Chart primary action (enter practice): `Check my take`.
- Mic prompt: heading `Let Needle Drop hear you play`, body `Turn on your mic so
  it can check your take. Your audio stays on this machine.`, action `Turn on
  mic`.
- Mic denied: heading `Turn on your mic`, body `Allow mic access in your browser,
  then try again.`, action `Try again`.
- Mic unavailable (no device): heading `Connect a microphone`, body `Plug in a
  mic, then try again.`, action `Try again`.
- Ready: primary `Start`, helper `You will hear the phrase once, then play it
  back after the count.`
- Reference phase label: `Here is the phrase`.
- Recording label: `Your turn` with a recording indicator and live level meter.
- Grading label: `Checking your take`.
- Verdict, matched: heading `You played it`, line `Every note matched.`, score
  shown as a percent, actions `Save to riff-book` (primary) and `Play it again`.
- Verdict, partial: heading `Close`, line `{passed} of {total} notes matched.`,
  actions `Try again` (primary) and `Hear it again`. Per-note aria labels:
  `{name} matched` / `{name} try again`.
- Verdict, nothing heard: heading `I did not catch that`, body `Play a little
  louder, or move closer to the mic, then try again.`, action `Try again`.
  (States the next step; not a dead end.)
- Save confirmation: `Saved to your riff-book.`
- Tolerances controls: `Pitch tolerance (cents)`, `Timing window (ms)`,
  `Ignore octave`.
Sweep every string added or edited in this EPIC before finishing (QUALITY
BAR §8): the characters `—`/`–`, the banned vocabulary, and negative empty-state
phrasing.

---

## Ordered task list (each with acceptance criteria)

### T1 — Pure pitch tracking core
Add `pitch-detect.ts` and `pitch-track.ts` (+ `hzToMidi`).
- **AC:** `detectPitch` returns the fundamental within a few cents on synthesized
  sines across the supported range (E1, E2, A2, A4), and returns null / low
  clarity on silence and white noise. Unit-tested.
- **AC:** `trackPitch` on a synthesized two-note phrase yields voiced frames at
  the correct MIDI numbers in the correct time spans, and unvoiced frames over
  silence. Unit-tested.

### T2 — Pure grading core + tolerances
Add `grade.ts` with `DEFAULT_TOLERANCES`, `estimateOffset`, `gradePass`.
- **AC:** A clean matching take grades to all notes `pass`, score 100,
  `matched: true`. A take with one wrong note flags that note `wrong-pitch` and
  `matched: false`. (Maps to planner AC 3, 4.)
- **AC:** Detune within `cents` passes; beyond it is `wrong-pitch`. Timing rush
  within `timingWindowSec` passes; beyond it the note is not matched. An
  octave-shifted take passes with `octaveTolerant: true` and fails with it off.
  A globally-late take is rescued by `estimateOffset`. A silent/noise take has
  `heardLine: false` and never matches. Unit-tested. (Maps to planner AC 3, 4;
  guards the differentiator both ways.)

### T3 — Mic capture shell + metronome
Add `mic.ts` (`MicRecorder` interface, `WebMicRecorder`, and a fake for tests)
and `metronome.ts` (pure `planClicks` + thin shell).
- **AC:** `WebMicRecorder.requestPermission` resolves `granted` on success,
  `denied` on `NotAllowedError`, `unavailable` when no device / no
  `mediaDevices`; `record` returns a `Take` of the requested length at the
  context sample rate and emits RMS. Verified via a component/integration test
  with a fake `getUserMedia` (unit-level where practical).
- **AC:** `planClicks` returns the right number of clicks at the right times for
  a tempo. Unit-tested. (Maps to planner AC 6, count-in feedback.)

### T4 — PracticePanel state machine + mic states
Add `PracticePanel.tsx` and `MicPrompt.tsx`; wire `LoopRoom` `practice` phase and
the `Check my take` entry from `ChartPanel`.
- **AC:** The mic is requested behind the designed prompt; a denied or
  unavailable mic shows its designed state with a next step, never a dead end.
  (Maps to planner AC 1.)
- **AC:** The cycle runs reference (backing audible) then records with the
  backing muted, and grading runs once after recording ends, never mid-note and
  never while backing plays. (Maps to planner AC 2; enforces both Non-Goals.)

### T5 — Verdict, score, success + save offer
Render per-note pass/try-again lights, the per-pass score, the success
confirmation, and the save offer wired to `onSave` (session store).
- **AC:** After a pass, each target note shows a pass or try-again indicator and
  a per-pass score appears. (Maps to planner AC 3.)
- **AC:** On a matching pass the app confirms success in the product voice and
  offers to save; saving calls `onSave` and confirms. (Maps to planner AC 4.)

### T6 — Configurable tolerances surface
Add the grading-settings controls (cents, timing window, octave-tolerant),
generous defaults, changes applied to grading.
- **AC:** Pitch cents and a timing window are configurable and generous by
  default; the octave-tolerant option is present; changing a tolerance changes
  the grade of a borderline take. (Maps to planner AC 3, "generous and
  configurable".)

### T7 — Accuracy fixture harness
Add the take battery generator and the Vitest harness that feeds every take
through `trackPitch` → `gradePass`.
- **AC:** Under `npm test`, correct-take fixtures (clean plus realistic
  imperfections) match at a **false-negative rate under about 1 in 10**, and
  every wrong-note fixture is **flagged wrong** (`matched: false` and the wrong
  note not `pass`). (Maps to planner AC 5 — the headline accuracy criterion.)

### T8 — Feedback timing, mobile, accessibility, copy sweep
- **AC:** Count-in, recording indicator, and pressed states render within 100 ms
  of the triggering action; the verdict appears promptly after recording ends.
  (Maps to planner AC 6.)
- **AC:** The practice panel is usable at 390px with no horizontal scroll, ~44px
  touch targets, labeled controls, visible focus, full keyboard reach, and an
  `aria-live` region announcing the verdict.
- **AC:** No user-visible string added or edited in this EPIC contains `—`, `–`,
  banned vocabulary, or negative empty-state phrasing.

---

## Test plan (which tests prove each criterion)

### Unit (Vitest, pure — no Web Audio, no DOM)
- `pitch-detect.ts`: fundamentals within a few cents on synthesized sines at E1,
  E2, A2, A4; null/low clarity on silence and noise; `hzToMidi` inverts
  `midiToFreq`. → T1.
- `pitch-track.ts`: a synthesized two-note phrase yields the right voiced MIDIs
  in the right spans; silence yields unvoiced frames. → T1.
- `grade.ts`: clean match → all pass, score 100, matched; wrong note →
  `wrong-pitch`, not matched; detune/timing at and beyond tolerance; octave
  shift with the flag on vs off; global-offset rescue via `estimateOffset`;
  silence/noise → `heardLine: false`, never matched. → T2 (the core proof of a
  believable verdict in both directions).
- `metronome.ts` `planClicks`: correct count and times for a tempo. → T3.
- `wav.ts` `readWavPcm`: round-trips PCM written by the generator. → T7 support.

### Accuracy fixture harness (Vitest — the headline AC, runs under `npm test`)
Generate a battery into `tests/fixtures/takes/` from a small set of known target
phrases (reuse the bundled bass line and a second short phrase). For each phrase:
- **Correct takes** (each should match): clean; slight detune within tolerance;
  slight rush/drag within the timing window; global late start; added vibrato;
  richer timbre (added harmonics); a modest noise floor; octave-up (graded with
  `octaveTolerant: true`). These model synthesized and recording-like conditions.
- **Wrong takes** (each must be flagged wrong): one note replaced by a wrong
  pitch; a phrase transposed by a non-octave interval; a phrase of the wrong
  notes throughout.

The harness decodes each WAV via `readWavPcm` (and/or synthesizes the take in
memory), runs `trackPitch` → `gradePass` with `DEFAULT_TOLERANCES`, and asserts:
- Across all correct takes, the fraction that fail to match is **under ~1/10**.
- Every wrong take has `matched: false` and its wrong note(s) are not `pass`.
Any recorded WAV dropped into the takes directory is graded by the same pure
path, so the harness "feeds synthesized and recorded monophonic phrases through
the grading path" as the planner scope requires. If a synthesis choice is too
easy to be meaningful, tighten the imperfection models rather than the
assertions. → planner AC 5.

### Component (Vitest + RTL, jsdom — injected fake `MicRecorder`)
jsdom has no getUserMedia/Web Audio, so tests inject a fake recorder that
returns a known `Take` (or the panel accepts an injected grade for pure-UI
tests). Tests:
- Mic prompt renders; granting proceeds to `ready`; denying shows the denied
  state with a next step; `unavailable` shows its state. No dead end. → AC 1.
- Cycle order: reference precedes recording; `gradePass` (spied) is called
  exactly once, after recording, never during reference/recording; no backing
  node sounds during recording. → AC 2 and both Non-Goals.
- Verdict: given a known `PassResult`, each target note shows a pass/try-again
  indicator and the per-pass score renders; the verdict is in an `aria-live`
  region. → AC 3.
- Success: a matching result shows the success confirmation in the product voice
  and the save offer; clicking `Save to riff-book` calls `onSave` and shows the
  confirmation. → AC 4.
- Tolerances: changing cents/timing/octave updates the tolerances passed to the
  next grade (and re-grades a held take if applicable). → AC 3 "configurable".
- Feedback: the recording indicator and count-in appear synchronously on phase
  change (rendered immediately, no awaited round-trip). → AC 6.

### End-to-end (Playwright — real getUserMedia via Chromium fake device)
Launch Chromium with the fake audio device fed by a generated capture WAV that
matches the bundled sample phrase; grant the `microphone` permission via the
Playwright context.
- **Full pass, real mic path:** load the sample, `Find the notes`, `Check my
  take`, `Start`; assert the count-in and recording indicator appear, then the
  verdict surface appears with per-note indicators and a score. With the
  matching capture and generous defaults, assert a passing verdict (green
  notes). If exact alignment proves flaky in CI, assert the verdict surface,
  per-note lights, and score render and that a clearly-matching capture passes
  under generous tolerance; the deterministic accuracy proof rests on the Vitest
  harness, and this test proves the wiring end to end. → AC 1, 2, 3, 6.
- **Denied mic:** deny the `microphone` permission and assert the denied state
  appears with a next step and no crash. → AC 1.
- **No audio left the origin:** during the recorded pass and grading, assert no
  request left the app's host (network-panel assertion, as in EPIC 1). → privacy
  / security hygiene.
- **390px:** at a 390px viewport, the practice panel has no horizontal overflow
  and the primary controls are visible and focusable. → T8.

### Copy sweep (QUALITY BAR §8) — part of DONE
Mechanically search every user-visible string added or edited in this EPIC
(`PracticePanel`, `MicPrompt`, the `ChartPanel` action, verdict/score/settings
labels, the README additions) for `—`/`–`, banned vocabulary, and negative
empty-state phrasing. Every hit is a defect fixed in the same run.

---

## Definition of done
All six planner acceptance criteria are provable via the tests above: the mic is
requested behind a designed prompt and denied/unavailable states are dead-end
free (component + e2e); the cycle plays the reference then records with the
backing muted and grades once after the pass, never mid-note and never over
backing (component invariants + e2e); each target note shows pass/try-again with
a per-pass score under generous, configurable pitch-cents / timing / octave
tolerances (unit + component); a matching pass confirms success in the product
voice and offers a real save (component); the accuracy fixture harness runs under
`npm test` with correct-take false negatives under about 1 in 10 and every
wrong-note fixture flagged wrong (fixture harness); and count-in, recording
indicator, and pressed states land within 100 ms with the verdict prompt after
the pass (component + e2e). The QUALITY BAR is met for the practice surface
(perceived speed, no bundle growth, mobile at 390px, designed
prompt/denied/grading/verdict/nothing-heard states, accessibility with an
aria-live verdict, one primary action, human copy), no Non-Goal was built (no
mid-note grading, no grading over backing, no polyphony, no riff-book
persistence/screen/streaks/review/export, no stem separation), and the copy
sweep is clean.
