import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RiffPractice } from "../../src/components/RiffPractice";
import { FakeRiffStore, makeRecord } from "./helpers/fake-store";
import { FakeMicRecorder } from "../../src/audio/mic";
import type { AuditionLike } from "../../src/audio/note-synth";
import type { MetronomeLike } from "../../src/audio/metronome";
import type { PassResult, NoteVerdict } from "../../src/audio/grade";
import type { Note } from "../../src/audio/note";
import type { Take } from "../../src/audio/take";
import { DAY_MS } from "../../src/book/schedule";

const NOW = 1_750_000_000_000;
const now = () => NOW;

class FakeAudition implements AuditionLike {
  onEnded: (() => void) | null = null;
  async playAlone() {
    queueMicrotask(() => this.onEnded?.());
  }
  async playWithSong() {
    queueMicrotask(() => this.onEnded?.());
  }
  stop() {}
}

class FakeMetronome implements MetronomeLike {
  playing = false;
  async playClicks() {}
  stop() {}
}

const fakeBuffer = { duration: 2 } as AudioBuffer;
const decodeOk = () => Promise.resolve(fakeBuffer);
const decodeFail = () => Promise.reject(new Error("bad clip"));

function gradeAs(matched: boolean) {
  return (_take: Take, notes: Note[]): PassResult => {
    const perNote: NoteVerdict[] = notes.map((n, i) => ({
      noteId: n.id,
      status: matched || i === 0 ? "pass" : "wrong-pitch",
      heardMidi: n.midi,
    }));
    const passed = perNote.filter((v) => v.status === "pass").length;
    return {
      perNote,
      matched,
      heardLine: true,
      score: Math.round((100 * passed) / notes.length),
      offsetSec: 0,
    };
  };
}

interface Options {
  store?: FakeRiffStore;
  matched?: boolean;
  onBack?: () => void;
  decodeClip?: (wav: ArrayBuffer) => Promise<AudioBuffer>;
}

function renderPractice({
  store = new FakeRiffStore(),
  matched = true,
  onBack = () => {},
  decodeClip = decodeOk,
}: Options = {}) {
  const record =
    store.records[0] ??
    (() => {
      const r = makeRecord({
        notes: [
          { midi: 40, startSec: 0, durSec: 0.4, confidence: 1, edited: false },
          { midi: 45, startSec: 0.5, durSec: 0.4, confidence: 1, edited: false },
        ],
      });
      store.records.push(r);
      return r;
    })();
  render(
    <RiffPractice
      record={record}
      store={store}
      now={now}
      recorder={new FakeMicRecorder({ samples: new Float32Array(2048), sampleRate: 22050 })}
      audition={new FakeAudition()}
      metronome={new FakeMetronome()}
      decodeClip={decodeClip}
      gradeTake={gradeAs(matched)}
      onBack={onBack}
    />,
  );
  return { record, store };
}

async function runCycle() {
  fireEvent.click(await screen.findByRole("button", { name: /turn on mic/i }));
  await screen.findByRole("button", { name: /^start$/i });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  });
}

