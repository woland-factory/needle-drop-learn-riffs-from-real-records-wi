import { describe, it, expect } from "vitest";
import { trackPitch } from "../../src/audio/pitch-track";
import {
  gradePass,
  estimateOffset,
  clampTolerances,
  DEFAULT_TOLERANCES,
  type Tolerances,
} from "../../src/audio/grade";
import { synthTake, makeTarget, noiseTake, silenceTake, SR } from "./helpers/synth";

const PHRASE = [
  { midi: 40, startSec: 0.0, durSec: 0.4 },
  { midi: 43, startSec: 0.5, durSec: 0.4 },
  { midi: 45, startSec: 1.0, durSec: 0.4 },
  { midi: 47, startSec: 1.5, durSec: 0.4 },
];

function grade(take: ReturnType<typeof synthTake>, target = makeTarget(PHRASE), tol: Tolerances = DEFAULT_TOLERANCES) {
  return gradePass(trackPitch(take), target, tol);
}

describe("gradePass", () => {
  it("passes a clean matching take: all notes pass, score 100, matched", () => {
    const target = makeTarget(PHRASE);
    const res = gradePass(trackPitch(synthTake(PHRASE, SR)), target, DEFAULT_TOLERANCES);
    expect(res.matched).toBe(true);
    expect(res.score).toBe(100);
    expect(res.perNote.every((v) => v.status === "pass")).toBe(true);
  });

  it("flags a single wrong note wrong-pitch and does not match", () => {
    const wrong = PHRASE.map((n, i) => (i === 2 ? { ...n, midi: n.midi + 4 } : n));
    const target = makeTarget(PHRASE);
    const res = gradePass(trackPitch(synthTake(wrong, SR)), target, DEFAULT_TOLERANCES);
    expect(res.matched).toBe(false);
    expect(res.perNote[2].status).toBe("wrong-pitch");
    expect(res.perNote.filter((v) => v.status === "pass").length).toBe(3);
  });

  it("passes a detune within cents and fails beyond it", () => {
    const target = makeTarget(PHRASE);
    const within = synthTake(PHRASE, SR, () => ({ detuneCents: 30 }));
    expect(gradePass(trackPitch(within), target, DEFAULT_TOLERANCES).matched).toBe(true);

    const beyond = synthTake(PHRASE, SR, () => ({ detuneCents: 90 }));
    const res = gradePass(trackPitch(beyond), target, DEFAULT_TOLERANCES);
    expect(res.matched).toBe(false);
    expect(res.perNote.every((v) => v.status === "wrong-pitch")).toBe(true);
  });

  it("passes a rush within the timing window", () => {
    const target = makeTarget(PHRASE);
    const rushed = PHRASE.map((n) => ({ ...n, startSec: Math.max(0, n.startSec - 0.08) }));
    expect(grade(synthTake(rushed, SR), target).matched).toBe(true);
  });

  it("rescues a globally late take via estimateOffset", () => {
    const target = makeTarget(PHRASE);
    // Late by more than the timing window, so only a global offset can rescue it.
    const late = PHRASE.map((n) => ({ ...n, startSec: n.startSec + 0.3 }));
    const take = synthTake(late, SR, () => ({}), 2.3);
    const frames = trackPitch(take);
    const offset = estimateOffset(frames, target, DEFAULT_TOLERANCES);
    expect(offset).toBeGreaterThan(0.1);
    expect(gradePass(frames, target, DEFAULT_TOLERANCES).matched).toBe(true);
  });

  it("honors the octave-tolerant flag", () => {
    const target = makeTarget(PHRASE);
    const up = PHRASE.map((n) => ({ ...n, midi: n.midi + 12 }));
    const take = synthTake(up, SR);
    expect(gradePass(trackPitch(take), target, { ...DEFAULT_TOLERANCES, octaveTolerant: true }).matched).toBe(true);
    expect(gradePass(trackPitch(take), target, { ...DEFAULT_TOLERANCES, octaveTolerant: false }).matched).toBe(false);
  });

  it("never passes silence or noise (heardLine false)", () => {
    const target = makeTarget(PHRASE);
    const sil = gradePass(trackPitch(silenceTake(2.0)), target, DEFAULT_TOLERANCES);
    expect(sil.heardLine).toBe(false);
    expect(sil.matched).toBe(false);
    expect(sil.perNote.every((v) => v.status === "not-heard")).toBe(true);

    const noi = gradePass(trackPitch(noiseTake(2.0)), target, DEFAULT_TOLERANCES);
    expect(noi.matched).toBe(false);
  });

  it("changing a tolerance changes the grade of a borderline take", () => {
    const target = makeTarget(PHRASE);
    const borderline = synthTake(PHRASE, SR, () => ({ detuneCents: 65 }));
    const frames = trackPitch(borderline);
    expect(gradePass(frames, target, { ...DEFAULT_TOLERANCES, cents: 50 }).matched).toBe(false);
    expect(gradePass(frames, target, { ...DEFAULT_TOLERANCES, cents: 90 }).matched).toBe(true);
  });

  it("tolerates an empty pitch track without throwing", () => {
    const target = makeTarget(PHRASE);
    const res = gradePass([], target, DEFAULT_TOLERANCES);
    expect(res.matched).toBe(false);
    expect(res.heardLine).toBe(false);
  });
});

describe("clampTolerances", () => {
  it("clamps out-of-range and non-finite values", () => {
    expect(clampTolerances({ cents: 9999, timingWindowSec: 9, octaveTolerant: true }).cents).toBe(200);
    expect(clampTolerances({ cents: -5, timingWindowSec: -1, octaveTolerant: false }).cents).toBe(1);
    expect(clampTolerances({ cents: NaN, timingWindowSec: NaN, octaveTolerant: true }).cents).toBe(
      DEFAULT_TOLERANCES.cents,
    );
    expect(clampTolerances({ cents: 50, timingWindowSec: 9, octaveTolerant: true }).timingWindowSec).toBe(0.5);
  });
});
