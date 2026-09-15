import { describe, it, expect } from "vitest";
import {
  REVIEW_LADDER_DAYS,
  DAY_MS,
  intervalDays,
  nextReviewDue,
  isDue,
  initialSchedule,
  applyPass,
  dueLabel,
} from "../../src/book/schedule";
import type { RiffRecord } from "../../src/book/store";

const NOW = 1_750_000_000_000; // fixed injected clock

function record(overrides: Partial<RiffRecord> = {}): RiffRecord {
  return {
    v: 1,
    id: "r1",
    title: "riff",
    sourceName: "riff.wav",
    clipWav: new ArrayBuffer(8),
    loopRegion: { startSec: 1, endSec: 3, bars: 2, tempoBpm: 120, speed: 1 },
    notes: [],
    stemUsed: "mix",
    dateFirstNailed: NOW - 10 * DAY_MS,
    bestScore: 80,
    streak: 2,
    lastPracticed: NOW - 5 * DAY_MS,
    reviewDueDate: NOW - 2 * DAY_MS,
    ...overrides,
  };
}

describe("intervalDays", () => {
  it("walks the ladder by streak and caps at the last rung", () => {
    REVIEW_LADDER_DAYS.forEach((days, i) => {
      expect(intervalDays(i + 1)).toBe(days);
    });
    expect(intervalDays(REVIEW_LADDER_DAYS.length + 1)).toBe(60);
    expect(intervalDays(100)).toBe(60);
    expect(intervalDays(0)).toBe(1); // defensive floor
  });
});

describe("initialSchedule", () => {
  it("starts at streak 1 with a review one day out", () => {
    const s = initialSchedule(85, NOW);
    expect(s).toEqual({
      streak: 1,
      dateFirstNailed: NOW,
      lastPracticed: NOW,
      reviewDueDate: NOW + 1 * DAY_MS,
      bestScore: 85,
    });
  });
});

describe("applyPass", () => {
  it("grows the streak, moves the review out by the new interval, keeps max score", () => {
    const before = record({ streak: 2, bestScore: 80 });
    const after = applyPass(before, 70, NOW);
    expect(after.streak).toBe(3);
    expect(after.lastPracticed).toBe(NOW);
    expect(after.reviewDueDate).toBe(NOW + 7 * DAY_MS); // ladder rung for streak 3
    expect(after.bestScore).toBe(80); // 70 < 80, maximum kept
    expect(after.dateFirstNailed).toBe(before.dateFirstNailed); // untouched
  });

  it("raises the best score when the new one is higher and caps the ladder", () => {
    const before = record({ streak: 9, bestScore: 80 });
    const after = applyPass(before, 100, NOW);
    expect(after.streak).toBe(10);
    expect(after.reviewDueDate).toBe(NOW + 60 * DAY_MS); // capped at the last rung
    expect(after.bestScore).toBe(100);
  });

  it("never mutates its input", () => {
    const before = record();
    const frozen = JSON.stringify({ ...before, clipWav: undefined });
    applyPass(before, 100, NOW);
    expect(JSON.stringify({ ...before, clipWav: undefined })).toBe(frozen);
  });
});

describe("isDue", () => {
  it("is false before the stored date, true at and after it, without mutation", () => {
    const r = record({ reviewDueDate: NOW });
    expect(isDue(r, NOW - 1)).toBe(false);
    expect(isDue(r, NOW)).toBe(true);
    expect(isDue(r, NOW + 30 * DAY_MS)).toBe(true);
    expect(r.reviewDueDate).toBe(NOW);
  });

  it("reads an untouched phrase as due purely from the stored date and clock", () => {
    const saved = { ...record(), ...initialSchedule(90, NOW) };
    expect(isDue(saved, NOW + DAY_MS - 1)).toBe(false);
    expect(isDue(saved, NOW + DAY_MS)).toBe(true); // decay with zero writes
  });
});

describe("dueLabel", () => {
  it("labels overdue, same-day, and future reviews", () => {
    expect(dueLabel(record({ reviewDueDate: NOW - 1 }), NOW)).toBe("Due now");
    expect(dueLabel(record({ reviewDueDate: NOW }), NOW)).toBe("Due now");
    expect(dueLabel(record({ reviewDueDate: NOW + DAY_MS / 2 }), NOW)).toBe("Due today");
    expect(dueLabel(record({ reviewDueDate: NOW + DAY_MS }), NOW)).toBe("Due in 1 day");
    expect(dueLabel(record({ reviewDueDate: NOW + 1.5 * DAY_MS }), NOW)).toBe(
      "Due in 2 days",
    );
    expect(dueLabel(record({ reviewDueDate: NOW + 14 * DAY_MS }), NOW)).toBe(
      "Due in 14 days",
    );
  });
});

describe("nextReviewDue", () => {
  it("is now plus the ladder interval for the streak", () => {
    expect(nextReviewDue(1, NOW)).toBe(NOW + DAY_MS);
    expect(nextReviewDue(4, NOW)).toBe(NOW + 14 * DAY_MS);
  });
});
