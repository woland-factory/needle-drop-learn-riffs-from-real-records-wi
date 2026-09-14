// The heart of the verdict. Pure grading of a pitch track against a target note
// list. Deterministic and defensive: a malformed or empty track returns a
// non-matching result, never throws. This is the code the accuracy fixtures and
// the live mic both run, so believability is measured, not asserted.

import type { Note } from "./note";
import type { PitchFrame } from "./pitch-track";

export interface Tolerances {
  cents: number; // pitch tolerance, +/- cents
  timingWindowSec: number; // +/- window around each note, seconds
  octaveTolerant: boolean; // ignore octave errors when true
}

export const DEFAULT_TOLERANCES: Tolerances = {
  cents: 50,
  timingWindowSec: 0.12,
  octaveTolerant: true,
};

// Boundary clamps so a malformed settings input can never produce a nonsense
// grade. Generous ranges; the defaults sit comfortably inside them.
export const CENTS_MIN = 1;
export const CENTS_MAX = 200;
export const TIMING_MIN_SEC = 0;
export const TIMING_MAX_SEC = 0.5;

/** Clamps tolerance fields to sane ranges, dropping non-finite values. */
export function clampTolerances(tol: Tolerances): Tolerances {
  const cents = Number.isFinite(tol.cents)
    ? Math.min(CENTS_MAX, Math.max(CENTS_MIN, tol.cents))
    : DEFAULT_TOLERANCES.cents;
  const timingWindowSec = Number.isFinite(tol.timingWindowSec)
    ? Math.min(TIMING_MAX_SEC, Math.max(TIMING_MIN_SEC, tol.timingWindowSec))
    : DEFAULT_TOLERANCES.timingWindowSec;
  return { cents, timingWindowSec, octaveTolerant: !!tol.octaveTolerant };
}

export type NoteStatus = "pass" | "wrong-pitch" | "not-heard";

export interface NoteVerdict {
  noteId: string;
  status: NoteStatus;
  heardMidi: number | null; // rounded, for display; null when not heard
}

export interface PassResult {
  perNote: NoteVerdict[];
  score: number; // 0..100, round(100 * passed / total)
  matched: boolean; // true only when EVERY target note passes
  offsetSec: number; // the global alignment offset that was applied
  heardLine: boolean; // false when the take is silence/noise (never a pass)
}

// A take counts as having a line only when voiced frames cover at least this
// fraction of the whole track. Silence and noise fall far below it, so they can
// never light up green. This is the false-positive guard.
const HEARD_LINE_FRACTION = 0.05;

// Fraction of a note's core span that must be voiced to count as heard at all.
const NOTE_VOICED_FRACTION = 0.4;

// Trim this fraction of each end of a note before taking the median pitch, so an
// attack slide or a release tail does not skew the reading.
const EDGE_TRIM = 0.2;

// A clean single note reads as one steady pitch. These gate that: at least
// CLUSTER_FRACTION of a note's voiced frames must sit within CLUSTER_SEMITONES
// of the median. A window that straddles two different notes fails the gate, so
// a lucky mixed median can never masquerade as a pass. This is the second
// false-positive guard, alongside the heard-line check.
const CLUSTER_SEMITONES = 0.6;
const CLUSTER_FRACTION = 0.6;
// Penalty (semitones) charged for an unclear note when comparing offsets, so the
// alignment search is never drawn toward a straddling window.
const UNCLEAR_PENALTY = 3;

// Offset search bounds and step (seconds). Bounded and pure. Kept modest so a
// global shift can rescue a take that starts a hair late, yet can never slide a
// note's window onto a neighbor's audio and manufacture a false pass. A count-in
// precedes every pass, so gross offsets do not occur.
const OFFSET_MAX = 0.15;
const OFFSET_STEP = 0.01;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Semitone distance, folding octaves away when octaveTolerant. */
function pitchError(heardMidi: number, targetMidi: number, octaveTolerant: boolean): number {
  let d = heardMidi - targetMidi;
  if (octaveTolerant) d -= 12 * Math.round(d / 12);
  return Math.abs(d);
}

interface NoteGrade {
  verdict: NoteVerdict;
  pass: boolean;
  heard: boolean; // status is not "not-heard"
  error: number; // pitch error / penalty in semitones for offset comparison
}

