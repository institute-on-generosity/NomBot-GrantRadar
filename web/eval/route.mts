// Router eval: each question in route-questions.json through one uncached router call (FAST_MODEL), checked
// against its expected route (metric, source, filters, cause), with input/output tokens and latency.
//   npx tsx eval/route.mts                 all questions
//   npx tsx eval/route.mts --file research-questions.json   another question file (same format)
//   npm run eval:route -- --out /tmp/route.json            also writes per-question results (to diff prompt changes)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { routeMeasured, looksLikeResearch } = await import("../lib/answerRoute");
type Spec = import("../lib/answerSpec").Spec;

export type Expect = {
  q: string; research?: boolean; metric?: string[]; source?: string; by?: string[]; charityFunder?: string; funderType?: string; recipientKind?: string;
  label?: string; subtype?: string; ntee?: string; perResident?: boolean; perPoverty?: boolean; condition?: string; missing?: string; states?: string[]; area?: string;
  order?: string; measure?: string; funderSizeMin?: number; recipientSizeMax?: number; yearFrom?: number; yearTo?: number; region?: string; topN?: number; streak?: number;
  premise?: string | null; // "rise" | "fall" | "more" | "less", or null = must not assume a direction
  nteeBasis?: string;       // spec.ntee: "irs" | "corrected"
};
export function check(e: Expect, research: boolean, s: Spec | null): string[] {
  const bad: string[] = [];
  const wantResearch = e.research ?? true;
  if (research !== wantResearch) return [`research ${research}, want ${wantResearch}`];
  if (!s) return bad;
  const c0 = s.causes[0];
  if (e.metric && !e.metric.includes(s.metric)) bad.push(`metric ${s.metric}, want ${e.metric.join("|")}`);
  if (e.source && s.source !== e.source) bad.push(`source ${s.source}, want ${e.source}`);
  if (e.by && !e.by.includes(s.by ?? "")) bad.push(`by ${s.by}, want ${e.by.join("|")}`);
  for (const k of ["charityFunder", "funderType", "recipientKind", "condition", "area", "order", "measure", "premise"] as const)
    if (e[k] !== undefined && s[k] !== e[k]) bad.push(`${k} ${s[k]}, want ${e[k]}`);
  for (const k of ["perResident", "perPoverty"] as const) if (e[k] !== undefined && s[k] !== e[k]) bad.push(`${k} ${s[k]}, want ${e[k]}`);
  if (e.label && c0?.label !== e.label) bad.push(`label ${c0?.label}, want ${e.label}`);
  if (e.subtype && c0?.subtype !== e.subtype) bad.push(`subtype ${c0?.subtype}, want ${e.subtype}`);
  if (e.ntee && !(c0?.ntee ?? []).some((n) => n.startsWith(e.ntee!) || e.ntee!.startsWith(n))) bad.push(`ntee ${c0?.ntee.join("+")}, want ${e.ntee}`);
  if (e.missing && !s.missing.includes(e.missing as Spec["missing"][number])) bad.push(`missing ${s.missing.join("+")}, want ${e.missing}`);
  if (e.states && !e.states.every((x) => s.states.includes(x))) bad.push(`states ${s.states.join(",")}, want ${e.states.join(",")}`);
  if (e.funderSizeMin && s.funderSize?.min !== e.funderSizeMin) bad.push(`funderSize.min ${s.funderSize?.min}, want ${e.funderSizeMin}`);
  if (e.recipientSizeMax && s.recipientSize?.max !== e.recipientSizeMax) bad.push(`recipientSize.max ${s.recipientSize?.max}, want ${e.recipientSizeMax}`);
  for (const k of ["yearFrom", "yearTo"] as const) if (e[k] !== undefined && s[k] !== e[k]) bad.push(`${k} ${s[k]}, want ${e[k]}`);
  if (e.nteeBasis !== undefined && s.ntee !== e.nteeBasis) bad.push(`ntee ${s.ntee}, want ${e.nteeBasis}`);
  for (const k of ["region", "topN", "streak"] as const) if (e[k] !== undefined && s[k] !== e[k]) bad.push(`${k} ${s[k]}, want ${e[k]}`);
  return bad;
}

