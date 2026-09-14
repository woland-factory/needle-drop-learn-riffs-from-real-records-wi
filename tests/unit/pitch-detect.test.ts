import { describe, it, expect } from "vitest";
import { detectPitch, hzToMidi } from "../../src/audio/pitch-detect";
import { midiToFreq } from "../../src/audio/pitch";
import { tone, noiseTake, silenceTake, SR } from "./helpers/synth";

function centsOff(hz: number, targetHz: number): number {
  return Math.abs(1200 * Math.log2(hz / targetHz));
}

describe("detectPitch", () => {
  // E1, E2, A2, A4 across the supported bass/guitar range.
  for (const midi of [28, 40, 45, 69]) {
    it(`finds the fundamental of MIDI ${midi} within a few cents`, () => {
      const frame = tone(midi, 0.2, SR, { harmonics: [0.3, 0.1] });
      const res = detectPitch(frame, SR);
      expect(res).not.toBeNull();
      const target = midiToFreq(midi);
      expect(centsOff(res!.hz, target)).toBeLessThan(15);
      expect(res!.clarity).toBeGreaterThan(0.8);
    });
  }

  it("returns null on silence", () => {
    expect(detectPitch(silenceTake(0.2).samples, SR)).toBeNull();
  });

  it("returns null or very low clarity on white noise", () => {
    const res = detectPitch(noiseTake(0.2).samples, SR);
    if (res) expect(res.clarity).toBeLessThan(0.5);
    else expect(res).toBeNull();
  });
});

describe("hzToMidi", () => {
  it("inverts midiToFreq", () => {
    for (const midi of [28, 40, 45, 57, 69, 81]) {
      expect(hzToMidi(midiToFreq(midi))).toBeCloseTo(midi, 6);
    }
  });
});
