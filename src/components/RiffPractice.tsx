import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RiffRecord, RiffStore } from "../book/store";
import { intervalDays } from "../book/schedule";
import { makeNoteId, type Note } from "../audio/note";
import { WebMicRecorder, type MicRecorder } from "../audio/mic";
import { Audition, type AuditionLike } from "../audio/note-synth";
import { Metronome, type MetronomeLike } from "../audio/metronome";
import type { Tolerances } from "../audio/grade";
import { loadTolerances, saveTolerances } from "../audio/tolerance-prefs";
import { PracticePanel } from "./PracticePanel";

interface RiffPracticeProps {
  record: RiffRecord;
  store: RiffStore;
  /** Injectable clock; defaults to Date.now. */
  now?: () => number;
  /** All injectable for tests; defaults touch real audio. */
  recorder?: MicRecorder;
  audition?: AuditionLike;
  metronome?: MetronomeLike;
  decodeClip?: (wav: ArrayBuffer) => Promise<AudioBuffer>;
  onBack: () => void;
}

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  return new Ctx();
}

/**
 * Re-practice a saved phrase: decodes the stored clip, rebuilds the graded
 * notes, and runs the exact same call-and-response cycle. The first matched
 * cycle of a session records the pass; later ones change nothing.
 */
export function RiffPractice({
  record,
  store,
  now = Date.now,
  recorder,
  audition,
  metronome,
  decodeClip,
  onBack,
}: RiffPracticeProps) {
  const [clip, setClip] = useState<AudioBuffer | null>(null);
  const [failed, setFailed] = useState(false);
  const [line, setLine] = useState<string | undefined>(undefined);
  const [tolerances, setTolerances] = useState<Tolerances>(loadTolerances);

  const ctxRef = useRef<AudioContext | null>(null);
  const auditionRef = useRef<AuditionLike | null>(audition ?? null);
  const metronomeRef = useRef<MetronomeLike | null>(metronome ?? null);
  // One store write per opening of a phrase, no matter how many matched cycles.
  const recordedRef = useRef(false);

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) ctxRef.current = createAudioContext();
    return ctxRef.current;
  }, []);

  const activeRecorder = useMemo<MicRecorder>(
    () => recorder ?? new WebMicRecorder(),
    [recorder],
  );

  const getAudition = useCallback((): AuditionLike => {
    if (!auditionRef.current) auditionRef.current = new Audition(getCtx());
    return auditionRef.current;
  }, [getCtx]);

  const getMetronome = useCallback((): MetronomeLike => {
    if (!metronomeRef.current) metronomeRef.current = new Metronome(getCtx());
    return metronomeRef.current;
  }, [getCtx]);

  const notes = useMemo<Note[]>(
    () => record.notes.map((n) => ({ ...n, id: makeNoteId("r") })),
    [record],
  );

  useEffect(() => {
    let cancelled = false;
    const decode =
      decodeClip ?? ((wav: ArrayBuffer) => getCtx().decodeAudioData(wav));
    // decodeAudioData detaches its input; hand it a copy, never the record.
    decode(record.clipWav.slice(0))
      .then((buffer) => {
        if (!cancelled) setClip(buffer);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [record, decodeClip, getCtx]);

  useEffect(() => {
    return () => {
      void ctxRef.current?.close();
    };
  }, []);

  const changeTolerances = useCallback((next: Tolerances) => {
    setTolerances(next);
    saveTolerances(next);
  }, []);

  const handleMatched = useCallback(
    (score: number) => {
      if (recordedRef.current) {
        setLine("Still matched.");
        return;
      }
      recordedRef.current = true;
      store
        .recordPass(record.id, score, now())
        .then((updated) => {
          const days = intervalDays(updated.streak);
          const next =
            days === 1 ? "Next review tomorrow." : `Next review in ${days} days.`;
          setLine(`You still have it. Streak ${updated.streak}. ${next}`);
        })
        .catch(() => {
          // The pass was not stored; let a later matched cycle retry.
          recordedRef.current = false;
          setLine(
            "Your browser blocked saving. Allow storage for this site, then try again.",
          );
        });
    },
    [store, record.id, now],
  );

  if (failed) {
    return (
      <section className="error card" role="alert">
        <h2>That clip will not play</h2>
        <p>Reload the page and open it again.</p>
        <button type="button" className="btn btn-primary" onClick={onBack}>
          Back to your book
        </button>
      </section>
    );
  }

  if (!clip) {
    return (
      <section className="card" aria-busy="true" aria-live="polite">
        <div className="skeleton skeleton-row" />
        <div className="skeleton skeleton-row" />
        <p className="loading-note">Opening {record.title}…</p>
      </section>
    );
  }

  return (
    <div className="view-stack">
      <p className="source-name">Practicing: {record.title}</p>
      <PracticePanel
        notes={notes}
        regionLen={clip.duration}
        bpm={record.loopRegion.tempoBpm}
        buffer={clip}
        region={{ startSec: 0, endSec: clip.duration }}
        recorder={activeRecorder}
        audition={getAudition()}
        metronome={getMetronome()}
        tolerances={tolerances}
        onTolerancesChange={changeTolerances}
        onSave={async () => {}}
        onMatched={handleMatched}
        matchedMode="review"
        matchedLine={line}
        backLabel="Back to your book"
        onBack={onBack}
      />
    </div>
  );
}
