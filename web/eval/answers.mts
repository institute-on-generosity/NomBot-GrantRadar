// Sample research questions end to end (router + engine), as the search page runs them: question -> answer -> time.
//   npx tsx eval/answers.mts   (needs ANTHROPIC_API_KEY for the router)
import { readFileSync } from "node:fs";
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { db } = await import("../lib/db");
const { routeQuestion } = await import("../lib/answerRoute");
const { answer } = await import("../lib/answer");
const qs: string[] = JSON.parse(readFileSync(join(import.meta.dirname, "answer-questions.json"), "utf8"));
const out = await Promise.all(qs.map(async (q) => {
  const t = Date.now();
  const r = await routeQuestion(q);
  const tr = Date.now() - t;
  if (!r.research) return { q, route: tr, sql: 0, head: "(org search, no answer card)", status: "-", spec: "" };
  const a = await answer(q, r.spec);
  return { q, route: tr, sql: a.ms, head: a.headline, status: a.status, spec: `${r.spec.metric}/${r.spec.source}/${r.spec.causes.map((c) => c.label ?? (c.ntee.join("+") || `kw:${c.keywords.join("+")}`)).join(",")}/${r.spec.states.join(",")}${r.spec.missing.length ? ` missing:${r.spec.missing}` : ""}` };
}));
for (const o of out) console.log(`| ${o.q} | ${o.head} | ${o.status} | ${o.spec} | ${(o.route / 1000).toFixed(1)} s + ${(o.sql / 1000).toFixed(2)} s |`);
await db.end();
