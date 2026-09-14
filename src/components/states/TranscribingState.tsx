interface TranscribingStateProps {
  progress: number; // 0..1
  onCancel: () => void;
}

export function TranscribingState({ progress, onCancel }: TranscribingStateProps) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <section className="card transcribing" aria-live="polite">
      <h2>Reading the notes</h2>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Reading the notes"
      >
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-pct">{pct}%</p>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}
