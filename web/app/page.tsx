import { Suspense } from "react";
import { connection } from "next/server";
import { FilterChips, type Chip } from "@/components/FilterChips";
import { RecordSearch } from "@/components/HistoryRecorder";
import { ScrollToResult } from "@/components/ScrollToResult";
import { NavLink } from "@/components/NavLink";
import { ResearchBuddy } from "@/components/ResearchBuddy";
import { ResultRow } from "@/components/ResultRow";
import { AiOverview, AiOverviewSkeleton } from "@/components/AiOverview";
import { overview } from "@/lib/overview";
import { Gems, Landscape } from "@/components/Landscape";
import { landscape } from "@/lib/landscape";
import { LandscapeTabs } from "@/components/LandscapeTabs";
import { LandscapeMap } from "@/components/LandscapeMap";
import { titleCase } from "@/components/text";
import { SearchBox } from "@/components/SearchBox";
import { parseQuestion } from "@/lib/parse";
import { PROMPT_SETS } from "@/lib/examples";
import { HeroFlip } from "@/components/HeroFlip";
import { applyOverrides, BUDGETS, MIN_BUDGETS, CAUSES, causeLabel, hasOverrides, LOADED_STATES, money, reqSlug, type Overrides } from "@/lib/filters";
import type { Filters } from "@/lib/parse";
import { isStrong, POOL, rank, searchCandidates, type Ranked } from "@/lib/rerank";
import type { Result } from "@/lib/search";
import { PrintButton, PrintStamp } from "@/components/PrintButton";
import { PersonView } from "@/components/PersonView";
import { looksLikeName, personProfile } from "@/lib/people";

type Params = { question?: string; n?: string; all?: string; focus?: string; buddy?: string; as?: string; ask?: string; tab?: string } & Overrides;
type SearchParams = Promise<Params>;

const PLACEHOLDER = "e.g. food banks in rural Appalachia that do workforce training, under $500K";

