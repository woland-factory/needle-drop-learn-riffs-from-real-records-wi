interface BookEmptyStateProps {
  onGoToLoopRoom: () => void;
}

/** The designed empty book: what this screen is for and where to start. */
export function BookEmptyState({ onGoToLoopRoom }: BookEmptyStateProps) {
  return (
    <section className="empty card" aria-labelledby="book-empty-heading">
      <h1 id="book-empty-heading">Conquer your first phrase</h1>
      <p>
        Loop two bars, play them into your mic, and save the pass. Every phrase
        you nail lands here.
      </p>
      <button type="button" className="btn btn-primary" onClick={onGoToLoopRoom}>
        Go to the Loop Room
      </button>
    </section>
  );
}
