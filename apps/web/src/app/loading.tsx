export default function Loading() {
  return (
    <div className="page-shell" aria-live="polite" aria-busy="true">
      <div className="skeleton skeleton--eyebrow" />
      <div className="skeleton skeleton--title" />
      <div className="metric-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="skeleton skeleton--tile" key={index} />
        ))}
      </div>
      <span className="visually-hidden">Loading Faro signals</span>
    </div>
  );
}
