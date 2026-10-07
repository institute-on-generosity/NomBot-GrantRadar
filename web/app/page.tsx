import { Suspense } from "react";
import { connection } from "next/server";
import { FilterChips, type Chip } from "@/components/FilterChips";
import { RecordSearch } from "@/components/HistoryRecorder";
import { ScrollToResult } from "@/components/ScrollToResult";
import { NavLink } from "@/components/NavLink";
import { ResearchBuddy } from "@/components/ResearchBuddy";
import { ResultRow } from "@/components/ResultRow";
import { titleCase } from "@/components/text";
import { SearchBox } from "@/components/SearchBox";
import { parseQuestion } from "@/lib/parse";
import { EXAMPLES } from "@/lib/examples";
import { applyOverrides, BUDGETS, describeFilters, CAUSES, causeLabel, hasOverrides, LOADED_STATES, money, reqSlug, type Overrides } from "@/lib/filters";
import type { Filters } from "@/lib/parse";
import { isStrong, rank, searchCandidates, type Ranked } from "@/lib/rerank";
import type { Result } from "@/lib/search";

type Params = { question?: string; n?: string; all?: string; focus?: string; buddy?: string } & Overrides;
type SearchParams = Promise<Params>;

const PLACEHOLDER = "e.g. food banks in rural Appalachia that do workforce training, under $500K";
const ASK = "Which nonprofits are you looking for?";

// Build a "/?..." URL from the current params plus changes.
function url(p: Params, change: Partial<Params>) {
  const merged = { ...p, focus: "", buddy: "", ...change };
  const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
  return `/?${qs}`;
}

// The shell (brand + empty search box) prerenders; everything that reads the
// query string streams in inside <Suspense>, as Cache Components requires.
export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const question = (p.question ?? "").trim().slice(0, 300);
  if (!question) {
    return (
      <Hero>
        <div className="chips suggest">{EXAMPLES.slice(0, 5).map((e) => <NavLink key={e} href={url({}, { question: e })} className="chip link" label="Reading your question…" search>{e}</NavLink>)}</div>
      </Hero>
    );
  }
  await connection(); // per-request work below (Claude SDK uses Math.random; DB queries)
  const n = Math.min(Math.max(Number(p.n) || 10, 10), 100);
  const includeInactive = p.all === "1";
  const overrides: Overrides = { st: p.st, city: p.city, region: p.region, max: p.max, cause: p.cause, drop: p.drop };
  const filters = applyOverrides(await parseQuestion(question), overrides);
  // Results show as soon as the search returns; relevance scores stream in and re-sort the list once.
  const res = await searchCandidates(filters, { includeInactive, limit: n });
  const ranking = rank(question, res, n);
  const patterns = filters.requirements.map((r) => r.pattern);
  const back = encodeURIComponent(url(p, {}));
  const focus = p.focus ?? "";
  const shown = describeFilters(filters);
  const must = filters.requirements.map((r) => r.label).join(" + ");
  const rowProps = { question, patterns, back, focus, must, shown };

  return (
    <>
      <SearchBox key={question} value={question} placeholder={PLACEHOLDER} />
      <RecordSearch question={question} href={url(p, {})} total={res.total} />
      {focus && <ScrollToResult id={`org-${focus}`} />}
      <FilterChips chips={filterChips(filters, p)} resetHref={hasOverrides(overrides) ? url(p, { st: "", city: "", region: "", max: "", cause: "", drop: "", n: "" }) : undefined} />

      <ResearchBuddy key={url(p, { n: "" })} convKey={url(p, { n: "" })} startOpen={p.buddy === "1"} question={question} overrides={overrides} all={includeInactive} />

      {res.exact_total === 0 && <p className="notice">No organizations clearly mention <b>{must}</b> in their filings. Showing the closest results.</p>}
      <Suspense fallback={<ResultList rows={res.results.slice(0, n)} total={res.total} pending {...rowProps} />}>
        <RankedList ranking={ranking} total={res.total} {...rowProps} />
      </Suspense>

      <div className="more">
        {res.total > n && <NavLink href={url(p, { n: String(n + 10) })} label="Loading more…">Show more</NavLink>}
        <a href={`/export?${new URLSearchParams(Object.entries({ question, all: includeInactive ? "1" : "", ...overrides }).filter(([, v]) => v) as [string, string][])}`}>Download as spreadsheet (CSV)</a>
        <NavLink href={url(p, { all: includeInactive ? "" : "1", n: "" })}>{includeInactive ? "Hide tiny & inactive orgs" : "Include tiny & inactive orgs"}</NavLink>
      </div>
      <Footer />
    </>
  );
}

type RowProps = { question: string; patterns: string[]; back: string; focus: string; must: string; shown: Record<string, unknown> };

async function RankedList({ ranking, total, ...p }: RowProps & { ranking: ReturnType<typeof rank>; total: number }) {
  const { results, scored } = await ranking;
  return <ResultList rows={results} total={total} scored={scored} {...p} />;
}

