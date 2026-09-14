import { clampMidi, makeNoteId, type Note } from "./note";
import { MIN_NOTE_SEC } from "./monophonic";

// Default length for a hand-added note, trimmed to fit the free gap.
export const DEFAULT_ADD_DUR = 0.25;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function byStart(a: Note, b: Note): number {
  return a.startSec - b.startSec;
}

/** Removes the note with `id`. Returns a new array. */
export function applyDelete(notes: Note[], id: string): Note[] {
  return notes.filter((n) => n.id !== id);
}

/** Moves a note by whole semitones, clamped to the MIDI range. Marks edited. */
export function applyPitch(notes: Note[], id: string, deltaSemitones: number): Note[] {
  return notes.map((n) =>
    n.id === id
      ? { ...n, midi: clampMidi(n.midi + Math.round(deltaSemitones)), edited: true }
      : n,
  );
}

/**
 * Shifts a note's start by `deltaSec`, clamped to the region and to the gap
 * between its neighbours so no overlap is ever created. Marks edited.
 */
export function applyNudge(
  notes: Note[],
  id: string,
  deltaSec: number,
  regionLen: number,
): Note[] {
  const target = notes.find((n) => n.id === id);
  if (!target) return notes;
  const sorted = [...notes].sort(byStart);
  const idx = sorted.findIndex((n) => n.id === id);
  const prev = sorted[idx - 1];
  const next = sorted[idx + 1];
  const lower = prev ? prev.startSec + prev.durSec : 0;
  const upper = (next ? next.startSec : regionLen) - target.durSec;
  if (upper < lower) {
    // No room to move; still register the edit intent.
    return notes.map((n) => (n.id === id ? { ...n, edited: true } : n));
  }
  const nextStart = clamp(target.startSec + deltaSec, Math.max(0, lower), upper);
  return notes.map((n) =>
    n.id === id ? { ...n, startSec: nextStart, edited: true } : n,
  );
}

export interface AddResult {
  notes: Note[];
  addedId: string | null;
}

/**
 * Adds a note near the requested time and pitch. If the moment is occupied the
 * note slides to the next free gap and is trimmed to fit; if no audible gap is
 * available the add is rejected (addedId null) rather than creating an overlap.
 */
export function applyAdd(
  notes: Note[],
  desired: { startSec: number; midi: number },
  regionLen: number,
): AddResult {
  const midi = clampMidi(desired.midi);
  const sorted = [...notes].sort(byStart);
  let start = clamp(desired.startSec, 0, regionLen);
  // Slide out of any note that covers the requested point.
  for (const n of sorted) {
    if (start >= n.startSec && start < n.startSec + n.durSec) {
      start = n.startSec + n.durSec;
    }
  }
  start = clamp(start, 0, regionLen);
  const next = sorted.find((n) => n.startSec >= start);
  const gapEnd = next ? next.startSec : regionLen;
  const dur = Math.min(DEFAULT_ADD_DUR, gapEnd - start);
  if (dur < MIN_NOTE_SEC) {
    return { notes, addedId: null };
  }
  const note: Note = {
    id: makeNoteId("add"),
    midi,
    startSec: start,
    durSec: dur,
    confidence: 1,
    edited: true,
  };
  return { notes: [...notes, note].sort(byStart), addedId: note.id };
}
