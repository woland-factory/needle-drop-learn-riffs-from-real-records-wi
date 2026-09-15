import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PracticePanel } from "../../src/components/PracticePanel";
import type { AuditionLike } from "../../src/audio/note-synth";
import type { MetronomeLike } from "../../src/audio/metronome";
import type { MicRecorder, MicPermission } from "../../src/audio/mic";
import type { Take } from "../../src/audio/take";
import {
  DEFAULT_TOLERANCES,
  type PassResult,
  type Tolerances,
  type NoteVerdict,
} from "../../src/audio/grade";
import type { Note } from "../../src/audio/note";

class FakeAudition implements AuditionLike {
  onEnded: (() => void) | null = null;
  playing = false;
  withSong = 0;
  alone = 0;
  stops = 0;
  async playAlone() {
    this.alone++;
    this.playing = true;
    queueMicrotask(() => {
      this.playing = false;
      this.onEnded?.();
    });
  }
  async playWithSong() {
    this.withSong++;
    this.playing = true;
    queueMicrotask(() => {
      this.playing = false;
      this.onEnded?.();
    });
  }
  stop() {
    this.stops++;
    this.playing = false;
  }
}

class FakeMetronome implements MetronomeLike {
  playing = false;
  plays = 0;
  private gate: Promise<void> | null;
  constructor(gate: Promise<void> | null = null) {
    this.gate = gate;
  }
  async playClicks() {
    this.plays++;
    this.playing = true;
    if (this.gate) await this.gate;
    else await Promise.resolve();
    this.playing = false;
  }
  stop() {
    this.playing = false;
  }
}

class DeferredRecorder implements MicRecorder {
  permission: MicPermission = "granted";
  requests = 0;
  records = 0;
  disposed = false;
  onLevel?: (rms: number) => void;
  private resolve?: (t: Take) => void;
  take: Take = { samples: new Float32Array(2048), sampleRate: 22050 };

  async requestPermission() {
    this.requests++;
    return this.permission;
  }
  record(_dur: number, onLevel?: (rms: number) => void): Promise<Take> {
    this.records++;
    this.onLevel = onLevel;
    return new Promise<Take>((res) => {
      this.resolve = res;
    });
  }
  finish() {
    this.resolve?.(this.take);
  }
  dispose() {
    this.disposed = true;
  }
}

const NOTES: Note[] = [
  { id: "a", midi: 40, startSec: 0, durSec: 0.4, confidence: 1, edited: false },
  { id: "b", midi: 45, startSec: 0.5, durSec: 0.4, confidence: 1, edited: false },
];

function verdict(perNote: NoteVerdict[], matched: boolean, heardLine = true): PassResult {
  const passed = perNote.filter((v) => v.status === "pass").length;
  return {
    perNote,
    matched,
    heardLine,
    score: Math.round((100 * passed) / perNote.length),
    offsetSec: 0,
  };
}

interface HarnessProps {
  audition: AuditionLike;
  metronome: MetronomeLike;
  recorder: MicRecorder;
  gradeTake?: (take: Take, notes: Note[], tol: Tolerances) => PassResult;
  onSave?: (notes: Note[], score: number) => Promise<void>;
  onBack?: () => void;
  onMatched?: (score: number) => void;
  matchedMode?: "save" | "review";
  matchedLine?: string;
}

function Harness({
  audition,
  metronome,
  recorder,
  gradeTake,
  onSave,
  onBack,
  onMatched,
  matchedMode,
  matchedLine,
}: HarnessProps) {
  const [tol, setTol] = useState<Tolerances>(DEFAULT_TOLERANCES);
  return (
    <PracticePanel
      notes={NOTES}
      regionLen={2}
      bpm={120}
      buffer={{} as AudioBuffer}
      region={{ startSec: 0, endSec: 2 }}
      recorder={recorder}
      audition={audition}
      metronome={metronome}
      tolerances={tol}
      onTolerancesChange={setTol}
      onSave={onSave ?? (async () => {})}
      onBack={onBack ?? (() => {})}
      onMatched={onMatched}
      matchedMode={matchedMode}
      matchedLine={matchedLine}
      gradeTake={gradeTake}
    />
  );
}

