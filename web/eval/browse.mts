// Browse by cause checks (lib/sdg.ts, lib/browse.ts), no Claude calls:
//  1. taxonomy: 17 goals with official numbers, unique ids, real labels, NTEE prefixes the engine takes (8 at most)
//  2. links: every Browse "Ask" question maps back (lib/answerRoute withSdg) to the exact cause its figure counts,
//     and every SDG-phrased home prompt to a covered cause
//  3. numbers: each figure equals the research answer for the same question and spec (the cached answer path the
//     Research page uses), and for a sample the original grant_clean SQL path (cube off) gives the same total and
//     top funder
//  4. latency: cold compute per cause and warm reads
//   npx tsx eval/browse.mts            all causes      --sample=N   only N causes for step 3
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { db } = await import("../lib/db");
const { answer } = await import("../lib/answer");
const { withSdg } = await import("../lib/answerRoute");
const { DEFAULT_SPEC } = await import("../lib/answerSpec");
const { LABEL_SLUGS } = await import("../lib/labels");
const { SDGS, ENVIRONMENT, covered, causeOf, sdgRefs } = await import("../lib/sdg");
const { asks, entry, figures, METRICS_SHOWN, specFor } = await import("../lib/browse");
const { RESEARCH_GROUPS } = await import("../lib/examples");
const { knownSpec } = await import("../lib/knownQuestions");

const bad: string[] = [];
let checks = 0;
const ok = (cond: boolean, msg: string) => { checks++; if (!cond) bad.push(msg); };
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];

// 1. taxonomy
ok(SDGS.length === 17 && SDGS.every((g, i) => g.n === i + 1), "17 goals numbered 1 to 17");
const ids = covered().map((f) => f.sub.id).concat(SDGS.flatMap((g) => g.subs.filter((s) => s.coverage === "none").map((s) => s.id)));
ok(new Set(ids).size === ids.length, `unique ids: ${ids.filter((x, i) => ids.indexOf(x) !== i).join(", ")}`);
for (const f of [...SDGS.flatMap((g) => [g.scope, ...g.subs]), ENVIRONMENT.scope]) {
  if (f.coverage === "label") ok(!!f.label && (LABEL_SLUGS as string[]).includes(f.label), `${f.id}: label ${f.label} not loaded`);
  if (f.coverage === "ntee") ok(!!f.ntee?.length && f.ntee.length <= 8 && f.ntee.every((n) => /^[A-Z][0-9A-Z]{0,4}$/.test(n)), `${f.id}: ntee ${f.ntee}`);
  if (f.coverage === "keywords") ok(!!f.keywords?.length && !f.ntee?.length && !f.label, `${f.id}: keywords`);
  if (f.coverage === "none") ok(!!f.note && !causeOf(f, null), `${f.id}: not covered needs a note and no cause`);
}
for (const id of ENVIRONMENT.includes) ok(covered().some((f) => f.sub.id === id), `environment includes unknown ${id}`);

// 2. links
const dummy = { name: "x", label: null, ntee: [], keywords: [] };
const same = (a: unknown, z: unknown) => JSON.stringify(a) === JSON.stringify(z);
for (const f of covered()) {
  const e = entry(f.sub.id)!;
  const q = asks(e.name);
  for (const m of [...METRICS_SHOWN, "underfunded"] as const) {
    // Browse and the cause popover ask plain questions (no "(SDG n)"); each must map to its own spec with no router call
    const got = knownSpec(q[m])?.causes[0] ?? null;
    ok(same(got, e.spec!.causes[0]) && knownSpec(q[m])?.metric === m && !/\(SDG \d+\)|\bGoal \d/.test(q[m]), `${f.sub.id} ${m}: "${q[m]}" maps to ${JSON.stringify(got)}, want ${JSON.stringify(e.spec!.causes[0])}`);
  }
}
// Every question the home and /research popover can ask: no "(SDG n)" or "Goal n" in its text, and the standard ones
// map to a covered cause with no router call
let knownN = 0;
for (const g of RESEARCH_GROUPS) for (const q of g.prompts) {
  ok(!/\(SDG \d+\)|\b(SDG|Goal) \d/.test(q), `home prompt "${q}" shows an SDG label`);
  const k = knownSpec(q);
  if (k) { knownN++; ok(covered().some((f) => same(causeOf(f.sub, f.sdg), k.causes[0]) || same(entry(f.sub.id)?.spec?.causes[0], k.causes[0])), `home prompt "${q}" maps to no covered cause`); }
}
console.log(`home prompts with a known spec (no router): ${knownN}`);
console.log(`taxonomy and links: ${checks - bad.length}/${checks}`);

// 3. numbers, 4. latency
const n = Number(arg("sample") || 0);
const all = covered();
const pick = n ? all.filter((_, i) => i % Math.ceil(all.length / n) === 0) : all;
const cold: number[] = [], warm: number[] = [];
let numChecks = 0, numBad = 0;
const want = (m: string, x: string, y: string, label: string) => { numChecks++; if (x !== y) { numBad++; bad.push(`${label} ${m}: browse ${x} vs answer ${y}`); } };
for (const [i, f] of pick.entries()) {
  const id = f.sub.id, e = entry(id)!;
  const t0 = Date.now();
  const fig = await figures(id);
  cold.push(Date.now() - t0);
  const t1 = Date.now();
  await figures(id);
  warm.push(Date.now() - t1);
  if (!fig) { bad.push(`${id}: no figures`); continue; }
  const q = asks(e.name);
  for (const m of METRICS_SHOWN) {
    const a = await answer(q[m], specFor(e, m));
    const p = fig.parts[m];
    want(m, JSON.stringify(p?.numbers ?? null), JSON.stringify(a.numbers), id);
    want(m, p?.headline ?? "", a.headline, id);
  }
  if (n && i < 8) {
    // Original grant_clean SQL (cube off): an independent path to the same total and top funder.
    for (const m of ["total", "top_funders"] as const) {
      const a = await answer(q[m], specFor(e, m), { cube: false });
      want(`${m} (cube off)`, fig.parts[m]?.numbers[0]?.value ?? "", a.numbers[0]?.value ?? "", id);
    }
  }
}
const pctl = (xs: number[], p: number) => { const s = [...xs].sort((a, z) => a - z); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
console.log(`numbers: ${numChecks - numBad}/${numChecks} match the research answers (${pick.length} causes)`);
console.log(`latency per cause: first read p50 ${pctl(cold, 0.5)} ms, p90 ${pctl(cold, 0.9)} ms, max ${Math.max(...cold)} ms (cold when nothing was cached), cached read p50 ${pctl(warm, 0.5)} ms`);
if (bad.length) { console.log(`\n${bad.length} failing:\n${bad.slice(0, 40).join("\n")}`); process.exitCode = 1; }
else console.log("all pass");
await new Promise((r) => setTimeout(r, 2500)); // let the disk cache save
await db.end();
