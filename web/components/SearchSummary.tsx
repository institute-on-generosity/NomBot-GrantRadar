import { Suspense } from "react";
import { SummaryBody } from "./SummaryBody";
import type { Summary, SummaryHead } from "@/lib/searchSummary";

// The summary under the search bar (lib/searchSummary). The count line shows at once (what the search found) and is
// replaced by the scored one (same counts as the list) when relevance scoring finishes. The AI description (2-3
// sentences about the closest matches, checked against its inputs) streams in alongside scoring, in a live region
// with a skeleton until it arrives; SummaryBody swaps in a rewrite if scoring changes the set a lot. One computed
// caveat when it matters.
export function SearchSummary({ summary, question }: { summary: Summary; question: string }) {
  const p = summary.pending;
  return (
    <section className="sum-card" aria-labelledby="sum-h">
      <h2 id="sum-h" className="sum-h">Summary</h2>
      <Suspense fallback={
        <p className="sum-count" aria-busy="true">
          <b>{p.main}</b>
          {p.parts.map((x) => <span key={x}><i aria-hidden> · </i>{x}</span>)}
          <span className="sum-more"><i aria-hidden> · </i><span className="spinner" />{p.more}</span>
        </p>
      }>
        <ScoredCount head={summary.head} />
      </Suspense>
      <div aria-live="polite">
        <Suspense fallback={<SummarySkeleton />}><SummaryText summary={summary} question={question} /></Suspense>
      </div>
      <Suspense fallback={null}><Caveat head={summary.head} /></Suspense>
    </section>
  );
}

async function ScoredCount({ head }: { head: Promise<SummaryHead> }) {
  const { line, facts } = await head;
  return (
    <p className="sum-count" data-strong={facts.strong} data-weaker={facts.weaker}>
      <b>{line.main}</b>
      {line.parts.map((p) => <span key={p}><i aria-hidden> · </i>{p}</span>)}
      {line.more && <span className="sum-more"><i aria-hidden> · </i>{line.more}</span>}
    </p>
  );
}

async function Caveat({ head }: { head: Promise<SummaryHead> }) {
  const { caveat } = await head;
  return caveat ? <p className="sum-caveat">{caveat}</p> : null;
}

async function SummaryText({ summary, question }: { summary: Summary; question: string }) {
  const first = await summary.ai;
  // later: a promise handed to the client component, so a rewrite can stream in without holding up the first text.
  return <SummaryBody first={first} later={summary.later} question={question} />;
}

function SummarySkeleton() {
  return <div className="sum-wait" aria-label="Writing the summary"><div className="ov-lines" aria-hidden><i /><i /><i className="short" /></div></div>;
}
