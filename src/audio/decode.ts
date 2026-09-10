export const MAX_FILE_BYTES = 60 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ["mp3", "wav", "ogg", "flac"] as const;
export const ACCEPT_ATTR = ".mp3,.wav,.ogg,.flac,audio/*";

export type DecodeErrorKind = "too-large" | "unsupported";

export class AudioDecodeError extends Error {
  kind: DecodeErrorKind;
  constructor(kind: DecodeErrorKind, message: string) {
    super(message);
    this.name = "AudioDecodeError";
    this.kind = kind;
  }
}

/**
 * Decodes a local File into an AudioBuffer entirely in-browser. The bytes are
 * read with File.arrayBuffer() and handed to decodeAudioData. Nothing is sent
 * over the network.
 */
export async function decodeAudioFile(
  file: File,
  ctx: AudioContext | OfflineAudioContext,
): Promise<AudioBuffer> {
  if (file.size > MAX_FILE_BYTES) {
    throw new AudioDecodeError("too-large", "File exceeds the size cap.");
  }
  const bytes = await file.arrayBuffer();
  try {
    return await ctx.decodeAudioData(bytes);
  } catch {
    throw new AudioDecodeError("unsupported", "Could not decode this file.");
  }
}
