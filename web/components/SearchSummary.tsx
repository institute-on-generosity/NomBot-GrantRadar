import { Suspense } from "react";
import { Yr, yy } from "./Yr";
import { SummaryBody } from "./SummaryBody";
import { money } from "@/lib/summaryFacts";
import { Icon, type IconName } from "./Icons";

// Tier chips: the same icons as the list's tier headings.
const chipIcon = (x: string): IconName | null => / based elsewhere, /.test(x) ? "arrowIn" : / nearby, within /.test(x) ? "radius" : /^[\d,]+ based in /.test(x) ? "pin" : null;
// What each place chip means, in one line (the same words as the tier headings' tooltips, lib/place tierNote)
const chipTip = (x: string): string | undefined => {
  const elsewhere = / based elsewhere, work in (.+)$/.exec(x);
  if (elsewhere) return `Headquarters outside ${elsewhere[1]}, but their filings or grants name it`;
  if (/ nearby, within /.test(x)) return "Headquarters in a nearby ZIP code";
  const based = /^[\d,]+ based in (.+)$/.exec(x);
  return based ? `Headquarters in ${based[1]}` : undefined;
};
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
      <Suspense fallback={null}><Tiles head={summary.head} /></Suspense>
    </section>
  );
}

// The focal number big with a short noun ("42 programs"), the place tiers as small chips with their words ("9 in
// Inglewood"): icon-only counts were unreadable to testers (round-2 audit V5).
function Count({ main, parts, more, busy, strong, weaker }: { main: string; parts: string[]; more: string | null; busy?: boolean; strong?: number; weaker?: number }) {
  const [n, ...rest] = main.split(" ");
  const noun = rest.join(" ");
  return (
    <div className="sum-count" {...(busy ? { "aria-busy": "true" } : { "data-strong": strong, "data-weaker": weaker })}>
      <p className="sum-head" title={main}><b className="sum-n">{n}</b> <span>{noun}</span></p>
      {(parts.length > 0 || more) && (
        <p className="sum-parts">
          {parts.map((x) => {
            const ic = chipIcon(x);
            return ic
              ? <span key={x} className="sum-chip" title={chipTip(x)}><Icon name={ic} size={13} />{x}</span>
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

// Two small stat tiles after the line (median income, share with foundation grants; the years in the tooltip) and
// the caveat as a warning icon with its text on hover or focus.
async function Tiles({ head }: { head: Promise<SummaryHead> }) {
  const { facts: f, caveat } = await head;
  const [g0, g1] = f.grantYears;
  return (
    <p className="sum-tiles">
      {f.revenue && <span title={`Median yearly income, ${f.revenue.reported} of the ${f.strong} report it`}><Icon name="money" /><b>{money(f.revenue.median)}</b> median income<Yr title="Each organization's newest return">newest returns</Yr></span>}
      {f.strong > 0 && <span title={`Got foundation grants, ${g0} to ${g1}`}><Icon name="gift" /><b>{Math.round((100 * f.funded) / f.strong)}%</b> got foundation grants<Yr>{yy(g0, g1)}</Yr></span>}
      {caveat && <span className="sum-warn" title={caveat} tabIndex={0}><Icon name="warn" /><span className="sr-only">{caveat}</span></span>}
    </p>
  );
}

async function SummaryText({ summary, question }: { summary: Summary; question: string }) {
  const first = await summary.ai;
  // later: a promise handed to the client component, so a rewrite can stream in without holding up the first text.
  return <SummaryBody first={first} later={summary.later} question={question} />;
}

function SummarySkeleton() {
  return <div className="sum-wait" aria-label="Writing the summary"><div className="ov-lines" aria-hidden><i /><i className="short" /></div></div>;
}
