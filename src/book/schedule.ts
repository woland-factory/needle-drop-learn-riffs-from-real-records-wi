// The spaced-repetition brain. Pure and deterministic: every function takes the
// clock as a parameter and nothing here mutates a record. Decay is computed,
// never written; an untouched phrase reads as due purely because its stored
// reviewDueDate has lapsed. Only matched passes ever change stored fields.

import type { RiffRecord } from "./store";

export const REVIEW_LADDER_DAYS = [1, 3, 7, 14, 30, 60]; // by streak, capped
export const DAY_MS = 24 * 60 * 60 * 1000;

/** The review interval for a streak, from the ladder, capped at the last rung. */
export function intervalDays(streak: number): number {
  const rung = Math.min(Math.max(1, Math.floor(streak)), REVIEW_LADDER_DAYS.length);
  return REVIEW_LADDER_DAYS[rung - 1];
}

/** When the next review falls due for a streak, from now. */
export function nextReviewDue(streak: number, nowMs: number): number {
  return nowMs + intervalDays(streak) * DAY_MS;
}

/** Due at and after the stored review date, never before. Reads only. */
export function isDue(record: Pick<RiffRecord, "reviewDueDate">, nowMs: number): boolean {
  return nowMs >= record.reviewDueDate;
}

/** The schedule fields of a brand-new record: first nailed right now, streak 1. */
export function initialSchedule(
  score: number,
  nowMs: number,
): Pick<
  RiffRecord,
  "streak" | "dateFirstNailed" | "lastPracticed" | "reviewDueDate" | "bestScore"
> {
  return {
    streak: 1,
    dateFirstNailed: nowMs,
    lastPracticed: nowMs,
    reviewDueDate: nextReviewDue(1, nowMs),
    bestScore: score,
  };
}

/**
 * A matched re-pass: the streak grows, the next review moves out by the new
 * streak's interval, and the best score keeps its maximum. Returns a new
 * record; the input is untouched.
 */
export function applyPass(record: RiffRecord, score: number, nowMs: number): RiffRecord {
  const streak = record.streak + 1;
  return {
    ...record,
    streak,
    lastPracticed: nowMs,
    reviewDueDate: nextReviewDue(streak, nowMs),
    bestScore: Math.max(record.bestScore, score),
  };
}

/** "Due now" when overdue, "Due today" inside a day, else "Due in n days". */
export function dueLabel(
  record: Pick<RiffRecord, "reviewDueDate">,
  nowMs: number,
): string {
  const diff = record.reviewDueDate - nowMs;
  if (diff <= 0) return "Due now";
  if (diff < DAY_MS) return "Due today";
  const days = Math.ceil(diff / DAY_MS);
  return days === 1 ? "Due in 1 day" : `Due in ${days} days`;
}
