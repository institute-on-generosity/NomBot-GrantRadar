import { Suspense } from "react";
import { connection } from "next/server";
import { Chips } from "@/components/Chips";
import { RecordSearch } from "@/components/HistoryRecorder";
import { ScrollToResult } from "@/components/ScrollToResult";
import { NavLink } from "@/components/NavLink";
import { ResultRow } from "@/components/ResultRow";
import { SearchBox } from "@/components/SearchBox";
import { parseQuestion } from "@/lib/parse";
import { search } from "@/lib/search";

type Params = { question?: string; n?: string; all?: string; focus?: string };
type SearchParams = Promise<Params>;

const PLACEHOLDER = "e.g. food banks in rural Appalachia that do workforce training, under $500K";
const ASK = "Which nonprofits are you looking for?";
const EXAMPLES = [
  "food banks in rural Appalachia that do workforce training, under $500K",
  "youth mentoring nonprofits in Kentucky under $1M",
  "animal shelters in Ohio",
  "arts organizations in West Virginia",
  "housing nonprofits in Tennessee that help veterans",
];

// Build a "/?..." URL from the current params plus changes.
function url(p: Params, change: Partial<Params>) {
  const merged = { ...p, focus: "", ...change };
  const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
  return `/?${qs}`;
}

// The shell (brand + empty search box) prerenders; everything that reads the
// query string streams in inside <Suspense>, as Cache Components requires.
export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main>
      <Suspense fallback={<Hero />}>
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
        <div className="chips suggest">{EXAMPLES.map((e) => <NavLink key={e} href={url({}, { question: e })} className="chip link" label="Reading your question…">{e}</NavLink>)}</div>
      </Hero>
    );
  }
  await connection(); // per-request work below (Claude SDK uses Math.random; DB queries)
  const n = Math.min(Math.max(Number(p.n) || 10, 10), 100);
  const includeInactive = p.all === "1";
  const filters = await parseQuestion(question);
  const res = await search({ ...filters, includeInactive, limit: n });
  const patterns = filters.requirements.map((r) => r.pattern);
  const exact = res.results.filter((r) => r.exact);
  const closest = res.results.filter((r) => !r.exact);
  const back = encodeURIComponent(url(p, {}));
  const focus = p.focus ?? "";
  const row = (r: (typeof res.results)[number], i: number) => <ResultRow key={r.ein} r={r} index={i} patterns={patterns} href={`/org/${r.ein}?back=${back}`} focused={r.ein === focus} />;
  const must = filters.requirements.map((r) => r.label).join(" + ");

  return (
    <>
      <SearchBox value={question} placeholder={PLACEHOLDER} />
      <RecordSearch question={question} href={url(p, {})} total={res.total} />
      {focus && <ScrollToResult id={`org-${focus}`} />}
      <Chips items={filters.labels} />

      <div className="bar"><span>{res.total} results</span></div>

      {res.exact_total !== null && (
        res.exact_total > 0
          ? <h2 className="group">{res.exact_total} exact {res.exact_total === 1 ? "match" : "matches"} <span>mention {must}</span></h2>
          : <p className="notice">No organizations clearly mention <b>{must}</b> in their filings. Showing the closest results.</p>
      )}
      {exact.map(row)}
      {res.exact_total !== null && res.exact_total > 0 && closest.length > 0 && <h2 className="group">Closest results</h2>}
      {closest.map(row)}

      <div className="more">
        {res.total > n && <NavLink href={url(p, { n: String(n + 10) })} label="Loading more…">Show more</NavLink>}
        <a href={`/export?${new URLSearchParams({ question, ...(includeInactive ? { all: "1" } : {}) })}`}>Download as spreadsheet (CSV)</a>
        <NavLink href={url(p, { all: includeInactive ? "" : "1", n: "" })}>{includeInactive ? "Hide tiny & inactive orgs" : "Include tiny & inactive orgs"}</NavLink>
      </div>
      <div className="ask">✦ Ask Research Buddy about these results · coming in Phase 2</div>
      <Footer />
    </>
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
