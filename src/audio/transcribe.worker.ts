// Runs Basic Pitch / tfjs inference off the main thread. tfjs and the model
// are dynamically imported so they stay out of the initial app bundle. The
// model weights load same-origin from /models/basic-pitch, so no audio and no
// model request ever leaves the machine.

import type { RawNoteEvent } from "./monophonic";

const MODEL_URL = new URL(
  "/models/basic-pitch/model.json",
  self.location.origin,
).toString();

// Thresholds favor clean, confident notes over completeness: a note the user
// adds by hand beats a phantom note that erodes trust in the chart.
const ONSET_THRESHOLD = 0.4;
const FRAME_THRESHOLD = 0.25;
const MIN_NOTE_FRAMES = 5; // ~58ms at 86 frames/sec

interface IncomingMessage {
  id: number;
  audio: Float32Array;
}

self.onmessage = async (e: MessageEvent<IncomingMessage>) => {
  const { id, audio } = e.data;
  try {
    const tf = await import("@tensorflow/tfjs");
    // No WebGL context in a worker; the CPU backend is always available.
    await tf.setBackend("cpu");
    await tf.ready();

    const {
      BasicPitch,
      outputToNotesPoly,
      addPitchBendsToNoteEvents,
      noteFramesToTime,
    } = await import("@spotify/basic-pitch");

    const basicPitch = new BasicPitch(MODEL_URL);
    const frames: number[][] = [];
    const onsets: number[][] = [];
    const contours: number[][] = [];

    await basicPitch.evaluateModel(
      audio,
      (f: number[][], o: number[][], c: number[][]) => {
        frames.push(...f);
        onsets.push(...o);
        contours.push(...c);
      },
      (p: number) => {
        (self as unknown as Worker).postMessage({
          id,
          type: "progress",
          progress: p,
        });
      },
    );

    const poly = outputToNotesPoly(
      frames,
      onsets,
      ONSET_THRESHOLD,
      FRAME_THRESHOLD,
      MIN_NOTE_FRAMES,
    );
    const timed = noteFramesToTime(addPitchBendsToNoteEvents(contours, poly));

    const events: RawNoteEvent[] = timed.map((n) => ({
      midi: n.pitchMidi,
      startSec: n.startTimeSeconds,
      durSec: n.durationSeconds,
      confidence: Math.min(1, Math.max(0, n.amplitude)),
    }));

    (self as unknown as Worker).postMessage({ id, type: "done", events });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      type: "error",
      message: err instanceof Error ? err.message : "transcription-failed",
    });
  }
};
