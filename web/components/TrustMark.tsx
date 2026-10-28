import type { Trust } from "@/lib/sdg";

// How far to trust a cause's counts (Oct 28): ◐ partial (IRS codes), ✓ a checked cause label, a dotted circle for
// limited data. One small fixed-width glyph after the name, its meaning on hover and for screen readers (no layout
// shift, no extra words). See trustOf / trustText in lib/sdg.ts.
// The dotted circle is drawn: the ◌ character renders tiny or missing in common fonts
const Dotted = () => <svg width="0.8em" height="0.8em" viewBox="0 0 12 12" aria-hidden="true" style={{ verticalAlign: "-0.05em" }}><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1.6 1.9" /></svg>;
// Half-filled circle, drawn (the ◐ character varies by font)
export const Half = () => <svg width="0.8em" height="0.8em" viewBox="0 0 12 12" aria-hidden="true" style={{ verticalAlign: "-0.05em" }}><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M6 1.4 A4.6 4.6 0 0 0 6 10.6 Z" fill="currentColor" /></svg>;
const GLYPH: Record<Trust, React.ReactNode> = { partial: <Half />, checked: "✓", limited: <Dotted /> };
const NAME: Record<Trust, string> = { partial: "Partial", checked: "Checked label", limited: "Limited data" };

export function TrustMark({ trust, tip }: { trust: Trust; tip: string }) {
  return <span className={`trust trust-${trust}`} role="img" aria-label={`${NAME[trust]}. ${tip}`} title={tip}>{GLYPH[trust]}</span>;
}

// Once per page, small and muted
export function TrustLegend({ limited = false }: { limited?: boolean }) {
  return (
    <p className="trust-legend" aria-hidden="true">
      <span><span className="trust trust-partial"><Half /></span> partial</span>
      <span><span className="trust trust-checked">✓</span> checked</span>
      {limited && <span><span className="trust trust-limited"><Dotted /></span> limited data</span>}
    </p>
  );
}
