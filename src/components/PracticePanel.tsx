import { useCallback, useEffect, useRef, useState } from "react";
import type { Note } from "../audio/note";
import { midiToName } from "../audio/pitch";
import type { AuditionLike } from "../audio/note-synth";
import type { AbsoluteRegion } from "../audio/transcribe";
import type { MicRecorder } from "../audio/mic";
import type { MetronomeLike } from "../audio/metronome";
import type { Take } from "../audio/take";
import {
  gradePass,
  clampTolerances,
  CENTS_MIN,
  CENTS_MAX,
  TIMING_MIN_SEC,
  TIMING_MAX_SEC,
  type PassResult,
  type Tolerances,
  type NoteVerdict,
} from "../audio/grade";
import { trackPitch } from "../audio/pitch-track";
import { DEFAULT_BEATS_PER_BAR } from "../audio/timing";
import { MicPrompt } from "./states/MicPrompt";
import { pitchRange } from "./PianoRoll";

type Phase =
  | "prompt"
  | "denied"
  | "unavailable"
  | "ready"
  | "countin"
  | "reference"
  | "recording"
  | "grading"
  | "verdict";

const COUNT_IN_BEATS = DEFAULT_BEATS_PER_BAR;

export interface PracticePanelProps {
  notes: Note[];
  regionLen: number;
  bpm: number;
  buffer: AudioBuffer;
  region: AbsoluteRegion;
  recorder: MicRecorder;
  audition: AuditionLike;
  metronome: MetronomeLike;
  tolerances: Tolerances;
  onTolerancesChange: (t: Tolerances) => void;
  onSave: (notes: Note[]) => void;
  onBack: () => void;
  /** Injectable for tests; defaults to the real pure grading path. */
  gradeTake?: (take: Take, notes: Note[], tol: Tolerances) => PassResult;
}

const defaultGrade = (take: Take, notes: Note[], tol: Tolerances): PassResult =>
  gradePass(trackPitch(take), notes, tol);

export function PracticePanel({
  notes,
  regionLen,
  bpm,
  buffer,
  region,
  recorder,
  audition,
  metronome,
  tolerances,
  onTolerancesChange,
  onSave,
  onBack,
  gradeTake = defaultGrade,
}: PracticePanelProps) {
  const [phase, setPhase] = useState<Phase>("prompt");
  const [level, setLevel] = useState(0);
  const [result, setResult] = useState<PassResult | null>(null);
  const [saved, setSaved] = useState(false);

  // Refs so the tolerance-change re-grade never re-runs on unrelated renders.
  const cycleRef = useRef(0);
  const mountedRef = useRef(true);
  const lastTakeRef = useRef<Take | null>(null);
  const phaseRef = useRef<Phase>(phase);
  const notesRef = useRef(notes);
  phaseRef.current = phase;
  notesRef.current = notes;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cycleRef.current++; // abandon any running cycle
      recorder.dispose();
      audition.stop();
      metronome.stop();
    };
  }, [recorder, audition, metronome]);

  const stopSound = useCallback(() => {
    audition.stop();
    metronome.stop();
  }, [audition, metronome]);

  async function requestMic() {
    const perm = await recorder.requestPermission();
    if (!mountedRef.current) return;
    if (perm === "granted") setPhase("ready");
    else if (perm === "denied") setPhase("denied");
    else setPhase("unavailable");
  }

  function playReference(): Promise<void> {
    return new Promise<void>((resolve) => {
      audition.onEnded = () => {
        audition.onEnded = null;
        resolve();
      };
      void audition.playWithSong(notes, buffer, region);
    });
  }

  async function runCycle() {
    const token = ++cycleRef.current;
    const alive = () => mountedRef.current && cycleRef.current === token;

    setResult(null);
    setSaved(false);
    setLevel(0);

    setPhase("countin");
    await metronome.playClicks(COUNT_IN_BEATS, bpm);
    if (!alive()) return;

    setPhase("reference");
    await playReference();
    if (!alive()) return;

    setPhase("countin");
    await metronome.playClicks(COUNT_IN_BEATS, bpm);
    if (!alive()) return;

    // Backing muted for the recorded pass: nothing sounds while the mic listens.
    stopSound();
    setPhase("recording");
    const take = await recorder.record(regionLen, (rms) => {
      if (alive()) setLevel(rms);
    });
    if (!alive()) return;

    lastTakeRef.current = take;
    setPhase("grading");
    const res = gradeTake(take, notesRef.current, tolerances);
    if (!alive()) return;
    setResult(res);
    setPhase("verdict");
  }

  // Re-grade a held take when the tolerances change, so the player sees the
  // effect of a looser or stricter setting without playing again.
  useEffect(() => {
    if (phaseRef.current === "verdict" && lastTakeRef.current) {
      setResult(gradeTake(lastTakeRef.current, notesRef.current, tolerances));
      setSaved(false);
    }
    // Intentionally keyed on tolerances only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tolerances]);

  function handleStart() {
    void runCycle();
  }

  function handleTryAgain() {
    stopSound();
    setResult(null);
    setPhase("ready");
  }

  function handleSave() {
    onSave(notes);
    setSaved(true);
  }

  function handleBack() {
    cycleRef.current++;
    stopSound();
    onBack();
  }

  function changeTol(patch: Partial<Tolerances>) {
    onTolerancesChange(clampTolerances({ ...tolerances, ...patch }));
  }

  const passed = result ? result.perNote.filter((v) => v.status === "pass").length : 0;
  const total = notes.length;

  return (
    <section className="practice card" aria-label="Check your take">
      {(phase === "prompt" || phase === "denied" || phase === "unavailable") && (
        <MicPrompt variant={phase} onAction={() => void requestMic()} onBack={handleBack} />
      )}

      {phase === "ready" && (
        <div className="practice-ready">
          <h2>Play it back</h2>
          <button type="button" className="btn btn-primary btn-block" onClick={handleStart}>
            Start
          </button>
          <p className="practice-help">
            You will hear the phrase once, then play it back after the count.
          </p>
          <TargetRoll notes={notes} regionLen={regionLen} />
          <ToleranceControls tolerances={tolerances} onChange={changeTol} />
          <button type="button" className="btn btn-ghost" onClick={handleBack}>
            Back to the chart
          </button>
        </div>
      )}

      {(phase === "countin" || phase === "reference" || phase === "recording" || phase === "grading") && (
        <div className="practice-stage">
          <p className="stage-label" role="status" aria-live="polite">
            {phase === "countin" && "Count in"}
            {phase === "reference" && "Here is the phrase"}
            {phase === "recording" && "Your turn"}
            {phase === "grading" && "Checking your take"}
          </p>
          {phase === "recording" && (
            <div className="rec-indicator">
              <span className="rec-dot" aria-hidden="true" />
              <div className="level-meter" aria-hidden="true">
                <div
                  className="level-fill"
                  style={{ width: `${Math.min(100, Math.round(level * 300))}%` }}
                />
              </div>
            </div>
          )}
          <TargetRoll notes={notes} regionLen={regionLen} />
        </div>
      )}

      {phase === "verdict" && result && (
        <div className="practice-verdict">
          <div className="verdict-head" aria-live="polite">
            {result.matched ? (
              <>
                <h2>You played it</h2>
                <p className="verdict-line">Every note matched.</p>
              </>
            ) : result.heardLine ? (
              <>
                <h2>Close</h2>
                <p className="verdict-line">
                  {passed} of {total} notes matched.
                </p>
              </>
            ) : (
              <>
                <h2>I did not catch that</h2>
                <p className="verdict-line">
                  Play a little louder, or move closer to the mic, then try again.
                </p>
              </>
            )}
            {result.heardLine && (
              <p className="verdict-score" aria-label={`Score ${result.score} percent`}>
                {result.score}%
              </p>
            )}
          </div>

          {result.heardLine && (
            <TargetRoll notes={notes} regionLen={regionLen} verdicts={result.perNote} />
          )}

          <div className="verdict-actions">
            {result.matched ? (
              <>
                {saved ? (
                  <p className="verdict-saved" role="status">
                    Saved to your riff-book.
                  </p>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={handleSave}>
                    Save to riff-book
                  </button>
                )}
                <button type="button" className="btn" onClick={handleStart}>
                  Play it again
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-primary" onClick={handleTryAgain}>
                  Try again
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void playReference()}
                >
                  Hear it again
                </button>
              </>
            )}
          </div>

          <ToleranceControls tolerances={tolerances} onChange={changeTol} />
          <button type="button" className="btn btn-ghost" onClick={handleBack}>
            Back to the chart
          </button>
        </div>
      )}
    </section>
  );
}

