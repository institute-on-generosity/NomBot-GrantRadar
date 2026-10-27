import { Suspense } from "react";
import { connection } from "next/server";
import { FilterChips, type Chip } from "@/components/FilterChips";
import { RecordSearch } from "@/components/HistoryRecorder";
import { ScrollToResult } from "@/components/ScrollToResult";
import { NavLink } from "@/components/NavLink";
import { ResearchBuddy } from "@/components/ResearchBuddy";
import { ResultRow } from "@/components/ResultRow";
import { SearchSummary, SummaryPending } from "@/components/SearchSummary";
import { searchSummary } from "@/lib/searchSummary";
import { DidYouKnow } from "@/components/DidYouKnow";
import { didYouKnow } from "@/lib/overviewFacts";
import { Gems, Landscape } from "@/components/Landscape";
import { landscape } from "@/lib/landscape";
import { LandscapeTabs } from "@/components/LandscapeTabs";
import { LandscapeMap } from "@/components/LandscapeMap";
import { titleCase } from "@/components/text";
import { SearchBox } from "@/components/SearchBox";
import { parseQuestion } from "@/lib/parse";
import { PROMPT_SETS } from "@/lib/examples";
import { HeroFlip } from "@/components/HeroFlip";
import { LABEL_SLUGS, LABEL_SUBTYPES, labelName, type LabelSub } from "@/lib/labels";
import { applyOverrides, BUDGETS, MIN_BUDGETS, CAUSES, causeLabel, hasOverrides, LOADED_STATES, money, reqSlug, type Overrides } from "@/lib/filters";
import type { Filters } from "@/lib/parse";
import { isStrong, POOL, rank, searchCandidates, type Ranked } from "@/lib/rerank";
import type { Result } from "@/lib/search";
import { PrintButton, PrintStamp } from "@/components/PrintButton";
import { PersonView } from "@/components/PersonView";
import { looksLikeName, personProfile } from "@/lib/people";
import { looksLikeResearch, routeQuestion, type Routed } from "@/lib/answerRoute";
import { contentPlan } from "@/lib/answerSpec";
import { askHref } from "@/lib/researchQuestions";
import { redirect } from "next/navigation";
import { answer } from "@/lib/answer";
import { AnswerCard, AnswerSkeleton } from "@/components/AnswerCard";

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
  const overrides: Overrides = { st: p.st, city: p.city, county: p.county, region: p.region, max: p.max, min: p.min, cause: p.cause, label: p.label, tier: p.tier, sub: p.sub, drop: p.drop };
  // Content plan, per question (lib/answerSpec contentPlan):
  //   research  ("how much…", "what share…", "which states…"): redirected to /research/ask, the answer
  //             card only. No org search, landscape, AI overview or relevance scoring runs.
  //   mixed     (a specific org set asked about, "how many animal shelters in Ohio run deficits"): the card,
  //             then the matching organizations as its evidence, no landscape panel.
  //   search    everything else, and whenever the router isn't sure: list + analysis panel, as before.
  const routed = looksLikeResearch(question) ? routeQuestion(question) : null;
  const viewProps = { question, p, n, includeInactive, overrides };
  if (!routed) return <SearchView {...viewProps} />;
  return (
    <Suspense fallback={
      <>
        <div className="serp-head"><SearchBox key={question} value={question} placeholder={PLACEHOLDER} /></div>
        <div className="serp research"><div className="serp-main"><AnswerSkeleton /></div></div>
      </>
    }>
      <Planned routed={routed} {...viewProps} />
    </Suspense>
  );
}

type ViewProps = { question: string; p: Params; n: number; includeInactive: boolean; overrides: Overrides };

