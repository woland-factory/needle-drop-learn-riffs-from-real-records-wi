import { useCallback, useEffect, useState } from "react";
import type { RiffRecord, RiffStore } from "../book/store";
import { dueLabel, isDue } from "../book/schedule";
import { serializeBook } from "../book/export";
import { BookEmptyState } from "./states/BookEmptyState";

type Phase = "loading" | "ready" | "error";

interface RiffBookProps {
  store: RiffStore;
  /** Injectable clock so dueness is testable; defaults to Date.now. */
  now?: () => number;
  onGoToLoopRoom: () => void;
  onPractice: (record: RiffRecord) => void;
  /** Lets the shell refresh the due badge after a delete. */
  onMutated?: () => void;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function triggerDownload(json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "needle-drop-riff-book.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function RiffBook({
  store,
  now = Date.now,
  onGoToLoopRoom,
  onPractice,
  onMutated,
}: RiffBookProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [records, setRecords] = useState<RiffRecord[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  const load = useCallback(() => {
    setPhase("loading");
    store
      .list()
      .then((all) => {
        setRecords(all);
        setPhase("ready");
      })
      .catch(() => setPhase("error"));
  }, [store]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(
    (id: string) => {
      setConfirmId(null);
      store
        .remove(id)
        .catch(() => {
          // The record is still there; the reload below shows the truth.
        })
        .finally(() => {
          load();
          onMutated?.();
        });
    },
    [store, load, onMutated],
  );

  const handleExport = useCallback(() => {
    triggerDownload(JSON.stringify(serializeBook(records, now())));
    setExported(true);
  }, [records, now]);

  if (phase === "loading") {
    return (
      <section className="card book" aria-busy="true" aria-live="polite">
        <div className="skeleton skeleton-row" />
        <div className="skeleton skeleton-row" />
        <div className="skeleton skeleton-row" />
      </section>
    );
  }

  if (phase === "error") {
    return (
      <section className="error card" role="alert">
        <h2>Your book is out of reach</h2>
        <p>Your browser blocked storage for this site. Allow storage, then try again.</p>
        <button type="button" className="btn btn-primary" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  if (records.length === 0) {
    return <BookEmptyState onGoToLoopRoom={onGoToLoopRoom} />;
  }

  const nowMs = now();
  const due = records
    .filter((r) => isDue(r, nowMs))
    .sort((a, b) => a.reviewDueDate - b.reviewDueDate);
  const rest = records
    .filter((r) => !isDue(r, nowMs))
    .sort((a, b) => b.lastPracticed - a.lastPracticed);

  const item = (r: RiffRecord) => (
    <li key={r.id} className="riff-item">
      <div className="riff-info">
        <h3 className="riff-title">{r.title}</h3>
        <p className="riff-meta">
          <span>Streak {r.streak}</span>
          <span>First nailed {formatDate(r.dateFirstNailed)}</span>
          <span>Best {r.bestScore}%</span>
        </p>
        <p className={`riff-due${isDue(r, nowMs) ? " is-due" : ""}`}>
          {dueLabel(r, nowMs)}
        </p>
      </div>
      {confirmId === r.id ? (
        <div className="riff-actions riff-confirm">
          <span className="confirm-question">Delete this phrase?</span>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => handleDelete(r.id)}
          >
            Delete
          </button>
          <button type="button" className="btn" onClick={() => setConfirmId(null)}>
            Keep it
          </button>
        </div>
      ) : (
        <div className="riff-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onPractice(r)}
          >
            Practice
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setConfirmId(r.id)}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );

  return (
    <section className="book" aria-labelledby="book-heading">
      <div className="book-head">
        <h1 id="book-heading">Your riff-book</h1>
        <button type="button" className="btn" onClick={handleExport}>
          Export book
        </button>
      </div>
      <p className="book-status" role="status" aria-live="polite">
        {exported ? "Riff-book exported." : ""}
      </p>

      {due.length > 0 && (
        <section className="card due-section" aria-labelledby="due-heading">
          <h2 id="due-heading">Due for review</h2>
          <p className="due-line">Keep these sharp. Play one back to grow its streak.</p>
          <ul className="riff-list">{due.map(item)}</ul>
        </section>
      )}

      {rest.length > 0 && (
        <section className="card">
          <ul className="riff-list">{rest.map(item)}</ul>
        </section>
      )}
    </section>
  );
}
