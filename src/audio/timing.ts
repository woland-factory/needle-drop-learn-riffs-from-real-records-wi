export const DEFAULT_BEATS_PER_BAR = 4;
export const DEFAULT_BARS = 2;
export const DEFAULT_BPM = 120;

export interface Region {
  startSec: number;
  endSec: number;
}

/** Seconds spanned by a number of bars at a tempo. */
export function barsToSeconds(
  bars: number,
  bpm: number,
  beatsPerBar: number = DEFAULT_BEATS_PER_BAR,
): number {
  return bars * beatsPerBar * (60 / bpm);
}

/**
 * Returns a region whose length equals `bars` bars at the given tempo, clamped
 * to the buffer duration. When `quantizeBeat` is set, the start is pulled to
 * the nearest beat. If the requested length exceeds the buffer, the region is
 * shortened to fit.
 */
export function snapRegionToBars(
  startSec: number,
  bars: number,
  bpm: number,
  beatsPerBar: number,
  duration: number,
  quantizeBeat = false,
): Region {
  const beatSec = 60 / bpm;
  let start = Math.max(0, startSec);
  if (quantizeBeat) {
    start = Math.round(start / beatSec) * beatSec;
  }
  const length = barsToSeconds(bars, bpm, beatsPerBar);
  if (length >= duration) {
    return { startSec: 0, endSec: duration };
  }
  let end = start + length;
  if (end > duration) {
    end = duration;
    start = end - length;
  }
  return { startSec: start, endSec: end };
}