async function Planned({ routed, ...v }: ViewProps & { routed: Promise<Routed> }) {
  const r = await routed;
  if (!r.research) return <SearchView {...v} />;
  // Pure research questions live in the Research section (/research/ask); only mixed questions,
  // whose organizations are the evidence, stay here.
  if (contentPlan(r.spec, "ok") === "research") redirect(askHref(v.question));
  const a = await answer(v.question, r.spec).catch((err) => {
    console.error("research answer failed", err);
    return null;
  });
  if (!a) return <SearchView {...v} />; // safe default: the organizations
  const plan = contentPlan(r.spec, a.status);
  if (plan === "search") return <SearchView {...v} />;
  if (plan === "research") redirect(askHref(v.question));
  // Mixed: the card shows at once; the organizations (parse + search) stream in under it.
  return (
    <Suspense fallback={
      <>
        <div className="serp-head"><SearchBox key={v.question} value={v.question} placeholder={PLACEHOLDER} /></div>
        <div className="serp research"><div className="serp-main"><AnswerCard a={a} /><ResultsSkeleton /></div></div>
      </>
    }>
      <SearchView {...v} card={<AnswerCard a={a} />} />
    </Suspense>
  );
}

async function SearchView({ question, p, n, includeInactive, overrides, card }: ViewProps & { card?: React.ReactNode }) {
  const filters = applyOverrides(await parseQuestion(question), overrides);
  // Results show as soon as the search returns; relevance scores stream in and re-sort the list once.
  const res = await searchCandidates(filters, { includeInactive, limit: n });
  const ranking = rank(question, res, n);
  const rankingAll = n >= POOL ? ranking : rank(question, res, POOL); // the overview reads every scored candidate (same cached scores)
  // Place tiers: the panel and AI overview describe the matches (strong, across tiers), not every org in the city.
  const matched = res.tiers ? rankingAll.then(({ results }) => results.filter((r) => !r.relevance || isStrong(r))) : undefined;
  const patterns = filters.requirements.map((r) => r.pattern);
  const back = encodeURIComponent(url(p, {}));
  const focus = p.focus ?? "";
  const must = filters.requirements.map((r) => r.label).join(" + ");
  // Tiered place search (lib/tiers.ts): sections per tier, and the county one click away when nothing matches.
  const tiers = res.tiers?.map((t) => ({ tier: t.tier, title: t.title, note: t.note, total: t.total }));
  const county = res.scope?.kind === "city" && res.scope.county ? { name: res.scope.county.name, href: url(p, { county: res.scope.county.name, city: "", n: "" }) } : undefined;
  const rowProps = { patterns, back, focus, must, noMention: res.exact_total === 0, tiers, county, widened: res.widened };
  // Keyed by the search: a new filter gets a fresh boundary, so its unscored results show at once
  // instead of React keeping the old list on screen until the new scores arrive.
  const orgList = (
    <Suspense key={`results:${url(p, { n: "" })}`} fallback={<ResultList rows={res.tiers ? res.tiers.flatMap((t) => t.results.slice(0, n)) : res.results.slice(0, n)} total={res.total} pending {...rowProps} />}>
      <RankedList ranking={ranking} rankingAll={rankingAll} total={res.total} {...rowProps} />
    </Suspense>
  );
  const more = (
    <div className="more">
      {res.total > n && <NavLink href={url(p, { n: String(n + 10) })} label="Loading more…">Show more</NavLink>}
      <PrintButton label="Print summary" />
      <a href={`/export?${new URLSearchParams(Object.entries({ question, all: includeInactive ? "1" : "", ...overrides }).filter(([, v]) => v) as [string, string][])}`}>Download as spreadsheet (CSV)</a>
      <a href={`/report?${new URLSearchParams(Object.entries({ question, all: includeInactive ? "1" : "", ...overrides }).filter(([, v]) => v) as [string, string][])}`} target="_blank" rel="noreferrer">Download report</a>
      <NavLink href={url(p, { all: includeInactive ? "" : "1", n: "" })}>{includeInactive ? "Hide tiny & inactive orgs" : "Include tiny & inactive orgs"}</NavLink>
    </div>
  );

  // Summary under the search bar (no summary on mixed questions: their answer card is the summary). Same rank()
  // promises as the list, so the counts match it.
  const summary = card ? null : searchSummary(question, filters, res, ranking, rankingAll).catch((err) => { console.error("search summary failed", err); return null; });
  const top = summary && (
    <>
      <Suspense key={`summary:${url(p, {})}`} fallback={<SummaryPending total={res.total} />}>
        <SearchSummary summary={summary} question={question} />
      </Suspense>
      <Suspense key={`dyk:${url(p, { n: "" })}`} fallback={null}>
        <DidYouKnowPanel filters={filters} includeInactive={includeInactive} matched={matched} />
      </Suspense>
    </>
  );

  return (
    <>
      {/* Search bar + filters stay put; below them the results and the analysis panel scroll on their own. */}
      <div className="serp-head">
        <SearchBox key={question} value={question} placeholder={PLACEHOLDER} />
        <FilterChips chips={filterChips(filters, p)} resetHref={hasOverrides(overrides) ? url(p, { st: "", city: "", county: "", region: "", max: "", min: "", cause: "", label: "", tier: "", drop: "", n: "" }) : undefined} />
      </div>
      <RecordSearch question={question} href={url(p, {})} total={res.total} />
      {focus && <ScrollToResult id={`org-${focus}`} />}

      {res.widened && <p className="notice">Few organizations have {res.widened} as their main focus, so ones where it is one goal among others are included.</p>}
      <ResearchBuddy key={url(p, { n: "" })} convKey={url(p, { n: "" })} startOpen={p.buddy === "1"} startAsk={(p.ask ?? "").slice(0, 1000)} question={question} overrides={overrides} all={includeInactive} />

      {card ? (
        // Mixed question: the answer card, then the organizations it counts (the evidence). No landscape panel.
        <div className="serp research">
          <div className="serp-main">
            {card}
            <h2 className="answer-list-head" id="org-results">The organizations</h2>
            {orgList}
            {more}
            <Footer />
          </div>
        </div>
      ) : (
      /* Results on the left; on the right one sticky panel: AI overview + landscape views as tabs. */
      <div className="serp">
      <aside className="serp-rail" aria-label="Analysis">
        <Suspense key={`landscape:${url(p, { n: "" })}`} fallback={<LandscapeTabs views={[{ key: "overview", label: "Overview", title: "Overview", node: <RailSkeleton /> }]} />}>
          <Landscape question={question} filters={filters} includeInactive={includeInactive} total={res.total} matched={matched}
            gems={<Suspense fallback={null}><Gems ranking={rankingAll} /></Suspense>}
            map={(m) => <LandscapeMap {...m} />} />
        </Suspense>
      </aside>
      <div className="serp-main">
      {top}
      {orgList}
      {more}
      <Footer />
      </div>
      </div>
      )}
      <PrintStamp />
    </>
  );
}

