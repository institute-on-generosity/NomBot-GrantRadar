"use client";
import { useMemo } from "react";
import { Answer } from "./CitedAnswer";
import { usePublishOverview } from "./OverviewVisual";
import type { Overview } from "@/lib/overview";


// The AI part of the Overview tab: a one-line headline and 2-3 short cited bullets, then related
// searches. visual: the tiles and chart (OverviewVisual) sit above and show the headline, so it is
// handed to them (and to the exported slide) instead of shown twice.
// Hover only for now: citations show the organization, Explore lists searches without running them.
export function AiOverview({ o, question, visual = false }: { o: Overview; question: string; visual?: boolean }) {
  // On the slide there are no citation chips: drop "like [2, 7]" clauses and any other [n].
  const plain = useMemo(() => o.bullets.map((b) => b.replace(/,?\s*(?:like|such as|including|e\.g\.,?)\s*\[\d+(?:,\s*\d+)*\]/gi, "")
    .replace(/\s*\[\d+(?:,\s*\d+)*\]/g, "").replace(/\s+([,.])/g, "$1").replace(/,\s*,/g, ",").trim()), [o]);
  usePublishOverview(question, o.headline, plain);
  const cite = (n: number) => {
    const x = o.orgs.find((y) => y.n === n);
    return x && { title: x.name, lines: [[x.place, x.facts].filter(Boolean).join(" · "), x.about] };
  };
  return (
    <section className="overview" aria-label="AI overview">
      {!visual && o.headline && <p className="ovv-head ai">{o.headline}</p>}
      {o.bullets.length > 0 && <Answer text={o.bullets.map((p) => `- ${p}`).join("\n")} cite={cite} />}
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

export function AiOverviewSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <section className="overview loading-ov" aria-label="AI overview loading">
      <p className="ov-wait">{compact ? "Writing the AI summary…" : "Reading the strongest matches…"}</p>
      <div className="ov-lines" aria-hidden><i /><i className="short" />{!compact && <i />}</div>
    </section>
  );
}
