import { describe, it, expect } from "vitest";
import { buildNewRiff, riffTitle } from "../../src/book/new-riff";
import type { Note } from "../../src/audio/note";

const NOTES: Note[] = [
  { id: "a", midi: 40, startSec: 0, durSec: 0.4, confidence: 0.9, edited: false },
  { id: "b", midi: 45, startSec: 0.5, durSec: 0.4, confidence: 1, edited: true },
];

describe("riffTitle", () => {
  it("drops the extension and keeps dotless names whole", () => {
    expect(riffTitle("cold sweat.mp3")).toBe("cold sweat");
    expect(riffTitle("take.five.wav")).toBe("take.five");
    expect(riffTitle("liveset")).toBe("liveset");
  });
});

describe("buildNewRiff", () => {
  it("carries the graded notes without UI ids, the clip, and the loop metadata", () => {
    const clip = new Uint8Array([1, 2, 3]).buffer;
    const riff = buildNewRiff(NOTES, {
      sourceName: "my riff.wav",
      clipWav: clip,
      startSec: 4,
      endSec: 8,
      bars: 2,
      tempoBpm: 96,
      speed: 0.75,
    });
    expect(riff.title).toBe("my riff");
    expect(riff.sourceName).toBe("my riff.wav");
    expect(riff.clipWav).toBe(clip);
    expect(riff.stemUsed).toBe("mix");
    expect(riff.loopRegion).toEqual({
      startSec: 4,
      endSec: 8,
      bars: 2,
      tempoBpm: 96,
      speed: 0.75,
    });
    expect(riff.notes).toEqual([
      { midi: 40, startSec: 0, durSec: 0.4, confidence: 0.9, edited: false },
      { midi: 45, startSec: 0.5, durSec: 0.4, confidence: 1, edited: true },
    ]);
    expect(riff.notes[0]).not.toHaveProperty("id");
  });
});
