# VALIDATION — Needle Drop

**Verdict: VIABLE** — conditional on the scope fences below being treated as
binding by the plan. Built without them, this idea fails exactly the way the
premortem predicts.

## Core value proposition

Close the feedback loop of learning-by-ear: loop two bars of a record you own,
play along into your mic, and the machine tells you note by note when you
finally matched the record — all processed on your own machine, nothing
uploaded. The durable artifact is the riff-book: a verified, exportable history
of every phrase you conquered, with mastery streaks and review decay.

## Why it clears the value bar

- **Real, documented pain.** The needle-lifter tradition is well evidenced
  (direct HN testimony in the dossier). The missing piece is precisely the
  judge: your ear grades the record, nothing grades you.
- **Not chatbot-substitutable.** A chat window cannot loop audio, listen to a
  mic in real time, or compare a performance to an isolated stem. No runtime
  LLM anywhere, so there is no "the model does it free" collapse and no BYOK
  friction — first value needs only a browser, a song file, and a mic.
- **Not free-tool-substitutable.** Moises (stems + loop, deaf), Soundslice
  (notation + loop, deaf), Yousician (mic grading, but its catalog, not your
  records). Every incumbent holds at most two links of the
  record → stem → chart → mic → verdict chain. The full chain ships nowhere,
  free or paid. Verified independently: the chain's two hard primitives exist
  as reusable open source — demucs-rs (HTDemucs v4 in browser via WASM/WebGPU,
  https://github.com/nikhilunni/demucs-rs) and Spotify's
  `@spotify/basic-pitch` (npm-installable browser audio-to-MIDI,
  https://github.com/spotify/basic-pitch-ts).
- **Durable and compounding.** The riff-book accumulates verified repertoire
  across sessions; spaced review decay gives a reason to return. A one-shot
  splitter page structurally cannot hold this state.
- **Zero running cost.** All ML is client-side; hosting is static. No catalog
  licensing, no server pipeline, no per-user cost.
- **Signature moment is nameable and reachable in minute one** (with the demo
  riff condition below): the notes lighting up green, one by one, on a song
  you chose.

## Minimal feature set (MVP)

1. **Loop room**: drop an audio file, see a waveform, select a loop region,
   slow it down, loop it. Works before and without stem separation.
2. **Stem isolation, client-side**, via in-browser Demucs on WebGPU browsers,
   with honest progress framing during the model download and processing.
   Degrades cleanly: no WebGPU → practice against the full mix.
3. **Target chart**: Basic Pitch transcribes the loop region of the chosen
   stem (or full mix in the degraded path) into notes. The chart is always
   auditionable (play back the detected notes) and editable (delete or correct
   notes) before practice. This is the trust mitigation, not a nicety.
4. **Mic verdict, call-and-response**: the loop plays, then the user plays the
   phrase back into silence and is graded after the pass completes.
   Monophonic pitch tracking only, lenient on timing. Call-and-response is a
   scope fence with teeth: it eliminates backing-track bleed into the mic (the
   thing that helped kill Rocksmith's mic mode) and it matches practice
   psychology (play, then learn the verdict).
5. **Riff-book**: local-first (IndexedDB) store of conquered phrases — clip,
   notes, date first nailed, streak, review-due decay. JSON export.
6. **Bundled demo riff**: a short self-produced monophonic bass/guitar phrase
   ships with the app, pre-processed, so a first-run user reaches the verdict
   loop in under a minute, before any model download and without hunting for
   a file. First-run must not be gated on an 84–333 MB download.

Explicitly out of MVP scope: chord/strum verification, tab or standard
notation rendering, accounts and server sync, any server-side ML, social
features, licensed content of any kind.

## Main risks (ranked, with the mitigation each demands)

1. **A false "wrong note" at the moment of triumph destroys the product.**
   The target chart is machine-derived twice over (separation artifacts feed
   transcription errors), and the premortem is right that this is the
   existential risk. Mitigations are design obligations: monophonic-only
   scope, call-and-response grading, auditionable/editable charts, per-pass
   (not mid-note) scoring, generous pitch/timing tolerance, and a nudge toward
   headphones. Monophonic pitch tracking of a clean solo mic signal is mature
   territory (every tuner app does it); the premortem's 0.85 kill probability
   was priced against polyphonic riffs over a bleeding backing loop, which
   this scope excludes.
2. **In-browser Demucs is real but not a packaged library.** demucs-rs is a
   working demo plus Rust source, WebGPU-only, admittedly slower in WASM than
   native, and not on npm. Integration means building its wasm artifact or
   vendoring the demo's pipeline — feasible but the most likely place an
   agent build stalls. The mitigation is the degradation ladder: loop, chart
   (Basic Pitch on the full mix within the loop region), verdict, and
   riff-book all work with no separation at all. Stems improve chart quality;
   they are not load-bearing for the core loop.
3. **Agents cannot playtest with a guitar.** Verification leniency wants
   human ears and hands; the build pipeline has neither. Mitigation: an
   automated fixture harness — synthesized and recorded monophonic phrases
   (clean, detuned, rushed, wrong-note variants) fed through the mic path,
   asserting the false-negative rate on correct takes stays under roughly 1
   in 10 and that wrong notes are caught. This is buildable and must be an
   acceptance criterion, not an afterthought. Residual risk on real-world
   mics remains and should be stated honestly.
4. **First-run weight.** Model download plus minutes of processing before
   value is a wall. Mitigated by the bundled demo riff (value before
   download) and by honest progress copy while a user's own record processes.
5. **Retention is bursty.** Self-taught players practice in bursts; the
   riff-book's review decay is the only return hook and may not fire for
   months. Acceptable for a utility app that is "mostly done at launch"; not
   a rejection reason, but the plan should not promise engagement it cannot
   create.

## What would make me reject it

- The plan drifts to polyphonic or chord verification, real-time mid-note
  grading, or server-side ML. Any of these re-imports the failure mode the
  scope fences exist to exclude.
- The fixture harness shows monophonic verification cannot get correct takes
  under ~1-in-10 false negatives even in controlled audio. Then the verdict —
  the only differentiator — underdelivers and the rest is a worse Moises.
- Demucs integration fails AND full-mix transcription of prominent riffs
  proves unusable for building charts. Then "from real records" collapses to
  a generic pitch game.
- The bundled demo riff gets cut. Without it, first-run value sits behind a
  model download and a file hunt, and the quality bar's first-minute
  requirement cannot be met on staging.

## Conditions the product plan must carry forward as binding

1. Monophonic riffs and basslines only, stated plainly in-product.
2. Call-and-response grading; never grade while the backing loop plays.
3. The target chart is always auditionable and editable before practice.
4. A pre-processed demo riff ships in the app for the first-run path.
5. The core loop must survive with stem separation unavailable.
6. Automated verification-accuracy fixtures are acceptance criteria of the
   mic-verdict EPIC.
