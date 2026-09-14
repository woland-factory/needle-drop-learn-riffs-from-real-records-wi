import { useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { MIDI_MAX, MIDI_MIN, type Note } from "../audio/note";
import { midiToName } from "../audio/pitch";

export interface PitchRange {
  min: number;
  max: number;
}

const MIN_SPAN = 11; // show at least an octave so a single note still reads as a roll

/** Pitch range to draw: the notes' span padded, with a sensible default. */
export function pitchRange(notes: Note[]): PitchRange {
  if (notes.length === 0) {
    return { min: 40, max: 52 }; // E2..E3, a bass-friendly default
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) {
    lo = Math.min(lo, n.midi);
    hi = Math.max(hi, n.midi);
  }
  lo -= 2;
  hi += 2;
  if (hi - lo < MIN_SPAN) {
    const pad = Math.ceil((MIN_SPAN - (hi - lo)) / 2);
    lo -= pad;
    hi += pad;
  }
  return { min: Math.max(MIDI_MIN, lo), max: Math.min(MIDI_MAX, hi) };
}

interface PianoRollProps {
  notes: Note[];
  regionLen: number;
  selectedId: string | null;
  onSelectNote: (id: string) => void;
  onAddAt: (startSec: number, midi: number) => void;
  onNoteKey: (id: string, key: string, shiftKey: boolean) => void;
}

export function PianoRoll({
  notes,
  regionLen,
  selectedId,
  onSelectNote,
  onAddAt,
  onNoteKey,
}: PianoRollProps) {
  const range = useMemo(() => pitchRange(notes), [notes]);
  const rows = range.max - range.min + 1;
  const rowPct = 100 / rows;
  const len = regionLen > 0 ? regionLen : 1;

  function topPct(midi: number): number {
    return (range.max - midi) * rowPct;
  }

  function handleGridClick(e: MouseEvent<HTMLDivElement>) {
    // Only react to clicks on the empty grid, not on a note button.
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    const yFrac = (e.clientY - rect.top) / rect.height;
    const startSec = Math.max(0, Math.min(len, xFrac * len));
    const midi = Math.round(range.max - yFrac * (range.max - range.min));
    onAddAt(startSec, midi);
  }

  return (
    <div className="piano-roll" role="group" aria-label="Detected notes">
      <div className="roll-grid" onClick={handleGridClick} data-testid="roll-grid">
        {notes.map((n) => {
          const left = (n.startSec / len) * 100;
          const width = Math.max(1.5, (n.durSec / len) * 100);
          const selected = n.id === selectedId;
          return (
            <button
              key={n.id}
              type="button"
              className={`roll-note${selected ? " selected" : ""}${n.edited ? " edited" : ""}`}
              data-note="1"
              data-start={n.startSec}
              data-dur={n.durSec}
              data-midi={n.midi}
              style={{
                left: `${left}%`,
                width: `${Math.min(100 - left, width)}%`,
                top: `${topPct(n.midi)}%`,
                height: `${rowPct}%`,
              }}
              aria-pressed={selected}
              aria-label={`${midiToName(n.midi)} at ${n.startSec.toFixed(2)} seconds`}
              onClick={() => onSelectNote(n.id)}
              onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
                const keys = [
                  "ArrowUp",
                  "ArrowDown",
                  "ArrowLeft",
                  "ArrowRight",
                  "Delete",
                  "Backspace",
                ];
                if (keys.includes(e.key)) {
                  e.preventDefault();
                  onNoteKey(n.id, e.key, e.shiftKey);
                }
              }}
            >
              <span className="visually-hidden">{midiToName(n.midi)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
