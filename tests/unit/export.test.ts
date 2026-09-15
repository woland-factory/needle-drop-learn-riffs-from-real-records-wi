import { describe, it, expect } from "vitest";
import {
  serializeBook,
  bytesToBase64,
  base64ToBytes,
} from "../../src/book/export";
import { readWavPcm, writeWavPcm } from "../../src/audio/wav";
import type { RiffRecord } from "../../src/book/store";
import { tone, SR } from "./helpers/synth";

const NOW = 1_750_000_000_000;

function record(clipWav: ArrayBuffer): RiffRecord {
  return {
    v: 1,
    id: "r1",
    title: "riff",
    sourceName: "riff.wav",
    clipWav,
    loopRegion: { startSec: 1, endSec: 3, bars: 2, tempoBpm: 120, speed: 1 },
    notes: [{ midi: 45, startSec: 0, durSec: 0.5, confidence: 1, edited: false }],
    stemUsed: "mix",
    dateFirstNailed: NOW,
    bestScore: 100,
    streak: 1,
    lastPracticed: NOW,
    reviewDueDate: NOW + 1,
  };
}

describe("bytesToBase64", () => {
  it("round-trips bytes, including buffers larger than one chunk", () => {
    const big = new Uint8Array(70_000);
    for (let i = 0; i < big.length; i++) big[i] = i % 251;
    const back = base64ToBytes(bytesToBase64(big.buffer));
    expect(back.length).toBe(big.length);
    expect(back[0]).toBe(big[0]);
    expect(back[69_999]).toBe(big[69_999]);
    expect(Array.from(back.slice(0, 300))).toEqual(Array.from(big.slice(0, 300)));
  });
});

describe("serializeBook", () => {
  it("emits the export shape and each clip decodes back through readWavPcm", () => {
    const samples = tone(45, 0.2, SR);
    const clip = writeWavPcm({ samples, sampleRate: SR });
    const out = serializeBook([record(clip)], NOW);

    expect(out.app).toBe("needle-drop");
    expect(out.exportVersion).toBe(1);
    expect(out.exportedAt).toBe(NOW);
    expect(out.riffs).toHaveLength(1);

    const riff = out.riffs[0];
    expect(riff.id).toBe("r1");
    expect(riff.title).toBe("riff");
    expect(riff.notes).toHaveLength(1);
    expect(riff.stemUsed).toBe("mix");
    expect(riff.streak).toBe(1);
    expect(riff.bestScore).toBe(100);
    expect(riff.loopRegion.tempoBpm).toBe(120);

    const decoded = readWavPcm(base64ToBytes(riff.clipWavBase64));
    expect(decoded.sampleRate).toBe(SR);
    expect(decoded.samples.length).toBe(samples.length);

    // The whole object survives JSON, the actual download format.
    const parsed = JSON.parse(JSON.stringify(out));
    expect(parsed.riffs[0].clipWavBase64).toBe(riff.clipWavBase64);
  });

  it("serializes an empty book as an empty riff list", () => {
    expect(serializeBook([], NOW).riffs).toEqual([]);
  });
});
