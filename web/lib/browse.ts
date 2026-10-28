// Browse by cause (/browse): each SDG goal, its subcategories and the Environment umbrella (lib/sdg.ts), with the
// figures a researcher asks first. Every figure is a research answer (lib/answer.ts) for the same spec its "Ask" link
// routes to, so Browse and the answer show the same numbers (eval/browse.mts checks both). Nothing is computed here
// beyond picking fields from those answers, except money per org (the yearly total over orgs that e-file a 990).
// Six answers per cause, about 1 to 3 s cold. Kept per cause for 24 h in memory and on disk (.next/cache), keyed by
// the answer cache version and the exact spec, so restarts are fast and a taxonomy or engine change recomputes.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { answer, ANSWER_VERSION, type Num } from "./answer";
import { DEFAULT_SPEC, normalizeSpec, type Metric, type Spec } from "./answerSpec";
import { askHref } from "./researchQuestions";
import { causeOf, causeQuestions, covered, coverageOf, plainCauseText, ENVIRONMENT, findSub, type Coverage, type Sdg, type Sub } from "./sdg";

export const BROWSE_VERSION = "browse:v1";
const KEY = `${BROWSE_VERSION}|${ANSWER_VERSION}`;
const TTL = 24 * 3600_000;
const FILE = join(process.cwd(), ".next", "cache", "nombot-browse.json");

export const METRICS_SHOWN = ["total", "trend", "top_funders", "by_state", "concentration", "count_orgs"] as const satisfies readonly Metric[];
type Shown = (typeof METRICS_SHOWN)[number];

export type Part = { headline: string; numbers: Num[]; status: string; ask: string };
export type Figures = {
  id: string; spec: Spec; at: number; ms: number;
  status: "ok" | "unanswerable";
  parts: Record<Shown, Part | null>;
  years: { year: number; usd: number }[];        // total: each year's dollars (primary for tiered labels)
  usdYear: number;                                // a year, 2022-24 (the total answer's own "a year" figure, unrounded)
  funders: { name: string; state: string; usd: number }[];
  states: { state: string; name: string; usd: number }[];
  filed: number;                                  // orgs that e-file a 990 (count_orgs)
  perOrg: number | null;                          // usdYear / filed
  basis: "label" | "codes" | "keywords";
  causeNote: string; recency: string; caveats: string[];
};

// The questions a Browse page links to: each routes (router + lib/sdg withSdg) to the spec its figure came from.
// Plain cause names in the questions ("education", never "(SDG 4)"); lib/knownQuestions maps each back to its spec.
export function asks(name: string): Record<Shown | "underfunded", string> {
  return causeQuestions(plainCauseText(name));
}
export const askLink = (q: string) => askHref(q);

export type Entry = { sub: Sub; sdg: Sdg | null; isScope: boolean; name: string; coverage: Coverage; spec: Spec | null };
export function entry(id: string): Entry | null {
  const f = id === ENVIRONMENT.id ? { sub: ENVIRONMENT.scope, sdg: null, isScope: true } : findSub(id);
  if (!f) return null;
  const c = causeOf(f.sub, f.sdg);
  return { ...f, name: c?.name ?? f.sub.name, coverage: coverageOf(f.sub), spec: c ? normalizeSpec({ ...DEFAULT_SPEC, causes: [c] }) : null };
}
export const specFor = (e: Entry, metric: Metric): Spec => normalizeSpec({ ...e.spec!, metric });

// ------------------------------------------------------------------ cache
type Disk = { key: string; figures: Record<string, Figures> };
const g = globalThis as unknown as { __browse?: { mem: Map<string, Promise<Figures>>; disk: Promise<Disk> | null; saving: boolean } };
const state = (g.__browse ??= { mem: new Map(), disk: null, saving: false });
const empty = (): Disk => ({ key: KEY, figures: {} });
const disk = (): Promise<Disk> => (state.disk ??= readFile(FILE, "utf8").then((t) => JSON.parse(t) as Disk).then((d) => (d.key === KEY ? d : empty())).catch(empty));
async function save() {
  if (state.saving) return;
  state.saving = true;
  setTimeout(async () => {
    state.saving = false;
    const d = await disk();
    await mkdir(join(FILE, ".."), { recursive: true }).catch(() => {});
    await writeFile(FILE, JSON.stringify(d)).catch((e) => console.warn("browse cache not saved:", (e as Error).message));
  }, 2000).unref?.();
}
const fresh = (f: Figures | undefined, spec: Spec) => !!f && Date.now() - f.at < TTL && JSON.stringify(f.spec) === JSON.stringify(spec);

// One cause's figures, from the disk or memory cache when fresh.
export async function figures(id: string): Promise<Figures | null> {
  const e = entry(id);
  if (!e?.spec) return null;
  const d = await disk();
  if (fresh(d.figures[id], e.spec)) return d.figures[id];
  const hit = state.mem.get(id);
  if (hit) { const f = await hit.catch(() => null); if (f && fresh(f, e.spec)) return f; }
  const p = compute(id, e);
  state.mem.set(id, p);
  p.then((f) => { d.figures[id] = f; void save(); }, () => state.mem.delete(id));
  return p;
}

// With the time it took (shown on the page: cached figures come back in milliseconds).
export async function figuresTimed(id: string): Promise<{ f: Figures | null; ms: number }> {
  const t0 = Date.now();
  const f = await figures(id);
  return { f, ms: Date.now() - t0 };
}