/** Read-only piano roll of the target, optionally lit with a per-note verdict. */
function TargetRoll({
  notes,
  regionLen,
  verdicts,
}: {
  notes: Note[];
  regionLen: number;
  verdicts?: NoteVerdict[];
}) {
  const range = pitchRange(notes);
  const rows = range.max - range.min + 1;
  const rowPct = 100 / rows;
  const len = regionLen > 0 ? regionLen : 1;
  const statusFor = (id: string) => verdicts?.find((v) => v.noteId === id)?.status;

  return (
    <div
      className="piano-roll verdict-roll"
      role="group"
      aria-label={verdicts ? "Note by note verdict" : "Target notes"}
    >
      <div className="roll-grid">
        {notes.map((n) => {
          const left = (n.startSec / len) * 100;
          const width = Math.max(1.5, (n.durSec / len) * 100);
          const status = statusFor(n.id);
          const matched = status === "pass";
          const cls = verdicts
            ? `roll-note ${matched ? "note-pass" : "note-try"}`
            : "roll-note";
          const label = verdicts
            ? `${midiToName(n.midi)} ${matched ? "matched" : "try again"}`
            : midiToName(n.midi);
          return (
            <span
              key={n.id}
              className={cls}
              data-note="1"
              data-status={status ?? ""}
              style={{
                left: `${left}%`,
                width: `${Math.min(100 - left, width)}%`,
                top: `${(range.max - n.midi) * rowPct}%`,
                height: `${rowPct}%`,
              }}
              aria-label={label}
            >
              <span className="visually-hidden">{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ToleranceControls({
  tolerances,
  onChange,
}: {
  tolerances: Tolerances;
  onChange: (patch: Partial<Tolerances>) => void;
}) {
  return (
    <fieldset className="tolerances">
      <legend>Grading settings</legend>
      <div className="tol-grid">
        <label className="field">
          <span>Pitch tolerance (cents)</span>
          <input
            type="number"
            min={CENTS_MIN}
            max={CENTS_MAX}
            step={5}
            value={tolerances.cents}
            onChange={(e) => onChange({ cents: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>Timing window (ms)</span>
          <input
            type="number"
            min={Math.round(TIMING_MIN_SEC * 1000)}
            max={Math.round(TIMING_MAX_SEC * 1000)}
            step={10}
            value={Math.round(tolerances.timingWindowSec * 1000)}
            onChange={(e) => onChange({ timingWindowSec: Number(e.target.value) / 1000 })}
          />
        </label>
        <label className="switch tol-octave">
          <input
            type="checkbox"
            checked={tolerances.octaveTolerant}
            onChange={(e) => onChange({ octaveTolerant: e.target.checked })}
          />
          <span>Ignore octave</span>
        </label>
      </div>
    </fieldset>
  );
}
