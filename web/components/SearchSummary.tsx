import { Suspense } from "react";
import { SummaryBody } from "./SummaryBody";
import { Icon, type IconName } from "./Icons";

// Tier chips: the same icons as the list's tier headings.
const chipIcon = (x: string): IconName | null => / serving /.test(x) ? "arrowIn" : / nearby$/.test(x) ? "radius" : /^[\d,]+ in /.test(x) ? "pin" : null;
import type { Summary, SummaryHead } from "@/lib/searchSummary";

// The summary under the search bar (lib/searchSummary). The count (the focal number) shows at once and is
// replaced by the scored one (same counts as the list) when relevance scoring finishes. The AI lead (one
// sentence about the closest matches, checked against its inputs) streams in alongside scoring, in a live region
// with a skeleton; SummaryBody swaps in a rewrite if scoring changes the set a lot. Then computed points (size,
// grants, the largest strong matches) and one caveat when it matters.
export function SearchSummary({ summary, question }: { summary: Summary; question: string }) {
  const p = summary.pending;
  return (
    <section className="sum-card" aria-labelledby="sum-h">
      <h2 id="sum-h" className="sr-only">Summary</h2>
      <Suspense fallback={<Count main={p.main} parts={p.parts} more={p.more} busy />}>
        <ScoredCount head={summary.head} />
      </Suspense>
      <div aria-live="polite">
        <Suspense fallback={<SummarySkeleton />}><SummaryText summary={summary} question={question} /></Suspense>
      </div>
      <Suspense fallback={null}><Caveat head={summary.head} /></Suspense>
    </section>
  );
}

// The focal number big with a short noun ("42 programs"), the place tiers as icon chips (the words in the tooltip).
function Count({ main, parts, more, busy, strong, weaker }: { main: string; parts: string[]; more: string | null; busy?: boolean; strong?: number; weaker?: number }) {
  const [n, ...rest] = main.split(" ");
  const noun = rest.length > 2 ? rest[rest.length - 1] : rest.join(" ");
  return (
    <div className="sum-count" {...(busy ? { "aria-busy": "true" } : { "data-strong": strong, "data-weaker": weaker })}>
      <p className="sum-head" title={main}><b className="sum-n">{n}</b> <span>{noun}</span></p>
      {(parts.length > 0 || more) && (
        <p className="sum-parts">
          {parts.map((x) => {
            const ic = chipIcon(x);
            return ic
              ? <span key={x} className="sum-chip" title={x} aria-label={x}><Icon name={ic} size={13} />{x.split(" ")[0]}</span>
              : <span key={x} className="sum-chip">{x}</span>;
          })}
          {more && <span className="sum-more">{busy && <span className="spinner" />}{busy ? "ranking…" : more}</span>}
        </p>
      )}
    </div>
  );
}

async function ScoredCount({ head }: { head: Promise<SummaryHead> }) {
  const { line, facts } = await head;
  return <Count main={line.main} parts={line.parts} more={line.more} strong={facts.strong} weaker={facts.weaker} />;
}

// The one caveat, as a warning icon with its text on hover or focus (figures live in the panel's Key facts).
async function Caveat({ head }: { head: Promise<SummaryHead> }) {
  const { caveat } = await head;
  return caveat ? <p className="sum-warn" title={caveat} tabIndex={0}><Icon name="warn" /><span className="sr-only">{caveat}</span></p> : null;
}

async function SummaryText({ summary, question }: { summary: Summary; question: string }) {
  const first = await summary.ai;
  // later: a promise handed to the client component, so a rewrite can stream in without holding up the first text.
  return <SummaryBody first={first} later={summary.later} question={question} />;
}

function SummarySkeleton() {
  return <div className="sum-wait" aria-label="Writing the summary"><div className="ov-lines" aria-hidden><i /><i className="short" /></div></div>;
}
