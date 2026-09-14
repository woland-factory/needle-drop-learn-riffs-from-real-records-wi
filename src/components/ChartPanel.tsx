import { useState } from "react";
import type { Note } from "../audio/note";
import {
  applyAdd,
  applyDelete,
  applyNudge,
  applyPitch,
} from "../audio/chart-edits";
import type { AuditionLike } from "../audio/note-synth";
import type { AbsoluteRegion } from "../audio/transcribe";
import { PianoRoll, pitchRange } from "./PianoRoll";

const NUDGE_SEC = 0.01;
const NUDGE_BIG_SEC = 0.05;

type PlayMode = "none" | "alone" | "with";

interface ChartPanelProps {
  notes: Note[];
  regionLen: number;
  buffer: AudioBuffer;
  region: AbsoluteRegion;
  audition: AuditionLike;
  stale: boolean;
  onChange: (next: Note[]) => void;
  onRefind: () => void;
  onCheck: () => void;
}

export function ChartPanel({
  notes,
  regionLen,
  buffer,
  region,
  audition,
  stale,
  onChange,
  onRefind,
  onCheck,
}: ChartPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [play, setPlay] = useState<PlayMode>("none");
  const [addNote, setAddNote] = useState("");

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const canEdit = selected !== null;

  function defaultMidi(): number {
    if (selected) return selected.midi;
    const r = pitchRange(notes);
    return Math.round((r.min + r.max) / 2);
  }

  function pitchBy(delta: number) {
    if (!selected) return;
    onChange(applyPitch(notes, selected.id, delta));
  }

  function nudgeBy(delta: number) {
    if (!selected) return;
    onChange(applyNudge(notes, selected.id, delta, regionLen));
  }

  function deleteSelected() {
    if (!selected) return;
    onChange(applyDelete(notes, selected.id));
    setSelectedId(null);
    setAddNote("");
  }

  function addAt(startSec: number, midi: number) {
    const { notes: next, addedId } = applyAdd(notes, { startSec, midi }, regionLen);
    if (addedId) {
      onChange(next);
      setSelectedId(addedId);
      setAddNote("");
    } else {
      setAddNote("No room there. Nudge a note aside first.");
    }
  }

  function handleNoteKey(id: string, key: string, shiftKey: boolean) {
    setSelectedId(id);
    const step = shiftKey ? NUDGE_BIG_SEC : NUDGE_SEC;
    switch (key) {
      case "ArrowUp":
        onChange(applyPitch(notes, id, 1));
        break;
      case "ArrowDown":
        onChange(applyPitch(notes, id, -1));
        break;
      case "ArrowLeft":
        onChange(applyNudge(notes, id, -step, regionLen));
        break;
      case "ArrowRight":
        onChange(applyNudge(notes, id, step, regionLen));
        break;
      case "Delete":
      case "Backspace":
        onChange(applyDelete(notes, id));
        setSelectedId(null);
        break;
    }
  }

  async function start(mode: "alone" | "with") {
    audition.onEnded = () => setPlay("none");
    setPlay(mode);
    if (mode === "alone") {
      await audition.playAlone(notes);
    } else {
      await audition.playWithSong(notes, buffer, region);
    }
  }

  function stop() {
    audition.stop();
    setPlay("none");
  }

  const empty = notes.length === 0;
  const playing = play !== "none";

  return (
    <section className="chart card" aria-label="Target chart">
      <div className="chart-head">
        <h2>Your target</h2>
        <p className="scope">
          Needle Drop reads one note at a time. Best on single-note riffs and
          basslines.
        </p>
      </div>

      {stale && (
        <div className="chart-stale" role="status">
          <span>The loop region moved. Read the notes for the new region.</span>
          <button type="button" className="btn btn-primary" onClick={onRefind}>
            Find the notes again
          </button>
        </div>
      )}

      <PianoRoll
        notes={notes}
        regionLen={regionLen}
        selectedId={selectedId}
        onSelectNote={setSelectedId}
        onAddAt={addAt}
        onNoteKey={handleNoteKey}
      />

      {empty && (
        <p className="chart-empty">Add a note, or read the notes again.</p>
      )}

      <div className="chart-actions">
        <div className="check-row">
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={onCheck}
            disabled={empty}
          >
            Check my take
          </button>
          {empty && (
            <p className="chart-hint" role="status">
              Add a note first, then check your take.
            </p>
          )}
        </div>

        <div className="action-row" aria-label="Play the target">
          {playing ? (
            <button type="button" className="btn" onClick={stop}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => start("with")}
              disabled={empty}
            >
              Play with the song
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => start("alone")}
            disabled={empty || playing}
          >
            Play the notes
          </button>
        </div>

        <div className="action-row" aria-label="Edit the selected note">
          <button
            type="button"
            className="btn"
            onClick={() => pitchBy(1)}
            disabled={!canEdit}
          >
            Up
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => pitchBy(-1)}
            disabled={!canEdit}
          >
            Down
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => nudgeBy(-NUDGE_SEC)}
            disabled={!canEdit}
          >
            Nudge left
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => nudgeBy(NUDGE_SEC)}
            disabled={!canEdit}
          >
            Nudge right
          </button>
          <button
            type="button"
            className="btn"
            onClick={deleteSelected}
            disabled={!canEdit}
          >
            Delete
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => addAt(selected ? selected.startSec : 0, defaultMidi())}
          >
            Add note
          </button>
        </div>
        {addNote && (
          <p className="chart-hint" role="status">
            {addNote}
          </p>
        )}
      </div>
    </section>
  );
}