// Build a "/?..." URL from the current params plus changes.
function url(p: Params, change: Partial<Params>) {
  const merged = { ...p, focus: "", buddy: "", ask: "", ...change };
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
      <Hero insights={p.tab === "research" || p.tab === "insights"} />
    );
  }
  await connection(); // per-request work below (Claude SDK uses Math.random; DB queries)
  // A person's name ("Darren Walker"): their board seats, straight from the IRS board lists (no Claude
  // calls). "as=topic" searches organizations for the same words instead.
  if (p.as !== "topic" && looksLikeName(question)) {
    const profile = await personProfile(question);
    if (profile.seats.length) {
      return (
        <>
          <div className="serp-head"><SearchBox key={question} value={question} placeholder={PLACEHOLDER} /></div>
          <RecordSearch question={question} href={url(p, {})} total={profile.seats.length} />
          <PersonView name={question} profile={profile} topicHref={url(p, { as: "topic" })} />
          <Footer />
        </>
      );
    }
  }
  const n = Math.min(Math.max(Number(p.n) || 10, 10), 100);
  const includeInactive = p.all === "1";
  const overrides: Overrides = { st: p.st, city: p.city, region: p.region, max: p.max, min: p.min, cause: p.cause, drop: p.drop };
  const filters = applyOverrides(await parseQuestion(question), overrides);
  // Results show as soon as the search returns; relevance scores stream in and re-sort the list once.
  const res = await searchCandidates(filters, { includeInactive, limit: n });
  const ranking = rank(question, res, n);
  const rankingAll = n >= POOL ? ranking : rank(question, res, POOL); // the overview reads every scored candidate (same cached scores)
  const patterns = filters.requirements.map((r) => r.pattern);
  const back = encodeURIComponent(url(p, {}));
  const focus = p.focus ?? "";
  const must = filters.requirements.map((r) => r.label).join(" + ");
  const rowProps = { patterns, back, focus, must, noMention: res.exact_total === 0 };

  return (
    <>
      {/* Search bar + filters stay put; below them the results and the analysis panel scroll on their own. */}
      <div className="serp-head">
        <SearchBox key={question} value={question} placeholder={PLACEHOLDER} />
        <FilterChips chips={filterChips(filters, p)} resetHref={hasOverrides(overrides) ? url(p, { st: "", city: "", region: "", max: "", min: "", cause: "", drop: "", n: "" }) : undefined} />
      </div>
      <RecordSearch question={question} href={url(p, {})} total={res.total} />
      {focus && <ScrollToResult id={`org-${focus}`} />}

      <ResearchBuddy key={url(p, { n: "" })} convKey={url(p, { n: "" })} startOpen={p.buddy === "1"} startAsk={(p.ask ?? "").slice(0, 1000)} question={question} overrides={overrides} all={includeInactive} />


      {/* Results on the left; on the right one sticky panel: AI overview + landscape views as tabs. */}
      <div className="serp">
      <aside className="serp-rail" aria-label="Analysis">
        <Suspense key={`landscape:${url(p, { n: "" })}`} fallback={<LandscapeTabs views={[{ key: "overview", label: "Overview", title: "AI overview", node: <AiOverviewSkeleton /> }]} />}>
          <Landscape question={question} filters={filters} includeInactive={includeInactive} total={res.total}
            overview={(v) => <Suspense fallback={<AiOverviewSkeleton compact={v.visual} />}><OverviewPanel question={question} ranking={rankingAll} filters={filters} includeInactive={includeInactive} {...v} /></Suspense>}
            gems={<Suspense fallback={null}><Gems ranking={rankingAll} /></Suspense>}
            map={(m) => <LandscapeMap {...m} />} />
        </Suspense>
      </aside>
      <div className="serp-main">
      {/* Keyed by the search: a new filter gets a fresh boundary, so its unscored results show at once
          instead of React keeping the old list on screen until the new scores arrive. */}
      <Suspense key={`results:${url(p, { n: "" })}`} fallback={<ResultList rows={res.results.slice(0, n)} total={res.total} pending {...rowProps} />}>
        <RankedList ranking={ranking} rankingAll={rankingAll} total={res.total} {...rowProps} />
      </Suspense>

      <div className="more">
        {res.total > n && <NavLink href={url(p, { n: String(n + 10) })} label="Loading more…">Show more</NavLink>}
        <PrintButton label="Print summary" />
        <a href={`/export?${new URLSearchParams(Object.entries({ question, all: includeInactive ? "1" : "", ...overrides }).filter(([, v]) => v) as [string, string][])}`}>Download as spreadsheet (CSV)</a>
        <NavLink href={url(p, { all: includeInactive ? "" : "1", n: "" })}>{includeInactive ? "Hide tiny & inactive orgs" : "Include tiny & inactive orgs"}</NavLink>
      </div>
      <Footer />
      </div>
      </div>
      <PrintStamp />
    </>
  );
}

async function OverviewPanel({ question, ranking, filters, includeInactive, visual, story }: { question: string; ranking: ReturnType<typeof rank>; filters: Filters; includeInactive: boolean; visual: boolean; story?: string }) {
  // County need for the AI overview: high-poverty counties with none of the 200 closest organizations.
  const l = await landscape(filters, includeInactive);
  const need = l.highNeed ? `Need (Census SAIPE 2023 poverty): ${l.highNeed} counties in the area have ${l.povertyCut}%+ poverty (the poorest quarter, up to 20%); ${l.underserved.length} of them have none of the 200 closest organizations (worst: ${l.underserved.slice(0, 3).map((c) => `${c.name}, ${c.state} ${c.poverty}%`).join("; ") || "none"})` : undefined;
  const o = await overview(question, (await ranking).results, need, story);
  return o ? <AiOverview o={o} question={question} visual={visual} /> : visual ? null : <p className="ls-note">No overview for these results.</p>;
}

