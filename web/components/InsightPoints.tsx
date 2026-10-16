import type { Insight } from "@/lib/insightMeta";

// A finding's 2-3 short bullets (insights.points), shared by feed cards and the finding page.
// The only markup is **bold** around key numbers and the "Why it matters:" label; it is split into
// text and <b> nodes (never HTML). Rows the miner hasn't filled yet show the one-sentence summary.

const parts = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((t, k) => (k % 2 ? <b key={k}>{t}</b> : t));

export function InsightPoints({ i, className = "" }: { i: Pick<Insight, "points" | "summary">; className?: string }) {
  const points = (i.points ?? []).filter((p) => typeof p === "string" && p.trim());
  if (!points.length) return <p className={`ins-summary ${className}`.trim()}>{i.summary}</p>;
  return (
    <ul className={`ins-points ${className}`.trim()}>
      {points.map((p) => <li key={p} className={p.startsWith("**Why it matters:**") ? "ins-why" : undefined}>{parts(p)}</li>)}
    </ul>
  );
}
