export interface Note {
  id: string; // stable UI id for editing/keys; EPIC 4 may drop it on persist
  midi: number; // MIDI number, integer, clamped to [MIDI_MIN, MIDI_MAX]
  startSec: number; // seconds RELATIVE TO REGION START (0 = region start)
  durSec: number; // seconds, > 0
  confidence: number; // 0..1, from the model; edited/added notes use 1
  edited: boolean; // true if the user changed or added this note
}

export const MIDI_MIN = 28; // E1, below a 4-string bass low E, generous floor
export const MIDI_MAX = 96; // C7, generous ceiling for guitar

/** Clamps a MIDI number into the supported range and rounds to an integer. */
export function clampMidi(midi: number): number {
  const rounded = Math.round(midi);
  return Math.min(MIDI_MAX, Math.max(MIDI_MIN, rounded));
}

let idCounter = 0;
/** Unique-within-session id for a note, used as a stable React/edit key. */
export function makeNoteId(prefix = "n"): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}
