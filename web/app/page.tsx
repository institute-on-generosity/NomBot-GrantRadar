import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Chips } from "@/components/Chips";
import { ResultRow } from "@/components/ResultRow";
import { SearchBox } from "@/components/SearchBox";
import { parseQuestion } from "@/lib/parse";
import { search } from "@/lib/search";

type SearchParams = Promise<{ question?: string }>;

const PLACEHOLDER = "e.g. food banks in rural Appalachia that do workforce training, under $500K";

// The shell (brand + empty search box) prerenders; everything that reads the
// query string streams in inside <Suspense>, as Cache Components requires.
export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main>
      <Link href="/" className="brand"><span className="logo">N</span>NomBot</Link>
      <Suspense fallback={<SearchBox value="" placeholder={PLACEHOLDER} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const question = ((await searchParams).question ?? "").trim().slice(0, 300);
  if (question) await connection(); // per-request work below (Claude SDK uses Math.random; DB queries)
  const filters = question ? await parseQuestion(question) : null;
  const res = filters ? await search({ q: filters.q, semantic: filters.semantic, states: filters.states, maxRevenue: filters.maxRevenue, ntee: filters.ntee, limit: 10 }) : null;

  return (
    <>
      <SearchBox value={question} placeholder={PLACEHOLDER} />
      {filters && <Chips items={filters.labels} />}
      {res && (
        <>
          <div className="count">{res.total} results</div>
          {res.results.map((r) => (
            <ResultRow key={r.ein} name={r.name} place={`${r.city ? r.city.toLowerCase().replace(/\b[a-z]/g, (c: string) => c.toUpperCase()) + ", " : ""}${r.state}`} line={r.mission} amount={r.financials?.revenue} />
          ))}
          <div className="ask">✦ Ask Research Buddy about these results · coming in Phase 2</div>
          <p className="note">Parser: {filters?.parser === "llm" ? "Claude" : "rules (no ANTHROPIC_API_KEY set)"} · Semantic: {res.semantic ? res.model : "off"} · Data: IRS BMF, SOI, 990 e-file (POC: WV, KY, TN, VA, OH)</p>
        </>
      )}
    </>
  );
}
