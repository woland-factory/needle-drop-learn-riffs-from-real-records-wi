import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "../../src/App";
import { FakeRiffStore, makeRecord } from "./helpers/fake-store";
import { FakeMicRecorder } from "../../src/audio/mic";
import type { Transcriber } from "../../src/audio/transcribe";
import { DAY_MS } from "../../src/book/schedule";

const NOW = 1_750_000_000_000;
const now = () => NOW;

const idleTranscriber: Transcriber = {
  transcribe: () => Promise.resolve([]),
  cancel: () => {},
  dispose: () => {},
};

function renderApp(store = new FakeRiffStore()) {
  render(
    <App
      store={store}
      now={now}
      transcriber={idleTranscriber}
      recorder={new FakeMicRecorder()}
    />,
  );
  return store;
}

describe("App shell", () => {
  it("reaches the riff-book and back while the Loop Room stays mounted", async () => {
    renderApp();
    // The Loop Room's empty state is the landing view.
    const loopHeading = screen.getByRole("heading", { name: /drop in a song to start/i });
    expect(loopHeading).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /riff-book/i }));
    expect(
      await screen.findByRole("heading", { name: /conquer your first phrase/i }),
    ).toBeInTheDocument();
    // Still mounted, only hidden: the loaded song and chart survive the trip.
    expect(screen.getByRole("heading", { name: /drop in a song to start/i, hidden: true })).toBeInTheDocument();
    expect(loopHeading.closest("[hidden]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Loop Room" }));
    expect(screen.getByRole("heading", { name: /drop in a song to start/i })).toBeVisible();
    expect(loopHeading.closest("[hidden]")).toBeNull();
  });

  it("shows a due count badge from the store and none when nothing is due", async () => {
    const store = new FakeRiffStore([
      makeRecord({ reviewDueDate: NOW - DAY_MS }),
      makeRecord({ reviewDueDate: NOW - 2 * DAY_MS }),
      makeRecord({ reviewDueDate: NOW + 5 * DAY_MS }),
    ]);
    renderApp(store);
    expect(await screen.findByLabelText("2 due for review")).toHaveTextContent("2");
  });

  it("keeps the badge off when the store is empty", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /riff-book/i }));
    await screen.findByRole("heading", { name: /conquer your first phrase/i });
    expect(screen.queryByLabelText(/due for review/i)).toBeNull();
  });

  it("empty book action navigates back to the Loop Room", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /riff-book/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /go to the loop room/i }),
    );
    expect(
      screen.getByRole("heading", { name: /drop in a song to start/i }),
    ).toBeVisible();
  });
});
