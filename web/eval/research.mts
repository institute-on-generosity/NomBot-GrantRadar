// Open-ended researcher questions end to end (research-questions.json): router -> answer -> follow-up chips.
// A question passes when it routes as expected (eval/route.mts check), the answer isn't unanswerable (unless
// expected), the headline has no broken numbers, and the suggested chips are on topic and answerable.
//   npx tsx eval/research.mts            prints a report; --out file.md also writes it
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { db } = await import("../lib/db");
const { routeQuestion } = await import("../lib/answerRoute");
const { answer } = await import("../lib/answer");
const { candidateFollowUps, pickFollowUps } = await import("../lib/followUp");
type Spec = import("../lib/answerSpec").Spec;
type Expect = { q: string; research?: boolean; missing?: string; status?: string; headlineNot?: string; headlineHas?: string; premiseHolds?: boolean; [k: string]: unknown };
const routeEval = "./route.mts"; // shared route checks (eval/route.mts); a variable path keeps tsc from resolving .mts
const { check } = (await import(routeEval)) as { check: (e: Expect, research: boolean, s: Spec | null) => string[] };

const qs: Expect[] = JSON.parse(readFileSync(join(import.meta.dirname, "research-questions.json"), "utf8"));
const lines: string[] = [];
let pass = 0;
const run = async (e: Expect) => {
  const t0 = Date.now();
  const r = await routeQuestion(e.q);
  const tr = Date.now() - t0;
  const bad = check(e, r.research, r.research ? r.spec : null);
  if (!r.research) return { e, bad, out: [`(org search)`], ms: tr };
  const a = await answer(e.q, r.spec);
  const want = e.status ?? (e.missing ? "any" : "answered");
  if (want === "answered" && a.status === "unanswerable") bad.push(`unanswerable: ${a.headline}`);
  if (want === "unanswerable" && a.status !== "unanswerable") bad.push(`status ${a.status}, want unanswerable: ${a.headline}`);
  if ((want === "ok" || want === "partial") && a.status !== want) bad.push(`status ${a.status}, want ${want}${a.missing.length ? ` (missing: ${a.missing.map((m) => m.what).join(", ")})` : ""}`);
  if (/NaN|undefined|Infinity|null/.test(a.headline + a.numbers.map((n) => n.value).join(" "))) bad.push(`broken number: ${a.headline}`);
  // headlineHas: the answer covers every part asked (a two-cause question names both causes).
  if (e.headlineHas && !new RegExp(e.headlineHas, "i").test(a.headline)) bad.push(`headline doesn't mention "${e.headlineHas}": ${a.headline}`);
  if (e.headlineNot && new RegExp(e.headlineNot, "i").test(a.headline + " " + a.causeNote)) bad.push(`headline/cause note mentions "${e.headlineNot}"`);
  // Premise check (spec.premise): holds or not as expected, and a false premise is corrected first thing.
  if (e.premiseHolds !== undefined) {
    if (a.premise?.holds !== e.premiseHolds) bad.push(`premise ${JSON.stringify(a.premise)}, want holds ${e.premiseHolds}`);
    const corrected = /^[^.]* didn't (rise|fall|get more|get less)\b/.test(a.headline);
    if (corrected !== !e.premiseHolds) bad.push(`headline ${corrected ? "corrects" : "doesn't correct"} the premise: ${a.headline}`);
  }
  const history = [{ question: e.q, spec: r.spec }];
  const pool = candidateFollowUps(r.spec, history);
  const chips = a.status === "unanswerable" ? [] : await pickFollowUps(history);
  for (const ch of chips) {
    const c = pool.find((x) => x.label === ch);
    if (!c) continue;
    const ca = await answer(ch, c.spec);
    if (ca.status === "unanswerable") bad.push(`chip unanswerable: ${ch}`);
  }
  if (a.status !== "unanswerable" && pool.length === 0) bad.push("no follow-up chips");
  const sp = r.spec;
  const specTxt = `${sp.metric}/${sp.source}${sp.by ? `/by ${sp.by}` : ""}${sp.charityFunder ? `/${sp.charityFunder}` : ""}${sp.funderType ? `/${sp.funderType}` : ""}${sp.recipientKind ? `/${sp.recipientKind}` : ""}/${sp.causes.map((c) => c.label ?? (c.ntee.join("+") || `kw:${c.keywords.join("+")}`)).join(",")}${sp.states.length ? `/${sp.states.join(",")}` : ""}${sp.missing.length ? ` missing:${sp.missing}` : ""}`;
  return { e, bad, ms: Date.now() - t0, out: [`spec ${specTxt}  [${a.status}, route ${(tr / 1000).toFixed(1)} s, answer ${(a.ms / 1000).toFixed(2)} s]`, `> ${a.headline}`,
    `  tiles: ${a.numbers.map((n) => `${n.value} ${n.label}`).join(" | ")}`, ...a.bullets.map((x) => `  - ${x}`), `  caveats: ${a.caveats.length}${a.missing.length ? `, missing: ${a.missing.map((m) => m.what).join(", ")}` : ""}`, `  chips: ${chips.join(" | ") || "(none)"}`] };
};
const res: Awaited<ReturnType<typeof run>>[] = [];
for (let i = 0; i < qs.length; i += 4) {
  res.push(...await Promise.all(qs.slice(i, i + 4).map(run)));
  if (process.argv.includes("--progress")) console.error(`${res.length}/${qs.length}`);
}
for (const r of res) {
  if (!r.bad.length) pass++;
  lines.push(`${r.bad.length ? "FAIL" : "ok  "}  ${r.e.q}`, ...r.out.map((x) => `      ${x}`), ...r.bad.map((x) => `      ✗ ${x}`), "");
}
lines.push(`${pass}/${qs.length} passed`);
console.log(lines.join("\n"));
const oi = process.argv.indexOf("--out");
if (oi > 0) writeFileSync(process.argv[oi + 1], lines.join("\n"));
await db.end();
process.exit(0);