type RowProps = { patterns: string[]; back: string; focus: string; must: string; noMention: boolean };

async function RankedList({ ranking, rankingAll, total, ...p }: RowProps & { ranking: ReturnType<typeof rank>; rankingAll: ReturnType<typeof rank>; total: number }) {
  const [{ results, scored }, all] = await Promise.all([ranking, rankingAll]);
  // Strong matches across every scored candidate, not just the rows shown, so it agrees with the AI overview.
  return <ResultList rows={results} total={total} scored={scored} strongTotal={all.results.filter((r) => r.relevance && isStrong(r)).length} {...p} />;
}

// pending: search order, while relevance scores are still being computed.
// Scored lists show strong matches (relevance ≥ 50) and fold near-misses under "Show weaker matches".
function ResultList({ rows, total, pending = false, scored = false, strongTotal, patterns, back, focus, must, noMention }: RowProps & { rows: (Result | Ranked)[]; total: number; pending?: boolean; scored?: boolean; strongTotal?: number }) {
  const strong = rows.filter((r) => !("relevance" in r) || isStrong(r));
  const weak = rows.filter((r) => "relevance" in r && !isStrong(r));
  const row = (r: Result | Ranked, i: number) => (
    <ResultRow key={r.ein} r={r} index={i} patterns={patterns} href={`/org/${r.ein}?back=${back}`} focused={r.ein === focus}
      relevance={"relevance" in r ? r.relevance : null} />
  );
  return (
    <div className={`results${pending ? " ranking" : ""}`}>
      <div className="bar">
        <span>{scored ? `${strongTotal ?? strong.length} strong ${(strongTotal ?? strong.length) === 1 ? "match" : "matches"} · ${total.toLocaleString("en-US")} related` : `${total.toLocaleString("en-US")} results`}</span>
        {pending ? <span className="ranking-note"><span className="spinner" />Ranking by relevance…</span> : scored && <span>Most relevant first</span>}
      </div>
      {/* One notice: what's missing (the must-mention phrase, strong matches, or both) */}
      {(noMention || (strong.length === 0 && weak.length > 0)) && (
        <p className="notice">
          {noMention && <>No organizations clearly mention <b>{must}</b> in their filings. </>}
          {strong.length === 0 && weak.length > 0
            ? <>{noMention ? "None is a strong match either. " : "No strong matches for this question. "}These are the closest organizations: hover a score to see what each is missing.</>
            : "Showing the closest results."}
        </p>
      )}
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
      key: "budget", kind: f.maxRevenue || f.minRevenue ? "set" : "unset",
      label: f.maxRevenue ? `Under ${money(f.maxRevenue)}` : f.minRevenue ? `${money(f.minRevenue)} or more` : "Any size",
      removeHref: f.maxRevenue || f.minRevenue ? go({ max: "none", min: "none" }) : undefined,
      options: [{ label: "Any size", href: go({ max: "none", min: "none" }), on: !f.maxRevenue && !f.minRevenue },
        ...BUDGETS.map((b) => ({ label: `Under ${money(b)}`, href: go({ max: String(b), min: "" }), on: f.maxRevenue === b })),
        // Larger, established organizations: for a small gift, less to check before giving.
        ...MIN_BUDGETS.map((b, i) => ({ label: `${money(b)} or more`, href: go({ min: String(b), max: "" }), on: f.minRevenue === b, note: i === 0 ? "Established. Good for a small gift" : undefined }))],
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
function Hero({ insights }: { insights: boolean }) {
  return (
    <div className="hero">
      <HeroFlip key={insights ? "insights" : "search"} sets={PROMPT_SETS} startInsights={insights} />
      <Footer />
    </div>
  );
}

function Footer() {
  return <p className="note">Test version · covers every US state · All figures come from public IRS filings; each result links to its sources.</p>;
}
