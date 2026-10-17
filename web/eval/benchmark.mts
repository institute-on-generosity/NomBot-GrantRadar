// Research benchmark (Phase 1 of the research-database plan): 100+ researcher questions (benchmark-questions.json)
// end to end through the engine (router lib/answerRoute -> lib/answer), each scored, plus a ranked list of the
// missing capabilities that block questions.
//   npm run eval:benchmark                 writes eval/results/benchmark-<date>.md (+ .json)
//   npm run eval:benchmark -- --only T01,C04 --progress
// Status per question:
//   ok           answerable question: routed as expected, answered, no broken numbers, direct-SQL check passes
//   partial      answered with a caveat or missing piece (gap questions: the gap is flagged)
//   unanswerable the engine said it can't answer
//   wrong route  the router picked another metric / filter, or sent it to org search
//   misleading   a number disagrees with direct SQL, a broken number, a premise not corrected, or a gap question
//                answered as if complete (no missing note, no caveat naming the gap): queued for human review
// Pass = ok. Gap questions (capability tags) can't pass until the capability exists; the useful signal there is
// whether the engine is honest (partial / unanswerable) rather than misleading.
// Cost: one router call per question that passes the regex screen (app API key, FAST_MODEL, cached prompt);
// answers are SQL only. No LLM judge: "misleading" is deterministic, the rest is listed for human review.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { db } = await import("../lib/db");
const { routeMeasured, looksLikeResearch } = await import("../lib/answerRoute");
const { answer } = await import("../lib/answer");
const { LOADED_STATES } = await import("../lib/filters");
type Spec = import("../lib/answerSpec").Spec;
type Answer = Awaited<ReturnType<typeof answer>>;
type Expect = { q: string; premiseHolds?: boolean; [k: string]: unknown }; // eval/route.mts Expect fields
const routeEval = "./route.mts"; // variable path keeps tsc from resolving .mts
const { check: routeCheck } = (await import(routeEval)) as { check: (e: Expect, research: boolean, s: Spec | null) => string[] };

type Check = { kind: "fdn_total" | "fdn_trend" | "fdn_top_state" | "hh_top_state"; ntee?: string[] };
type Q = { id: string; cat: string; q: string; origin: string; needs: string; expect?: Omit<Expect, "q">; capability?: string[]; check?: Check };
type Status = "ok" | "partial" | "unanswerable" | "wrong route" | "misleading";
type Res = {
  b: Q; status: Status; notes: string[]; review: string | null; checked: "pass" | "fail" | "skipped" | null; gapFlagged: boolean | null;
  spec: string; headline: string; engine: string; routeMs: number; answerMs: number; usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | null;
};

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
let qs: Q[] = JSON.parse(readFileSync(join(import.meta.dirname, "benchmark-questions.json"), "utf8"));
const only = arg("--only")?.split(",");
if (only) qs = qs.filter((q) => only.includes(q.id));

