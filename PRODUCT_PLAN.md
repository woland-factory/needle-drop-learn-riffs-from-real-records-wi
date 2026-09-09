# PRODUCT PLAN: Needle Drop

## Core value (one sentence)

Loop two bars of a record you own, play them back into your mic, and get a
trustworthy note-by-note verdict when you finally matched the record, with every
conquered phrase saved to a personal riff-book.

## North star

A year in, Needle Drop is the verified map of a player's own hands: a riff-book
of phrases lifted from the records they actually love, each one witnessed by the
machine rather than self-reported. The excellent version feels like earned
confidence. You do not think "I might be close." You know you played it, because
something you trust told you so, on music you chose. The standard is that the
verdict is believable every single time. A player returns not out of habit but
because the book remembers what their hands can do and quietly nudges the phrases
slipping out of reach. The measure of success is how many phrases from a person's
own music they have genuinely conquered and kept.

## Quality differentiator

**Trustworthy verification.** Every competitor either never listens (Moises,
Soundslice) or listens only to its own catalog (Yousician, Rocksmith+). The one
dimension Needle Drop must beat all of them on is a verdict the player believes.
That is not a slogan, it is the whole risk: the target is machine-derived twice
over (separation feeds transcription), so a single false "wrong note" at the
moment of triumph destroys the product. We win by making the target always
auditionable and editable before practice, grading per completed pass under
generous tolerance, and scoping to the monophonic case where pitch tracking is
mature. Believability is the product.

## Signature moment

"I dropped an MP3 of the actual record into a webpage, played my bass into the
laptop mic, and it told me, note by note, the moment I finally matched the
record." The green notes lighting up one by one after a pass, on a song you chose
because you love it.

## Who it is for

Self-taught guitarists and bassists who learn by ear from records they own (the
lift-the-needle tradition). Bass players especially, where single-note lines make
verification most reliable. Also teachers assigning "get these two bars verified,"
and adult returners rebuilding repertoire from their own collections.

## Plain-language descriptions

- **Layperson summary:** Drop in a song you own, pick a short part you want to
  learn, and the app listens through your microphone and tells you when you have
  played it right. It keeps a scrapbook of every bit you master.
- **Product pitch:** Needle Drop is a browser practice room for guitarists and
  bassists who learn songs by ear. Load a track from your own collection, loop
  the couple of bars you are chasing, then play them into your mic and get a clear
  verdict on whether you nailed it, note by note. Everything runs on your own
  machine, so your music never leaves it, and every phrase you conquer is saved in
  a riff-book you can look back on and export.

## Binding conditions (from VALIDATION.md, carried forward)

1. Monophonic riffs and basslines only, stated plainly in-product.
2. Call-and-response grading. Never grade while the backing loop plays.
3. The target chart is always auditionable and editable before practice.
4. A pre-processed demo riff ships in the app for the first-run path.
5. The core loop must survive with stem separation unavailable.
6. Automated verification-accuracy fixtures are acceptance criteria of the
   mic-verdict EPIC.

## Architecture at a glance

Fully client-side single-page app. No backend, no accounts, no server ML, no
runtime LLM, no audio ever uploaded. Static hosting; running cost is effectively
zero.

- **Framework:** Vite + React + TypeScript SPA.
- **Audio:** Web Audio API for loading, gapless looping, slow-down, playback, and
  synthesized note audition; getUserMedia for mic capture.
- **Transcription:** `@spotify/basic-pitch` (browser audio-to-MIDI), reduced to a
  monophonic note list.
- **Pitch tracking (mic):** in-browser monophonic tracker (autocorrelation / YIN
  class) for the verdict.
- **Stem separation:** in-browser Demucs (WebGPU) as an enhancement layer, with a
  full-mix fallback.
- **Storage:** IndexedDB for the riff-book (clips, notes, metadata).
- **Ops:** GlitchTip/Sentry via `SENTRY_DSN`, Umami via `UMAMI_WEBSITE_ID` /
  `UMAMI_URL`, all injected at deploy time and optional at runtime.