// "Did you know" under the summary: 1-3 facts from the same landscape as the panel (cached, computed once).
async function DidYouKnowPanel({ filters, includeInactive, matched }: { filters: Filters; includeInactive: boolean; matched?: Promise<Result[]> }) {
  const l = await landscape(filters, includeInactive, matched ? await matched : undefined);
  if (l.size < 5) return null;
  return <DidYouKnow facts={didYouKnow(l)} />;
}

function RailSkeleton() {
  return <section className="kp-card"><div className="ov-lines" aria-hidden><i /><i className="short" /><i /></div></section>;
}

type TierHead = { tier: string; title: string; note: string; total: number };
type RowProps = { patterns: string[]; back: string; focus: string; must: string; noMention: boolean; tiers?: TierHead[]; county?: { name: string; href: string }; widened?: string };

async function RankedList({ ranking, rankingAll, total, ...p }: RowProps & { ranking: ReturnType<typeof rank>; rankingAll: ReturnType<typeof rank>; total: number }) {
  const [{ results, scored }, all] = await Promise.all([ranking, rankingAll]);
  // Strong matches across every scored candidate, not just the rows shown, so it agrees with the AI overview.
  return <ResultList rows={results} total={total} scored={scored} strongTotal={all.results.filter((r) => r.relevance && isStrong(r)).length} {...p} />;
}

