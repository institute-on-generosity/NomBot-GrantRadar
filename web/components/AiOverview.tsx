"use client";
import { Answer } from "./CitedAnswer";
import type { Overview } from "@/lib/overview";


// The zoom-out view above the results: summary, patterns, and related searches to explore.
// Hover only for now: citations show the organization, Explore lists searches without running them.
export function AiOverview({ o }: { o: Overview }) {
  const cite = (n: number) => {
    const x = o.orgs.find((y) => y.n === n);
    return x && { title: `${x.name} · ${x.place}` };
  };
  return (
    <section className="overview" aria-label="AI overview">
      <Answer text={o.summary} cite={cite} />
      {o.patterns.length > 0 && <Answer text={o.patterns.map((p) => `- ${p}`).join("\n")} cite={cite} />}
      {o.explore.length > 0 && (
        <div className="explore">
          <span>Explore</span>
          {o.explore.map((q) => <span key={q} className="explore-link" title="A related search to try">{q}</span>)}
        </div>
      )}
      <p className="overview-foot">AI-generated from {o.count} strong matches&apos; IRS filings · verify details</p>
    </section>
  );
}

export function AiOverviewSkeleton() {
  return (
    <section className="overview loading-ov" aria-label="AI overview loading">
      <p className="ov-wait">Reading the strongest matches…</p>
      <div className="ov-lines" aria-hidden><i /><i /><i className="short" /></div>
    </section>
  );
}
