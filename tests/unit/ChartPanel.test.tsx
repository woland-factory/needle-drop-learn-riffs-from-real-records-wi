import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChartPanel } from "../../src/components/ChartPanel";
import type { AuditionLike } from "../../src/audio/note-synth";
import { MIDI_MAX, type Note } from "../../src/audio/note";

class FakeAudition implements AuditionLike {
  onEnded: (() => void) | null = null;
  alone = 0;
  withSong = 0;
  stops = 0;
  async playAlone() {
    this.alone += 1;
  }
  async playWithSong() {
    this.withSong += 1;
  }
  stop() {
    this.stops += 1;
  }
}

const dummyBuffer = {} as AudioBuffer;

function makeNotes(): Note[] {
  return [
    { id: "a", midi: 40, startSec: 0, durSec: 0.4, confidence: 1, edited: false },
    { id: "b", midi: 45, startSec: 1, durSec: 0.4, confidence: 1, edited: false },
  ];
}

function Harness({
  audition,
  initial,
}: {
  audition: AuditionLike;
  initial: Note[];
}) {
  const [notes, setNotes] = useState<Note[]>(initial);
  const [key, setKey] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setKey((k) => k + 1)}>
        remount
      </button>
      <ChartPanel
        key={key}
        notes={notes}
        regionLen={2}
        buffer={dummyBuffer}
        region={{ startSec: 0, endSec: 2 }}
        audition={audition}
        stale={false}
        onChange={setNotes}
        onRefind={() => {}}
      />
    </>
  );
}

describe("ChartPanel", () => {
  it("renders the piano roll and the single-note scope statement", () => {
    render(<Harness audition={new FakeAudition()} initial={makeNotes()} />);
    expect(
      screen.getByText(/reads one note at a time/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /E2 at 0.00 seconds/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /A2 at 1.00 seconds/ })).toBeInTheDocument();
  });

  it("deletes a selected note", () => {
    render(<Harness audition={new FakeAudition()} initial={makeNotes()} />);
    fireEvent.click(screen.getByRole("button", { name: /E2 at 0.00 seconds/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("button", { name: /E2 at 0.00 seconds/ })).toBeNull();
    expect(screen.getByRole("button", { name: /A2 at 1.00 seconds/ })).toBeInTheDocument();
  });

  it("changes pitch up and clamps at the ceiling", () => {
    const top: Note[] = [
      { id: "a", midi: MIDI_MAX, startSec: 0, durSec: 0.4, confidence: 1, edited: false },
    ];
    render(<Harness audition={new FakeAudition()} initial={top} />);
    fireEvent.click(screen.getByRole("button", { name: /C7 at 0.00 seconds/ }));
    fireEvent.click(screen.getByRole("button", { name: "Up" }));
    // Still C7 (MIDI_MAX), clamped.
    expect(screen.getByRole("button", { name: /C7 at 0.00 seconds/ })).toBeInTheDocument();
  });

  it("moves pitch down a semitone", () => {
    render(<Harness audition={new FakeAudition()} initial={makeNotes()} />);
    fireEvent.click(screen.getByRole("button", { name: /E2 at 0.00 seconds/ }));
    fireEvent.click(screen.getByRole("button", { name: "Down" }));
    expect(screen.getByRole("button", { name: /D#2 at 0.00 seconds/ })).toBeInTheDocument();
  });

  it("nudges timing to the right", () => {
    render(<Harness audition={new FakeAudition()} initial={makeNotes()} />);
    fireEvent.click(screen.getByRole("button", { name: /E2 at 0.00 seconds/ }));
    fireEvent.click(screen.getByRole("button", { name: "Nudge right" }));
    expect(screen.getByRole("button", { name: /E2 at 0.01 seconds/ })).toBeInTheDocument();
  });

  it("adds a missed note", () => {
    render(<Harness audition={new FakeAudition()} initial={makeNotes()} />);
    const before = screen.getAllByRole("button", { name: / at .* seconds/ }).length;
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    const after = screen.getAllByRole("button", { name: / at .* seconds/ }).length;
    expect(after).toBe(before + 1);
  });

  it("keeps edits as the source of truth across a panel remount", () => {
    render(<Harness audition={new FakeAudition()} initial={makeNotes()} />);
    fireEvent.click(screen.getByRole("button", { name: /E2 at 0.00 seconds/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    // Force ChartPanel to unmount and remount from the parent-held state.
    fireEvent.click(screen.getByRole("button", { name: "remount" }));
    expect(screen.queryByRole("button", { name: /E2 at 0.00 seconds/ })).toBeNull();
    expect(screen.getByRole("button", { name: /A2 at 1.00 seconds/ })).toBeInTheDocument();
  });

  it("starts and stops audition over the song", async () => {
    const audition = new FakeAudition();
    render(<Harness audition={audition} initial={makeNotes()} />);
    fireEvent.click(screen.getByRole("button", { name: "Play with the song" }));
    const stop = await screen.findByRole("button", { name: "Stop" });
    expect(audition.withSong).toBe(1);
    fireEvent.click(stop);
    expect(audition.stops).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Play with the song" })).toBeInTheDocument();
  });
});
