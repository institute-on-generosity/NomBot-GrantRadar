import { Suspense } from "react";
import { PublishSummary } from "./PublishSummary";
import type { Summary, SummaryText as Text } from "@/lib/searchSummary";

// The summary under the search bar (lib/searchSummary): the computed count line (same counts as the list), the
// AI description (2-3 sentences, checked against the results) in a live region with a skeleton until it arrives,
// and one computed caveat when it matters.
export async function SearchSummary({ summary, question }: { summary: Promise<Summary | null>; question: string }) {
  const s = await summary;
  if (!s) return null;
  const { line } = s;
  return (
    <section className="sum-card" aria-labelledby="sum-h">
      <h2 id="sum-h" className="sum-h">Summary</h2>
      <p className="sum-count" data-strong={s.facts.strong} data-weaker={s.facts.weaker}>
        <b>{line.main}</b>
        {line.parts.map((p) => <span key={p}><i aria-hidden> · </i>{p}</span>)}
        {line.more && <span className="sum-more"><i aria-hidden> · </i>{line.more}</span>}
      </p>
      <div aria-live="polite">
        <Suspense fallback={<SummarySkeleton />}><SummaryText ai={s.ai} question={question} /></Suspense>
      </div>
      {s.caveat && <p className="sum-caveat">{s.caveat}</p>}
    </section>
  );
}

async function SummaryText({ ai, question }: { ai: Promise<Text | null>; question: string }) {
  const t = await ai;
  if (!t) return null;
  return (
    <>
      <p className="sum-text">{t.text}</p>
      <p className="sum-foot">AI summary of the strong matches&apos; IRS filings · verify details</p>
      <PublishSummary question={question} text={t.text} explore={t.explore} />
    </>
  );
}

function SummarySkeleton() {
  return <div className="sum-wait" aria-label="Writing the summary"><div className="ov-lines" aria-hidden><i /><i /><i className="short" /></div></div>;
}

// While relevance scores are still coming in: the heading and a pending count, so the card doesn't jump in later.
export function SummaryPending({ total }: { total: number }) {
  return (
    <section className="sum-card" aria-labelledby="sum-h" aria-busy="true">
      <h2 id="sum-h" className="sum-h">Summary</h2>
      <p className="sum-count pending"><span className="spinner" />Checking {total.toLocaleString("en-US")} {total === 1 ? "result" : "results"} for strong matches…</p>
      <SummarySkeleton />
    </section>
  );
}
