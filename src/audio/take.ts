// The one shape mic capture and every fixture reach grading as. A mic take and
// a decoded WAV are the same thing here, so the exact same pure code grades a
// live pass and a test fixture.
export interface Take {
  samples: Float32Array; // mono PCM, roughly -1..1
  sampleRate: number; // Hz
}
