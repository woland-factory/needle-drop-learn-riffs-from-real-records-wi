// Single-frame monophonic pitch detection with YIN. Pure: no Web Audio, no DOM,
// no state. The same function grades a live mic frame and a fixture frame.
//
// YIN steps: difference function -> cumulative mean normalized difference (CMNDF)
// -> absolute threshold pick -> parabolic interpolation. Clarity is 1 minus the
// CMNDF at the chosen lag, so a clean periodic frame reads near 1 and noise near 0.

import { midiToFreq } from "./pitch";
import { MIDI_MAX, MIDI_MIN } from "./note";

export interface PitchResult {
  hz: number;
  clarity: number; // 0..1, higher is more clearly periodic
}

export interface DetectOptions {
  minHz?: number; // lowest fundamental to consider
  maxHz?: number; // highest fundamental to consider
  threshold?: number; // YIN absolute threshold, default 0.15
  clarityFloor?: number; // reject a frame below this clarity, default 0.5
  energyFloor?: number; // reject a frame quieter than this RMS, default 1e-3
}

const DEFAULT_THRESHOLD = 0.15;
const DEFAULT_CLARITY_FLOOR = 0.5;
const DEFAULT_ENERGY_FLOOR = 1e-3;

/** Float MIDI number for a frequency. The inverse of midiToFreq. */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / Math.max(1, frame.length));
}

/**
 * Detects the fundamental of a single frame, or null when the frame has no
 * clear pitch (silence, noise, or an aperiodic signal). The frame MUST be long
 * enough to fit at least two periods of the lowest supported note: at 22050 Hz
 * use >= 2048 samples (~93 ms), at 44100 Hz >= 4096.
 */
export function detectPitch(
  frame: Float32Array,
  sampleRate: number,
  opts: DetectOptions = {},
): PitchResult | null {
  const minHz = opts.minHz ?? midiToFreq(MIDI_MIN);
  const maxHz = opts.maxHz ?? midiToFreq(MIDI_MAX);
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const clarityFloor = opts.clarityFloor ?? DEFAULT_CLARITY_FLOOR;
  const energyFloor = opts.energyFloor ?? DEFAULT_ENERGY_FLOOR;

  if (frame.length < 8) return null;
  if (rms(frame) < energyFloor) return null; // silence

  const W = Math.floor(frame.length / 2); // integration window and max lag
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxTau = Math.min(W, Math.ceil(sampleRate / minHz));
  if (maxTau <= minTau) return null;

  // Difference function d(tau) over the integration window.
  const d = new Float32Array(maxTau + 1);
  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const delta = frame[j] - frame[j + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // Cumulative mean normalized difference.
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[minTau] = 1;
  let running = 0;
  for (let tau = minTau; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * (tau - minTau + 1)) / running : 1;
  }

  // Absolute threshold: first lag dipping below threshold, refined to its local
  // minimum. This picks the true fundamental, not a higher-octave sub-period.
  let bestTau = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau] < threshold) {
      let t = tau;
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      bestTau = t;
      break;
    }
  }
  // Fallback: the global minimum in range when nothing crossed the threshold.
  if (bestTau === -1) {
    let min = Infinity;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (cmnd[tau] < min) {
        min = cmnd[tau];
        bestTau = tau;
      }
    }
  }
  if (bestTau < minTau) return null;

  const clarity = 1 - cmnd[bestTau];
  if (!Number.isFinite(clarity) || clarity < clarityFloor) return null;

  // Parabolic interpolation around the chosen lag for sub-sample accuracy.
  let tauEst = bestTau;
  if (bestTau > minTau && bestTau < maxTau) {
    const s0 = cmnd[bestTau - 1];
    const s1 = cmnd[bestTau];
    const s2 = cmnd[bestTau + 1];
    const denom = s0 + s2 - 2 * s1;
    if (denom !== 0) {
      const shift = (0.5 * (s0 - s2)) / denom;
      if (shift > -1 && shift < 1) tauEst = bestTau + shift;
    }
  }

  const hz = sampleRate / tauEst;
  if (!Number.isFinite(hz) || hz < minHz || hz > maxHz) return null;
  return { hz, clarity: Math.min(1, Math.max(0, clarity)) };
}
