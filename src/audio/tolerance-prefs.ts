// Grading tolerances persisted per browser, shared by the Loop Room practice
// and the riff-book re-practice so the player meets one consistent grader.

import { DEFAULT_TOLERANCES, clampTolerances, type Tolerances } from "./grade";

const TOLERANCES_KEY = "needle-drop-tolerances";

export function loadTolerances(): Tolerances {
  try {
    const raw = localStorage.getItem(TOLERANCES_KEY);
    if (raw) return clampTolerances({ ...DEFAULT_TOLERANCES, ...JSON.parse(raw) });
  } catch {
    // ignore malformed or unavailable storage
  }
  return DEFAULT_TOLERANCES;
}

export function saveTolerances(next: Tolerances): void {
  try {
    localStorage.setItem(TOLERANCES_KEY, JSON.stringify(next));
  } catch {
    // ignore unavailable storage
  }
}
