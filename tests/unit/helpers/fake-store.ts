// An in-memory RiffStore for component tests: the same contract as the real
// IndexedDB store, with switches to simulate a blocked browser.

import type { NewRiff, RiffRecord, RiffStore } from "../../../src/book/store";
import { applyPass, initialSchedule } from "../../../src/book/schedule";

let seq = 0;

export function makeRecord(overrides: Partial<RiffRecord> = {}): RiffRecord {
  seq += 1;
  const now = 1_750_000_000_000;
  return {
    v: 1,
    id: `fake-${seq}`,
    title: `Riff ${seq}`,
    sourceName: `riff-${seq}.wav`,
    clipWav: new Uint8Array([1, 2, 3, 4]).buffer,
    loopRegion: { startSec: 0, endSec: 2, bars: 2, tempoBpm: 120, speed: 1 },
    notes: [{ midi: 45, startSec: 0, durSec: 0.5, confidence: 1, edited: false }],
    stemUsed: "mix",
    dateFirstNailed: now,
    bestScore: 100,
    streak: 1,
    lastPracticed: now,
    reviewDueDate: now + 86_400_000,
    ...overrides,
  };
}

export class FakeRiffStore implements RiffStore {
  records: RiffRecord[] = [];
  failList = false;
  failWrites = false;
  addCalls = 0;
  passCalls = 0;
  removeCalls = 0;

  constructor(records: RiffRecord[] = []) {
    this.records = records;
  }

  async add(riff: NewRiff, score: number, nowMs: number): Promise<RiffRecord> {
    if (this.failWrites) throw new Error("store-write-failed");
    this.addCalls += 1;
    seq += 1;
    const record: RiffRecord = {
      v: 1,
      id: `fake-${seq}`,
      ...riff,
      ...initialSchedule(score, nowMs),
    };
    this.records.push(record);
    return record;
  }

  async list(): Promise<RiffRecord[]> {
    if (this.failList) throw new Error("store-read-failed");
    return [...this.records];
  }

  async get(id: string): Promise<RiffRecord | undefined> {
    return this.records.find((r) => r.id === id);
  }

  async recordPass(id: string, score: number, nowMs: number): Promise<RiffRecord> {
    if (this.failWrites) throw new Error("store-write-failed");
    this.passCalls += 1;
    const idx = this.records.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("store-missing-record");
    const updated = applyPass(this.records[idx], score, nowMs);
    this.records[idx] = updated;
    return updated;
  }

  async remove(id: string): Promise<void> {
    if (this.failWrites) throw new Error("store-write-failed");
    this.removeCalls += 1;
    this.records = this.records.filter((r) => r.id !== id);
  }

  dispose(): void {}
}
