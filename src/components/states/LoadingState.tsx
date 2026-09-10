export function LoadingState() {
  return (
    <section className="card" aria-busy="true" aria-live="polite">
      <div className="skeleton skeleton-wave" />
      <div className="skeleton skeleton-row" />
      <div className="skeleton skeleton-row" />
      <p className="loading-note">Reading your song…</p>
    </section>
  );
}
