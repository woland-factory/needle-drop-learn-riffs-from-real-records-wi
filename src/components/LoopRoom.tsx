import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAudioFile, AudioDecodeError, type DecodeErrorKind } from "../audio/decode";
import { computePeaksFromBuffer, type Peak } from "../audio/peaks";
import { LoopPlayer, clampRate } from "../audio/loop-player";
import {
  DEFAULT_BARS,
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_BPM,
  snapRegionToBars,
  type Region,
} from "../audio/timing";
import { EmptyState } from "./states/EmptyState";
import { LoadingState } from "./states/LoadingState";
import { ErrorState } from "./states/ErrorState";
import { Waveform } from "./Waveform";
import { LoopControls } from "./LoopControls";

const PEAK_BUCKETS = 600;
const SAMPLE_URL = "/sample/riff.wav";

type Status = "empty" | "loading" | "loaded" | "error";

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  return new Ctx();
}

export function LoopRoom() {
  const [status, setStatus] = useState<Status>("empty");
  const [errorKind, setErrorKind] = useState<DecodeErrorKind>("unsupported");
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [duration, setDuration] = useState(0);
  const [sourceName, setSourceName] = useState("");
  const [region, setRegion] = useState<Region>({ startSec: 0, endSec: 0 });
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [bars, setBars] = useState(DEFAULT_BARS);
  const [snapOn, setSnapOn] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<LoopPlayer | null>(null);

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) ctxRef.current = createAudioContext();
    return ctxRef.current;
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      setStatus("loading");
      setPlaying(false);
      try {
        const ctx = getCtx();
        const buffer = await decodeAudioFile(file, ctx);
        const nextPeaks = computePeaksFromBuffer(buffer, PEAK_BUCKETS);
        const initial = snapRegionToBars(
          0,
          DEFAULT_BARS,
          DEFAULT_BPM,
          DEFAULT_BEATS_PER_BAR,
          buffer.duration,
        );
        playerRef.current?.dispose();
        const player = new LoopPlayer(ctx, buffer);
        player.setRegion(initial);
        player.setRate(1);
        playerRef.current = player;
        setPeaks(nextPeaks);
        setDuration(buffer.duration);
        setSourceName(file.name);
        setBpm(DEFAULT_BPM);
        setBars(DEFAULT_BARS);
        setSnapOn(true);
        setSpeed(1);
        setRegion(initial);
        setStatus("loaded");
      } catch (err) {
        const kind: DecodeErrorKind =
          err instanceof AudioDecodeError ? err.kind : "unsupported";
        setErrorKind(kind);
        setStatus("error");
      }
    },
    [getCtx],
  );

  const loadSample = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(SAMPLE_URL);
      const blob = await res.blob();
      const file = new File([blob], "sample-loop.wav", { type: "audio/wav" });
      await loadFile(file);
    } catch {
      setErrorKind("unsupported");
      setStatus("error");
    }
  }, [loadFile]);

  // Keep the player's region and rate in sync with UI state.
  useEffect(() => {
    playerRef.current?.setRegion(region);
  }, [region]);

  useEffect(() => {
    playerRef.current?.setRate(speed);
  }, [speed]);

  useEffect(() => {
    return () => {
      playerRef.current?.dispose();
      void ctxRef.current?.close();
    };
  }, []);

  function applyRegion(proposed: Region) {
    if (snapOn) {
      setRegion(
        snapRegionToBars(
          proposed.startSec,
          bars,
          bpm,
          DEFAULT_BEATS_PER_BAR,
          duration,
        ),
      );
    } else {
      setRegion(proposed);
    }
  }

  function reSnap(nextBars: number, nextBpm: number) {
    if (!snapOn || duration <= 0) return;
    setRegion(
      snapRegionToBars(
        region.startSec,
        nextBars,
        nextBpm,
        DEFAULT_BEATS_PER_BAR,
        duration,
      ),
    );
  }

  function handleBpm(next: number) {
    const value = Number.isFinite(next) && next > 0 ? next : bpm;
    setBpm(value);
    reSnap(bars, value);
  }

  function handleBars(next: number) {
    const value = Number.isFinite(next) && next > 0 ? Math.floor(next) : bars;
    setBars(value);
    reSnap(value, bpm);
  }

  function handleSnap(on: boolean) {
    setSnapOn(on);
    if (on && duration > 0) {
      setRegion(
        snapRegionToBars(
          region.startSec,
          bars,
          bpm,
          DEFAULT_BEATS_PER_BAR,
          duration,
        ),
      );
    }
  }

  async function handlePlayPause() {
    const player = playerRef.current;
    if (!player) return;
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      await player.play();
      setPlaying(true);
    }
  }

  function handleStop() {
    playerRef.current?.stop();
    setPlaying(false);
  }

  function reset() {
    playerRef.current?.dispose();
    playerRef.current = null;
    setStatus("empty");
    setPlaying(false);
  }

  return (
    <main className="app">
      <header className="topbar">
        <span className="brand">Needle Drop</span>
        <span className="privacy" aria-label="Your audio stays on your machine">
          <span aria-hidden="true">🔒</span> Your audio stays on your machine
        </span>
      </header>

      {status === "empty" && (
        <EmptyState onFile={loadFile} onSample={loadSample} />
      )}

      {status === "loading" && <LoadingState />}

      {status === "error" && <ErrorState kind={errorKind} onRetry={reset} />}

      {status === "loaded" && (
        <>
          <section className="card">
            <p className="source-name">Now looping: {sourceName}</p>
            <Waveform
              peaks={peaks}
              duration={duration}
              region={region}
              snapOn={snapOn}
              onRegionChange={applyRegion}
            />
          </section>
          <section className="card">
            <LoopControls
              bpm={bpm}
              bars={bars}
              snapOn={snapOn}
              speed={clampRate(speed)}
              playing={playing}
              onBpm={handleBpm}
              onBars={handleBars}
              onSnap={handleSnap}
              onSpeed={setSpeed}
              onPlayPause={handlePlayPause}
              onStop={handleStop}
            />
            <div className="transport" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                Load another song
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
