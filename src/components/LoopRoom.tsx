import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Audition } from "../audio/note-synth";
import { isClearEnough } from "../audio/monophonic";
import type { Note } from "../audio/note";
import {
  WorkerTranscriber,
  type AbsoluteRegion,
  type Transcriber,
} from "../audio/transcribe";
import { WebMicRecorder, type MicRecorder } from "../audio/mic";
import { extractRegionWav } from "../audio/wav";
import { buildNewRiff } from "../book/new-riff";
import type { RiffStore } from "../book/store";
import { Metronome, type MetronomeLike } from "../audio/metronome";
import type { Tolerances } from "../audio/grade";
import { loadTolerances, saveTolerances } from "../audio/tolerance-prefs";
import { EmptyState } from "./states/EmptyState";
import { LoadingState } from "./states/LoadingState";
import { ErrorState } from "./states/ErrorState";
import { TranscribingState } from "./states/TranscribingState";
import { NoPitchState } from "./states/NoPitchState";
import { Waveform } from "./Waveform";
import { LoopControls } from "./LoopControls";
import { ChartPanel } from "./ChartPanel";
import { PracticePanel } from "./PracticePanel";

const PEAK_BUCKETS = 600;
const SAMPLE_URL = "/sample/riff.wav";

type Status = "empty" | "loading" | "loaded" | "error";
type ChartPhase = "none" | "transcribing" | "ready" | "nopitch";

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  return new Ctx();
}

interface LoopRoomProps {
  /** The riff-book ledger a matched pass saves into. */
  store: RiffStore;
  /** Injectable for tests; defaults to the real Web Worker transcriber. */
  transcriber?: Transcriber;
  /** Injectable for tests/e2e; defaults to the real mic recorder. */
  recorder?: MicRecorder;
}

