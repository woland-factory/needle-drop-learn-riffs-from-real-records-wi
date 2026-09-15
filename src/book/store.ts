// The riff-book ledger: a thin promise wrapper over raw IndexedDB, no runtime
// dependency. One object store holds the whole record, clip bytes included, so
// a delete is atomic and an orphaned blob is structurally impossible. Errors
// reject as plain Errors carrying kinds, never contents, and never any PII.

import { applyPass, initialSchedule } from "./schedule";

export type StemUsed = "bass" | "guitar" | "other" | "mix";

export interface StoredNote {
  midi: number;
  startSec: number; // relative to clip start, exactly as graded
  durSec: number;
  confidence: number;
  edited: boolean;
}

export interface RiffRecord {
  v: 1;
  id: string;
  title: string; // source file name without extension
  sourceName: string;
  clipWav: ArrayBuffer; // 16-bit PCM mono WAV of the loop region, natural speed
  loopRegion: {
    startSec: number; // absolute position in the source file, for reference
    endSec: number;
    bars: number;
    tempoBpm: number;
    speed: number; // playback speed at save time
  };
  notes: StoredNote[];
  stemUsed: StemUsed;
  dateFirstNailed: number; // epoch ms
  bestScore: number; // 0..100
  streak: number; // >= 1
  lastPracticed: number; // epoch ms
  reviewDueDate: number; // epoch ms
}

export interface NewRiff {
  title: string;
  sourceName: string;
  clipWav: ArrayBuffer;
  loopRegion: RiffRecord["loopRegion"];
  notes: StoredNote[];
  stemUsed: StemUsed;
}

export interface RiffStore {
  add(riff: NewRiff, score: number, nowMs: number): Promise<RiffRecord>;
  list(): Promise<RiffRecord[]>;
  get(id: string): Promise<RiffRecord | undefined>;
  recordPass(id: string, score: number, nowMs: number): Promise<RiffRecord>;
  remove(id: string): Promise<void>;
  dispose(): void;
}

const DB_NAME = "needle-drop";
const DB_VERSION = 1;
const STORE = "riffs";

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

// Realm-safe: a structured clone can hand back an ArrayBuffer whose prototype
// comes from another realm, where instanceof lies.
function isArrayBuffer(x: unknown): x is ArrayBuffer {
  return (
    x instanceof ArrayBuffer ||
    Object.prototype.toString.call(x) === "[object ArrayBuffer]"
  );
}

/** Boundary validation on read: a record another version wrote is skipped, not thrown. */
export function isValidRecord(r: unknown): r is RiffRecord {
  if (typeof r !== "object" || r === null) return false;
  const rec = r as Partial<RiffRecord>;
  return (
    rec.v === 1 &&
    typeof rec.id === "string" &&
    typeof rec.title === "string" &&
    typeof rec.sourceName === "string" &&
    isArrayBuffer(rec.clipWav) &&
    typeof rec.loopRegion === "object" &&
    rec.loopRegion !== null &&
    Array.isArray(rec.notes) &&
    typeof rec.stemUsed === "string" &&
    isFiniteNumber(rec.dateFirstNailed) &&
    isFiniteNumber(rec.bestScore) &&
    isFiniteNumber(rec.streak) &&
    isFiniteNumber(rec.lastPracticed) &&
    isFiniteNumber(rec.reviewDueDate)
  );
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for older runtimes: random hex, unique enough for a local book.
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function requestToPromise<T>(req: IDBRequest<T>, kind: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error(kind));
  });
}

export class IdbRiffStore implements RiffStore {
  private factory: IDBFactory;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private db: IDBDatabase | null = null;

  constructor(factory?: IDBFactory) {
    this.factory = factory ?? globalThis.indexedDB;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        if (!this.factory) {
          reject(new Error("store-unavailable"));
          return;
        }
        const req = this.factory.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          // Forward-only migration 0 -> 1: create the riffs store. Later
          // versions only ever add stores/indexes; they never drop data.
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "id" });
          }
        };
        req.onsuccess = () => {
          this.db = req.result;
          // Best-effort nudge against eviction for a local-first book.
          try {
            void navigator.storage?.persist?.();
          } catch {
            // never a blocker
          }
          resolve(req.result);
        };
        req.onerror = () => {
          this.dbPromise = null;
          reject(new Error("store-open-failed"));
        };
      });
    }
    return this.dbPromise;
  }

  private async transaction(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  async add(riff: NewRiff, score: number, nowMs: number): Promise<RiffRecord> {
    const record: RiffRecord = {
      v: 1,
      id: newId(),
      title: riff.title,
      sourceName: riff.sourceName,
      clipWav: riff.clipWav,
      loopRegion: { ...riff.loopRegion },
      notes: riff.notes.map((n) => ({ ...n })),
      stemUsed: riff.stemUsed,
      ...initialSchedule(score, nowMs),
    };
    const store = await this.transaction("readwrite");
    await requestToPromise(store.add(record), "store-write-failed");
    return record;
  }

  async list(): Promise<RiffRecord[]> {
    const store = await this.transaction("readonly");
    const all = await requestToPromise(store.getAll(), "store-read-failed");
    return (all as unknown[]).filter(isValidRecord);
  }

  async get(id: string): Promise<RiffRecord | undefined> {
    const store = await this.transaction("readonly");
    const rec = await requestToPromise(store.get(id), "store-read-failed");
    return isValidRecord(rec) ? rec : undefined;
  }

  async recordPass(id: string, score: number, nowMs: number): Promise<RiffRecord> {
    // Read-modify-write inside a single readwrite transaction, so a pass can
    // never land on a stale copy of the record.
    const store = await this.transaction("readwrite");
    const current = await requestToPromise(store.get(id), "store-read-failed");
    if (!isValidRecord(current)) throw new Error("store-missing-record");
    const updated = applyPass(current, score, nowMs);
    await requestToPromise(store.put(updated), "store-write-failed");
    return updated;
  }

  async remove(id: string): Promise<void> {
    const store = await this.transaction("readwrite");
    await requestToPromise(store.delete(id), "store-write-failed");
  }

  dispose(): void {
    this.db?.close();
    this.db = null;
    this.dbPromise = null;
  }
}
