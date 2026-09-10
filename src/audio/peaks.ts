export interface Peak {
  min: number;
  max: number;
}

/**
 * Downsamples a single channel into `buckets` min/max pairs. Pure and
 * deterministic for a given input, so it can drive a stable waveform render.
 */
export function computePeaks(channelData: Float32Array, buckets: number): Peak[] {
  const peaks: Peak[] = [];
  const n = channelData.length;
  if (buckets <= 0 || n === 0) return peaks;
  const size = n / buckets;
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * size);
    const end = Math.min(n, Math.floor((i + 1) * size));
    if (end <= start) {
      peaks.push({ min: 0, max: 0 });
      continue;
    }
    let min = Infinity;
    let max = -Infinity;
    for (let j = start; j < end; j++) {
      const v = channelData[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks.push({ min, max });
  }
  return peaks;
}

/** Averages all channels of a buffer to mono, then computes peaks. */
export function computePeaksFromBuffer(
  buffer: AudioBuffer,
  buckets: number,
): Peak[] {
  const channels = buffer.numberOfChannels;
  if (channels === 1) {
    return computePeaks(buffer.getChannelData(0), buckets);
  }
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / channels;
    }
  }
  return computePeaks(mono, buckets);
}