function gradeNote(
  note: Note,
  frames: PitchFrame[],
  offsetSec: number,
  tol: Tolerances,
): NoteGrade {
  const coreLo = note.startSec + EDGE_TRIM * note.durSec;
  const coreHi = note.startSec + note.durSec - EDGE_TRIM * note.durSec;
  let total = 0;
  const voiced: number[] = [];
  for (const f of frames) {
    const t = f.timeSec - offsetSec;
    if (t < coreLo || t > coreHi) continue;
    total++;
    if (f.midi !== null) voiced.push(f.midi);
  }

  const heardFraction = total > 0 ? voiced.length / total : 0;
  if (voiced.length === 0 || heardFraction < NOTE_VOICED_FRACTION) {
    return {
      verdict: { noteId: note.id, status: "not-heard", heardMidi: null },
      pass: false,
      heard: false,
      error: 0,
    };
  }

  const heard = median(voiced);

  // Consistency gate: a clean note is one steady pitch. If the voiced frames do
  // not cluster around the median, the window straddles more than one note and
  // the reading is not trustworthy, so it can never pass.
  const clustered = voiced.filter(
    (m) => pitchError(m, heard, tol.octaveTolerant) <= CLUSTER_SEMITONES,
  ).length;
  if (clustered / voiced.length < CLUSTER_FRACTION) {
    return {
      verdict: { noteId: note.id, status: "wrong-pitch", heardMidi: Math.round(heard) },
      pass: false,
      heard: true,
      error: UNCLEAR_PENALTY,
    };
  }

  const error = pitchError(heard, note.midi, tol.octaveTolerant);
  const pass = error <= tol.cents / 100;
  return {
    verdict: {
      noteId: note.id,
      status: pass ? "pass" : "wrong-pitch",
      heardMidi: Math.round(heard),
    },
    pass,
    heard: true,
    error,
  };
}

interface OffsetScore {
  grades: NoteGrade[];
  passed: number;
  heard: number;
  totalError: number;
}

function gradeAtOffset(
  frames: PitchFrame[],
  target: Note[],
  offsetSec: number,
  tol: Tolerances,
): OffsetScore {
  const grades = target.map((n) => gradeNote(n, frames, offsetSec, tol));
  let passed = 0;
  let heard = 0;
  let totalError = 0;
  for (const g of grades) {
    if (g.pass) passed++;
    if (g.heard) heard++;
    totalError += g.error;
  }
  return { grades, passed, heard, totalError };
}

/**
 * Searches a bounded global offset for the best alignment. The objective, in
 * order: pass the most notes, then hear the most notes, then lowest total pitch
 * error, then the smallest shift. Rescues a take that starts a hair late without
 * ever being drawn toward a straddling window or rescuing wrong pitches.
 */
export function estimateOffset(frames: PitchFrame[], target: Note[], tol: Tolerances): number {
  if (frames.length === 0 || target.length === 0) return 0;
  const t = clampTolerances(tol);
  let bestOffset = 0;
  let best: OffsetScore | null = null;
  for (let offset = -OFFSET_MAX; offset <= OFFSET_MAX + 1e-9; offset += OFFSET_STEP) {
    const score = gradeAtOffset(frames, target, offset, t);
    if (best === null || betterOffset(score, offset, best, bestOffset)) {
      best = score;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

/** Lexicographic offset objective: more passes, more heard, less error, smaller shift. */
function betterOffset(a: OffsetScore, aOffset: number, b: OffsetScore, bOffset: number): boolean {
  if (a.passed !== b.passed) return a.passed > b.passed;
  if (a.heard !== b.heard) return a.heard > b.heard;
  if (Math.abs(a.totalError - b.totalError) > 1e-9) return a.totalError < b.totalError;
  return Math.abs(aOffset) < Math.abs(bOffset);
}

/**
 * Grades a completed pass. Runs once, on the whole take, after recording ends.
 * Returns a legible per-note verdict plus a per-pass score.
 */
export function gradePass(frames: PitchFrame[], target: Note[], tol: Tolerances): PassResult {
  const t = clampTolerances(tol);

  // Heard-line guard: silence and noise can never pass.
  const voicedFrames = frames.filter((f) => f.midi !== null).length;
  const heardLine =
    frames.length > 0 && voicedFrames / frames.length >= HEARD_LINE_FRACTION;

  if (target.length === 0) {
    return { perNote: [], score: 0, matched: false, offsetSec: 0, heardLine };
  }

  if (!heardLine) {
    return {
      perNote: target.map((n) => ({
        noteId: n.id,
        status: "not-heard" as NoteStatus,
        heardMidi: null,
      })),
      score: 0,
      matched: false,
      offsetSec: 0,
      heardLine: false,
    };
  }

  const offsetSec = estimateOffset(frames, target, t);
  const { grades, passed } = gradeAtOffset(frames, target, offsetSec, t);
  const score = Math.round((100 * passed) / target.length);
  const matched = passed === target.length;
  return {
    perNote: grades.map((g) => g.verdict),
    score,
    matched,
    offsetSec,
    heardLine: true,
  };
}
