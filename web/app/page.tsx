import Link from "next/link";
import { Chips } from "@/components/Chips";
import { ResultRow } from "@/components/ResultRow";
import { SearchBox } from "@/components/SearchBox";
import { parseQuestion } from "@/lib/parse";
import { search } from "@/lib/search";

export default async function Home({ searchParams }: { searchParams: Promise<{ question?: string }> }) {
  const question = ((await searchParams).question ?? "").trim().slice(0, 300);
  const filters = question ? await parseQuestion(question) : null;
  const res = filters ? await search({ q: filters.q, semantic: filters.semantic, states: filters.states, maxRevenue: filters.maxRevenue, ntee: filters.ntee, limit: 10 }) : null;

  return (
    <main>
      <Link href="/" className="brand"><span className="logo">N</span>NomBot</Link>
      <SearchBox value={question} placeholder="e.g. food banks in rural Appalachia that do workforce training, under $500K" />
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
    </main>
  );
}
