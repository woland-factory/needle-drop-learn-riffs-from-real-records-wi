// Pure serialization of the riff-book to one JSON-ready object. The download
// plumbing lives in RiffBook; everything testable is here. No dependency:
// base64 is encoded in chunks with btoa.

import type { RiffRecord, StemUsed, StoredNote } from "./store";

export interface ExportedRiff {
  id: string;
  title: string;
  sourceName: string;
  loopRegion: RiffRecord["loopRegion"];
  notes: StoredNote[];
  stemUsed: StemUsed;
  dateFirstNailed: number;
  bestScore: number;
  streak: number;
  lastPracticed: number;
  reviewDueDate: number;
  clipWavBase64: string;
}

export interface BookExport {
  app: "needle-drop";
  exportVersion: 1;
  exportedAt: number; // epoch ms
  riffs: ExportedRiff[];
}

const CHUNK = 0x8000;

/** Base64 of an ArrayBuffer, chunked so a long clip never blows the arg limit. */
export function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decodes base64 back to bytes. Used by tests to prove the round trip. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The whole book as one export object, ready for JSON.stringify. */
export function serializeBook(records: RiffRecord[], exportedAt: number): BookExport {
  return {
    app: "needle-drop",
    exportVersion: 1,
    exportedAt,
    riffs: records.map((r) => ({
      id: r.id,
      title: r.title,
      sourceName: r.sourceName,
      loopRegion: { ...r.loopRegion },
      notes: r.notes.map((n) => ({ ...n })),
      stemUsed: r.stemUsed,
      dateFirstNailed: r.dateFirstNailed,
      bestScore: r.bestScore,
      streak: r.streak,
      lastPracticed: r.lastPracticed,
      reviewDueDate: r.reviewDueDate,
      clipWavBase64: bytesToBase64(r.clipWav),
    })),
  };
}
