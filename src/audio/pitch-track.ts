// Walks a whole take with the single-frame detector, producing a per-hop pitch
// track. Pure: the fixture harness and the live mic path both run this exact code.

import { detectPitch, hzToMidi, type DetectOptions } from "./pitch-detect";
import type { Take } from "./take";

export type { Take } from "./take";

export interface PitchFrame {
  timeSec: number;
  midi: number | null; // null when the hop is unvoiced (silence/noise/aperiodic)
  clarity: number;
}

export interface TrackOptions extends DetectOptions {
  windowSec?: number; // analysis window length, default ~0.093 s
  hopSec?: number; // step between hops, default 0.01 s
}

const DEFAULT_WINDOW_SEC = 0.093;
const DEFAULT_HOP_SEC = 0.01;

/**
 * Hops a window across the take and detects pitch at each hop. A hop is marked
 * unvoiced (midi: null) when the detector finds no clear pitch. Times are the
 * window centers, in seconds from the take start.
 */
export function trackPitch(take: Take, opts: TrackOptions = {}): PitchFrame[] {
  const { samples, sampleRate } = take;
  if (!samples || samples.length === 0 || !(sampleRate > 0)) return [];

  const windowSize = Math.max(256, Math.round((opts.windowSec ?? DEFAULT_WINDOW_SEC) * sampleRate));
  const hop = Math.max(1, Math.round((opts.hopSec ?? DEFAULT_HOP_SEC) * sampleRate));

  const frames: PitchFrame[] = [];
  for (let start = 0; start + windowSize <= samples.length; start += hop) {
    const frame = samples.subarray(start, start + windowSize);
    const res = detectPitch(frame, sampleRate, opts);
    const timeSec = (start + windowSize / 2) / sampleRate;
    if (res) {
      frames.push({ timeSec, midi: hzToMidi(res.hz), clarity: res.clarity });
    } else {
      frames.push({ timeSec, midi: null, clarity: 0 });
    }
  }
  return frames;
}
