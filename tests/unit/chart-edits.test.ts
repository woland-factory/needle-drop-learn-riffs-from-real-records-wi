import { describe, it, expect } from "vitest";
import {
  applyAdd,
  applyDelete,
  applyNudge,
  applyPitch,
} from "../../src/audio/chart-edits";
import { MIDI_MAX, MIDI_MIN, type Note } from "../../src/audio/note";

function note(over: Partial<Note> & { id: string }): Note {
  return {
    midi: 40,
    startSec: 0,
    durSec: 0.4,
    confidence: 1,
    edited: false,
    ...over,
  };
}

function assertNonOverlapping(notes: Note[]) {
  const sorted = [...notes].sort((a, b) => a.startSec - b.startSec);
  for (let i = 0; i < sorted.length - 1; i++) {
    expect(sorted[i].startSec + sorted[i].durSec).toBeLessThanOrEqual(
      sorted[i + 1].startSec + 1e-9,
    );
  }
}

describe("applyDelete", () => {
  it("removes the note by id", () => {
    const notes = [note({ id: "a" }), note({ id: "b", startSec: 1 })];
    expect(applyDelete(notes, "a").map((n) => n.id)).toEqual(["b"]);
  });
});

describe("applyPitch", () => {
  it("changes midi by a semitone and marks edited", () => {
    const notes = [note({ id: "a", midi: 40 })];
    const out = applyPitch(notes, "a", 1);
    expect(out[0].midi).toBe(41);
    expect(out[0].edited).toBe(true);
  });

  it("clamps at the top and bottom of the range", () => {
    expect(applyPitch([note({ id: "a", midi: MIDI_MAX })], "a", 1)[0].midi).toBe(
      MIDI_MAX,
    );
    expect(applyPitch([note({ id: "a", midi: MIDI_MIN })], "a", -1)[0].midi).toBe(
      MIDI_MIN,
    );
  });
});

describe("applyNudge", () => {
  it("shifts the start and marks edited", () => {
    const notes = [note({ id: "a", startSec: 0.5, durSec: 0.4 })];
    const out = applyNudge(notes, "a", 0.1, 4);
    expect(out[0].startSec).toBeCloseTo(0.6, 6);
    expect(out[0].edited).toBe(true);
  });

  it("clamps to the region edges", () => {
    const notes = [note({ id: "a", startSec: 0.1, durSec: 0.4 })];
    expect(applyNudge(notes, "a", -1, 4)[0].startSec).toBe(0);
    const atEnd = applyNudge([note({ id: "a", startSec: 3.5, durSec: 0.4 })], "a", 5, 4);
    expect(atEnd[0].startSec).toBeCloseTo(3.6, 6);
  });

  it("never overlaps a neighbour", () => {
    const notes = [
      note({ id: "a", startSec: 0, durSec: 0.4 }),
      note({ id: "b", startSec: 1, durSec: 0.4 }),
    ];
    // Try to drag b left across a; it should stop at a's end.
    const out = applyNudge(notes, "b", -2, 4);
    expect(out.find((n) => n.id === "b")!.startSec).toBeGreaterThanOrEqual(0.4);
    assertNonOverlapping(out);
  });
});

describe("applyAdd", () => {
  it("adds a note with confidence 1 and edited true", () => {
    const { notes, addedId } = applyAdd([], { startSec: 0.5, midi: 43 }, 4);
    expect(addedId).not.toBeNull();
    const added = notes.find((n) => n.id === addedId)!;
    expect(added.confidence).toBe(1);
    expect(added.edited).toBe(true);
    expect(added.midi).toBe(43);
  });

  it("clamps an out-of-range pitch", () => {
    const { notes, addedId } = applyAdd([], { startSec: 0, midi: 500 }, 4);
    expect(notes.find((n) => n.id === addedId)!.midi).toBe(MIDI_MAX);
  });

  it("slides into the next free gap instead of overlapping", () => {
    const existing = [note({ id: "a", startSec: 0, durSec: 0.4 })];
    const { notes, addedId } = applyAdd(existing, { startSec: 0.1, midi: 45 }, 4);
    const added = notes.find((n) => n.id === addedId)!;
    expect(added.startSec).toBeGreaterThanOrEqual(0.4);
    assertNonOverlapping(notes);
  });

  it("rejects the add when no audible gap is available", () => {
    const existing = [note({ id: "a", startSec: 0, durSec: 4 })];
    const { notes, addedId } = applyAdd(existing, { startSec: 0, midi: 45 }, 4);
    expect(addedId).toBeNull();
    expect(notes).toHaveLength(1);
  });
});
