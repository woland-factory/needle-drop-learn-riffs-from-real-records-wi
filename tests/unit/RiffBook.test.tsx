import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { RiffBook } from "../../src/components/RiffBook";
import { FakeRiffStore, makeRecord } from "./helpers/fake-store";
import { DAY_MS } from "../../src/book/schedule";

const NOW = 1_750_000_000_000;
const now = () => NOW;

const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;
afterEach(() => {
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
});

function renderBook(store: FakeRiffStore, extra: Partial<Parameters<typeof RiffBook>[0]> = {}) {
  return render(
    <RiffBook
      store={store}
      now={now}
      onGoToLoopRoom={extra.onGoToLoopRoom ?? (() => {})}
      onPractice={extra.onPractice ?? (() => {})}
      onMutated={extra.onMutated}
    />,
  );
}

describe("RiffBook list", () => {
  it("shows a layout-holding skeleton while the list resolves", () => {
    const store = new FakeRiffStore();
    renderBook(store);
    expect(document.querySelector(".skeleton")).toBeTruthy();
  });

  it("lists each phrase with streak, first-nailed date, and best score", async () => {
    const store = new FakeRiffStore([
      makeRecord({
        title: "cold sweat",
        streak: 3,
        bestScore: 88,
        dateFirstNailed: NOW - 40 * DAY_MS,
        reviewDueDate: NOW + 5 * DAY_MS,
      }),
    ]);
    renderBook(store);
    expect(await screen.findByRole("heading", { name: /your riff-book/i })).toBeInTheDocument();
    expect(screen.getByText("cold sweat")).toBeInTheDocument();
    expect(screen.getByText(/streak 3/i)).toBeInTheDocument();
    expect(screen.getByText(/first nailed/i)).toBeInTheDocument();
    expect(screen.getByText(/best 88%/i)).toBeInTheDocument();
    expect(screen.getByText(/due in 5 days/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /practice/i })).toBeInTheDocument();
  });

  it("surfaces due phrases in the Due for review section on top, most overdue first", async () => {
    const store = new FakeRiffStore([
      makeRecord({ title: "fresh", reviewDueDate: NOW + 3 * DAY_MS }),
      makeRecord({ title: "older due", reviewDueDate: NOW - 5 * DAY_MS }),
      makeRecord({ title: "newer due", reviewDueDate: NOW - 1 * DAY_MS }),
    ]);
    renderBook(store);
    const due = await screen.findByRole("region", { name: /due for review/i });
    expect(
      within(due).getByText(/keep these sharp\. play one back to grow its streak\./i),
    ).toBeInTheDocument();
    const titles = within(due)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["older due", "newer due"]);
    expect(within(due).queryByText("fresh")).toBeNull();
    expect(within(due).getAllByText(/due now/i)).toHaveLength(2);
    // The fresh phrase still renders, below the due section.
    expect(screen.getByText("fresh")).toBeInTheDocument();
  });

  it("routes Practice to the opened record", async () => {
    const rec = makeRecord({ title: "riff one" });
    const onPractice = vi.fn();
    renderBook(new FakeRiffStore([rec]), { onPractice });
    fireEvent.click(await screen.findByRole("button", { name: /practice/i }));
    expect(onPractice).toHaveBeenCalledWith(rec);
  });
});

describe("RiffBook empty state", () => {
  it("points to the Loop Room in positive phrasing and navigates there", async () => {
    const onGoToLoopRoom = vi.fn();
    renderBook(new FakeRiffStore(), { onGoToLoopRoom });
    expect(
      await screen.findByRole("heading", { name: /conquer your first phrase/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/every phrase you nail lands here/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export book/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /go to the loop room/i }));
    expect(onGoToLoopRoom).toHaveBeenCalledOnce();
  });
});

describe("RiffBook error state", () => {
  it("designs the blocked store with a retry that reloads", async () => {
    const store = new FakeRiffStore([makeRecord({ title: "back again" })]);
    store.failList = true;
    renderBook(store);
    expect(
      await screen.findByRole("heading", { name: /your book is out of reach/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/your browser blocked storage for this site/i),
    ).toBeInTheDocument();

    store.failList = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("back again")).toBeInTheDocument();
  });
});

describe("RiffBook delete", () => {
  it("asks inline, deletes on confirm, and refreshes", async () => {
    const store = new FakeRiffStore([makeRecord({ title: "goner" })]);
    const onMutated = vi.fn();
    renderBook(store, { onMutated });
    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    expect(screen.getByText(/delete this phrase\?/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    });
    expect(store.removeCalls).toBe(1);
    expect(store.records).toHaveLength(0);
    expect(
      await screen.findByRole("heading", { name: /conquer your first phrase/i }),
    ).toBeInTheDocument();
    expect(onMutated).toHaveBeenCalled();
  });

  it("Keep it leaves everything untouched", async () => {
    const store = new FakeRiffStore([makeRecord({ title: "keeper" })]);
    renderBook(store);
    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    fireEvent.click(screen.getByRole("button", { name: /keep it/i }));
    expect(screen.queryByText(/delete this phrase\?/i)).toBeNull();
    expect(store.removeCalls).toBe(0);
    expect(screen.getByText("keeper")).toBeInTheDocument();
  });
});

describe("RiffBook export", () => {
  it("downloads the book and announces it in a status line", async () => {
    URL.createObjectURL = vi.fn(() => "blob:book");
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const store = new FakeRiffStore([makeRecord()]);
    renderBook(store);
    fireEvent.click(await screen.findByRole("button", { name: /export book/i }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:book");
    expect(screen.getByRole("status")).toHaveTextContent("Riff-book exported.");
    click.mockRestore();
  });
});
