// Generates the self-produced audio bundled with the app.
//  - public/sample/riff.wav : a short monophonic bass riff for the sample entry point.
//  - tests/fixtures/tone.wav : a tiny tone the e2e/unit tests decode.
// Run with: node scripts/gen-audio.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const SR = 44100;

function writeWav(path, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return buf.length;
}

// One plucked note with a short decay envelope, plus a soft octave for body.
function note(freq, durSec, gain = 0.6) {
  const len = Math.floor(durSec * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.exp(-3.2 * (t / durSec)) * (1 - Math.exp(-200 * t));
    const s =
      Math.sin(2 * Math.PI * freq * t) +
      0.25 * Math.sin(2 * Math.PI * freq * 2 * t);
    out[i] = s * env * gain;
  }
  return out;
}

function riff() {
  // A simple two-bar walking bass line at 100 BPM (0.6s per beat).
  const beat = 0.6;
  const seq = [
    ["E2", 82.41],
    ["G2", 98.0],
    ["A2", 110.0],
    ["B2", 123.47],
    ["A2", 110.0],
    ["G2", 98.0],
    ["E2", 82.41],
    ["D2", 73.42],
  ];
  const parts = seq.map(([, f]) => note(f, beat));
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const sampleBytes = writeWav(resolve(root, "public/sample/riff.wav"), riff());
const toneBytes = writeWav(
  resolve(root, "tests/fixtures/tone.wav"),
  note(220, 1.0),
);
console.log(`sample riff.wav: ${sampleBytes} bytes`);
console.log(`fixture tone.wav: ${toneBytes} bytes`);
