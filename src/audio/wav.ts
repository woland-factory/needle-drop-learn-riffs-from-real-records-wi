// Pure 16-bit PCM WAV read/write. The reader mirrors the writer in
// scripts/gen-audio.mjs; the writer here produces the clip bytes the riff-book
// stores, so a saved clip round-trips through the exact decode tests use.

import type { Take } from "./take";

interface RegionSpan {
  startSec: number;
  endSec: number;
}

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

function writeString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

/**
 * Encodes a mono Take as a 16-bit PCM WAV. Samples beyond [-1, 1] are clamped,
 * never wrapped, so a hot clip can only flatten, not glitch. The output decodes
 * back through readWavPcm within 16-bit quantization error.
 */
export function writeWavPcm(take: Take): ArrayBuffer {
  const { samples, sampleRate } = take;
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLen, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return buf;
}

/**
 * Averages multi-channel PCM into mono over [startFrame, endFrame), clamped to
 * the shortest channel. Pure; the Web Audio touch lives in extractRegionWav.
 */
export function mixToMono(
  channels: Float32Array[],
  startFrame: number,
  endFrame: number,
): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  const frames = Math.min(...channels.map((c) => c.length));
  const lo = Math.max(0, Math.min(Math.floor(startFrame), frames));
  const hi = Math.max(lo, Math.min(Math.ceil(endFrame), frames));
  const out = new Float32Array(hi - lo);
  for (const data of channels) {
    for (let i = lo; i < hi; i++) out[i - lo] += data[i] / channels.length;
  }
  return out;
}

/** Slices a region off an AudioBuffer as mono 16-bit PCM WAV bytes. */
export function extractRegionWav(buffer: AudioBuffer, region: RegionSpan): ArrayBuffer {
  const rate = buffer.sampleRate;
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  const mono = mixToMono(channels, region.startSec * rate, region.endSec * rate);
  return writeWavPcm({ samples: mono, sampleRate: rate });
}
