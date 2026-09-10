import { DropZone } from "../DropZone";

interface EmptyStateProps {
  onFile: (file: File) => void;
  onSample: () => void;
}

export function EmptyState({ onFile, onSample }: EmptyStateProps) {
  return (
    <section className="empty" aria-labelledby="empty-heading">
      <h1 id="empty-heading">Drop in a song to start</h1>
      <p>Pick a track from your own files. It stays on your machine.</p>
      <DropZone onFile={onFile} onSample={onSample} />
    </section>
  );
}