- **Deploy:** static build served by nginx in a Dockerfile, with
  `docker-compose.staging.yml`.

## User stories (MVP)

- As a learner, I load a song from my own files and see its waveform, so I can
  find the part I want.
- As a learner, I drag out a loop region and snap it to two bars, then loop it
  slowed down, so I can hear the phrase clearly.
- As a learner, I get a note chart of the phrase that I can play back and correct,
  so I trust the target before I practice against it.
- As a learner, I play the phrase into my mic after the loop and get a note-by-note
  verdict on the pass, so I know when I actually matched it.
- As a learner, every phrase I conquer is saved with its clip, notes, and a
  streak, so my riff-book becomes a record of what I can play.
- As a returning learner, phrases I have not touched resurface as due for review,
  so I keep my repertoire sharp.
- As a first-time visitor, a bundled demo riff lets me reach the verdict in under
  a minute, before downloading anything.
- As a learner on a modest laptop, I can still loop, chart, verify, and save even
  when stem separation is unavailable.

## Data model (sketch)

**Riff** (a conquered phrase, in IndexedDB):
- `id`, `title`, `sourceName`
- `clip` (audio blob of the loop region)
- `loopRegion` `{startSec, endSec, bars, tempoBpm, speed}`
- `notes[]` `{midi, startSec, durSec, confidence, edited}`
- `stemUsed` (`bass | guitar | other | mix`)
- `dateFirstNailed`, `bestScore`
- `streak`, `lastPracticed`, `reviewDueDate`

**Settings** (local): input device id, tuning reference (A440), pitch tolerance
(cents), timing tolerance, octave-tolerant flag, default playback speed.

No server-side entities. No user records.

## Screen / surface inventory

Client-only, so there are no HTTP endpoints. Surfaces:
- **Loop Room** (home + first-run entry): drop zone, waveform, loop region
  handles, tempo/bars snap, speed control.
- **Chart panel:** detected notes on a timeline, audition, edit (pitch, timing,
  delete, add).
- **Practice / Verdict:** count-in, call-and-response record, per-note result,
  per-pass score, save prompt.
- **Riff-book:** list of conquered phrases, streaks, due-for-review, re-practice,
  export, delete.
- **Settings:** mic device, tuning, tolerances, clear data.

## EPICs (build order)

Each EPIC is independently reviewable. The core value is delivered by EPIC 3 and
made demoable on staging by EPIC 5. Stem separation is deliberately last before
polish because it is the highest-risk-of-stall piece and is not load-bearing for
the core loop.

### EPIC 1: Loop Room and staging deploy scaffold
**Scope:** Scaffold the Vite + React + TS SPA. Add the Dockerfile (static build
served by nginx) and `docker-compose.staging.yml` per the deploy contract. Wire
`SENTRY_DSN` and Umami env with graceful absence. Build the Loop Room: load a
local audio file (mp3/wav/ogg/flac) with no upload, render a waveform, drag a loop
region, snap it to two bars via a tempo+bars input, adjust playback speed
(50% to 100%), and loop gaplessly. Write the stranger-facing README. Designed empty,
loading, and error states. Mobile-first at 390px.

**Acceptance criteria:**
- `docker compose -f docker-compose.staging.yml up` builds the image and serves
  the SPA on the documented port; the root shows real content within about a
  second, never a blank page.
- Dockerfile and `docker-compose.staging.yml` exist at the repo root and are the
  path staging uses.
- A user loads a local audio file and sees its waveform; no audio is sent over
  the network (all processing is client-side, verifiable in the network panel).
- The user drags a loop region, sets tempo and bars to snap it to two bars, and
  hears it loop with no gap at a chosen speed between 50% and 100%.
- Empty state tells the user to drop a song and shows the demo entry point;
  loading holds layout steady; errors speak in the product voice with a next step.
- Usable at 390px with no horizontal scroll, ~44px touch targets, one obvious
  primary action, visible focus states, full keyboard reach.