describe("RiffPractice matched cycle", () => {
  it("records the pass exactly once and confirms the new streak and next review", async () => {
    const store = new FakeRiffStore([
      makeRecord({
        streak: 1,
        bestScore: 90,
        notes: [{ midi: 40, startSec: 0, durSec: 0.4, confidence: 1, edited: false }],
      }),
    ]);
    const { record } = renderPractice({ store });
    await runCycle();

    expect(await screen.findByRole("heading", { name: /you played it/i })).toBeInTheDocument();
    expect(
      await screen.findByText(/you still have it\. streak 2\. next review in 3 days\./i),
    ).toBeInTheDocument();
    expect(store.passCalls).toBe(1);
    const stored = store.records.find((r) => r.id === record.id);
    expect(stored?.streak).toBe(2);
    expect(stored?.lastPracticed).toBe(NOW);
    expect(stored?.reviewDueDate).toBe(NOW + 3 * DAY_MS);
    expect(stored?.bestScore).toBe(100);
  });

  it("says Next review tomorrow when the interval is one day", async () => {
    // Drives the defensive 1-day copy branch: a stored streak of 0 lands the
    // pass on the ladder's first rung.
    const store = new FakeRiffStore([
      makeRecord({
        streak: 0,
        notes: [{ midi: 40, startSec: 0, durSec: 0.4, confidence: 1, edited: false }],
      }),
    ]);
    renderPractice({ store });
    await runCycle();
    expect(
      await screen.findByText(/you still have it\. streak 1\. next review tomorrow\./i),
    ).toBeInTheDocument();
  });

  it("a second matched cycle in the same session shows Still matched. with no second write", async () => {
    const store = new FakeRiffStore([
      makeRecord({
        streak: 1,
        notes: [{ midi: 40, startSec: 0, durSec: 0.4, confidence: 1, edited: false }],
      }),
    ]);
    renderPractice({ store });
    await runCycle();
    await screen.findByText(/you still have it/i);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play it again/i }));
    });
    expect(await screen.findByText(/still matched\./i)).toBeInTheDocument();
    expect(store.passCalls).toBe(1);
    expect(store.records[0].streak).toBe(2); // unchanged after the second cycle
  });

  it("never renders a save button in review mode", async () => {
    renderPractice();
    await runCycle();
    await screen.findByRole("heading", { name: /you played it/i });
    expect(screen.queryByRole("button", { name: /save to riff-book/i })).toBeNull();
  });
});

describe("RiffPractice unearned passes", () => {
  it("a failed cycle writes nothing", async () => {
    const { store } = renderPractice({ matched: false });
    await runCycle();
    await screen.findByRole("heading", { name: /close/i });
    expect(store.passCalls).toBe(0);
  });

  it("a tolerance-change re-grade writes nothing even when it flips to matched", async () => {
    // First grade fails; the re-grade after loosening returns matched.
    const store = new FakeRiffStore();
    const record = makeRecord({
      notes: [
        { midi: 40, startSec: 0, durSec: 0.4, confidence: 1, edited: false },
        { midi: 45, startSec: 0.5, durSec: 0.4, confidence: 1, edited: false },
      ],
    });
    store.records.push(record);
    let calls = 0;
    const flippy = (_take: Take, notes: Note[]): PassResult => {
      calls += 1;
      const matched = calls > 1;
      const perNote: NoteVerdict[] = notes.map((n, i) => ({
        noteId: n.id,
        status: matched || i === 0 ? "pass" : "wrong-pitch",
        heardMidi: n.midi,
      }));
      return {
        perNote,
        matched,
        heardLine: true,
        score: matched ? 100 : 50,
        offsetSec: 0,
      };
    };
    render(
      <RiffPractice
        record={record}
        store={store}
        now={now}
        recorder={new FakeMicRecorder({ samples: new Float32Array(2048), sampleRate: 22050 })}
        audition={new FakeAudition()}
        metronome={new FakeMetronome()}
        decodeClip={decodeOk}
        gradeTake={flippy}
        onBack={() => {}}
      />,
    );
    await runCycle();
    await screen.findByRole("heading", { name: /close/i });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/pitch tolerance/i), {
        target: { value: "150" },
      });
    });
    await screen.findByRole("heading", { name: /you played it/i });
    expect(store.passCalls).toBe(0);
  });

  it("an abandoned cycle writes nothing", async () => {
    const onBack = vi.fn();
    const { store } = renderPractice({ onBack });
    fireEvent.click(await screen.findByRole("button", { name: /turn on mic/i }));
    await screen.findByRole("button", { name: /^start$/i });
    fireEvent.click(screen.getByRole("button", { name: /back to your book/i }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(store.passCalls).toBe(0);
  });
});

describe("RiffPractice clip decode failure", () => {
  it("shows a designed error with a way back", async () => {
    const onBack = vi.fn();
    renderPractice({ decodeClip: decodeFail, onBack });
    expect(
      await screen.findByRole("heading", { name: /that clip will not play/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/reload the page and open it again\./i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back to your book/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
