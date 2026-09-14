// The mic capture boundary. The real recorder captures raw PCM through
// getUserMedia into a Take; component tests inject a fake and never touch Web
// Audio (the same pattern as the Transcriber). The take exists only in memory
// for the pass and never leaves the machine.

import type { Take } from "./take";

export type { Take } from "./take";

export type MicPermission = "granted" | "denied" | "unavailable";

export interface MicRecorder {
  requestPermission(): Promise<MicPermission>;
  /** Records `durationSec` of mono PCM, reporting live RMS through onLevel. */
  record(durationSec: number, onLevel?: (rms: number) => void): Promise<Take>;
  dispose(): void;
}

/** Root-mean-square of a frame, the loudness the live meter shows. */
export function frameRms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / Math.max(1, frame.length));
}

/** Maps a getUserMedia rejection to a permission outcome. */
export function mapMicError(err: unknown): MicPermission {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  return "unavailable"; // NotFoundError, OverconstrainedError, or no device
}

/**
 * Records the mic through Web Audio. Raw signal (no echo cancellation, no noise
 * suppression, no auto gain) grades better, so those are all off.
 */
export class WebMicRecorder implements MicRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;

  private hasMediaDevices(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
    );
  }

  async requestPermission(): Promise<MicPermission> {
    if (!this.hasMediaDevices()) return "unavailable";
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      return "granted";
    } catch (err) {
      return mapMicError(err);
    }
  }

  async record(durationSec: number, onLevel?: (rms: number) => void): Promise<Take> {
    if (!this.stream) {
      const perm = await this.requestPermission();
      if (perm !== "granted" || !this.stream) {
        throw new Error(`mic-${perm}`);
      }
    }
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtor();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const source = ctx.createMediaStreamSource(this.stream as MediaStream);
    const BUFFER = 2048;
    const processor = ctx.createScriptProcessor(BUFFER, 1, 1);
    const chunks: Float32Array[] = [];
    let collected = 0;
    const targetSamples = Math.ceil(durationSec * ctx.sampleRate);

    return new Promise<Take>((resolve) => {
      const finish = () => {
        processor.disconnect();
        source.disconnect();
        const out = new Float32Array(Math.min(collected, targetSamples));
        let o = 0;
        for (const chunk of chunks) {
          if (o >= out.length) break;
          const take = Math.min(chunk.length, out.length - o);
          out.set(chunk.subarray(0, take), o);
          o += take;
        }
        resolve({ samples: out, sampleRate: ctx.sampleRate });
      };

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        const input = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(input));
        collected += input.length;
        if (onLevel) onLevel(frameRms(input));
        if (collected >= targetSamples) finish();
      };

      source.connect(processor);
      // A muted sink keeps the processor pulling without echoing the mic.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      processor.connect(sink);
      sink.connect(ctx.destination);
    });
  }

  dispose(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}

/** A scripted recorder for tests: returns a preset take and simulated levels. */
export class FakeMicRecorder implements MicRecorder {
  permission: MicPermission = "granted";
  private take: Take;
  requests = 0;
  records = 0;
  disposed = false;

  constructor(take?: Take) {
    this.take = take ?? { samples: new Float32Array(0), sampleRate: 22050 };
  }

  setTake(take: Take): void {
    this.take = take;
  }

  async requestPermission(): Promise<MicPermission> {
    this.requests++;
    return this.permission;
  }

  async record(_durationSec: number, onLevel?: (rms: number) => void): Promise<Take> {
    this.records++;
    onLevel?.(0.2);
    return this.take;
  }

  dispose(): void {
    this.disposed = true;
  }
}
