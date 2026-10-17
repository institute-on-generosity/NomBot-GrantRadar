// Search benchmark: is meaning search (vectors) worth its cost over keyword search? Runs the same 50
// questions three ways with the same filters and no Claude re-ranking, so only retrieval differs:
//   keyword  Postgres full-text (an inverted index, the same approach as Elasticsearch)
//   vector   pgvector HNSW over mission + program text
//   hybrid   both, as the app searches
// Measures quality (relevant share of the top K, and share of all relevant results found), speed and
// index size. Labels reuse eval/judgments.json (shared with npm run eval); new ones come from Claude.
//
//   npm run bench                 50 questions, top 10
//   npm run bench -- --only=10    first 10 questions
//   npm run bench -- --no-judge   only results already labeled (no Claude calls)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }

const { db } = await import("../lib/db");
const { claude, LLM_MODEL } = await import("../lib/llm");
const { parseQuestion } = await import("../lib/parse");
const { search } = await import("../lib/search");
const { historyKey } = await import("../lib/history");
const { readable } = await import("../components/text");
const { nteeLabel } = await import("../lib/ntee");

type Mode = string; // keyword | vector | hybrid | hybrid@<keyword weight> | bm25
type Hit = Awaited<ReturnType<typeof search>>["results"][number];
const KW = (process.argv.find((a) => a.startsWith("--kw="))?.split("=")[1] ?? "").split(",").filter(Boolean);  // --kw=0.1,0.25: extra hybrid weights
const BM25 = process.argv.includes("--bm25"); // OpenSearch BM25 (generosity-data etl/load_search_index.py), OPENSEARCH_URL
const OS = process.env.OPENSEARCH_URL || "http://localhost:9200";
const MODES: Mode[] = ["keyword", "vector", "hybrid", ...KW.map((w) => `hybrid@${w}`), ...(BM25 ? ["bm25"] : [])];

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}`))?.split("=")[1] ?? (process.argv.includes(`--${name}`) ? "" : undefined);
const K = Number(arg("k")) || 10;
const ONLY = Number(arg("only")) || Infinity;
const JUDGE = arg("no-judge") === undefined;
const DIR = import.meta.dirname;
const CACHE = join(DIR, "judgments.json");
const queries: { q: string; tags: string[] }[] = JSON.parse(readFileSync(join(DIR, "queries.json"), "utf8")).slice(0, ONLY);
const cache: Record<string, { relevant: boolean; why: string; model: string }> = JSON.parse(readFileSync(CACHE, "utf8"));
const key = (q: string, ein: string) => `${historyKey(q)}|${ein.replace(/\D/g, "")}`;

// Same grader as eval/run.mts, so labels are shared.
const JUDGE_SYSTEM = `You grade nonprofit search results for relevance.
A user typed a plain-language question. For each organization, decide if it is a result the user would want: its actual work (mission and programs, name, cause) matches what they asked for, including any specific activity, place or budget they named.
- Judge only from the facts given. If the description is missing, judge from the name and cause; be strict when it is ambiguous.
- Place and budget: count a clear mismatch with what the user asked (e.g. wrong state, revenue far over a stated cap) as not relevant.
- "why": one short clause, under 15 words.`;
const verdicts = z.object({ results: z.array(z.object({ id: z.string(), relevant: z.boolean(), why: z.string() })) });

async function judge(question: string, hits: Hit[]) {
  const client = claude();
  if (!client || !hits.length) return;
  const items = hits.map((r, i) => ({
    id: `r${i + 1}`, name: r.name, place: [r.city, r.state].filter(Boolean).join(", "), cause: r.ntee?.label ?? null,
    revenue: r.revenue ? `$${r.revenue.amount.toLocaleString("en-US")} (${r.revenue.year ?? "?"})` : null,
    description: readable([r.mission, r.programs].filter(Boolean).join(" ")).slice(0, 700) || null,
  }));
  const res = await client.beta.messages.parse({
    model: LLM_MODEL, max_tokens: 4096, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(verdicts) },
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: `Question: ${question}\n\nOrganizations:\n${JSON.stringify(items, null, 1)}` }],
  });
  for (const v of res.parsed_output?.results ?? []) {
    const r = hits[Number(v.id.replace(/\D/g, "")) - 1];
    if (r) cache[key(question, r.ein)] = { relevant: v.relevant, why: v.why, model: LLM_MODEL };
  }
}

type Run = { q: string; mode: Mode; ms: number; hits: Hit[] };

// The same question and filters against OpenSearch: BM25 over name (x2), mission and programs, with
// place, cause, revenue and Appalachia as filters. Required activities ("must do X") are not applied
// here (the Postgres methods rank regex matches first), so questions with one favor the Postgres side.
async function bm25(f: Awaited<ReturnType<typeof parseQuestion>>): Promise<{ results: Hit[] }> {
  const filter: object[] = [];
  if (f.states.length) filter.push({ terms: { state: f.states } });
  if (f.cities.length) filter.push({ terms: { city: f.cities.map((c) => c.toUpperCase()) } });
  if (f.appalachia) filter.push({ term: { appalachia: true } });
  if (f.ntee) filter.push({ prefix: { ntee: f.ntee } });
  if (f.maxRevenue != null) filter.push({ range: { rev: { lte: f.maxRevenue } } });
  if (f.minRevenue != null) filter.push({ range: { rev: { gte: f.minRevenue } } });
  const body = { size: K, query: { bool: {
    must: [{ multi_match: { query: f.q, fields: ["name^2", "mission", "programs"] } }],
    filter, must_not: [{ range: { rev: { lte: 0 } } }],   // hide $0 / inactive, like search()
  } } };
  const r = await fetch(`${OS}/orgs/_search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`OpenSearch ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const hits = (await r.json()).hits.hits as { _source: Record<string, string | number | null> }[];
  return { results: hits.map(({ _source: d }) => ({
    ein: `${String(d.ein).slice(0, 2)}-${String(d.ein).slice(2)}`, name: String(d.name), city: d.city as string | null, state: d.state as string | null,
    ntee: d.ntee ? { code: String(d.ntee), label: nteeLabel(String(d.ntee)) } : null,
    revenue: d.rev != null ? { amount: Number(d.rev), year: (d.rev_year as number) ?? null, source: "IRS BMF" } : null,
    mission: d.mission as string | null, programs: d.programs as string | null,
  } as unknown as Hit)) };
}

async function runQuery(q: string): Promise<Run[]> {
  const filters = await parseQuestion(q);
  const out: Run[] = [];
  for (const mode of MODES) {
    const t0 = performance.now();
    const [base, w] = mode.split("@");
    const res = mode === "bm25" ? await bm25(filters) : await search({ ...filters, mode: base as "hybrid" | "keyword" | "vector", limit: K, ...(w ? { kwWeight: Number(w) } : {}) });
    out.push({ q, mode, ms: Math.round(performance.now() - t0), hits: res.results });
  }
  // Label every result any mode returned that isn't labeled yet, in one call per question.
  const seen = new Map<string, Hit>();
  for (const r of out) for (const h of r.hits) if (!cache[key(q, h.ein)]) seen.set(h.ein, h);
  if (JUDGE && seen.size) {
    const all = [...seen.values()];
    for (let i = 0; i < all.length; i += 15) await judge(q, all.slice(i, i + 15)).catch((e) => console.error(`  judge failed: ${(e as Error).message}`));
  }
  return out;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

// Warm the embedder and connection so the first timing isn't a cold start.
await search({ q: "food bank", mode: "hybrid", limit: 1 });
console.log(`Benchmark: ${queries.length} questions × ${MODES.join(", ")}, top ${K}, judge ${JUDGE ? LLM_MODEL : "off"}`);
const runs = (await pool(queries, 3, async ({ q }, i) => {
  const r = await runQuery(q);
  console.log(`${String(i + 1).padStart(2)}. ${r.map((x) => `${x.mode} ${x.ms}ms`).join(" · ")}  ${q}`);
  return r;
})).flat();
writeFileSync(CACHE, JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 1) + "\n");

// Per question: everything any mode found that is relevant = the pool recall is measured against.
const relevantPool = new Map<string, Set<string>>();
for (const r of runs) for (const h of r.hits) if (cache[key(r.q, h.ein)]?.relevant) {
  if (!relevantPool.has(r.q)) relevantPool.set(r.q, new Set());
  relevantPool.get(r.q)!.add(h.ein);
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
const p90 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length * 0.9)] ?? 0; };

const stats = MODES.map((mode) => {
  const rs = runs.filter((r) => r.mode === mode);
  const prec = rs.map((r) => {
    const labeled = r.hits.filter((h) => cache[key(r.q, h.ein)]);
    return labeled.length ? labeled.filter((h) => cache[key(r.q, h.ein)].relevant).length / labeled.length : null;
  }).filter((x): x is number => x != null);
  const rec = rs.map((r) => {
    const poolQ = relevantPool.get(r.q);
    if (!poolQ?.size) return null;
    return r.hits.filter((h) => poolQ.has(h.ein)).length / poolQ.size;
  }).filter((x): x is number => x != null);
  return {
    mode,
    precision: prec.reduce((a, b) => a + b, 0) / (prec.length || 1),
    recall: rec.reduce((a, b) => a + b, 0) / (rec.length || 1),
    empty: rs.filter((r) => r.hits.length === 0).length,
    median: median(rs.map((r) => r.ms)), p90: p90(rs.map((r) => r.ms)),
    unlabeled: rs.reduce((a, r) => a + r.hits.filter((h) => !cache[key(r.q, h.ein)]).length, 0),
  };
});

// Storage: the vector index vs the keyword (full-text) indexes the search uses.
const { rows: sizes } = await db.query(`SELECT
  pg_relation_size('filing_latest_embedding_half_idx') AS vector,
  (SELECT coalesce(sum(pg_relation_size(i.indexrelid)), 0) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE (i.indrelid = 'orgs'::regclass AND c.relname LIKE '%search%') OR (i.indrelid = 'filing_latest'::regclass AND c.relname LIKE '%search%')) AS keyword`);
const gb = (b: number) => `${(Number(b) / 1e9).toFixed(2)} GB`;
const osSize = BM25 ? await fetch(`${OS}/orgs/_stats/store`).then((r) => r.json()).then((j) => j._all.primaries.store.size_in_bytes as number).catch(() => null) : null;

// Where the modes disagree: questions with the biggest precision gap between keyword and vector.
const perQ = queries.map(({ q }) => {
  const p = (mode: Mode) => {
    const r = runs.find((x) => x.q === q && x.mode === mode)!;
    const lab = r.hits.filter((h) => cache[key(q, h.ein)]);
    return lab.length ? lab.filter((h) => cache[key(q, h.ein)].relevant).length / lab.length : null;
  };
  return { q, by: Object.fromEntries(MODES.map((m) => [m, p(m)])) };
});

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const lines = [
  `# Search benchmark · ${stamp}`, "",
  `${queries.length} questions, top ${K}, same filters for every method, no Claude re-ranking. Judge: ${LLM_MODEL}.`, "",
  "| Method | Relevant in top 10 | Relevant found (of all found by any method) | Empty | Median time | 90th pct time | Index size |",
  "|---|---|---|---|---|---|---|",
  ...stats.map((s) => `| **${s.mode}** | ${pct(s.precision)} | ${pct(s.recall)} | ${s.empty} | ${s.median}ms | ${s.p90}ms | ${s.mode === "vector" ? gb(sizes[0].vector) : s.mode === "keyword" ? gb(sizes[0].keyword) : s.mode.startsWith("hybrid") ? gb(Number(sizes[0].vector) + Number(sizes[0].keyword)) : s.mode === "bm25" && osSize ? `${gb(osSize)} (separate service)` : "—"} |`),
  "",
  `Unlabeled results (judge off or failed): ${stats.map((s) => `${s.mode} ${s.unlabeled}`).join(", ")}.`,
  "Times include embedding the question (local nomic model) for vector and hybrid.", "",
  "## Per question", "",
  `| Question | ${MODES.join(" | ")} |`, `|---|${MODES.map(() => "---|").join("")}`,
  ...perQ.map((r) => `| ${r.q} | ${MODES.map((m) => (r.by[m] == null ? "—" : pct(r.by[m]!))).join(" | ")} |`),
  "",
];
mkdirSync(join(DIR, "results"), { recursive: true });
const out = join(DIR, "results", `bench-${stamp}.md`);
writeFileSync(out, lines.join("\n"));
console.log("\n" + lines.slice(0, 9).join("\n") + `\n\nWrote ${out}`);
await db.end();