async function grantAndStart() {
  fireEvent.click(screen.getByRole("button", { name: /turn on mic/i }));
  await screen.findByRole("button", { name: /^start$/i });
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
}

describe("PracticePanel mic permission", () => {
  it("grants and proceeds to ready", async () => {
    const rec = new DeferredRecorder();
    render(<Harness audition={new FakeAudition()} metronome={new FakeMetronome()} recorder={rec} />);
    fireEvent.click(screen.getByRole("button", { name: /turn on mic/i }));
    expect(await screen.findByRole("button", { name: /^start$/i })).toBeInTheDocument();
  });

  it("shows the denied state with a next step, never a dead end", async () => {
    const rec = new DeferredRecorder();
    rec.permission = "denied";
    render(<Harness audition={new FakeAudition()} metronome={new FakeMetronome()} recorder={rec} />);
    fireEvent.click(screen.getByRole("button", { name: /turn on mic/i }));
    expect(await screen.findByText(/allow mic access in your browser/i)).toBeInTheDocument();
  });

  it("shows the unavailable state", async () => {
    const rec = new DeferredRecorder();
    rec.permission = "unavailable";
    render(<Harness audition={new FakeAudition()} metronome={new FakeMetronome()} recorder={rec} />);
    fireEvent.click(screen.getByRole("button", { name: /turn on mic/i }));
    expect(await screen.findByRole("heading", { name: /connect a microphone/i })).toBeInTheDocument();
  });
});

describe("PracticePanel cycle invariants", () => {
  it("plays the reference then records with backing muted, grading once after the pass", async () => {
    const audition = new FakeAudition();
    const metronome = new FakeMetronome();
    const rec = new DeferredRecorder();
    const gradeTake = vi.fn(() =>
      verdict([{ noteId: "a", status: "pass", heardMidi: 40 }, { noteId: "b", status: "pass", heardMidi: 45 }], true),
    );
    render(
      <Harness audition={audition} metronome={metronome} recorder={rec} gradeTake={gradeTake} />,
    );
    await grantAndStart();

    // Now blocked in the recording phase, waiting on the deferred take.
    await screen.findByText(/your turn/i);
    expect(rec.records).toBe(1);
    expect(audition.withSong).toBe(1); // the reference played before recording
    expect(audition.playing).toBe(false); // no backing during the recorded pass
    expect(metronome.playing).toBe(false); // no click during the recorded pass
    expect(gradeTake).not.toHaveBeenCalled(); // never graded mid-pass

    await act(async () => {
      rec.finish();
    });

    expect(await screen.findByRole("heading", { name: /you played it/i })).toBeInTheDocument();
    expect(gradeTake).toHaveBeenCalledTimes(1); // graded exactly once, after the pass
  });

  it("renders the count-in immediately on phase change", async () => {
    const rec = new DeferredRecorder();
    // A metronome that never resolves keeps the panel in the count-in phase.
    const metronome = new FakeMetronome(new Promise<void>(() => {}));
    render(<Harness audition={new FakeAudition()} metronome={metronome} recorder={rec} />);
    await grantAndStart();
    expect(await screen.findByText(/count in/i)).toBeInTheDocument();
  });
});

