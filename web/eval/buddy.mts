// Research Buddy eval (.mts for top-level await): ask 30 questions about real search results,
// then check every factual claim in each answer against the filings it cites.
// Goal: zero unsupported claims.
//
//   npm run eval:buddy                 all 30
//   npm run eval:buddy -- --only=5     first 5
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { db } = await import("../lib/db");
const { claude, LLM_MODEL } = await import("../lib/llm");
const { buddyContext, buddyMessages, SYSTEM } = await import("../lib/buddy");

const client = claude();
if (!client) { console.error("Needs ANTHROPIC_API_KEY."); process.exit(1); }
const ONLY = Number(process.argv.find((a) => a.startsWith("--only="))?.split("=")[1]) || Infinity;
const DIR = import.meta.dirname;
const items: { q: string; ask: string }[] = JSON.parse(readFileSync(join(DIR, "buddy-questions.json"), "utf8")).slice(0, ONLY);

const JUDGE = `You fact-check an AI research assistant's answer about nonprofits against the source records it was given.
Split the answer into atomic factual claims about organizations (one fact each: an activity, a number, a place, a size, a comparison).
For each claim give the organization numbers it cites ([n]) and a verdict:
- "supported": the cited record(s) state it, or it follows directly (e.g. comparing two stated revenues).
- "unsupported": the cited records don't say it, contradict it, or it relies on outside knowledge.
- "no_citation": a factual claim about a specific organization with no [n] citation.
Skip statements that aren't facts about organizations (advice, framing, "the filings don't say X"). "why": under 15 words.`;
const verdicts = z.object({ claims: z.array(z.object({
  claim: z.string(), cites: z.array(z.number()), verdict: z.enum(["supported", "unsupported", "no_citation"]), why: z.string(),
})) });
type Claim = z.infer<typeof verdicts>["claims"][number];

async function runOne(item: { q: string; ask: string }) {
  const { blocks, context } = await buddyContext(item.q);
  const t0 = performance.now();
  const answer = (await client!.beta.messages.stream({
    model: LLM_MODEL, max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    thinking: { type: "adaptive" }, output_config: { effort: "medium" },
    system: SYSTEM, messages: buddyMessages(context, item.ask),
  }).finalMessage()).content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const ms = Math.round(performance.now() - t0);
  const judged = await client!.beta.messages.parse({
    model: LLM_MODEL, max_tokens: 8192, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(verdicts) },
    system: JUDGE,
    messages: [{ role: "user", content: `Source records:\n\n${blocks.join("\n\n")}\n\nQuestion: ${item.ask}\n\nAnswer to check:\n${answer}` }],
  });
  const claims: Claim[] = judged.parsed_output?.claims ?? [];
  return { ...item, answer, ms, claims, words: answer.split(/\s+/).filter(Boolean).length };
}

const rows: Awaited<ReturnType<typeof runOne>>[] = new Array(items.length);
let next = 0;
console.log(`Buddy eval: ${items.length} questions, ${LLM_MODEL}`);
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < items.length) {
    const i = next++;
    try { rows[i] = await runOne(items[i]); } catch (err) { console.error(`  failed: ${items[i].ask}`, (err as Error).message); continue; }
    const bad = rows[i].claims.filter((c) => c.verdict !== "supported").length;
    console.log(`${String(i + 1).padStart(2)}. ${bad ? `${bad} problem(s)` : "clean"} · ${rows[i].claims.length} claims · ${rows[i].words} words  ${items[i].q} → ${items[i].ask}`);
  }
}));

const done = rows.filter(Boolean);
const claims = done.flatMap((r) => r.claims);
const count = (v: Claim["verdict"]) => claims.filter((c) => c.verdict === v).length;
const clean = done.filter((r) => r.claims.every((c) => c.verdict === "supported")).length;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const lines = [
  `# Research Buddy eval · ${stamp}`,
  "",
  `**${count("unsupported") + count("no_citation")} unsupported or uncited claims** (goal 0) · ${pct(count("supported") / (claims.length || 1))} of ${claims.length} claims supported`,
  "",
  "| Measure | Value |",
  "|---|---|",
  `| Questions | ${done.length} of ${items.length} |`,
  `| Answers with every claim supported | ${clean} / ${done.length} |`,
  `| Claims supported | ${count("supported")} / ${claims.length} |`,
  `| Unsupported | ${count("unsupported")} |`,
  `| No citation | ${count("no_citation")} |`,
  `| Median answer length | ${[...done].sort((a, b) => a.words - b.words)[Math.floor(done.length / 2)]?.words ?? 0} words |`,
  `| Median answer time | ${[...done].sort((a, b) => a.ms - b.ms)[Math.floor(done.length / 2)]?.ms ?? 0}ms |`,
  `| Model / judge | ${LLM_MODEL} / ${LLM_MODEL} |`,
  "",
  "## Problems (what to fix)",
  "",
  ...done.flatMap((r) => {
    const bad = r.claims.filter((c) => c.verdict !== "supported");
    return bad.length ? [`**${r.q} → ${r.ask}**`, ...bad.map((c) => `- ${c.verdict === "no_citation" ? "No citation" : "Unsupported"}: "${c.claim}" ${c.cites.length ? `[${c.cites.join(", ")}]` : ""}: ${c.why}`), ""] : [];
  }),
];
mkdirSync(join(DIR, "results"), { recursive: true });
writeFileSync(join(DIR, "results", `buddy-${stamp}.md`), lines.join("\n") + "\n");
writeFileSync(join(DIR, "results", `buddy-${stamp}.json`), JSON.stringify({ stamp, rows: done }, null, 1) + "\n");
console.log(`\n${count("unsupported") + count("no_citation")} unsupported/uncited of ${claims.length} claims · ${clean}/${done.length} answers clean`);
console.log(`Report: eval/results/buddy-${stamp}.md`);
await db.end();