// ------------------------------------------------------------------ deterministic checks (direct SQL on grant_clean)
const UNIT: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
function firstMoney(s: string): { v: number; tol: number } | null {
  const m = s.match(/\$([\d,]+(?:\.(\d+))?)\s*([KMBT])?\b/);
  if (!m) return null;
  const unit = UNIT[m[3] ?? ""] ?? 1, dec = m[2]?.length ?? 0;
  const v = parseFloat(m[1].replace(/,/g, "")) * unit;
  return { v, tol: (0.5 * 10 ** -dec * unit) / v + 0.01 }; // display rounding + 1%
}
function headlineYears(s: string): [number, number] {
  const r = s.match(/\b(20\d\d)[–-](\d{2,4})\b/);
  if (r) { const a = +r[1], b = r[2].length === 2 ? 2000 + +r[2] : +r[2]; return [a, b]; }
  const y = s.match(/\bin (20\d\d)\b/);
  return y ? [+y[1], +y[1]] : [2022, 2024];
}
const nteeWhere = (ntee: string[] | undefined, p: unknown[]) => {
  if (!ntee?.length) return "TRUE";
  p.push(ntee.map((n) => `${n}%`));
  return `recipient_ntee LIKE ANY($${p.length}::text[])`;
};
const stateByName = new Map(LOADED_STATES.map(([c, n]) => [n.toLowerCase(), c]));
// A check runs only when the route matches the check's plain shape (no extra filters), else it's skipped.
function plainSpec(s: Spec, c: Check): boolean {
  const n = s.causes[0]?.ntee ?? [];
  return s.source === "foundation_grants" && !s.states.length && !s.county && !s.area && !s.funderType && !s.funderSize && !s.recipientSize
    && !s.recipientKind && !s.perResident && !s.perPoverty && s.causes.length <= 1 && !s.causes[0]?.label && !s.causes[0]?.keywords.length
    && JSON.stringify(n) === JSON.stringify(c.ntee ?? []);
}
async function runCheck(c: Check, a: Answer): Promise<{ ok: boolean | null; note: string }> {
  // Household giving (IRS SOI, soi_individual_county): the state the headline names first vs the top state by
  // charitable deduction dollars in the headline's tax year.
  if (c.kind === "hh_top_state") {
    if (a.spec.source !== "household_giving" || a.spec.perResident || a.spec.states.length) return { ok: null, note: "check skipped: not a plain household by-state answer" };
    const named = [...stateByName.keys()].filter((n) => a.headline.toLowerCase().startsWith(n)).sort((x, z) => z.length - x.length)[0];
    const yr = +(a.headline.match(/\b(20\d\d)\b(?!.*\b20\d\d\b)/)?.[1] ?? 2023);
    const { rows: [r] } = await db.query(`SELECT state AS st, sum(charity_usd)::float8 AS usd FROM soi_individual_county WHERE level = 'state' AND tax_year = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, [yr]);
    const m = firstMoney(a.headline);
    const amtOk = !!m && Math.abs(m.v - r.usd) / r.usd <= m.tol;
    return { ok: !!named && stateByName.get(named) === r.st && amtOk, note: `headline ${named ?? "?"}${m ? ` $${(m.v / 1e9).toFixed(1)}B` : ""} vs SQL ${r.st} $${(r.usd / 1e9).toFixed(1)}B (${yr})` };
  }
  if (!plainSpec(a.spec, c)) return { ok: null, note: "check skipped: spec has filters beyond the check" };
  const p: unknown[] = [];
  const w = nteeWhere(c.ntee, p);
  if (c.kind === "fdn_total") {
    const m = firstMoney(a.headline);
    if (!m) return { ok: null, note: "check skipped: no $ in headline" };
    const [y0, y1] = headlineYears(a.headline);
    const { rows: [r] } = await db.query(`SELECT coalesce(sum(amount),0)::float8 AS usd FROM grant_clean WHERE tax_year BETWEEN ${y0} AND ${y1} AND ${w}`, p);
    const d = Math.abs(m.v - r.usd) / Math.max(1, r.usd);
    return { ok: d <= m.tol, note: `headline $${(m.v / 1e6).toFixed(1)}M vs SQL $${(r.usd / 1e6).toFixed(1)}M (${(d * 100).toFixed(1)}% off, ${y0}-${y1})` };
  }
  if (c.kind === "fdn_trend") {
    const t = a.headline.match(/\b(grew|rose|increased|fell|dropped|declined|shrank|decreased)\s+(?:by\s+)?([\d.]+)%(?:\s*\([^)]*\))?\s+from (20\d\d) to (20\d\d)/i);
    if (!t) return { ok: null, note: "check skipped: no % change in headline" };
    const sign = /grew|rose|increased/i.test(t[1]) ? 1 : -1, pct = sign * parseFloat(t[2]), y0 = +t[3], y1 = +t[4];
    const { rows } = await db.query(`SELECT tax_year, sum(amount)::float8 AS usd FROM grant_clean WHERE tax_year IN (${y0}, ${y1}) AND ${w} GROUP BY 1`, p);
    const by = Object.fromEntries(rows.map((r) => [r.tax_year, r.usd]));
    const sql = (by[y1] / by[y0] - 1) * 100;
    const dec = t[2].split(".")[1]?.length ?? 0;
    return { ok: Math.abs(sql - pct) <= 0.5 * 10 ** -dec + 0.5, note: `headline ${pct}% vs SQL ${sql.toFixed(2)}% (${y0}->${y1})` };
  }
  // fdn_top_state: the state the headline names first vs the top recipient state by dollars.
  const named = [...stateByName.keys()].filter((n) => a.headline.toLowerCase().startsWith(n)).sort((x, z) => z.length - x.length)[0];
  if (!named) return { ok: null, note: "check skipped: headline doesn't start with a state" };
  const [y0, y1] = headlineYears(a.headline);
  const { rows: [r] } = await db.query(`SELECT recipient_state AS st, sum(amount)::float8 AS usd FROM grant_clean WHERE tax_year BETWEEN ${y0} AND ${y1} AND ${w} AND recipient_state IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, p);
  const m = firstMoney(a.headline);
  const amtOk = !m || Math.abs(m.v - r.usd) / r.usd <= m.tol;
  return { ok: stateByName.get(named) === r.st && amtOk, note: `headline ${named}${m ? ` $${(m.v / 1e6).toFixed(1)}M` : ""} vs SQL ${r.st} $${(r.usd / 1e6).toFixed(1)}M` };
}

// ------------------------------------------------------------------ gap detection
// Does the answer tell the reader the capability is missing? Any missing note counts; else a phrase per capability.
const GENERIC_GAP = /isn't in our|aren't in our|not in our (irs )?data|can't (be )?answer|cannot|don't have|no data|not loaded|aren't loaded|isn't loaded|not available/i;
const GAP_TEXT: Record<string, RegExp> = {
  history_pre2022: /(before|prior to|earlier than) 2022|pre-2022|starts? (in )?2022|(only|just) (from |covers? )?20(22|23)|from 2022 on/i,
  inflation: /inflation|real dollars|constant dollars|\bCPI\b|nominal/i,
  household_giving: /individual|household|itemiz/i,
  corporate_direct: /corporate giving outside|direct corporate|only company foundations/i,
  external_benchmarks: /Giving USA|GDP/i,
  international: /foreign|abroad|other countries|international/i,
  service_area: /headquarter|where (they|it) (serve|work)|service area|mailing address|filing address/i,
};
function gapFlagged(cap: string[], a: Answer): boolean {
  if (a.status === "unanswerable" || a.missing.length) return true;
  const text = [a.headline, a.causeNote, ...a.caveats, ...a.bullets].join(" ");
  if (GENERIC_GAP.test(a.headline)) return true;
  return cap.some((c) => c.startsWith("cause_label:") ? a.basis != null // counted by NTEE codes or keywords, and the answer says so
    : (GAP_TEXT[c]?.test(text) ?? false));
}

// ------------------------------------------------------------------ one question
const specTxt = (sp: Spec) => `${sp.metric}/${sp.source}${sp.by ? `/by ${sp.by}` : ""}${sp.charityFunder ? `/${sp.charityFunder}` : ""}${sp.funderType ? `/${sp.funderType}` : ""}${sp.recipientKind ? `/${sp.recipientKind}` : ""}/${sp.causes.map((c) => c.label ?? (c.ntee.join("+") || `kw:${c.keywords.join("+")}`)).join(",") || "all"}${sp.states.length ? `/${sp.states.join(",")}` : ""}${sp.perResident ? "/per resident" : ""}${sp.perPoverty ? "/per poor" : ""}${sp.missing.length ? ` missing:${sp.missing}` : ""}`;

async function run(b: Q): Promise<Res> {
  const gap = !!b.capability?.length;
  const base = { b, notes: [] as string[], review: null as string | null, checked: null as Res["checked"], gapFlagged: null as boolean | null, spec: "", headline: "", engine: "", routeMs: 0, answerMs: 0, usage: null as Res["usage"] };
  const e: Expect = { q: b.q, ...(b.expect ?? {}) };
  // Router, as routeQuestion does it (screen, then one call; a failed call is a plain search) but uncached and measured.
  let routed: { research: false } | { research: true; spec: Spec } = { research: false };
  if (looksLikeResearch(b.q)) {
    const r = await routeMeasured(b.q).catch((err: unknown) => String(err).slice(0, 160));
    if (typeof r === "string") base.notes.push(`router error (app falls back to search): ${r}`);
    else { routed = r.routed; base.usage = r.usage; base.routeMs = r.ms; }
  } else base.notes.push("regex screen skipped it (org search)");
  if (!routed.research) return { ...base, status: "wrong route", notes: [...base.notes, "sent to org search"] };
  base.spec = specTxt(routed.spec);
  const bad = routeCheck(e, true, routed.spec);
  if (bad.length && !gap) return { ...base, status: "wrong route", notes: [...base.notes, ...bad] };
  if (bad.length) base.notes.push(...bad.map((x) => `route: ${x}`)); // gap questions: the route is secondary to honesty
  const a = await answer(b.q, routed.spec);
  base.headline = a.headline; base.engine = a.status; base.answerMs = a.ms;
  if (a.status === "unanswerable") return { ...base, status: "unanswerable", gapFlagged: gap ? true : null };
  const mis: string[] = [];
  if (/NaN|undefined|Infinity|\bnull\b/.test(a.headline + a.numbers.map((n) => n.value).join(" "))) mis.push(`broken number: ${a.headline}`);
  if (e.premiseHolds !== undefined) {
    const corrected = /^[^.]* didn't (rise|fall|get more|get less)\b/.test(a.headline);
    if (a.premise?.holds !== e.premiseHolds || corrected !== !e.premiseHolds) mis.push(`premise ${JSON.stringify(a.premise)}, want holds ${e.premiseHolds}; headline ${corrected ? "corrects" : "doesn't correct"} it`);
  }
  if (b.check) {
    const c = await runCheck(b.check, a);
    base.notes.push(c.note);
    base.checked = c.ok === null ? "skipped" : c.ok ? "pass" : "fail";
    if (c.ok === false) mis.push(`direct SQL disagrees: ${c.note}`);
  }
  if (gap) {
    base.gapFlagged = gapFlagged(b.capability!, a);
    if (!base.gapFlagged) mis.push(`answered as if complete; no note that ${b.capability!.join(", ")} is missing`);
  }
  if (mis.length) return { ...base, status: "misleading", notes: [...base.notes, ...mis], review: mis.join("; ") };
  if (a.basis) base.review = `cause counted by ${a.basis === "keywords" ? "keywords" : "NTEE codes"}, not a graded label: check what the set catches`;
  if (gap || a.status === "partial") {
    if (a.missing.length) base.notes.push(`missing: ${a.missing.map((m) => m.what).join(", ")}`);
    return { ...base, status: "partial" };
  }
  if (b.check && base.checked !== "pass") base.review = base.review ?? "headline not verified by SQL";
  return { ...base, status: "ok" };
}

// ------------------------------------------------------------------ run, 4 at a time (like eval/route.mts)
const t0 = Date.now();
const res: Res[] = [];
for (let i = 0; i < qs.length; i += 4) {
  res.push(...await Promise.all(qs.slice(i, i + 4).map((b) => run(b).catch((err: unknown) => ({
    b, status: "unanswerable" as Status, notes: [`engine error: ${String(err).slice(0, 200)}`], review: "engine threw", checked: null, gapFlagged: null,
    spec: "", headline: "", engine: "error", routeMs: 0, answerMs: 0, usage: null,
  })))));
  if (process.argv.includes("--progress")) console.error(`${res.length}/${qs.length}`);
}
const wall = Date.now() - t0;

// ------------------------------------------------------------------ scorecard
const STATUSES: Status[] = ["ok", "partial", "unanswerable", "wrong route", "misleading"];
const pct = (a: number, n: number) => `${n ? Math.round((100 * a) / n) : 0}%`;
const count = (rs: Res[], s: Status) => rs.filter((r) => r.status === s).length;
const L: string[] = [];
const date = new Date().toISOString().slice(0, 10);
const answerable = res.filter((r) => !r.b.capability?.length), gaps = res.filter((r) => r.b.capability?.length);
const ok = count(res, "ok");
L.push(`# Research benchmark, ${date}`, "",
  `${res.length} researcher questions (eval/benchmark-questions.json) end to end: router (lib/answerRoute) -> answer (lib/answer). Wall time ${(wall / 1000).toFixed(0)} s.`, "",
  `**Pass rate: ${ok}/${res.length} (${pct(ok, res.length)})** fully answered. Answerable today: ${count(answerable, "ok")}/${answerable.length} (${pct(count(answerable, "ok"), answerable.length)}). Questions that need a missing capability: ${gaps.length}, of which the engine was honest (partial or unanswerable) on ${gaps.filter((r) => r.status === "partial" || r.status === "unanswerable").length} and misleading on ${count(gaps, "misleading")}.`, "",
  "| | " + STATUSES.join(" | ") + " |", "|---|" + STATUSES.map(() => "---:").join("|") + "|",
  `| all (${res.length}) | ${STATUSES.map((s) => count(res, s)).join(" | ")} |`,
  `| answerable today (${answerable.length}) | ${STATUSES.map((s) => count(answerable, s)).join(" | ")} |`,
  `| need a missing capability (${gaps.length}) | ${STATUSES.map((s) => count(gaps, s)).join(" | ")} |`, "");

L.push("## Pass rate by category", "", "| Category | Pass | ok | partial | unanswerable | wrong route | misleading |", "|---|---:|---:|---:|---:|---:|---:|");
const cats = [...new Set(res.map((r) => r.b.cat))];
for (const c of cats) {
  const rs = res.filter((r) => r.b.cat === c);
  L.push(`| ${c} | ${count(rs, "ok")}/${rs.length} (${pct(count(rs, "ok"), rs.length)}) | ${STATUSES.map((s) => count(rs, s)).join(" | ")} |`);
}

L.push("", "## Missing capabilities, by questions blocked", "", "Questions not fully answered, counted under each capability they need (a question can need several). `cause_label:*` rows are also summed as **cause labels (any)**.", "",
  "| # | Capability | Questions blocked | Engine honest | Misleading | Examples |", "|---:|---|---:|---:|---:|---|");
const caps = new Map<string, Res[]>();
for (const r of res) {
  if (r.status === "ok") continue;
  const cs = r.b.capability ?? [];
  for (const c of cs) caps.set(c, [...(caps.get(c) ?? []), r]);
  if (cs.some((c) => c.startsWith("cause_label:"))) caps.set("cause labels (any)", [...(caps.get("cause labels (any)") ?? []), r]);
  if (!cs.length) caps.set(r.status === "wrong route" ? "router (answerable, wrong route)" : `engine (answerable, ${r.status})`, [...(caps.get(r.status === "wrong route" ? "router (answerable, wrong route)" : `engine (answerable, ${r.status})`) ?? []), r]);
}
const ranked = [...caps].sort((a, z) => z[1].length - a[1].length || a[0].localeCompare(z[0]));
ranked.forEach(([c, rs], i) => L.push(`| ${i + 1} | ${c} | ${rs.length} | ${rs.filter((r) => r.status === "partial" || r.status === "unanswerable").length} | ${count(rs, "misleading")} | ${rs.slice(0, 2).map((r) => `${r.b.id} ${r.b.q}`).join("<br>")} |`));

const checks = res.filter((r) => r.checked);
L.push("", "## Direct SQL checks", "", `Headline numbers re-computed straight from grant_clean (990-PF grants): ${checks.filter((r) => r.checked === "pass").length} pass, ${checks.filter((r) => r.checked === "fail").length} fail, ${checks.filter((r) => r.checked === "skipped").length} skipped.`, "");
for (const r of checks) L.push(`- **${r.checked}** ${r.b.id} ${r.b.q}: ${r.notes.find((n) => /SQL|skipped/.test(n)) ?? ""}`);

const review = res.filter((r) => r.review);
L.push("", "## For human review", "", `${review.length} answers: misleading flags (confirm), keyword-counted causes, unverified headlines.`, "");
for (const r of review) L.push(`- ${r.b.id} [${r.status}] ${r.b.q}`, `  > ${r.headline || "(no answer)"}`, `  - ${r.review}`);

const called = res.filter((r) => r.usage);
const sum = (f: (u: NonNullable<Res["usage"]>) => number) => called.reduce((a, r) => a + f(r.usage!), 0);
const lat = res.map((r) => r.routeMs + r.answerMs).sort((a, z) => a - z);
const pq = (p: number) => ((lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] ?? 0) / 1000).toFixed(1);
L.push("", "## Cost and latency", "",
  `- **Router calls:** ${called.length} (app API key, prompt-cached). Input ${sum((u) => u.input).toLocaleString()} tokens (${sum((u) => u.cacheRead).toLocaleString()} cache reads, ${sum((u) => u.cacheWrite).toLocaleString()} cache writes, ${(sum((u) => u.input) - sum((u) => u.cacheRead) - sum((u) => u.cacheWrite)).toLocaleString()} uncached), output ${sum((u) => u.output).toLocaleString()}.`,
  `- **Answers:** SQL only, no model calls. No LLM judge.`,
  `- **Latency per question** (route + answer, 4 in parallel): p50 ${pq(0.5)} s, p90 ${pq(0.9)} s.`);

