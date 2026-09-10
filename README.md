# Needle Drop

Needle Drop is a browser practice room for guitarists and bassists who learn by
ear. Drop in a song from your own files, loop the two bars you are chasing, and
slow them down without the audio ever leaving your machine. Everything runs in
the browser, so your music stays on your computer.

This repository is the Loop Room: load a local audio file, see its waveform,
drag out a loop region, snap it to a number of bars at a tempo you set, adjust
the speed between 50% and 100%, and loop it gaplessly.

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

## Contribute

- App code is in `src/`: `audio/` holds the decode, waveform peaks, timing math,
  and loop player. `components/` holds the Loop Room UI and its empty, loading,
  and error states. `observability/` wires optional Sentry and Umami.
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