// pending: search order, while relevance scores are still being computed.
// Scored lists show strong matches (relevance ≥ 50) and fold near-misses under "Show weaker matches".
function ResultList(props: RowProps & { rows: (Result | Ranked)[]; total: number; pending?: boolean; scored?: boolean; strongTotal?: number }) {
  if (props.tiers) return <TieredList {...props} tiers={props.tiers} />;
  const { rows, total, pending = false, scored = false, strongTotal, patterns, back, focus, must, noMention } = props;
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
            ? <>{noMention ? "None is a strong match either. " : "No strong matches for this question. "}These are the closest organizations. Hover “Why this result” to see what each is missing.</>
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

// Tiered place results: one section per tier (in the city, serving it from elsewhere, nearby), each ordered by
// relevance with its weaker matches folded. One notice up top when the must-mention phrase matched nothing.
function TieredList({ rows, pending = false, scored = false, patterns, back, focus, must, noMention, tiers, county }: RowProps & { tiers: TierHead[]; rows: (Result | Ranked)[]; pending?: boolean; scored?: boolean; strongTotal?: number; total: number }) {
  const row = (r: Result | Ranked, i: number) => (
    <ResultRow key={r.ein} r={r} index={i} patterns={patterns} href={`/org/${r.ein}?back=${back}`} focused={r.ein === focus}
      relevance={"relevance" in r ? r.relevance : null} />
  );
  const strongAll = rows.filter((r) => !("relevance" in r) || isStrong(r)).length;
  return (
    <div className={`results${pending ? " ranking" : ""}`}>
      <div className="bar">
        <span>{scored ? `${strongAll} strong ${strongAll === 1 ? "match" : "matches"} in ${tiers.length} ${tiers.length === 1 ? "group" : "groups"}` : `${rows.length} results in ${tiers.length} ${tiers.length === 1 ? "group" : "groups"}`}</span>
        {pending ? <span className="ranking-note"><span className="spinner" />Ranking by relevance…</span> : scored && <span>Most relevant first in each group</span>}
      </div>
      {noMention && (
        <p className="notice">
          No organization here mentions <b>{must}</b> in its filings. The lists below are the closest matches.
          {county && <> <NavLink href={county.href}>Search all of {county.name}</NavLink></>}
        </p>
      )}
      {tiers.map((t) => {
        const own = rows.filter((r) => r.place?.tier === t.tier);
        const strong = own.filter((r) => !("relevance" in r) || isStrong(r));
        const weak = own.filter((r) => "relevance" in r && !isStrong(r));
        return (
          <section key={t.tier} className="tier" aria-label={t.title}>
            <h2>{t.title}</h2>
            <p>{t.note}</p>
            {strong.length === 0 && <p className="tier-empty">{own.length ? "No strong matches here." : "No matches here."}</p>}
            {strong.map(row)}
            {weak.length > 0 && (
              <details className="weaker" open={Boolean(focus && weak.some((r) => r.ein === focus))}>
                <summary>Show {weak.length} weaker {weak.length === 1 ? "match" : "matches"} <span>relevance under 50</span></summary>
                {weak.map((r, i) => row(r, strong.length + i))}
              </details>
            )}
          </section>
        );
      })}
      {county && !noMention && <p className="tier-more"><NavLink href={county.href}>Search all of {county.name}</NavLink></p>}
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
      label: f.county && f.states.length === 1 ? `${f.cities.length === 1 ? `${titleCase(f.cities[0])} and the rest of ` : ""}${f.county.replace(/\s+county$/i, "")} County, ${f.states[0]}`
        : f.cities.length
        ? `${f.cities.map(titleCase).join(", ")}${f.states.length === 1 ? `, ${f.states[0]}` : ""}${p.county === undefined && f.cities.length === 1 ? " and nearby" : ""}`
        : f.placeLabel ?? (f.states.length > 3 ? `${f.states.length} states` : f.states.join(", ") || "Any state"),
      removeHref: f.county ? go({ city: "any", county: "" }) : f.cities.length ? go({ city: "any" }) : f.appalachia ? go({ region: "none", st: "all" }) : f.states.length ? go({ st: "all" }) : undefined,
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
        ...CAUSES.map((c) => ({ label: causeLabel(c), href: go({ cause: c }), on: f.ntee === c })),
        ...LABEL_SLUGS.map((l) => ({ label: labelName(l), href: go({ label: l, tier: "", sub: "" }), on: f.label === l, note: "Graded label, any IRS code" }))],
    },
    // Graded cause labels (climate, women and girls, substance use, housing and homelessness, tech and AI skills, racial equity, immigrants and refugees, mental health, education, health equity, animal welfare): shown when the question names one or the user picks it.
    // Primary: the cause is the org's main work. Partial adds orgs where it's one named goal among others.
    // A label with sub-types (immigrants and refugees: serving immigrants, or immigration policy groups of any stance)
    // shows which one is counted (the default unless the question or the chip picks another) and offers the others.
    ...(f.label ? [((l) => {
      const st = LABEL_SUBTYPES[l];
      const sub = st ? (f.labelSub ?? st.default) : null;
      const subText = st && sub ? `: ${sub === "all" ? "both sub-types" : st.names[sub as LabelSub].toLowerCase()}` : "";
      return {
        key: "label", kind: "set", label: `${labelName(l)}${subText}${f.labelPartial ? " (main or partial focus)" : " (main focus)"}`,
        removeHref: go({ label: "none", tier: "", sub: "" }),
        options: [
          { label: "Main focus only", href: go({ label: l, tier: "primary" }), on: !f.labelPartial, note: "The cause is most of their work" },
          { label: "Include partial focus", href: go({ label: l, tier: "all" }), on: Boolean(f.labelPartial), note: "Also orgs with one named program for it" },
          ...(st ? [...(Object.keys(st.names) as LabelSub[]).map((k) => ({ label: st.names[k], href: go({ label: l, sub: k }), on: sub === k, note: st.notes[k] })),
            { label: "Both sub-types", href: go({ label: l, sub: "all" }), on: sub === "all", note: "The whole label" }] : []),
          ...LABEL_SLUGS.filter((x) => x !== l).map((x) => ({ label: `Switch to ${labelName(x)}`, href: go({ label: x, tier: "", sub: "" }), on: false })),
          { label: "No cause label", href: go({ label: "none", tier: "", sub: "" }), on: false },
        ],
      } as Chip;
    })(f.label)] : []),
    // A preferred label ("girls mentoring and leadership programs", "ideally focused on girls"): ranks its orgs first and
    // keeps the rest. One tap makes it a filter ("only girls").
    ...(f.preferLabel && f.preferLabel !== f.label ? [((l): Chip => ({
      key: "prefer-label", kind: "set", label: `Ranks higher: ${labelName(l)}`,
      options: [{ label: `Ranks higher: ${labelName(l)}`, href: go({}), on: true, note: "Its orgs first, others still shown" },
        { label: `Only ${labelName(l)}`, href: go({ label: l, tier: "", sub: "" }), on: false, note: "Graded label, as a filter" }],
    }))(f.preferLabel)] : []),
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
      <HeroFlip key={insights ? "research" : "search"} sets={PROMPT_SETS} start={insights ? PROMPT_SETS.findIndex((s) => s.word === "research") : 0} />
      <Footer />
    </div>
  );
}

function Footer() {
  return <p className="note">Test version · covers every US state · All figures come from public IRS filings; each result links to its sources.</p>;
}