L.push("", "## All questions", "", "| ID | Category | Status | Question | Route | Headline | Notes |", "|---|---|---|---|---|---|---|");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
for (const r of res) L.push(`| ${r.b.id} | ${r.b.cat} | ${r.status} | ${cell(r.b.q)}${r.b.capability ? ` _(needs ${r.b.capability.join(", ")})_` : ""} | ${cell(r.spec)} | ${cell(r.headline)} | ${cell(r.notes.join("; "))} |`);

const md = L.join("\n") + "\n";
const dir = join(import.meta.dirname, "results");
mkdirSync(dir, { recursive: true });
const out = arg("--out") ?? join(dir, `benchmark-${date}${only ? "-partial" : ""}.md`);
writeFileSync(out, md);
writeFileSync(out.replace(/\.md$/, ".json"), JSON.stringify(res.map((r) => ({ id: r.b.id, cat: r.b.cat, q: r.b.q, capability: r.b.capability ?? [], status: r.status, engine: r.engine, spec: r.spec, headline: r.headline, notes: r.notes, review: r.review, checked: r.checked, routeMs: r.routeMs, answerMs: r.answerMs, usage: r.usage })), null, 1));
console.log(L.slice(0, 40).join("\n"));
console.log(`\nwrote ${out}`);
await db.end();
process.exit(0);
