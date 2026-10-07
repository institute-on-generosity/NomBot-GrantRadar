"use client";
import { Answer } from "./CitedAnswer";
import { NavLink } from "./NavLink";
import type { Overview } from "@/lib/overview";

const Spark = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M12 3.5c.6 4.4 2.9 6.9 8 8.5-5.1 1.6-7.4 4.1-8 8.5-.6-4.4-2.9-6.9-8-8.5 5.1-1.6 7.4-4.1 8-8.5Z" /></svg>;

// The zoom-out view above the results: summary, patterns, and related searches to explore.
export function AiOverview({ o, explore }: { o: Overview; explore: { q: string; href: string }[] }) {
  const cite = (n: number) => {
    const x = o.orgs.find((y) => y.n === n);
    return x && { title: `${x.name} · ${x.place}`, href: `/preview/org/${x.ein}` };
  };
  return (
    <section className="overview" aria-label="AI overview">
      <Answer text={o.summary} cite={cite} />
      {o.patterns.length > 0 && <Answer text={o.patterns.map((p) => `- ${p}`).join("\n")} cite={cite} />}
      {explore.length > 0 && (
        <div className="explore">
          <span>Explore</span>
          {explore.map(({ q, href }) => <NavLink key={q} href={href} className="explore-link" label="Reading your question…" search>{q}</NavLink>)}
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
