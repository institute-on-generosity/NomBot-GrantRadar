// Search eval (.mts: an ES module, for top-level await): run fixed questions through the real parser + search, judge the
// strong matches people see (relevance ≥ 50 in the top 10), and report how many are relevant (goal: ≥90%).
//
//   npm run eval                 all 50 questions, top 10 each
//   npm run eval -- --only=5     first 5 questions
//   npm run eval -- --k=5        judge the top 5 instead of 10
//   npm run eval -- --no-judge   only use labels we already have (no Claude calls)
//   npm run eval -- --rejudge    ignore cached Claude judgments
//
// Labels, in priority order: people's 👍/👎 (feedback table) > cached Claude judgments
// (eval/judgments.json, committed so scores are stable) > a fresh Claude judgment.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }

// Imported after the env file loads: these read DATABASE_URL / ANTHROPIC_API_KEY.
const { db } = await import("../lib/db");
const { claude, LLM_MODEL } = await import("../lib/llm");
const { parseQuestion } = await import("../lib/parse");
const { isStrong, rankedSearch } = await import("../lib/rerank");
const { describeFilters } = await import("../lib/filters");
const { historyKey } = await import("../lib/history");
const { readable } = await import("../components/text");

type Result = Awaited<ReturnType<typeof rankedSearch>>["results"][number];
type Label = { relevant: boolean; why: string; by: "people" | "claude" };

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}`))?.split("=")[1] ?? (process.argv.includes(`--${name}`) ? "" : undefined);
const K = Number(arg("k")) || 10;
const ONLY = Number(arg("only")) || Infinity;
const JUDGE = arg("no-judge") === undefined;
const REJUDGE = arg("rejudge") !== undefined;
const GOAL = 0.9;

const DIR = import.meta.dirname;
const CACHE = join(DIR, "judgments.json");
const queries: { q: string; tags: string[] }[] = JSON.parse(readFileSync(join(DIR, "queries.json"), "utf8")).slice(0, ONLY);
const cache: Record<string, { relevant: boolean; why: string; model: string }> = REJUDGE ? {} : JSON.parse(safeRead(CACHE) ?? "{}");
const labelKey = (q: string, ein: string) => `${historyKey(q)}|${ein.replace(/\D/g, "")}`;

function safeRead(path: string) { try { return readFileSync(path, "utf8"); } catch { return null; } }

// People's votes: net 👍 minus 👎 per (question, org).
async function peopleLabels(): Promise<Map<string, number>> {
  try {
    const { rows } = await db.query("SELECT question_key, ein, sum(vote)::int AS net FROM feedback GROUP BY 1, 2");
    return new Map(rows.filter((r) => r.net !== 0).map((r) => [`${r.question_key}|${r.ein}`, r.net]));
  } catch { return new Map(); } // no feedback table yet
}

const JUDGE_SYSTEM = `You grade nonprofit search results for relevance.
A user typed a plain-language question. For each organization, decide if it is a result the user would want: its actual work (mission and programs, name, cause) matches what they asked for, including any specific activity, place or budget they named.
- Judge only from the facts given. If the description is missing, judge from the name and cause; be strict when it is ambiguous.
- Place and budget: count a clear mismatch with what the user asked (e.g. wrong state, revenue far over a stated cap) as not relevant.
- "why": one short clause, under 15 words.`;

const verdicts = z.object({ results: z.array(z.object({ id: z.string(), relevant: z.boolean(), why: z.string() })) });

async function judge(question: string, results: Result[]): Promise<Map<string, Label>> {
  const client = claude();
  const out = new Map<string, Label>();
  if (!client || !results.length) return out;
  // Short ids ("r1"…) are copied back reliably; EINs sometimes come back altered.
  const items = results.map((r, i) => ({
    id: `r${i + 1}`, name: r.name, place: [r.city, r.state].filter(Boolean).join(", "), cause: r.ntee?.label ?? null,
    revenue: r.revenue ? `$${r.revenue.amount.toLocaleString("en-US")} (${r.revenue.year ?? "?"})` : null,
    description: readable([r.mission, r.programs].filter(Boolean).join(" ")).slice(0, 700) || null,
  }));
  const res = await client.beta.messages.parse({
    model: LLM_MODEL,
    max_tokens: 4096,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(verdicts) },
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: `Question: ${question}\n\nOrganizations:\n${JSON.stringify(items, null, 1)}` }],
  });
  for (const v of res.parsed_output?.results ?? []) {
    const r = results[Number(v.id.replace(/\D/g, "")) - 1];
    if (r) out.set(r.ein, { relevant: v.relevant, why: v.why, by: "claude" });
  }
  if (out.size < results.length) console.error(`  judge labeled ${out.size}/${results.length} for "${question}" (stop: ${res.stop_reason})`);
  return out;
}

type Row = {
  q: string; tags: string[]; parser: string; filters: ReturnType<typeof describeFilters>; ms: number; total: number; folded: number;
  shown: { rank: number; ein: string; name: string; place: string; score: number | null; label: Label | null }[];
};

async function runOne({ q, tags }: { q: string; tags: string[] }, people: Map<string, number>): Promise<Row> {
  const t0 = performance.now();
  const filters = await parseQuestion(q);
  const all = await rankedSearch(q, filters, { limit: K });
  // Score what people see: strong matches. Near-misses sit behind "Show weaker matches".
  const res = { ...all, results: all.results.filter(isStrong) };
  const ms = Math.round(performance.now() - t0);

  const labels = new Map<string, Label>();
  for (const r of res.results) {
    const key = labelKey(q, r.ein);
    const net = people.get(key);
    if (net) labels.set(r.ein, { relevant: net > 0, why: `${net > 0 ? "👍" : "👎"} ${Math.abs(net)} vote(s)`, by: "people" });
    else if (cache[key]) labels.set(r.ein, { relevant: cache[key].relevant, why: cache[key].why, by: "claude" });
  }
  const unlabeled = res.results.filter((r) => !labels.has(r.ein));
  if (JUDGE && unlabeled.length) {
    try {
      for (const [ein, l] of await judge(q, unlabeled)) {
        labels.set(ein, l);
        cache[labelKey(q, ein)] = { relevant: l.relevant, why: l.why, model: LLM_MODEL };
      }
    } catch (err) { console.error(`  judge failed for "${q}":`, (err as Error).message); }
  }
  return {
    q, tags, parser: filters.parser, filters: describeFilters(filters), ms, total: res.total, folded: all.results.length - res.results.length,
    shown: res.results.map((r, i) => ({ rank: i + 1, ein: r.ein, name: r.name, place: [r.city, r.state].filter(Boolean).join(", "), score: r.relevance?.score ?? null, label: labels.get(r.ein) ?? null })),
  };
}

// A few questions at a time: Claude calls dominate, the local DB and embedder are quick.
async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const precision = (r: Row) => {
  const judged = r.shown.filter((s) => s.label);
  return judged.length ? judged.filter((s) => s.label!.relevant).length / judged.length : null;
};

const people = await peopleLabels();
console.log(`Eval: ${queries.length} questions, top ${K}, judge ${JUDGE ? (claude() ? LLM_MODEL : "unavailable (no ANTHROPIC_API_KEY)") : "off"}, ${people.size} people labels`);
const rows = await pool(queries, 4, async (query, i) => {
  const row = await runOne(query, people);
  const p = precision(row);
  console.log(`${String(i + 1).padStart(2)}. ${p == null ? "  —" : pct(p).padStart(4)}  ${row.ms}ms  ${row.q}`);
  return row;
});
writeFileSync(CACHE, JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 1) + "\n");

// Summary
const scored = rows.filter((r) => precision(r) != null);
const macro = scored.reduce((a, r) => a + precision(r)!, 0) / (scored.length || 1);
const all = rows.flatMap((r) => r.shown);
const judged = all.filter((s) => s.label);
const micro = judged.filter((s) => s.label!.relevant).length / (judged.length || 1);
const empty = rows.filter((r) => r.total === 0);
const noStrong = rows.filter((r) => r.total > 0 && r.shown.length === 0);
const avgShown = rows.reduce((a, r) => a + r.shown.length, 0) / (rows.length || 1);
const times = rows.map((r) => r.ms).sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)] ?? 0;
const parsers = [...new Set(rows.map((r) => r.parser))].join(", ");
// Does the relevance score agree with the labels? Relevant results should score higher.
const avgScore = (rel: boolean) => {
  const xs = judged.filter((s) => s.label!.relevant === rel && s.score != null).map((s) => s.score!);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
};
const met = macro >= GOAL;

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const lines = [
  `# Search eval · ${stamp}`,
  "",
  `**${pct(macro)} relevant** (average per question; goal ${pct(GOAL)}) · ${met ? "goal met" : "below goal"}`,
  "",
  "| Measure | Value |",
  "|---|---|",
  `| Questions | ${rows.length} (${scored.length} scored) |`,
  `| Relevant, per question | ${pct(macro)} |`,
  `| Relevant, all results pooled | ${pct(micro)} |`,
  `| Questions ≥ goal | ${scored.filter((r) => precision(r)! >= GOAL).length} / ${scored.length} |`,
  `| Questions with no results | ${empty.length} |`,
  `| Questions with no strong match (only weaker matches shown) | ${noStrong.length}${noStrong.length ? `: ${noStrong.map((r) => r.q).join("; ")}` : ""} |`,
  `| Strong matches shown per question (of top ${K}) | ${avgShown.toFixed(1)} |`,
  `| Results labeled | ${judged.length} / ${all.length} (people ${judged.filter((s) => s.label!.by === "people").length}, Claude ${judged.filter((s) => s.label!.by === "claude").length}) |`,
  `| Median time (parse + search) | ${median}ms |`,
  `| Parser | ${parsers} |`,
  `| Avg relevance score: relevant / not relevant | ${avgScore(true) ?? "—"} / ${avgScore(false) ?? "—"} |`,
  `| Judge | ${JUDGE ? LLM_MODEL : "off"}, strong matches in the top ${K} |`,
  "",
  "## Per question (worst first)",
  "",
  "| Relevant | Question | Read as | Results | Time |",
  "|---|---|---|---|---|",
  ...[...rows].sort((a, b) => (precision(a) ?? 2) - (precision(b) ?? 2)).map((r) => {
    const p = precision(r);
    const f = r.filters;
    const readAs = [f.topic, f.cities?.length ? f.cities.join(",") : null, f.appalachia ? "Appalachia (ARC counties)" : null, f.states.length ? f.states.join(",") : null, f.maxRevenue ? `≤$${f.maxRevenue.toLocaleString("en-US")}` : null, f.ntee ? `cause ${f.ntee}` : null, f.nteeHint ? `likely ${f.nteeHint}` : null, ...f.requirements.map((x) => `must: ${x}`)].filter(Boolean).join(" · ");
    return `| ${p == null ? "—" : pct(p)} | ${r.q} | ${readAs.replace(/\|/g, "/")} | ${r.total} | ${r.ms}ms |`;
  }),
  "",
  "## Not relevant (what to fix)",
  "",
  ...rows.flatMap((r) => {
    const bad = r.shown.filter((s) => s.label && !s.label.relevant);
    return bad.length ? [`**${r.q}**`, ...bad.map((s) => `- #${s.rank} ${s.name} (${s.place}): ${s.label!.why}`), ""] : [];
  }),
];
const outDir = join(DIR, "results");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${stamp}.md`), lines.join("\n") + "\n");
writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify({ stamp, k: K, goal: GOAL, macro, micro, median, rows }, null, 1) + "\n");

console.log(`\n${pct(macro)} relevant per question (goal ${pct(GOAL)}), ${pct(micro)} pooled · ${judged.length}/${all.length} labeled · median ${median}ms`);
console.log(`Report: eval/results/${stamp}.md`);
await db.end();
