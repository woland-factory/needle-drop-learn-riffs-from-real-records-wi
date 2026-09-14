// The count-in. A pure planner (unit-tested) plus a thin oscillator shell that
// schedules short clicks, mirroring note-synth.ts.

export interface Click {
  at: number; // absolute AudioContext time, seconds
}

const CLICK_FREQ = 1000;
const CLICK_DUR = 0.04;
const CLICK_GAIN = 0.3;
const LEAD_SEC = 0.08; // schedule comfortably ahead of the audio clock

/** Times of `count` evenly spaced clicks at `bpm`, starting at `startAt`. Pure. */
export function planClicks(count: number, bpm: number, startAt: number): Click[] {
  const clicks: Click[] = [];
  if (!(count > 0) || !(bpm > 0)) return clicks;
  const beat = 60 / bpm;
  for (let i = 0; i < count; i++) {
    clicks.push({ at: startAt + i * beat });
  }
  return clicks;
}

/** The count-in surface PracticePanel depends on; a fake is injected in tests. */
export interface MetronomeLike {
  /** Plays `count` clicks at `bpm`; resolves when the last click has sounded. */
  playClicks(count: number, bpm: number): Promise<void>;
  stop(): void;
  readonly playing: boolean;
}

/** Schedules short clicks on a shared AudioContext. Owns only its own nodes. */
export class Metronome implements MetronomeLike {
  private ctx: AudioContext;
  private voices: OscillatorNode[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private _playing = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  get playing(): boolean {
    return this._playing;
  }

  async playClicks(count: number, bpm: number): Promise<void> {
    this.stop();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const start = this.ctx.currentTime + LEAD_SEC;
    const clicks = planClicks(count, bpm, start);
    let last = start;
    for (const click of clicks) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.value = CLICK_FREQ;
      gain.gain.setValueAtTime(CLICK_GAIN, click.at);
      gain.gain.exponentialRampToValueAtTime(0.0001, click.at + CLICK_DUR);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(click.at);
      osc.stop(click.at + CLICK_DUR + 0.01);
      this.voices.push(osc);
      last = Math.max(last, click.at + CLICK_DUR);
    }
    this._playing = true;
    const wait = Math.max(0, last - this.ctx.currentTime);
    await new Promise<void>((resolve) => {
      this.timer = setTimeout(() => {
        this._playing = false;
        this.timer = null;
        resolve();
      }, wait * 1000);
    });
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const osc of this.voices) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      osc.disconnect();
    }
    this.voices = [];
    this._playing = false;
  }
}