// Category for the per-category tally: org search, missing data, else the expected source and metric.
export const category = (e: Expect) =>
  e.research === false ? "org search" : e.missing ? "missing" : `${e.source ?? "foundation_grants"} / ${e.metric?.[0] ?? "?"}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const file = arg("--file") ?? "route-questions.json";
  const qs: Expect[] = JSON.parse(readFileSync(join(import.meta.dirname, file), "utf8"));
  type Row = { e: Expect; bad: string[]; screened: boolean; input: number; output: number; cacheRead: number; cacheWrite: number; ms: number };
  const res: Row[] = [];
  // 4 at a time: close to real latency without tripping rate limits.
  for (let i = 0; i < qs.length; i += 4) {
    res.push(...await Promise.all(qs.slice(i, i + 4).map(async (e): Promise<Row> => {
      const none = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0 };
      if (!looksLikeResearch(e.q)) return { e, bad: check(e, false, null), screened: false, ...none };
      // A parse failure or API error is a failure here: in the app routeQuestion would quietly fall back to a plain search.
      const r = await routeMeasured(e.q).catch((err: unknown) => String(err).slice(0, 160));
      if (typeof r === "string") return { e, bad: [`router error (app falls back to search): ${r}`], screened: true, ...none };
      return { e, bad: check(e, r.routed.research, r.routed.research ? r.routed.spec : null), screened: true, ...none, ...r.usage, ms: r.ms };
    })));
  }
  const called = res.filter((r) => r.screened && r.input);
  const avg = (f: (r: Row) => number) => Math.round(called.reduce((a, r) => a + f(r), 0) / Math.max(1, called.length));
  const ms = called.map((r) => r.ms).sort((a, z) => a - z);
  const pct = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] ?? 0;
  for (const r of res) console.log(`${r.bad.length ? "FAIL" : "ok  "} ${String(r.ms).padStart(5)} ms ${String(r.input).padStart(5)} in ${String(r.cacheRead).padStart(5)} cached ${String(r.output).padStart(4)} out  ${r.e.q}${r.bad.length ? `\n       x ${r.bad.join("; ")}` : ""}`);
  const cats = new Map<string, [number, number]>();
  for (const r of res) { const c = cats.get(category(r.e)) ?? [0, 0]; c[1]++; if (!r.bad.length) c[0]++; cats.set(category(r.e), c); }
  console.log("\nBy category:");
  for (const [c, [ok, n]] of [...cats].sort()) console.log(`  ${ok === n ? "  " : "! "}${ok}/${n}  ${c}`);
  const fn = res.filter((r) => !r.screened && r.e.research !== false);
  console.log(`\nPre-filter false negatives (research question the regex skipped): ${fn.length}${fn.map((r) => `\n  - ${r.e.q}`).join("")}`);
  console.log(`Router errors (parse failures, timeouts): ${res.filter((r) => r.bad[0]?.startsWith("router error")).length}`);
  const pass = res.length - res.filter((r) => r.bad.length).length;
  console.log(`\n${pass}/${res.length} routed as expected. Router calls: ${called.length}, avg input ${avg((r) => r.input)} tokens (avg cache read ${avg((r) => r.cacheRead)}, write ${avg((r) => r.cacheWrite)}), avg output ${avg((r) => r.output)}, latency p50 ${pct(0.5)} ms, p90 ${pct(0.9)} ms`);
  const out = arg("--out");
  if (out) writeFileSync(out, JSON.stringify(res.map((r) => ({ q: r.e.q, ok: !r.bad.length, bad: r.bad, input: r.input, cacheRead: r.cacheRead, output: r.output, ms: r.ms })), null, 1));
  process.exit(0);
}
