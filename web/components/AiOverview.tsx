"use client";
import { useMemo, useState } from "react";
import { Answer } from "./CitedAnswer";
import { RelatedList, Spark, usePublishOverview } from "./OverviewVisual";
import type { Overview } from "@/lib/overview";

const SHOW = 2; // bullets before "Show more"

// The AI part of the Overview tab: up to 2 short cited bullets (the rest behind "Show more") and a
// source line. visual: it sits inside OverviewVisual's AI card, which shows the headline, and the
// related searches go to the bottom of the panel (Related); so all three are handed over instead of
// shown here. Without the visual (few results) it is its own card with the headline and searches.
export function AiOverview({ o, question, visual = false }: { o: Overview; question: string; visual?: boolean }) {
  const [more, setMore] = useState(false);
  // On the slide there are no citation chips: drop "like [2, 7]" clauses and any other [n].
  const plain = useMemo(() => o.bullets.map((b) => b.replace(/,?\s*(?:like|such as|including|e\.g\.,?)\s*\[\d+(?:,\s*\d+)*\]/gi, "")
    .replace(/\s*\[\d+(?:,\s*\d+)*\]/g, "").replace(/\s+([,.])/g, "$1").replace(/,\s*,/g, ",").trim()), [o]);
  usePublishOverview(question, o.headline, plain, o.explore);
  const cite = (n: number) => {
    const x = o.orgs.find((y) => y.n === n);
    return x && { title: x.name, lines: [[x.place, x.facts].filter(Boolean).join(" · "), x.about] };
  };
  const shown = more ? o.bullets : o.bullets.slice(0, SHOW);
  const body = (
    <div className="overview">
      {shown.length > 0 && <Answer text={shown.map((p) => `- ${p}`).join("\n")} cite={cite} />}
      {o.bullets.length > SHOW && (
        <button type="button" className="kp-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Show less" : "Show more"}</button>
      )}
      <p className="overview-foot">AI-generated from {o.count} strong matches&apos; IRS filings · verify details</p>
    </div>
  );
  if (visual) return body;
  return (
    <>
      <section className="kp-card" aria-label="AI overview">
        <h3 className="kp-h"><Spark />AI overview</h3>
        {o.headline && <p className="ovv-head ai">{o.headline}</p>}
        {body}
      </section>
      <RelatedList items={o.explore} />
    </>
  );
}

export function AiOverviewSkeleton({ compact = false }: { compact?: boolean }) {
  const lines = (
    <div className="overview loading-ov" aria-label="AI overview loading">
      <p className="ov-wait">{compact ? "Writing the AI summary…" : "Reading the strongest matches…"}</p>
      <div className="ov-lines" aria-hidden><i /><i className="short" />{!compact && <i />}</div>
    </div>
  );
  if (compact) return lines;
  return <section className="kp-card"><h3 className="kp-h"><Spark />AI overview</h3>{lines}</section>;
}
