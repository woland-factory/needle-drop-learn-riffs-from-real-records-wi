// The headline accuracy criterion, run under `npm test`. A battery of takes,
// synthesized to model both clean and recording-like conditions, is fed through
// the exact pure path the live mic uses (trackPitch -> gradePass) with the
// shipped DEFAULT_TOLERANCES. It proves the verdict in both directions:
//   - correct takes match at a false-negative rate under about 1 in 10;
//   - every wrong take is flagged wrong.
// Any recorded WAV dropped in and decoded with readWavPcm would grade the same
// way; the synthesis here keeps the proof deterministic and self-contained.

import { describe, it, expect } from "vitest";
import { trackPitch } from "../../src/audio/pitch-track";
import { gradePass, DEFAULT_TOLERANCES, type PassResult } from "../../src/audio/grade";
import { makeTarget, synthTake, lcg, type ToneOptions, SR } from "./helpers/synth";
import type { Note } from "../../src/audio/note";

interface Spec {
  midi: number;
  startSec: number;
  durSec: number;
}

// Two known phrases: a walking bassline and a shorter guitar lick an octave up.
const BASS: Spec[] = [
  { midi: 40, startSec: 0.0, durSec: 0.4 }, // E2
  { midi: 43, startSec: 0.5, durSec: 0.4 }, // G2
  { midi: 45, startSec: 1.0, durSec: 0.4 }, // A2
  { midi: 47, startSec: 1.5, durSec: 0.4 }, // B2
  { midi: 45, startSec: 2.0, durSec: 0.4 }, // A2
  { midi: 43, startSec: 2.5, durSec: 0.4 }, // G2
];
const LICK: Spec[] = [
  { midi: 57, startSec: 0.0, durSec: 0.35 }, // A3
  { midi: 60, startSec: 0.4, durSec: 0.35 }, // C4
  { midi: 64, startSec: 0.8, durSec: 0.35 }, // E4
  { midi: 62, startSec: 1.2, durSec: 0.35 }, // D4
];

const PHRASES: { name: string; spec: Spec[] }[] = [
  { name: "bass", spec: BASS },
  { name: "lick", spec: LICK },
];

type Variant = {
  name: string;
  build: (spec: Spec[]) => { take: ReturnType<typeof synthTake>; target: Note[] };
};

function shift(spec: Spec[], dt: number): Spec[] {
  return spec.map((n) => ({ ...n, startSec: Math.max(0, n.startSec + dt) }));
}

// Correct takes: each should match under the generous defaults.
const CORRECT: Variant[] = [
  {
    name: "clean",
    build: (spec) => ({ take: synthTake(spec, SR), target: makeTarget(spec) }),
  },
  {
    name: "slight-detune",
    build: (spec) => ({
      take: synthTake(spec, SR, () => ({ detuneCents: 25 })),
      target: makeTarget(spec),
    }),
  },
  {
    name: "rushed",
    build: (spec) => ({ take: synthTake(shift(spec, -0.06), SR), target: makeTarget(spec) }),
  },
  {
    name: "dragged",
    build: (spec) => ({ take: synthTake(shift(spec, 0.06), SR, () => ({}), 3.2), target: makeTarget(spec) }),
  },
  {
    name: "global-late",
    build: (spec) => ({ take: synthTake(shift(spec, 0.25), SR, () => ({}), 3.4), target: makeTarget(spec) }),
  },
  {
    name: "vibrato",
    build: (spec) => ({
      take: synthTake(spec, SR, () => ({ vibratoCents: 20, vibratoHz: 5.5 })),
      target: makeTarget(spec),
    }),
  },
  {
    name: "rich-timbre",
    build: (spec) => ({
      take: synthTake(spec, SR, () => ({ harmonics: [0.7, 0.5, 0.3, 0.2] })),
      target: makeTarget(spec),
    }),
  },
  {
    name: "noise-floor",
    build: (spec) => ({
      take: synthTake(spec, SR, (_n, i) => ({ noise: 0.03, rand: lcg(100 + i) } as ToneOptions)),
      target: makeTarget(spec),
    }),
  },
  {
    name: "octave-up",
    build: (spec) => ({
      take: synthTake(spec.map((n) => ({ ...n, midi: n.midi + 12 })), SR),
      target: makeTarget(spec),
    }),
  },
];

// Wrong takes: each MUST be flagged wrong (matched false, the wrong note not pass).
const WRONG: {
  name: string;
  build: (spec: Spec[]) => { take: ReturnType<typeof synthTake>; target: Note[]; wrongIdx: number[] };
}[] = [
  {
    name: "one-wrong-note",
    build: (spec) => {
      const idx = 2;
      const played = spec.map((n, i) => (i === idx ? { ...n, midi: n.midi + 3 } : n));
      return { take: synthTake(played, SR), target: makeTarget(spec), wrongIdx: [idx] };
    },
  },
  {
    name: "transposed-non-octave",
    build: (spec) => {
      const played = spec.map((n) => ({ ...n, midi: n.midi + 5 }));
      return {
        take: synthTake(played, SR),
        target: makeTarget(spec),
        wrongIdx: spec.map((_, i) => i),
      };
    },
  },
  {
    name: "wrong-notes-throughout",
    build: (spec) => {
      const rng = lcg(42);
      const played = spec.map((n) => ({ ...n, midi: n.midi + 2 + Math.floor(rng() * 4) }));
      return {
        take: synthTake(played, SR),
        target: makeTarget(spec),
        wrongIdx: spec.map((_, i) => i),
      };
    },
  },
];

describe("accuracy fixture harness", () => {
  it("matches correct takes at a false-negative rate under about 1 in 10", () => {
    let total = 0;
    let missed = 0;
    const misses: string[] = [];
    for (const { name: pname, spec } of PHRASES) {
      for (const variant of CORRECT) {
        const { take, target } = variant.build(spec);
        const res: PassResult = gradePass(trackPitch(take), target, DEFAULT_TOLERANCES);
        total++;
        if (!res.matched) {
          missed++;
          misses.push(`${pname}/${variant.name} (score ${res.score})`);
        }
      }
    }
    // Under ~1/10: with this battery, allow at most one stray false negative.
    expect(missed / total, `false negatives: ${misses.join(", ")}`).toBeLessThan(0.1);
  });

  it("flags every wrong take wrong, with the wrong note never a pass", () => {
    for (const { name: pname, spec } of PHRASES) {
      for (const variant of WRONG) {
        const { take, target, wrongIdx } = variant.build(spec);
        const res = gradePass(trackPitch(take), target, DEFAULT_TOLERANCES);
        expect(res.matched, `${pname}/${variant.name} wrongly matched`).toBe(false);
        for (const idx of wrongIdx) {
          expect(
            res.perNote[idx].status,
            `${pname}/${variant.name} note ${idx} should not pass`,
          ).not.toBe("pass");
        }
      }
    }
  });
});
