// Deterministic take synthesis for the pitch/grade unit tests and the accuracy
// harness. No Web Audio: everything is plain Float32Array math so the exact pure
// grading path runs on synthesized and file-based takes alike.

import { midiToFreq } from "../../../src/audio/pitch";
import type { Note } from "../../../src/audio/note";
import { makeNoteId } from "../../../src/audio/note";
import type { Take } from "../../../src/audio/take";

export const SR = 22050;

/** A tiny deterministic PRNG so "noise" and "wrong notes" never vary per run. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export interface ToneOptions {
  detuneCents?: number; // steady pitch offset
  harmonics?: number[]; // extra partial gains, e.g. [0.4, 0.2] for 2nd, 3rd
  vibratoCents?: number; // peak vibrato depth
  vibratoHz?: number;
  noise?: number; // additive white-noise amplitude
  rand?: () => number;
}

/** One sustained note with a soft attack/release, at `midi` for `durSec`. */
export function tone(midi: number, durSec: number, sr = SR, opts: ToneOptions = {}): Float32Array {
  const {
    detuneCents = 0,
    harmonics = [0.4, 0.15],
    vibratoCents = 0,
    vibratoHz = 5,
    noise = 0,
    rand,
  } = opts;
  const rng = rand ?? lcg(1);
  const len = Math.max(1, Math.floor(durSec * sr));
  const out = new Float32Array(len);
  const baseFreq = midiToFreq(midi + detuneCents / 100);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const vib = vibratoCents ? (vibratoCents / 100) * Math.sin(2 * Math.PI * vibratoHz * t) : 0;
    const freq = baseFreq * Math.pow(2, vib / 12);
    phase += (2 * Math.PI * freq) / sr;
    let s = Math.sin(phase);
    for (let h = 0; h < harmonics.length; h++) {
      s += harmonics[h] * Math.sin(phase * (h + 2));
    }
    // Soft attack and release so frames are clearly voiced without clicks.
    const attack = Math.min(1, t / 0.01);
    const release = Math.min(1, (durSec - t) / 0.02);
    const env = 0.6 * Math.max(0, Math.min(attack, release));
    let v = s * env;
    if (noise) v += (rng() * 2 - 1) * noise;
    out[i] = v;
  }
  return out;
}

/** Concatenates note tones into a single take, honoring per-note start times. */
export function synthTake(
  notes: { midi: number; startSec: number; durSec: number }[],
  sr = SR,
  toneOpts: (n: { midi: number; startSec: number; durSec: number }, i: number) => ToneOptions = () => ({}),
  totalSec?: number,
): Take {
  const end = totalSec ?? Math.max(...notes.map((n) => n.startSec + n.durSec), 0);
  const len = Math.max(1, Math.ceil(end * sr));
  const samples = new Float32Array(len);
  notes.forEach((n, i) => {
    const t = tone(n.midi, n.durSec, sr, toneOpts(n, i));
    const off = Math.floor(n.startSec * sr);
    for (let j = 0; j < t.length && off + j < len; j++) samples[off + j] += t[j];
  });
  return { samples, sampleRate: sr };
}

/** Builds a target Note[] from a compact spec, with real stable ids. */
export function makeTarget(spec: { midi: number; startSec: number; durSec: number }[]): Note[] {
  return spec.map((s) => ({
    id: makeNoteId("t"),
    midi: s.midi,
    startSec: s.startSec,
    durSec: s.durSec,
    confidence: 1,
    edited: false,
  }));
}

/** White noise of a given amplitude and length. */
export function noiseTake(durSec: number, amp = 0.2, sr = SR, seed = 7): Take {
  const rng = lcg(seed);
  const len = Math.max(1, Math.floor(durSec * sr));
  const samples = new Float32Array(len);
  for (let i = 0; i < len; i++) samples[i] = (rng() * 2 - 1) * amp;
  return { samples, sampleRate: sr };
}

/** Silence of a given length. */
export function silenceTake(durSec: number, sr = SR): Take {
  return { samples: new Float32Array(Math.max(1, Math.floor(durSec * sr))), sampleRate: sr };
}
