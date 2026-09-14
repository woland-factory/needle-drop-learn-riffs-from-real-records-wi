// Pure pitch helpers. No Web Audio, no state, safe to unit-test and run in a
// worker or on the main thread.

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** Frequency in Hz for a MIDI number. A4 (69) is 440 Hz. */
export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Name for a MIDI number, e.g. 40 -> "E2", 69 -> "A4". */
export function midiToName(midi: number): string {
  const m = Math.round(midi);
  const name = NOTE_NAMES[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}
