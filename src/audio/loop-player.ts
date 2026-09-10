import type { Region } from "./timing";

export const MIN_RATE = 0.5;
export const MAX_RATE = 1.0;

/** Clamps a playback rate into the supported [0.5, 1.0] slow-down range. */
export function clampRate(rate: number): number {
  if (Number.isNaN(rate)) return MAX_RATE;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

/**
 * Gapless region looping over the Web Audio graph. Uses a single
 * AudioBufferSourceNode with loop=true and loopStart/loopEnd set to the region
 * bounds, which the browser loops sample-accurately with no click at the seam.
 * Region and rate changes apply live to the running source, so there is no gap.
 */
export class LoopPlayer {
  private ctx: AudioContext;
  private buffer: AudioBuffer;
  private gain: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private region: Region;
  private rate = MAX_RATE;
  private _playing = false;

  constructor(ctx: AudioContext, buffer: AudioBuffer) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.region = { startSec: 0, endSec: buffer.duration };
    this.gain = ctx.createGain();
    this.gain.connect(ctx.destination);
  }

  get playing(): boolean {
    return this._playing;
  }

  get playbackRate(): number {
    return this.rate;
  }

  setRegion(region: Region): void {
    this.region = region;
    if (this.source) {
      this.source.loopStart = region.startSec;
      this.source.loopEnd = region.endSec;
    }
  }

  setRate(rate: number): void {
    this.rate = clampRate(rate);
    if (this.source) {
      this.source.playbackRate.value = this.rate;
    }
  }

  async play(): Promise<void> {
    if (this._playing) return;
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.loopStart = this.region.startSec;
    source.loopEnd = this.region.endSec;
    source.playbackRate.value = this.rate;
    source.connect(this.gain);
    source.start(0, this.region.startSec);
    this.source = source;
    this._playing = true;
  }

  pause(): void {
    this.stop();
  }

  stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
    this._playing = false;
  }

  dispose(): void {
    this.stop();
    this.gain.disconnect();
  }
}
