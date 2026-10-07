// Fixed "Loading…" popup plus a thin progress bar. Appears after a short delay
// (CSS) so instant navigations don't flash it.
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading-bar" />
      <div className="loading-pill"><span className="spinner" />{label}</div>
    </div>
  );
}