export function LoopRoom({ store, transcriber, recorder }: LoopRoomProps) {
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

  const [chartPhase, setChartPhase] = useState<ChartPhase>("none");
  const [notes, setNotes] = useState<Note[]>([]);
  const [chartRegion, setChartRegion] = useState<AbsoluteRegion | null>(null);
  const [progress, setProgress] = useState(0);
  const [practicing, setPracticing] = useState(false);
  const [tolerances, setTolerances] = useState<Tolerances>(loadTolerances);

  const ctxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<LoopPlayer | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const auditionRef = useRef<Audition | null>(null);
  const metronomeRef = useRef<MetronomeLike | null>(null);

  const activeTranscriber = useMemo<Transcriber>(
    () => transcriber ?? new WorkerTranscriber(),
    [transcriber],
  );
  const activeRecorder = useMemo<MicRecorder>(
    () => recorder ?? new WebMicRecorder(),
    [recorder],
  );

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) ctxRef.current = createAudioContext();
    return ctxRef.current;
  }, []);

  const getAudition = useCallback((): Audition => {
    if (!auditionRef.current) auditionRef.current = new Audition(getCtx());
    return auditionRef.current;
  }, [getCtx]);

  const getMetronome = useCallback((): MetronomeLike => {
    if (!metronomeRef.current) metronomeRef.current = new Metronome(getCtx());
    return metronomeRef.current;
  }, [getCtx]);

  const changeTolerances = useCallback((next: Tolerances) => {
    setTolerances(next);
    saveTolerances(next);
  }, []);

  // Persists a matched phrase: the region audio as WAV bytes, the notes as
  // graded, and the metadata of this loop, all in one riff-book record.
  const savePhrase = useCallback(
    async (phrase: Note[], score: number) => {
      const buffer = bufferRef.current;
      if (!buffer || !chartRegion) throw new Error("no-clip");
      const riff = buildNewRiff(phrase, {
        sourceName,
        clipWav: extractRegionWav(buffer, chartRegion),
        startSec: chartRegion.startSec,
        endSec: chartRegion.endSec,
        bars,
        tempoBpm: bpm,
        speed,
      });
      await store.add(riff, score, Date.now());
    },
    [store, sourceName, chartRegion, bars, bpm, speed],
  );

  const resetChart = useCallback(() => {
    auditionRef.current?.stop();
    metronomeRef.current?.stop();
    activeTranscriber.cancel();
    setChartPhase("none");
    setPracticing(false);
    setNotes([]);
    setChartRegion(null);
    setProgress(0);
  }, [activeTranscriber]);

  const loadFile = useCallback(
    async (file: File) => {
      setStatus("loading");
      setPlaying(false);
      resetChart();
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
        bufferRef.current = buffer;
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
    [getCtx, resetChart],
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
      auditionRef.current?.stop();
      metronomeRef.current?.stop();
      activeRecorder.dispose();
      activeTranscriber.dispose();
      void ctxRef.current?.close();
    };
  }, [activeTranscriber, activeRecorder]);

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

  async function findNotes() {
    const buffer = bufferRef.current;
    if (!buffer) return;
    const snapshot: AbsoluteRegion = {
      startSec: region.startSec,
      endSec: region.endSec,
    };
    const regionLen = snapshot.endSec - snapshot.startSec;
    setChartRegion(snapshot);
    setProgress(0);
    setChartPhase("transcribing");
    try {
      const result = await activeTranscriber.transcribe(
        { buffer, region: snapshot },
        setProgress,
      );
      if (isClearEnough(result, regionLen)) {
        setNotes(result);
        setChartPhase("ready");
      } else {
        setNotes([]);
        setChartPhase("nopitch");
      }
    } catch {
      // Cancelled or failed: return to the start so the user can try again.
      setChartPhase("none");
    }
  }

  function cancelFind() {
    activeTranscriber.cancel();
    setChartPhase("none");
  }

  function reset() {
    playerRef.current?.dispose();
    playerRef.current = null;
    bufferRef.current = null;
    resetChart();
    setStatus("empty");
    setPlaying(false);
  }

  const chartRegionLen = chartRegion
    ? chartRegion.endSec - chartRegion.startSec
    : 0;
  const stale =
    chartPhase === "ready" &&
    chartRegion !== null &&
    (Math.abs(chartRegion.startSec - region.startSec) > 1e-4 ||
      Math.abs(chartRegion.endSec - region.endSec) > 1e-4);

  return (
    <div className="view-stack">
      <p className="privacy" aria-label="Your audio stays on your machine">
        <span aria-hidden="true">🔒</span> Your audio stays on your machine
      </p>

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

          {chartPhase === "none" && (
            <section className="card chart-start">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={findNotes}
              >
                Find the notes
              </button>
              <p className="chart-start-note">
                Turn this loop into notes you can hear and check.
              </p>
            </section>
          )}

          {chartPhase === "transcribing" && (
            <TranscribingState progress={progress} onCancel={cancelFind} />
          )}

          {chartPhase === "nopitch" && (
            <NoPitchState onBack={() => setChartPhase("none")} />
          )}

          {chartPhase === "ready" && chartRegion && !practicing && (
            <ChartPanel
              notes={notes}
              regionLen={chartRegionLen}
              buffer={bufferRef.current as AudioBuffer}
              region={chartRegion}
              audition={getAudition()}
              stale={stale}
              onChange={setNotes}
              onRefind={findNotes}
              onCheck={() => setPracticing(true)}
            />
          )}

          {chartPhase === "ready" && chartRegion && practicing && (
            <PracticePanel
              notes={notes}
              regionLen={chartRegionLen}
              bpm={bpm}
              buffer={bufferRef.current as AudioBuffer}
              region={chartRegion}
              recorder={activeRecorder}
              audition={getAudition()}
              metronome={getMetronome()}
              tolerances={tolerances}
              onTolerancesChange={changeTolerances}
              onSave={savePhrase}
              onBack={() => {
                getAudition().stop();
                getMetronome().stop();
                setPracticing(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
