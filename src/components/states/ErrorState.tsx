import type { DecodeErrorKind } from "../../audio/decode";

interface ErrorStateProps {
  kind: DecodeErrorKind;
  onRetry: () => void;
}

const MESSAGES: Record<DecodeErrorKind, string> = {
  unsupported: "That file would not open. Try an mp3, wav, ogg, or flac.",
  "too-large": "That file is large. Try a shorter clip or a smaller file.",
};

export function ErrorState({ kind, onRetry }: ErrorStateProps) {
  return (
    <section className="error card" role="alert">
      <h2>Let us try another file</h2>
      <p>{MESSAGES[kind]}</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Choose another song
      </button>
    </section>
  );
}
