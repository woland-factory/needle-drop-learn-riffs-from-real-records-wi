interface NoPitchStateProps {
  onBack: () => void;
}

export function NoPitchState({ onBack }: NoPitchStateProps) {
  return (
    <section className="card no-pitch" role="status">
      <h2>This part is hard to read</h2>
      <p>
        Pick a part with one clear note at a time, like a bassline or a
        single-string riff.
      </p>
      <button type="button" className="btn btn-primary" onClick={onBack}>
        Pick another part
      </button>
    </section>
  );
}
