// Pure assembly of a NewRiff from the Loop Room's state at save time. Kept out
// of the component so the exact record a matched pass persists is unit-proven.

import type { Note } from "../audio/note";
import type { NewRiff } from "./store";

export interface RiffContext {
  sourceName: string;
  clipWav: ArrayBuffer;
  startSec: number;
  endSec: number;
  bars: number;
  tempoBpm: number;
  speed: number;
}

/** Title from the source file name without its extension. */
export function riffTitle(sourceName: string): string {
  return sourceName.replace(/\.[^.]+$/, "") || sourceName;
}

/** The record shape a matched pass persists: notes exactly as graded, UI ids dropped. */
export function buildNewRiff(notes: Note[], ctx: RiffContext): NewRiff {
  return {
    title: riffTitle(ctx.sourceName),
    sourceName: ctx.sourceName,
    clipWav: ctx.clipWav,
    loopRegion: {
      startSec: ctx.startSec,
      endSec: ctx.endSec,
      bars: ctx.bars,
      tempoBpm: ctx.tempoBpm,
      speed: ctx.speed,
    },
    notes: notes.map(({ midi, startSec, durSec, confidence, edited }) => ({
      midi,
      startSec,
      durSec,
      confidence,
      edited,
    })),
    stemUsed: "mix",
  };
}