// pending: search order, while relevance scores are still being computed.
// Scored lists show strong matches (relevance ≥ 50) and fold near-misses under "Show weaker matches".
function ResultList({ rows, total, pending = false, scored = false, question, patterns, back, focus, must, shown }: RowProps & { rows: (Result | Ranked)[]; total: number; pending?: boolean; scored?: boolean }) {
  const strong = rows.filter((r) => !("relevance" in r) || isStrong(r));
  const weak = rows.filter((r) => "relevance" in r && !isStrong(r));
  const row = (r: Result | Ranked, i: number) => (
    <ResultRow key={r.ein} r={r} index={i} patterns={patterns} href={`/org/${r.ein}?back=${back}`} focused={r.ein === focus}
      relevance={"relevance" in r ? r.relevance : null} mentions={r.exact ? must : undefined} feedback={{ question, rank: i + 1, filters: shown }} />
  );
  return (
    <div className={`results${pending ? " ranking" : ""}`}>
      <div className="bar">
        <span>{scored ? `${strong.length} strong ${strong.length === 1 ? "match" : "matches"} · ${total.toLocaleString("en-US")} related` : `${total.toLocaleString("en-US")} results`}</span>
        {pending ? <span className="ranking-note"><span className="spinner" />Ranking by relevance…</span> : scored && <span>Most relevant first</span>}
      </div>
      {strong.length === 0 && weak.length > 0 && <p className="notice">No strong matches for this question. These are the closest organizations, and each falls short somewhere: hover a score to see why.</p>}
      {strong.map(row)}
      {strong.length > 0 && weak.length > 0 && (
        <details className="weaker" open={Boolean(focus && weak.some((r) => r.ein === focus))}>
          <summary>Show {weak.length} weaker {weak.length === 1 ? "match" : "matches"} <span>relevance under 50</span></summary>
          {weak.map((r, i) => row(r, strong.length + i))}
        </details>
      )}
      {strong.length === 0 && weak.map(row)}
    </div>
  );
}

// Chips for the filters in effect. Each change keeps the question and starts from the top.
function filterChips(f: Filters, p: Params): Chip[] {
  const go = (change: Partial<Params>) => url(p, { n: "", ...change });
  const dropped = p.drop ? p.drop.split(",") : [];
  return [
    ...(f.topic ? [{ key: "topic", kind: "topic", label: f.topic } as Chip] : []),
    {
      key: "place", kind: f.states.length || f.appalachia ? "set" : "unset",
      label: f.cities.length
        ? `${f.cities.map(titleCase).join(", ")}${f.states.length === 1 ? `, ${f.states[0]}` : ""}`
        : f.placeLabel ?? (f.states.length > 3 ? `${f.states.length} states` : f.states.join(", ") || "Any state"),
      removeHref: f.cities.length ? go({ city: "any" }) : f.appalachia ? go({ region: "none", st: "all" }) : f.states.length ? go({ st: "all" }) : undefined,
      options: [
        ...(f.cities.length && f.states.length === 1 ? [{ label: `Anywhere in ${LOADED_STATES.find(([c]) => c === f.states[0])?.[1] ?? f.states[0]}`, href: go({ city: "any" }), on: false }] : []),
        { label: "Any state", href: go({ st: "all", region: "none" }), on: !f.states.length && !f.appalachia },
        { label: "Appalachia", href: go({ region: "appalachia", st: "", city: "" }), on: Boolean(f.appalachia) },
        ...LOADED_STATES.map(([code, name]) => ({ label: name, href: go({ st: code }), on: !f.cities.length && !f.appalachia && f.states.length === 1 && f.states[0] === code }))],
    },
    {
      key: "budget", kind: f.maxRevenue ? "set" : "unset",
      label: f.maxRevenue ? `Under ${money(f.maxRevenue)}` : "Any size",
      removeHref: f.maxRevenue ? go({ max: "none" }) : undefined,
      options: [{ label: "Any size", href: go({ max: "none" }), on: !f.maxRevenue },
        ...BUDGETS.map((b) => ({ label: `Under ${money(b)}`, href: go({ max: String(b) }), on: f.maxRevenue === b }))],
    },
    {
      key: "cause", kind: f.ntee ? "set" : "unset",
      label: f.ntee ? causeLabel(f.ntee) : "Any cause",
      removeHref: f.ntee ? go({ cause: "any" }) : undefined,
      options: [{ label: "Any cause", href: go({ cause: "any" }), on: !f.ntee },
        ...CAUSES.map((c) => ({ label: causeLabel(c), href: go({ cause: c }), on: f.ntee === c }))],
    },
    ...f.requirements.map((r): Chip => ({
      key: `must-${reqSlug(r.label)}`, kind: "must", label: `Must mention: ${r.label}`,
      removeHref: go({ drop: [...dropped, reqSlug(r.label)].join(",") }),
    })),
  ];
}

// Shown only while a question loads. Hidden for the first 300ms (CSS) so quick loads
// and the empty home page never flash it.
function ResultsSkeleton() {
  return (
    <div className="skeleton" aria-hidden>
      <div className="sk sk-bar" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="sk-row"><div className="sk sk-title" /><div className="sk sk-line" /><div className="sk sk-line short" /></div>)}
    </div>
  );
}

// Empty home page: greeting and composer centered on screen, like Claude's new chat.
function Hero({ children }: { children?: React.ReactNode }) {
  return (
    <div className="hero">
      <h1 className="greet"><span className="logo">N</span>{ASK}</h1>
      <SearchBox value="" placeholder={PLACEHOLDER} big />
      {children}
      <Footer />
    </div>
  );
}

function Footer() {
  return <p className="note">Test version · covers WV, KY, TN, VA, OH · All figures come from public IRS filings; each result links to its sources.</p>;
}
