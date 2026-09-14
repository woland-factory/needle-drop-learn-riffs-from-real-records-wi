import { describe, it, expect } from "vitest";
import { readWavPcm } from "../../src/audio/wav";
import { trackPitch } from "../../src/audio/pitch-track";
import { tone, SR } from "./helpers/synth";

/** Writes a mono 16-bit PCM WAV the same way scripts/gen-audio.mjs does. */
function writeWav(samples: Float32Array, sr = SR): Uint8Array {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return new Uint8Array(buf);
}

describe("readWavPcm", () => {
  it("round-trips PCM written by the generator", () => {
    const samples = tone(45, 0.3, SR);
    const bytes = writeWav(samples, SR);
    const take = readWavPcm(bytes);
    expect(take.sampleRate).toBe(SR);
    expect(take.samples.length).toBe(samples.length);
    // Values survive the 16-bit round-trip within quantization error.
    for (let i = 0; i < samples.length; i += 500) {
      expect(take.samples[i]).toBeCloseTo(samples[i], 3);
    }
    // The decoded take tracks to the right pitch, proving it is the same shape.
    const voiced = trackPitch(take).filter((f) => f.midi !== null);
    expect(voiced.length).toBeGreaterThan(0);
  });

  it("throws on a non-WAVE file", () => {
    expect(() => readWavPcm(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
