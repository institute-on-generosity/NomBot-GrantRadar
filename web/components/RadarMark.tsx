// Concentric arcs with a sweep: GrantRadar's mark.
export function RadarMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M12 12 19 6.5" />
      <path d="M17.7 17.7A8 8 0 1 1 20 12" opacity=".55" />
      <path d="M15.5 15.5A5 5 0 1 1 17 12" opacity=".8" />
    </svg>
  );
}