- README lets a stranger understand, run (commands verified against the compose
  files), and contribute; no factory internals.
- The app runs correctly when `SENTRY_DSN` and Umami env are unset.

### EPIC 2: Target chart: transcribe, audition, edit
**Scope:** Run `@spotify/basic-pitch` on the selected loop region (full mix at
this stage) and reduce it to a monophonic note list (one note per moment; drop
overlaps). Render notes on a simple piano-roll timeline aligned to the loop.
Audition: play the detected notes as synthesized tones, alone and against the
loop. Edit: change a note's pitch, nudge its timing, delete a note, add a missed
one. State plainly that only single-note riffs and basslines are supported. This
EPIC is the trust mitigation and must not be trimmed.

**Acceptance criteria:**
- Running transcription on a loop region yields a monophonic note timeline within
  the region, entirely in-browser.
- The detected notes are auditionable: the user plays them back as tones, both
  alone and over the loop.
- The user can delete a note, change a note's pitch, and nudge a note's timing,
  and the edits carry into the practice step.
- Transcription shows a designed progress state and never freezes the loop
  controls.
- Monophonic enforcement is real: overlapping input reduces to one note per
  moment, and the UI states the single-note scope plainly.
- A region with no clear pitch shows a designed state asking for a clearer region,
  never a crash and never zero notes presented as success.

### EPIC 3: Mic verdict: call-and-response grading and accuracy fixtures
**Scope:** Request mic permission with a designed prompt and denied state. Track
monophonic pitch on the mic input. Run the call-and-response cycle: play the loop
once with a count-in, then record the user's pass with the backing muted, then
grade the completed pass against the target chart. Light each note pass or retry,
show a per-pass score, and apply generous, configurable pitch (cents) and timing
tolerance with an octave-tolerant option. Confirm success in the product voice and
offer to save. Build an automated fixture harness that feeds synthesized and
recorded monophonic phrases (clean, detuned, rushed, wrong-note) through the
grading path.

**Acceptance criteria:**
- Mic permission is requested with a designed prompt; a denied or unavailable mic
  shows a state that explains the next step, never a dead end.
- The loop plays for reference, then grading records the user's pass with the
  backing muted (call-and-response), and grading happens after the pass, not
  mid-note.
- After a pass, each target note shows a pass or retry indicator and a per-pass
  score appears; tolerances are generous and configurable (at least pitch cents
  and a timing window).
- On a matching pass the app confirms success in the product voice and offers to
  save the phrase to the riff-book.
- Automated fixture harness runs under `npm test`: correct-take fixtures produce a
  false-negative rate under about 1 in 10, and wrong-note fixtures are flagged
  wrong.
- Interaction feedback (count-in, recording indicator, pressed states) lands
  within 100ms; the verdict appears promptly after the pass.

### EPIC 4: Riff-book: local-first store, streaks, review decay, export
**Scope:** IndexedDB store. On a confirmed phrase, save the clip, notes, source
name, region, stem used, date first nailed, streak, last practiced, review-due
date, and best score. Build the riff-book screen: list phrases with streaks,
surface phrases due for review on a spaced-repetition schedule, re-open a phrase
to practice again (streak grows on a re-pass, decays to due when overdue). JSON
export of notes and metadata plus clips. Delete a phrase.

**Acceptance criteria:**
- Saving a conquered phrase persists it in IndexedDB and it survives a reload.
- The riff-book lists phrases with streak and date first nailed, and surfaces
  overdue phrases as due for review via a spaced-repetition schedule.
- Re-practicing a due phrase and passing updates its streak and next review date;
  an untouched phrase decays to due after its interval.
- JSON export produces a file containing notes and metadata for all phrases along
  with clip data or references. Import is out of scope.
- The empty riff-book shows a designed state pointing to the Loop Room to conquer
  a first phrase, in positive phrasing.
- Deleting a phrase removes it and its stored clip with no orphaned blobs.

