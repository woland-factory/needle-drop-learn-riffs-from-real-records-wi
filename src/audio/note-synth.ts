import { midiToFreq } from "./pitch";
import type { Note } from "./note";

export interface PlannedTone {
  freq: number;
  startAt: number; // absolute AudioContext time
  stopAt: number;
}

// Lead time before the first tone so scheduling is comfortably ahead of the
// audio clock. Also the alignment anchor for playing over the record.
export const AUDITION_LEAD_SEC = 0.08;
const ATTACK_SEC = 0.008;
const RELEASE_SEC = 0.03;
const PEAK_GAIN = 0.22;
// Silence tail after the last event so release ramps finish before teardown.
const TAIL_SEC = 0.12;

/**
 * Pure schedule: maps notes (times relative to region start) to absolute
 * oscillator start/stop times anchored at `startTimeSec`. Unit-tested.
 */
export function planSchedule(notes: Note[], startTimeSec: number): PlannedTone[] {
  return [...notes]
    .sort((a, b) => a.startSec - b.startSec)
    .map((n) => ({
      freq: midiToFreq(n.midi),
      startAt: startTimeSec + n.startSec,
      stopAt: startTimeSec + n.startSec + n.durSec,
    }));
}

interface AbsoluteRegion {
  startSec: number;
  endSec: number;
}

/**
 * The audition surface ChartPanel depends on. The real class below implements
 * it; component tests inject a fake so they never touch Web Audio.
 */
export interface AuditionLike {
  playAlone(notes: Note[]): Promise<void>;
  playWithSong(
    notes: Note[],
    buffer: AudioBuffer,
    region: AbsoluteRegion,
  ): Promise<void>;
  stop(): void;
  onEnded: (() => void) | null;
}

/**
 * Plays a chart back as synthesized tones, alone or aligned over the record.
 * Owns only its own nodes: stopping audition never touches the Loop Room's
 * transport, and the record one-shot here runs at true tempo (rate 1) so the
 * pitch comparison stays honest regardless of the slow-down slider.
 */
export class Audition implements AuditionLike {
  private ctx: AudioContext;
  private voices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private record: AudioBufferSourceNode | null = null;
  private recordGain: GainNode | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private _playing = false;
  /** Called when a scheduled audition finishes on its own. */
  onEnded: (() => void) | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  get playing(): boolean {
    return this._playing;
  }

  async playAlone(notes: Note[]): Promise<void> {
    await this.begin(notes, null);
  }

  async playWithSong(
    notes: Note[],
    buffer: AudioBuffer,
    region: AbsoluteRegion,
  ): Promise<void> {
    await this.begin(notes, { buffer, region });
  }

  private async begin(
    notes: Note[],
    song: { buffer: AudioBuffer; region: AbsoluteRegion } | null,
  ): Promise<void> {
    this.stop();
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    const start = this.ctx.currentTime + AUDITION_LEAD_SEC;
    const tones = planSchedule(notes, start);

    let lastStop = start;
    for (const tone of tones) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = tone.freq;
      const releaseStart = Math.max(tone.startAt + ATTACK_SEC, tone.stopAt - RELEASE_SEC);
      gain.gain.setValueAtTime(0, tone.startAt);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, tone.startAt + ATTACK_SEC);
      gain.gain.setValueAtTime(PEAK_GAIN, releaseStart);
      gain.gain.linearRampToValueAtTime(0, tone.stopAt);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(tone.startAt);
      osc.stop(tone.stopAt + 0.02);
      this.voices.push({ osc, gain });
      lastStop = Math.max(lastStop, tone.stopAt + 0.02);
    }

    if (song) {
      const { buffer, region } = song;
      const regionLen = Math.max(0, region.endSec - region.startSec);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 1; // true tempo, independent of the slow-down slider
      const rg = this.ctx.createGain();
      rg.gain.value = 0.85;
      src.connect(rg);
      rg.connect(this.ctx.destination);
      src.start(start, region.startSec, regionLen);
      this.record = src;
      this.recordGain = rg;
      lastStop = Math.max(lastStop, start + regionLen);
    }

    this._playing = true;
    const untilEnd = Math.max(0, lastStop - this.ctx.currentTime + TAIL_SEC);
    this.endTimer = setTimeout(() => {
      this.stop();
      this.onEnded?.();
    }, untilEnd * 1000);
  }

  stop(): void {
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    for (const { osc, gain } of this.voices) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      osc.disconnect();
      gain.disconnect();
    }
    this.voices = [];
    if (this.record) {
      try {
        this.record.stop();
      } catch {
        // already stopped
      }
      this.record.disconnect();
      this.record = null;
    }
    this.recordGain?.disconnect();
    this.recordGain = null;
    this._playing = false;
  }
}
