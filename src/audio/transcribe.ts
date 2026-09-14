import type { Note } from "./note";
import {
  MIN_NOTE_SEC,
  reduceToMonophonic,
  type RawNoteEvent,
} from "./monophonic";

export interface AbsoluteRegion {
  startSec: number;
  endSec: number;
}

export interface TranscribeRequest {
  buffer: AudioBuffer;
  region: AbsoluteRegion;
}

export type ProgressFn = (progress: number) => void;

/**
 * The transcription boundary. Component tests inject a fake implementation so
 * they never touch WebGL/Web Audio; the real path runs Basic Pitch in a worker.
 */
export interface Transcriber {
  transcribe(req: TranscribeRequest, onProgress: ProgressFn): Promise<Note[]>;
  cancel(): void;
  dispose(): void;
}

const TARGET_RATE = 22050; // Basic Pitch expects 22050 Hz mono.

/**
 * Slices the region from the source buffer, downmixes to mono, and resamples
 * to 22050 Hz. Runs on the audio thread via OfflineAudioContext, so the main
 * thread stays responsive. Times in the returned samples start at 0.
 */
export async function extractRegionMono22050(
  buffer: AudioBuffer,
  region: AbsoluteRegion,
): Promise<Float32Array> {
  const srcRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(region.startSec * srcRate));
  const endSample = Math.min(buffer.length, Math.ceil(region.endSec * srcRate));
  const len = Math.max(1, endSample - startSample);
  const chans = buffer.numberOfChannels;
  const mono = new Float32Array(len);
  for (let c = 0; c < chans; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      mono[i] += data[startSample + i] / chans;
    }
  }
  const outLen = Math.max(1, Math.ceil((len / srcRate) * TARGET_RATE));
  const offline = new OfflineAudioContext(1, outLen, TARGET_RATE);
  const sliceBuf = offline.createBuffer(1, len, srcRate);
  sliceBuf.copyToChannel(mono, 0);
  const source = offline.createBufferSource();
  source.buffer = sliceBuf;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return Float32Array.from(rendered.getChannelData(0));
}

/** Clamps model note times into [0, regionLen] and drops now-tiny notes. */
function clampToRegion(notes: Note[], regionLen: number): Note[] {
  const out: Note[] = [];
  for (const n of notes) {
    if (n.startSec >= regionLen) continue;
    const durSec = Math.min(n.durSec, regionLen - n.startSec);
    if (durSec < MIN_NOTE_SEC) continue;
    out.push({ ...n, durSec });
  }
  return out;
}

type WorkerMessage =
  | { id: number; type: "progress"; progress: number }
  | { id: number; type: "done"; events: RawNoteEvent[] }
  | { id: number; type: "error"; message: string };

/** Runs Basic Pitch inference in a Web Worker, off the main thread. */
export class WorkerTranscriber implements Transcriber {
  private worker: Worker | null = null;
  private seq = 0;
  private pending: {
    id: number;
    onProgress: ProgressFn;
    resolve: (events: RawNoteEvent[]) => void;
    reject: (err: Error) => void;
  } | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL("./transcribe.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (e: MessageEvent<WorkerMessage>) =>
        this.onMessage(e.data);
      this.worker.onerror = () => {
        this.pending?.reject(new Error("transcription-failed"));
        this.pending = null;
      };
    }
    return this.worker;
  }

  private onMessage(msg: WorkerMessage) {
    const p = this.pending;
    if (!p || msg.id !== p.id) return;
    if (msg.type === "progress") {
      p.onProgress(msg.progress);
    } else if (msg.type === "done") {
      this.pending = null;
      p.resolve(msg.events);
    } else {
      this.pending = null;
      p.reject(new Error(msg.message || "transcription-failed"));
    }
  }

  async transcribe(
    req: TranscribeRequest,
    onProgress: ProgressFn,
  ): Promise<Note[]> {
    const regionLen = Math.max(0, req.region.endSec - req.region.startSec);
    onProgress(0);
    const audio = await extractRegionMono22050(req.buffer, req.region);
    const worker = this.ensureWorker();
    const id = ++this.seq;
    const events = await new Promise<RawNoteEvent[]>((resolve, reject) => {
      this.pending = { id, onProgress, resolve, reject };
      worker.postMessage({ id, audio }, [audio.buffer]);
    });
    const reduced = reduceToMonophonic(events);
    onProgress(1);
    return clampToRegion(reduced, regionLen);
  }

  cancel(): void {
    if (this.pending) {
      this.pending.reject(new Error("cancelled"));
      this.pending = null;
    }
    // Terminate so any in-flight inference stops; a fresh worker starts next run.
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  dispose(): void {
    this.cancel();
  }
}
