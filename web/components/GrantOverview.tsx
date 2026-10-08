"use client";
import { Answer } from "./CitedAnswer";
import type { GrantOverview as Overview } from "@/lib/grantLandscape";

// GrantRadar's AI overview: the funding landscape for groups like yours, a few patterns, and where
// to start. Citations [n] are funders by their rank in the list; hovering one shows the funder.
export function GrantOverview({ o }: { o: Overview }) {
  const cite = (n: number) => {
    const f = o.funders.find((x) => x.n === n);
    return f && { title: f.name, lines: [[f.place, f.facts].filter(Boolean).join(" · "), f.liked] };
  };
  return (
    <section className="overview" aria-label="AI overview">
      <Answer text={o.summary} cite={cite} />
      {o.patterns.length > 0 && <Answer text={o.patterns.map((p) => `- ${p}`).join("\n")} cite={cite} />}
      {o.next.length > 0 && (
        <div className="ov-next">
          <h3>Where to start</h3>
          <Answer text={o.next.map((p) => `- ${p}`).join("\n")} cite={cite} />
        </div>
      )}
      <p className="overview-foot">AI-generated from {o.count} matched foundations&apos; 990-PF filings · verify details</p>
    </section>
  );
}

export function GrantOverviewSkeleton() {
  return (
    <section className="overview loading-ov" aria-label="AI overview loading">
      <p className="ov-wait">Reading the best-fit funders…</p>
      <div className="ov-lines" aria-hidden><i /><i /><i className="short" /></div>
    </section>
  );
}
