import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoopRoom } from "./components/LoopRoom";
import { RiffBook } from "./components/RiffBook";
import { RiffPractice } from "./components/RiffPractice";
import { IdbRiffStore, type RiffRecord, type RiffStore } from "./book/store";
import { isDue } from "./book/schedule";
import type { Transcriber } from "./audio/transcribe";
import type { MicRecorder } from "./audio/mic";

type View = "loop" | "book";

interface AppProps {
  /** Injectable for tests; defaults to the shared IndexedDB store. */
  store?: RiffStore;
  /** Injectable clock for dueness in tests; defaults to Date.now. */
  now?: () => number;
  /** Forwarded to LoopRoom so tests never touch workers or the mic. */
  transcriber?: Transcriber;
  recorder?: MicRecorder;
}

export function App({ store, now = Date.now, transcriber, recorder }: AppProps = {}) {
  const ownStore = useMemo<RiffStore>(() => store ?? new IdbRiffStore(), [store]);
  const [view, setView] = useState<View>("loop");
  const [practicing, setPracticing] = useState<RiffRecord | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const nowRef = useRef(now);
  nowRef.current = now;

  const refreshDue = useCallback(() => {
    ownStore
      .list()
      .then((records) => {
        setDueCount(records.filter((r) => isDue(r, nowRef.current())).length);
      })
      .catch(() => {
        // A blocked store surfaces in the book view; the badge just stays off.
        setDueCount(0);
      });
  }, [ownStore]);

  useEffect(() => {
    refreshDue();
  }, [refreshDue, view]);

  useEffect(() => {
    return () => ownStore.dispose();
  }, [ownStore]);

  const openBook = useCallback(() => {
    setPracticing(null);
    setView("book");
  }, []);

  const openLoopRoom = useCallback(() => {
    setPracticing(null);
    setView("loop");
  }, []);

  return (
    <main className="app">
      <header className="topbar">
        <span className="brand">Needle Drop</span>
        <nav className="nav" aria-label="Sections">
          <button
            type="button"
            className="nav-link"
            aria-current={view === "loop" ? "page" : undefined}
            onClick={openLoopRoom}
          >
            Loop Room
          </button>
          <button
            type="button"
            className="nav-link"
            aria-current={view === "book" ? "page" : undefined}
            onClick={openBook}
          >
            Riff-book
            {dueCount > 0 && (
              <span className="due-badge" aria-label={`${dueCount} due for review`}>
                {dueCount}
              </span>
            )}
          </button>
        </nav>
      </header>

      {/* The Loop Room stays mounted while the book is open, so the loaded
          song, chart, and any practice state survive the round trip. */}
      <div hidden={view !== "loop"}>
        <LoopRoom store={ownStore} transcriber={transcriber} recorder={recorder} />
      </div>

      {view === "book" && !practicing && (
        <RiffBook
          store={ownStore}
          now={now}
          onGoToLoopRoom={openLoopRoom}
          onPractice={setPracticing}
          onMutated={refreshDue}
        />
      )}

      {view === "book" && practicing && (
        <RiffPractice
          record={practicing}
          store={ownStore}
          now={now}
          recorder={recorder}
          onBack={() => {
            setPracticing(null);
            refreshDue();
          }}
        />
      )}
    </main>
  );
}
