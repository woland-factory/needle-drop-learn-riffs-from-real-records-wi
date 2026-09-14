import { makeNoteId, MIDI_MAX, MIDI_MIN, type Note } from "./note";

/** A raw pitch event before monophonic reduction (model output or a fixture). */
export interface RawNoteEvent {
  midi: number;
  startSec: number;
  durSec: number;
  confidence: number;
}

// Shortest note we treat as audible. Anything briefer is a transient, not a
// riff note, and is dropped rather than shown.
export const MIN_NOTE_SEC = 0.04;

// A region counts as having a clear line only when the kept notes voice at
// least this fraction of its length. Below it we show the "no clear pitch"
// state instead of a near-empty chart.
export const VOICED_FRACTION_MIN = 0.1;

// Onsets closer than this are treated as the same moment for tie-breaking.
const SAME_ONSET_SEC = 0.01;

function isFiniteNumber(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Reduces polyphonic pitch events to a monophonic, non-overlapping note list:
 * one note per moment. Deterministic. The binding post-condition, asserted by
 * the unit tests, is that for all i:
 *   notes[i].startSec + notes[i].durSec <= notes[i + 1].startSec
 * and the output is sorted by startSec.
 */
export function reduceToMonophonic(events: RawNoteEvent[]): Note[] {
  const clean = events.filter(
    (e) =>
      isFiniteNumber(e.midi) &&
      isFiniteNumber(e.startSec) &&
      isFiniteNumber(e.durSec) &&
      isFiniteNumber(e.confidence) &&
      e.midi >= MIDI_MIN &&
      e.midi <= MIDI_MAX &&
      e.startSec >= 0 &&
      e.durSec >= MIN_NOTE_SEC,
  );

  // Sort by onset; ties broken by higher confidence, then lower midi, so the
  // walk below is fully deterministic regardless of input order.
  clean.sort((a, b) => {
    if (a.startSec !== b.startSec) return a.startSec - b.startSec;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return a.midi - b.midi;
  });

  const kept: RawNoteEvent[] = [];
  for (const ev of clean) {
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push({ ...ev });
      continue;
    }
    const lastEnd = last.startSec + last.durSec;
    if (ev.startSec >= lastEnd) {
      // No overlap.
      kept.push({ ...ev });
      continue;
    }
    // Overlap. Keep the more confident note.
    if (ev.confidence > last.confidence) {
      if (ev.startSec - last.startSec > SAME_ONSET_SEC) {
        // Incoming wins and clearly starts later: truncate the previous note
        // to end exactly at the incoming onset so the timeline stays gapless.
        last.durSec = ev.startSec - last.startSec;
        kept.push({ ...ev });
      } else {
        // Same moment: replace the weaker note outright.
        kept[kept.length - 1] = { ...ev };
      }
    }
    // Otherwise drop the lower-confidence incoming note.
  }

  // Truncation may have shortened a note below the audible floor; drop those.
  return kept
    .filter((e) => e.durSec >= MIN_NOTE_SEC)
    .map((e) => ({
      id: makeNoteId(),
      midi: Math.round(e.midi),
      startSec: e.startSec,
      durSec: e.durSec,
      confidence: Math.min(1, Math.max(0, e.confidence)),
      edited: false,
    }));
}

/**
 * True when the notes voice enough of the region to count as a real line.
 * Empty or near-silent results return false so the caller shows the designed
 * "no clear pitch" state instead of zero-notes-as-success.
 */
export function isClearEnough(notes: Note[], regionLen: number): boolean {
  if (!isFiniteNumber(regionLen) || regionLen <= 0) return false;
  if (notes.length === 0) return false;
  const voiced = notes.reduce((sum, n) => sum + n.durSec, 0);
  return voiced >= VOICED_FRACTION_MIN * regionLen;
}