async function compute(id: string, e: Entry): Promise<Figures> {
  const t0 = Date.now();
  const q = asks(e.name);
  const run = async (m: Shown) => {
    const a = await answer(q[m], specFor(e, m), { memo: false });
    return a;
  };
  // Two at a time: the pool has 5 connections and search shares it.
  const out: Partial<Record<Shown, Awaited<ReturnType<typeof run>>>> = {};
  for (let i = 0; i < METRICS_SHOWN.length; i += 2) {
    const ms = METRICS_SHOWN.slice(i, i + 2);
    const rs = await Promise.all(ms.map((m) => run(m).catch((err) => { console.error("browse answer failed", id, m, err); return null; })));
    ms.forEach((m, k) => { if (rs[k]) out[m] = rs[k]!; });
  }
  const part = (m: Shown): Part | null => { const a = out[m]; return a ? { headline: a.headline, numbers: a.numbers, status: a.status, ask: q[m] } : null; };
  const parts = Object.fromEntries(METRICS_SHOWN.map((m) => [m, part(m)])) as Record<Shown, Part | null>;
  const tot = out.total, num = (x: unknown) => (typeof x === "number" ? x : Number(x) || 0);
  const years = (tot?.status === "unanswerable" ? [] : tot?.rows ?? []).map((r) => ({ year: num(r.tax_year), usd: num(r.primary_usd ?? r.usd) })).filter((r) => r.year);
  const usdYear = years.length ? years.reduce((s, r) => s + r.usd, 0) / years.length : 0;
  const tf = out.top_funders?.status !== "unanswerable" ? out.top_funders?.rows ?? [] : [];
  const st = out.by_state?.status !== "unanswerable" ? out.by_state?.rows ?? [] : [];
  const cnt = out.count_orgs?.status !== "unanswerable" ? out.count_orgs?.rows?.[0] : undefined;
  const filed = num(cnt?.filed);
  return {
    id, spec: e.spec!, at: Date.now(), ms: Date.now() - t0,
    status: tot && tot.status !== "unanswerable" ? "ok" : "unanswerable",
    parts, years, usdYear,
    funders: tf.slice(0, 5).map((r) => ({ name: String(r.funder), state: String(r.state ?? ""), usd: num(r.primary_usd ?? r.usd) })),
    states: st.filter((r) => num(r.value) > 0).slice(0, 5).map((r) => ({ state: String(r.state), name: String(r.name), usd: num(r.value) })),
    filed, perOrg: filed > 0 && usdYear > 0 ? usdYear / filed : null,
    basis: e.coverage === "label" ? "label" : e.coverage === "keywords" ? "keywords" : "codes",
    causeNote: tot?.causeNote ?? "", recency: tot?.recency?.note ?? "", caveats: tot?.caveats ?? [],
  };
}

// Every cause's figures (index pages, money-per-org ranks). Three causes at a time.
export async function allFigures(): Promise<Map<string, Figures>> {
  const ids = [...covered().map((f) => f.sub.id)];
  const out = new Map<string, Figures>();
  for (let i = 0; i < ids.length; i += 3) {
    const rs = await Promise.all(ids.slice(i, i + 3).map((id) => figures(id).catch(() => null)));
    rs.forEach((f, k) => { if (f) out.set(ids[i + k], f); });
  }
  return out;
}

// The figures already cached and fresh, without computing any (pages rank against these while the warm-up runs).
export async function cachedFigures(): Promise<Map<string, Figures>> {
  const d = await disk(), out = new Map<string, Figures>();
  for (const f of covered()) {
    const e = entry(f.sub.id), x = d.figures[f.sub.id];
    if (e?.spec && fresh(x, e.spec)) out.set(f.sub.id, x);
  }
  return out;
}

// Crowded or under-funded: money per org against every other cause with figures (one entry per distinct spec).
export type Hint = { rank: number; of: number; median: number; tone: "low" | "mid" | "high"; text: string };
export function perOrgHint(id: string, all: Map<string, Figures>): Hint | null {
  const me = all.get(id);
  if (!me?.perOrg) return null;
  const seen = new Set<string>(), vals: { id: string; v: number }[] = [];
  for (const f of all.values()) {
    const k = JSON.stringify(f.spec.causes.map((c) => [c.label, c.ntee, c.keywords]));
    if (f.perOrg && !seen.has(k)) { seen.add(k); vals.push({ id: f.id, v: f.perOrg }); }
  }
  if (vals.length < 5) return null;
  const sorted = vals.map((x) => x.v).sort((a, z) => a - z), median = sorted[sorted.length >> 1];
  const rank = vals.filter((x) => x.v > me.perOrg!).length + 1;
  const r = me.perOrg / median;
  const tone = r < 0.5 ? "low" : r > 2 ? "high" : "mid";
  const text = tone === "low"
    ? "Less foundation money per org than most causes. A crowded field, or an under-funded one."
    : tone === "high" ? "More foundation money per org than most causes. Money goes to fewer, larger orgs." : "About the middle of causes for foundation money per org.";
  return { rank, of: vals.length, median, tone, text };
}

// Warm every cause in the background after a server start (instrumentation.ts): the first visitor gets cached figures.
export async function warmBrowse() {
  const t0 = Date.now();
  const all = await allFigures().catch((e) => { console.warn("browse warm failed:", (e as Error).message); return new Map(); });
  console.log(`browse: ${all.size} causes ready in ${Math.round((Date.now() - t0) / 1000)} s`);
}