describe("PracticePanel verdict", () => {
  it("shows a per-note pass/try-again indicator and the score in an aria-live region", async () => {
    const rec = new DeferredRecorder();
    const gradeTake = () =>
      verdict(
        [
          { noteId: "a", status: "pass", heardMidi: 40 },
          { noteId: "b", status: "wrong-pitch", heardMidi: 46 },
        ],
        false,
      );
    render(<Harness audition={new FakeAudition()} metronome={new FakeMetronome()} recorder={rec} gradeTake={gradeTake} />);
    await grantAndStart();
    await screen.findByText(/your turn/i);
    await act(async () => rec.finish());

    expect(await screen.findByRole("heading", { name: /close/i })).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 notes matched/i)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByLabelText(/E2 matched/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/A2 try again/i)).toBeInTheDocument();
  });

  it("confirms success and awaits a real save with the matched score", async () => {
    const rec = new DeferredRecorder();
    const onSave = vi.fn<(notes: Note[], score: number) => Promise<void>>(
      async () => {},
    );
    const gradeTake = () =>
      verdict([{ noteId: "a", status: "pass", heardMidi: 40 }, { noteId: "b", status: "pass", heardMidi: 45 }], true);
    render(
      <Harness audition={new FakeAudition()} metronome={new FakeMetronome()} recorder={rec} gradeTake={gradeTake} onSave={onSave} />,
    );
    await grantAndStart();
    await screen.findByText(/your turn/i);
    await act(async () => rec.finish());

    expect(await screen.findByRole("heading", { name: /you played it/i })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save to riff-book/i }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toHaveLength(2);
    expect(onSave.mock.calls[0][1]).toBe(100);
    expect(screen.getByText(/saved to your riff-book/i)).toBeInTheDocument();
    // Success removes the button entirely, so a double-save cannot happen.
    expect(screen.queryByRole("button", { name: /save to riff-book/i })).toBeNull();
  });

  it("shows the storage-blocked message on a rejecting store and retries", async () => {
    const rec = new DeferredRecorder();
    const onSave = vi
      .fn<(notes: Note[], score: number) => Promise<void>>()
      .mockRejectedValueOnce(new Error("store-write-failed"))
      .mockResolvedValueOnce(undefined);
    const gradeTake = () =>
      verdict([{ noteId: "a", status: "pass", heardMidi: 40 }, { noteId: "b", status: "pass", heardMidi: 45 }], true);
    render(
      <Harness audition={new FakeAudition()} metronome={new FakeMetronome()} recorder={rec} gradeTake={gradeTake} onSave={onSave} />,
    );
    await grantAndStart();
    await screen.findByText(/your turn/i);
    await act(async () => rec.finish());
    await screen.findByRole("heading", { name: /you played it/i });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save to riff-book/i }));
    });
    expect(
      screen.getByText(/your browser blocked saving\. allow storage for this site/i),
    ).toBeInTheDocument();

    // The button stays live; a second click retries and succeeds.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save to riff-book/i }));
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/saved to your riff-book/i)).toBeInTheDocument();
  });

  it("shows the nothing-heard state with a next step", async () => {
    const rec = new DeferredRecorder();
    const gradeTake = () =>
      verdict(
        [
          { noteId: "a", status: "not-heard", heardMidi: null },
          { noteId: "b", status: "not-heard", heardMidi: null },
        ],
        false,
        false,
      );
    render(<Harness audition={new FakeAudition()} metronome={new FakeMetronome()} recorder={rec} gradeTake={gradeTake} />);
    await grantAndStart();
    await screen.findByText(/your turn/i);
    await act(async () => rec.finish());
    expect(await screen.findByRole("heading", { name: /i did not catch that/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("PracticePanel tolerances", () => {
  it("re-grades the held take with the new tolerances when a setting changes", async () => {
    const rec = new DeferredRecorder();
    const gradeTake = vi.fn(
      (_take: Take, _notes: Note[], _tol: Tolerances): PassResult =>
        verdict([{ noteId: "a", status: "pass", heardMidi: 40 }, { noteId: "b", status: "pass", heardMidi: 45 }], true),
    );
    render(<Harness audition={new FakeAudition()} metronome={new FakeMetronome()} recorder={rec} gradeTake={gradeTake} />);
    await grantAndStart();
    await screen.findByText(/your turn/i);
    await act(async () => rec.finish());
    await screen.findByRole("heading", { name: /you played it/i });
    expect(gradeTake).toHaveBeenCalledTimes(1);

    const cents = screen.getByLabelText(/pitch tolerance/i);
    await act(async () => {
      fireEvent.change(cents, { target: { value: "80" } });
    });
    expect(gradeTake).toHaveBeenCalledTimes(2);
    expect(gradeTake.mock.calls[1][2].cents).toBe(80);

    const octave = screen.getByLabelText(/ignore octave/i);
    await act(async () => {
      fireEvent.click(octave);
    });
    expect(gradeTake).toHaveBeenCalledTimes(3);
    expect(gradeTake.mock.calls[2][2].octaveTolerant).toBe(false);
  });
});

const MATCHED = () =>
  verdict(
    [
      { noteId: "a", status: "pass", heardMidi: 40 },
      { noteId: "b", status: "pass", heardMidi: 45 },
    ],
    true,
  );

describe("PracticePanel onMatched", () => {
  it("fires once with the score when a completed cycle matches", async () => {
    const rec = new DeferredRecorder();
    const onMatched = vi.fn();
    render(
      <Harness
        audition={new FakeAudition()}
        metronome={new FakeMetronome()}
        recorder={rec}
        gradeTake={MATCHED}
        onMatched={onMatched}
      />,
    );
    await grantAndStart();
    await screen.findByText(/your turn/i);
    await act(async () => rec.finish());
    await screen.findByRole("heading", { name: /you played it/i });
    expect(onMatched).toHaveBeenCalledTimes(1);
    expect(onMatched).toHaveBeenCalledWith(100);
  });

  it("does not fire on a failed cycle", async () => {
    const rec = new DeferredRecorder();
    const onMatched = vi.fn();
    const gradeTake = () =>
      verdict(
        [
          { noteId: "a", status: "pass", heardMidi: 40 },
          { noteId: "b", status: "wrong-pitch", heardMidi: 46 },
        ],
        false,
      );
    render(
      <Harness
        audition={new FakeAudition()}
        metronome={new FakeMetronome()}
        recorder={rec}
        gradeTake={gradeTake}
        onMatched={onMatched}
      />,
    );
    await grantAndStart();
    await screen.findByText(/your turn/i);
    await act(async () => rec.finish());
    await screen.findByRole("heading", { name: /close/i });
    expect(onMatched).not.toHaveBeenCalled();
  });

  it("never fires from the tolerance-change re-grade, even when it flips to matched", async () => {
    const rec = new DeferredRecorder();
    const onMatched = vi.fn();
    const gradeTake = vi
      .fn<(take: Take, notes: Note[], tol: Tolerances) => PassResult>()
      .mockReturnValueOnce(
        verdict(
          [
            { noteId: "a", status: "pass", heardMidi: 40 },
            { noteId: "b", status: "wrong-pitch", heardMidi: 46 },
          ],
          false,
        ),
      )
      .mockReturnValue(MATCHED());
    render(
      <Harness
        audition={new FakeAudition()}
        metronome={new FakeMetronome()}
        recorder={rec}
        gradeTake={gradeTake}
        onMatched={onMatched}
      />,
    );
    await grantAndStart();
    await screen.findByText(/your turn/i);
    await act(async () => rec.finish());
    await screen.findByRole("heading", { name: /close/i });

    // Loosening the tolerance re-grades the held take into a match...
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/pitch tolerance/i), {
        target: { value: "120" },
      });
    });
    await screen.findByRole("heading", { name: /you played it/i });
    // ...but a re-grade is not a completed cycle, so no pass is earned.
    expect(onMatched).not.toHaveBeenCalled();
  });
});

describe("PracticePanel review mode", () => {
  it("hides the save button and shows the parent's line; Play it again stays", async () => {
    const rec = new DeferredRecorder();
    render(
      <Harness
        audition={new FakeAudition()}
        metronome={new FakeMetronome()}
        recorder={rec}
        gradeTake={MATCHED}
        matchedMode="review"
        matchedLine="You still have it. Streak 2. Next review in 3 days."
      />,
    );
    await grantAndStart();
    await screen.findByText(/your turn/i);
    await act(async () => rec.finish());
    await screen.findByRole("heading", { name: /you played it/i });

    expect(screen.queryByRole("button", { name: /save to riff-book/i })).toBeNull();
    expect(
      screen.getByText(/you still have it\. streak 2\. next review in 3 days\./i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play it again/i })).toBeInTheDocument();
  });
});