### EPIC 5: First-run walkthrough and bundled demo riff
**Scope:** Ship a pre-processed, self-produced monophonic demo phrase (a short
bass or guitar riff with its region and chart baked in) so first value needs no
download and no file hunt. Build a guided first-run path of 2 to 4 steps anchored
to the real controls: play the demo loop, inspect the chart, play the phrase for a
verdict, save it. Skippable at any step, shown only until first success, never
again for a returning user. Honor the `SEED_DEMO` convention (when the staging
contract block is present) so the deployed app reaches the verdict within a minute.

**Acceptance criteria:**
- On first visit the bundled demo riff loads instantly (no model download, no file
  picking) and can be taken through loop, chart, and mic verdict.
- The guided path is 2 to 4 steps, each one short imperative sentence anchored to
  a real control, skippable at any step, and it disappears after first success and
  does not return for a returning user.
- On staging with `SEED_DEMO` enabled, the deployed app reaches the green-note
  verdict on the demo riff within a minute with no hand-crafted input.
- The demo produces a real, non-empty verdict (green notes), never a zero-note
  sample.
- First-run copy passes the sweep: no em-dashes or en-dashes, no banned
  vocabulary, positive phrasing.

### EPIC 6: Stem isolation (client-side Demucs), enhancement with degradation
**Scope:** Integrate in-browser Demucs (WebGPU) to isolate the target instrument
before transcription, improving chart quality. Let the user pick which stem to
chart against. Frame progress honestly during model download and processing, with
layout held steady. Degradation ladder: no WebGPU or a separation failure falls
back to the full-mix chart from EPIC 2. Cache model assets after first download.
This EPIC is an enhancement; the core loop must remain fully working without it.

**Acceptance criteria:**
- On a WebGPU-capable browser the user separates a song into stems and picks a
  stem to chart and practice against; the chart runs on the isolated stem.
- Progress during download and processing is shown honestly with the layout held
  steady, and the user can keep using the loop and full-mix chart meanwhile.
- On a browser without WebGPU, or when separation fails, the app falls back to the
  full-mix path with a calm message and the core loop still works end to end.
- Downloaded model assets are cached so a second separation does not re-download.
- No audio leaves the machine during separation (verifiable in the network panel).

### EPIC 7: Polish pass (polish)
**Scope:** No new features. A UX, performance, accessibility, and copy pass over
the whole delivered product against the QUALITY BAR and the trustworthy-verification
differentiator. Tighten empty, loading, and error states, perceived speed, mobile
at 390px, accessibility, and every user-visible string. Confirm the differentiator
is reachable in the first minute on staging.

**Acceptance criteria:**
- First meaningful render is about a second on staging, every interaction gives
  feedback within 100ms, and the riff-book list is capped or paginated so it does
  not slow down as it grows.
- Every screen passes at 390px: no horizontal scroll, ~44px touch targets,
  readable text.
- Empty, loading, and error states are reviewed and designed on every screen: no
  white screens, no raw stack traces.
- Accessibility verified: contrast, visible focus, labeled inputs, semantic
  structure, and full keyboard reach.
- A copy sweep across all user-visible strings finds zero em-dashes or en-dashes,
  zero banned vocabulary, and positive empty-state phrasing.
- The signature moment (green notes on the demo riff verdict) is reachable within
  a minute on the deployed staging app, verified end to end.
- No new features are added; changes only tighten what exists.

## Non-goals / out of scope

- Chord, strum, or any polyphonic verification. Monophonic riffs and basslines
  only.
- Real-time mid-note grading. Grading is per completed pass.
- Tab or standard notation rendering.
- Accounts, login, server sync, or cloud storage.
- Any server-side ML, or uploading audio anywhere.
- Providing, hosting, or supplying any music or catalog. The user brings their own
  files.
- Social features, sharing feeds, or leaderboards.
- Runtime LLM features. None are needed anywhere in the product.
- Riff-book import. Export only for the MVP.
- A native or mobile app. Browser only.
