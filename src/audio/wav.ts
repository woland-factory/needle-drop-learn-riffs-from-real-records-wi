// Pure 16-bit PCM WAV decode for the fixture harness, the mirror of the writer
// in scripts/gen-audio.mjs. No Web Audio, so tests decode a take the same way
// the app records one. Used by unit tests only, never on a hot path.

import type { Take } from "./take";

class WavError extends Error {}

function readString(bytes: Uint8Array, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

/**
 * Decodes a 16-bit PCM WAV into a mono Take. Multi-channel input is downmixed by
 * averaging. Throws on a non-PCM or malformed file.
 */
export function readWavPcm(bytes: Uint8Array): Take {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || readString(bytes, 0, 4) !== "RIFF" || readString(bytes, 8, 4) !== "WAVE") {
    throw new WavError("not a RIFF/WAVE file");
  }

  let sampleRate = 0;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataLength = 0;

  // Walk the chunk list; fmt and data can sit anywhere after the header.
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = readString(bytes, pos, 4);
    const size = view.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt ") {
      const audioFormat = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
      if (audioFormat !== 1 || bitsPerSample !== 16) {
        throw new WavError("only 16-bit PCM is supported");
      }
    } else if (id === "data") {
      dataOffset = body;
      dataLength = Math.min(size, bytes.length - body);
    }
    pos = body + size + (size % 2); // chunks are word-aligned
  }

  if (dataOffset < 0 || sampleRate <= 0 || channels <= 0) {
    throw new WavError("missing fmt or data chunk");
  }

  const frameCount = Math.floor(dataLength / 2 / channels);
  const out = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const sample = view.getInt16(dataOffset + (i * channels + c) * 2, true);
      sum += sample / 32768;
    }
    out[i] = sum / channels;
  }
  return { samples: out, sampleRate };
}
