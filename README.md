# Needle Drop

Needle Drop is a browser practice room for guitarists and bassists who learn by
ear. Drop in a song from your own files, loop the two bars you are chasing, and
slow them down without the audio ever leaving your machine. Everything runs in
the browser, so your music stays on your computer.

Load a local audio file, see its waveform, drag out a loop region, snap it to a
number of bars at a tempo you set, adjust the speed between 50% and 100%, and
loop it gaplessly.

Then press "Find the notes" to turn that loop into a target chart. Needle Drop
reads the loop into a note timeline you can play back on its own or over the
record, and edit note by note until you agree it is the phrase. It reads one
note at a time, so it works best on single-note riffs and basslines. The
transcription runs entirely in your browser.

When the chart looks right, press "Check my take". Needle Drop plays the phrase
once, counts you in, and records one pass through your mic. Then it grades the
take note by note and tells you which notes matched and which to try again. A
matching pass offers to save the phrase to your riff-book. Pitch tolerance,
timing window, and octave matching are all adjustable, with generous defaults.
Your audio never leaves the machine: the mic take is analyzed locally and thrown
away after each pass.

Every phrase you nail lands in your riff-book, stored on your machine with the
clip, the notes as graded, your best score, and a mastery streak. Each phrase
resurfaces when it is due for review: play it back to keep the streak growing.
One button exports the whole book, clips included, to a single JSON file.

## Run it

You need [Node.js 22](https://nodejs.org) (see `.nvmrc`).

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173 by default) and either choose a
song or press "Play a sample loop" to try the bundled clip.

### Run the production build in Docker

```bash
docker build -t needle-drop .
docker run --rm -p 8080:80 needle-drop
```

Open http://localhost:8080. The container serves the static build with nginx and
writes its runtime config from environment variables at start. All of them are
optional:

| Variable           | What it does                                      |
| ------------------ | ------------------------------------------------- |
| `SENTRY_DSN`       | Enables error tracking when set.                  |
| `UMAMI_WEBSITE_ID` | Umami analytics site id (needs `UMAMI_URL` too).  |
| `UMAMI_URL`        | Umami script URL (needs `UMAMI_WEBSITE_ID` too).  |

With none set, the app runs normally and contacts no third party. See
`.env.example`.

`docker-compose.staging.yml` is the deploy definition used by the hosted staging
environment. It expects an external network and reaches the container by name,
so for local use prefer the `docker run` command above.

## How it works

- The file is read in the browser with `decodeAudioData`. Nothing is uploaded.
- Looping uses one Web Audio source node with `loop`, `loopStart`, and `loopEnd`,
  so the loop seam is sample-accurate and click-free.
- Slowing down uses playback rate, so pitch drops as the loop slows. That is the
  honest behavior for now.
- "Find the notes" transcribes the loop with the
  [Basic Pitch](https://github.com/spotify/basic-pitch) model running in a Web
  Worker, so the loop controls stay responsive. The model weights are served
  from the app's own origin, so no audio and no model request leaves your
  machine. The result is reduced to one note per moment, and a region with no
  clear pitch shows a designed state instead of a guessed note.
- "Check my take" records one pass through the mic and grades it with
  hand-written pitch tracking (a YIN-class detector) over the raw audio. Grading
  is generous and configurable, it aligns the whole take before judging so a
  slightly late start is not punished, and a take with no clear line never
  passes. The same pure code grades a live mic take and the accuracy test
  fixtures, so the verdict is measured, not asserted.
- The riff-book lives in IndexedDB on your machine: one record per phrase with
  the clip bytes inside, so a delete removes everything at once. Review timing
  is a small pure function of the stored record and the clock; time changes
  what is due, never what is stored. There is no account and no sync.

## Contribute

- App code is in `src/`: `audio/` holds the decode, waveform peaks, timing math,
  loop player, and the transcription path (the `transcribe` worker, the
  monophonic reduction, pitch helpers, and note synth), plus the mic verdict core
  (`pitch-detect`, `pitch-track`, `grade`, `wav`, `metronome`, and the `mic`
  capture boundary). `book/` holds the riff-book: the IndexedDB store, the
  spaced-repetition schedule, and the JSON export serializer. `components/`
  holds the Loop Room UI, the chart panel and piano roll, the practice panel,
  the riff-book screen and re-practice surface, and the designed states.
  `observability/` wires optional Sentry and Umami. The Basic Pitch model weights live in `public/models/basic-pitch/`
  so they are served from the app's own origin.
- `npm test` includes the accuracy fixture harness
  (`tests/unit/accuracy.test.ts`), which feeds a battery of synthesized takes
  through the real pitch-track and grading path and proves correct takes match
  and wrong takes are flagged.
- Run the unit and component tests (Vitest):

  ```bash
  npm test
  ```

- Run the end-to-end tests (Playwright). They build the app, serve it, and drive
  a real browser. The suite runs in the official Playwright container so the
  browser build matches the pinned version:

  ```bash
  npm run e2e
  ```

  Each run starts from a fresh build and a run-scoped server port, so nothing
  leaks between runs. No database is involved.

## License

MIT. See [LICENSE](./LICENSE).
