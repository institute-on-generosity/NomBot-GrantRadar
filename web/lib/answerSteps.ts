// "Show the steps": a numbered, evidence-backed chain under every research answer (lib/answer.ts).
// Deterministic: each step is built from numbers the engine already computed (rows, tiles, change, coverage,
// caveats, queries) or from the cheap evidence queries in lib/answer.ts (biggest recipients and funders in the
// key years, the year before the start). No model call. Copy rules as for bullets: no semicolons, no em dashes.
import { money } from "../components/money";
import { orgName } from "../components/text";
import type { Spec } from "./answerSpec";

// One step: a short title, one line with the numbers, details on expand. Lines use **bold** and [name](/org/ein).
export type StepEvidence = { role: "recipient" | "funder" | "row"; name: string; ein: string | null; usd: number; year?: string };
export type Step = { n: number; key: StepKey; title: string; line: string; details: string[]; evidence?: StepEvidence[] };
export type StepKey = "question" | "cause" | "data" | "count" | "compute" | "compare" | "check" | "reproduce";

// What lib/answer.ts hands over beyond the answer itself. All optional: missing parts fall back to the answer's text.
export type YearTotal = { year: number; usd: number; grants?: number; funders?: number; orgs?: number };
export type Movers = { year: string; total: number; recipients: StepEvidence[]; funders: StepEvidence[] };
export type Evidence = {
  perYear?: { label: string; primary: boolean; years: YearTotal[] }[];
  movers?: Movers[];
  change?: { from: number; to: number; a: number; z: number; g: number; real: number | null; cpiFrom?: number; cpiTo?: number; base?: number; primary: boolean };
  share?: { part: number; base: number; of: string };
  ratio?: { a: number; z: number; first: string; second: string };
  perYearAvg?: { sum: number; years: number };
  baseline?: { label: string; a: number; z: number; g: number; real: number | null };
  spike?: { year: number; prev: number; paper?: boolean; prevUsd: number; usd: number; jump: number; since: number; sinceG: number | null; sinceReal: number | null };
};
// subtype: for a label with sub-types (immigrants_refugees), which one was counted and the label's split in orgs.
export type CauseInfo = { name: string; kind: "label" | "ntee" | "keyword" | "program" | "all"; labelName?: string; tiers?: string; grade?: string; subtype?: string };
export type StepInput = {
  spec: Spec;
  a: {
    status: string; headline: string; numbers: { value: string; label: string; note?: string }[]; rows: Record<string, unknown>[];
    causeNote: string; method: string; caveats: string[]; coverage: { label: string; value: string }[];
    queries: { title: string }[]; orgCount?: number; basis?: "codes" | "keywords" | null;
    missing: { what: string; why: string }[];
  };
  years: { from: number; to: number; unit: string; why: string } | null;
  causes: CauseInfo[];
  source: string;          // "990-PF grants to identified recipients" ...
  sourceWords?: string;    // step 1's name for the data, when it isn't the spec's source (organization counts)
  moneyTo?: boolean;       // orgCount = organizations that received the money (grant and award answers)
  excluded: string[];      // what the source leaves out
  change?: { subject: string; g: number; from: string; to: string } | null;
  versus?: { first: string; second: string; a: number; z: number } | null;
  ev?: Evidence;
};

const pct = (x: number) => (!isFinite(x) ? "n/a" : Math.abs(x) >= 0.095 ? `${Math.round(x * 100)}%` : Math.abs(x) >= 0.0095 ? `${(x * 100).toFixed(1)}%` : `${(x * 100).toFixed(2)}%`);
export const signedPct = (x: number) => `${x >= 0 ? "+" : "−"}${pct(Math.abs(x))}`;
const int = (n: number) => Math.round(n).toLocaleString("en-US");
const b = (s: string) => `**${s}**`;
const clean = (s: string) => s.replace(/\s*;\s*/g, ", ").replace(/\s*—\s*/g, ", ");
const orgLink = (e: StepEvidence) => (e.ein ? `[${e.name}](/org/${e.ein})` : e.name);

const METRIC_WORDS: Record<string, string> = {
  total: "a total", share: "a share of all money", compare: "a comparison of two causes", trend: "a change over time",
  fastest_causes: "which causes grew or shrank most", by_state: "a ranking of states", by_rurality: "rural vs urban counties",
  top_funders: "the biggest funders", top_recipients: "the biggest recipients", out_of_state: "money from other states",
  grant_size: "the typical grant", general_support: "the share that is general support", concentration: "how concentrated the money is",
  overlap_funders: "funders of both causes", count_orgs: "a count of organizations", breakdown: "a breakdown", none: "something outside our data",
};
const SOURCE_WORDS: Record<string, string> = {
  foundation_grants: "foundation grants (990-PF)", charity_grants: "charity grants (Schedule I)", federal_awards: "federal awards (USAspending)",
  government_grants: "government grants on Form 990", contributions: "contributions on Form 990", revenue: "revenue on Form 990",
  household_giving: "household giving (IRS SOI)", foundation_finances: "foundation finances (990-PF)",
};

// Per-year totals: the evidence when the engine passed them, else the answer's rows (tax_year or fiscal_year + a dollar column).
function yearTotals(i: StepInput): { label: string; years: YearTotal[] } | null {
  if (i.ev?.perYear?.length) return i.ev.perYear[0];
  const rows = i.a.rows;
  const yk = ["tax_year", "fiscal_year"].find((k) => rows.some((r) => typeof r[k] === "number"));
  const uk = ["primary_usd", "usd", "grants_usd", "charitable_deductions_usd", "total_usd"].find((k) => rows.some((r) => typeof r[k] === "number"));
  if (!yk || !uk || rows.some((r) => typeof r.cause === "string" && r.cause !== rows[0].cause)) return null;
  const m = new Map<number, number>();
  for (const r of rows) if (typeof r[yk] === "number" && typeof r[uk] === "number") m.set(r[yk] as number, (m.get(r[yk] as number) ?? 0) + (r[uk] as number));
  if (m.size < 2) return null;
  return { label: "", years: [...m].sort((x, y) => x[0] - y[0]).map(([year, usd]) => ({ year, usd })) };
}
// The top rows of a ranking: a name, an EIN when there is one, and a dollar or value column.
// A ranked list: per resident (or per person in poverty) when the answer is, else dollars (primary tier first).
function topRows(i: StepInput, n = 3): { rows: StepEvidence[]; per: boolean } {
  const rows = i.a.rows;
  if (rows.length < 2) return { rows: [], per: false };
  const nk = ["name", "funder", "state", "group", "band", "area", "cause", "key", "revenue_band"].find((k) => typeof rows[0][k] === "string");
  const per = (i.spec.perResident || i.spec.perPoverty) && typeof rows[0].value === "number";
  const vk = per ? "value" : ["primary_usd", "usd", "charitable_deductions_usd", "total"].find((k) => typeof rows[0][k] === "number");
  if (!nk || !vk) return { rows: [], per: false };
  const ek = ["ein", "funder_ein"].find((k) => typeof rows[0][k] === "string");
  return { per, rows: rows.slice(0, n).map((r) => ({ role: (ek === "funder_ein" ? "funder" : ek ? "recipient" : "row") as StepEvidence["role"], name: ek ? orgName(String(r[nk])) : String(r[nk]), ein: ek ? String(r[ek]) : null, usd: Number(r[vk]) })) };
}
const perRes = (x: number) => (x >= 100 ? `$${int(x)}` : `$${x.toFixed(2)}`);
// A one-row answer (concentration, grant size, counts): its numeric fields, labeled.
function rowFacts(r: Record<string, unknown>): string[] {
  return Object.entries(r).flatMap(([k, v]) => {
    if (typeof v !== "number" || /^(tax_|fiscal_)?year$/.test(k)) return [];
    const name = k.replace(/_usd$/, "").replace(/_/g, " ");
    const val = /usd|total|revenue|amount|median$|average|^p\d+$|deductions/.test(k) && !/months|rate|share|orgs$/.test(k) ? money(v)
      : /share|rate|pct$/.test(k) && Math.abs(v) <= 1.5 ? pct(v) : Number.isInteger(v) ? int(v) : String(+v.toFixed(2));
    return [`${name} ${val}`];
  });
}

export function buildSteps(i: StepInput): Step[] {
  if (i.a.status === "unanswerable") return [];
  const s = i.spec, ev = i.ev ?? {};
  const steps: Omit<Step, "n">[] = [];
  const add = (key: StepKey, title: string, line: string, details: string[] = [], evidence?: StepEvidence[]) =>
    steps.push({ key, title, line: clean(line), details: details.filter(Boolean).map(clean), ...(evidence?.length ? { evidence } : {}) });

  // 1. The question as the engine read it.
  const causes = s.causes.map((c) => c.name).join(" and ") || "all causes";
  const place = s.county ? `${s.county}${s.states[0] ? `, ${s.states[0]}` : ""}` : s.region ? "Appalachia" : s.states.length ? s.states.join(", ") : "the US";
  const yr = i.years ? (i.years.from === i.years.to ? `${i.years.unit} ${i.years.from}` : `${i.years.unit}s ${i.years.from} to ${i.years.to}`) : "";
  add("question", "Understood the question",
    `${cap(METRIC_WORDS[s.metric] ?? s.metric)}, ${causes}, ${i.sourceWords ?? SOURCE_WORDS[s.source] ?? s.source}, ${place}${yr ? `, ${yr}` : ""}`,
    [i.years ? `Years: ${i.years.why}` : "", s.by ? `Split by ${s.by.replace(/_/g, " ")}` : "", s.perResident ? "Per resident: divided by Census 2024 population" : "",
      s.perPoverty ? "Per person in poverty: divided by Census ACS people in poverty" : "",
      ...i.a.missing.map((m) => `Not included, ${m.what.toLowerCase()}: ${m.why}`)]);

  // 2. The cause set.
  if (i.causes.length && !i.causes.every((c) => c.kind === "all")) {
    const one = (c: CauseInfo) => c.kind === "label" ? `${c.labelName ?? c.name} label${c.subtype ? `, ${c.subtype}` : ""}${c.tiers ? `, ${c.tiers}` : ""}${c.grade ? `, ${c.grade}` : ""}`
      : c.kind === "ntee" ? `${c.name} by IRS NTEE code, not a checked label (approximate)`
      : c.kind === "keyword" ? `${c.name} by keyword match, not a checked label (approximate)`
      : c.kind === "program" ? `${c.name} as a federal program` : c.name;
    const orgs = i.a.orgCount && i.causes.length === 1 ? `, ${b(int(i.a.orgCount))} organizations ${i.moneyTo ? "received money" : "counted"}` : "";
    add("cause", "Defined the cause", `${i.causes.map(one).join(" and ")}${orgs}`, [i.a.causeNote]);
  }

  // 3. The data.
  const link = i.a.coverage.find((c) => /identified/i.test(c.label));
  add("data", "Picked the data", `${cap(i.source)}${link ? `, recipients identified for ${link.value}` : ""}`,
    [...i.excluded.map((x) => `Left out: ${x}`), i.a.method]);

  // 4. Counted.
  const yt = yearTotals(i);
  if (yt && yt.years.length >= 2) {
    const ys = yt.years;
    const lines = ys.map((y) => `${y.year}: ${b(money(y.usd))}${y.grants != null ? `, ${int(y.grants)} grants` : ""}${y.funders != null ? `, ${int(y.funders)} funders` : ""}${y.orgs != null ? `, ${int(y.orgs)} recipients` : ""}`);
    const evid: StepEvidence[] = [];
    for (const m of ev.movers ?? []) {
      if (m.recipients.length) lines.push(`${m.year} biggest recipients: ${m.recipients.map((r) => `${orgLink(r)} ${money(r.usd)}`).join(", ")}`);
      if (m.funders.length) lines.push(`${m.year} biggest funders: ${m.funders.map((r) => `${orgLink(r)} ${money(r.usd)}`).join(", ")}`);
      const top = m.recipients[0];
      if (top && m.total > 0 && top.usd / m.total >= 0.25) lines.push(`${top.name} alone was ${b(pct(top.usd / m.total))} of ${m.year}`);
      evid.push(...m.recipients.map((r) => ({ ...r, year: m.year })), ...m.funders.map((r) => ({ ...r, year: m.year })));
    }
    const more = (ev.perYear ?? []).slice(1);
    for (const p of more) lines.push(`${p.label}: ${p.years.map((y) => `${y.year} ${b(money(y.usd))}`).join(", ")}`);
    const span = (p: { years: YearTotal[] }) => `${p.years[0].year} ${b(money(p.years[0].usd))}${p.years.length > 2 ? " … " : ", "}${p.years.at(-1)!.year} ${b(money(p.years.at(-1)!.usd))}`;
    add("count", "Counted", more.length ? [yt as { label: string; years: YearTotal[] }, ...more].map((p) => `${p.label} ${span(p)}`).join(", ")
      : `${span(yt)}${yt.label ? ` (${yt.label})` : ""}`, lines, evid);
  } else {
    const { rows: top, per } = topRows(i);
    const val = (r: StepEvidence) => (per ? `${perRes(r.usd)} ${i.spec.perPoverty ? "per person in poverty" : "per resident"}` : money(r.usd));
    if (top.length) {
      add("count", "Counted", top.map((r) => `${r.name} ${b(val(r))}`).join(", "),
        [`Top ${top.length} of ${int(i.a.rows.length)} rows (all in the CSV)`, ...top.map((r) => `${orgLink(r)} ${val(r)}`)], top.filter((r) => r.ein));
    } else if (i.a.rows.length) {
      const facts = rowFacts(i.a.rows[0]);
      if (facts.length) add("count", "Counted", facts.slice(0, 3).join(", "), [...facts, ...(i.a.rows.length > 1 ? [`${int(i.a.rows.length)} rows in the CSV`] : [])]);
    }
  }

  // 5. Computed.
  const ch = ev.change;
  if (ch) {
    const det = [`change = (${money(ch.z)} − ${money(ch.a)}) / ${money(ch.a)} = ${signedPct(ch.g)}${ch.primary ? ", main-purpose (primary) orgs" : ""}`];
    if (ch.real != null && ch.cpiFrom && ch.cpiTo) det.push(`after inflation: (1 ${ch.g >= 0 ? "+" : "−"} ${pct(Math.abs(ch.g))}) × CPI-U ${ch.from} / CPI-U ${ch.to} (${ch.cpiFrom.toFixed(1)} / ${ch.cpiTo.toFixed(1)} = ${(ch.cpiFrom / ch.cpiTo).toFixed(3)}) − 1 = ${signedPct(ch.real)}`);
    if (ev.perYearAvg) det.push(`a year = ${money(ev.perYearAvg.sum)} / ${ev.perYearAvg.years} full years = ${money(ev.perYearAvg.sum / ev.perYearAvg.years)}`);
    add("compute", "Computed", `change ${ch.from} to ${ch.to} = ${b(signedPct(ch.g))}${ch.real != null ? `, after inflation (CPI-U) ${b(signedPct(ch.real))}` : ""}`, det);
  } else if (ev.ratio) {
    const { a, z, first, second } = ev.ratio;
    add("compute", "Computed", `${first} ${b(money(a))} vs ${second} ${b(money(z))}, ratio ${b(`${(Math.max(a, z) / Math.max(1, Math.min(a, z))).toFixed(1)}x`)}`,
      [ev.share ? `shares: ${money(a)} / ${money(ev.share.base)} = ${pct(a / ev.share.base)}, ${money(z)} / ${money(ev.share.base)} = ${pct(z / ev.share.base)} of ${ev.share.of}` : ""]);
  } else if (ev.share) {
    const sh = ev.share;
    add("compute", "Computed", `share = ${money(sh.part)} / ${money(sh.base)} = ${b(pct(sh.part / Math.max(1, sh.base)))} of ${sh.of}`,
      [ev.perYearAvg ? `a year = ${money(ev.perYearAvg.sum)} / ${ev.perYearAvg.years} full years = ${money(ev.perYearAvg.sum / ev.perYearAvg.years)}` : ""]);
  } else if (i.change) {
    add("compute", "Computed", `change ${i.change.from} to ${i.change.to} = ${b(signedPct(i.change.g))}`, [yt ? `from the per-year totals above` : ""]);
  } else if (i.versus) {
    const { a, z, first, second } = i.versus;
    add("compute", "Computed", `${first} ${b(money(a))} vs ${second} ${b(money(z))}`);
  } else if (i.a.numbers.length) {
    add("compute", "Computed", i.a.numbers.map((n) => `${b(n.value)} ${n.label}`).join(", "), i.a.numbers.filter((n) => n.note).map((n) => `${n.value} ${n.label}: ${n.note}`));
  }

  // 6. Compared.
  if (ev.baseline) {
    const bl = ev.baseline;
    add("compare", "Compared", `${bl.label} ${b(signedPct(bl.g))}${bl.real != null ? ` (${signedPct(bl.real)} after inflation)` : ""} over the same years`,
      [`baseline change = (${money(bl.z)} − ${money(bl.a)}) / ${money(bl.a)} = ${signedPct(bl.g)}`,
        ch ? `the cause ${ch.g < bl.g ? "trailed" : "beat"} the baseline by ${Math.round(Math.abs(ch.g - bl.g) * 100)} percentage points` : ""]);
  } else if (ev.share && !ev.ratio) {
    add("compare", "Compared", `against ${money(ev.share.base)} of ${ev.share.of}`);
  }

  // 7. Checked.
  const checks: string[] = [];
  const sp = ev.spike;
  if (sp) checks.push(`${sp.year} was unusually high: ${money(sp.usd)} vs ${money(sp.prevUsd)} in ${sp.prev} (${b(signedPct(sp.jump))})${sp.sinceG != null ? `. From ${sp.since} the change is ${b(signedPct(sp.sinceG))}${sp.sinceReal != null ? ` (${signedPct(sp.sinceReal)} after inflation)` : ""}` : ""}`);
  if (sp?.paper) checks.push(`${sp.prev} returns were partly filed on paper, so part of the jump is filers moving to e-file`);
  const bench = i.a.coverage.filter((c) => !/identified|grants counted/i.test(c.label));
  checks.push(...bench.map((c) => `${c.label}: ${c.value}`));
  const lag = i.a.caveats.find((c) => /still arriving|incomplete/i.test(c));
  const hq = i.a.caveats.find((c) => /headquartered|place of performance/i.test(c));
  if (lag) checks.push(lag);
  if (hq) checks.push(hq);
  const rest = i.a.caveats.filter((c) => c !== lag && c !== hq);
  add("check", "Checked", sp ? `start year ${sp.year} was a spike (${signedPct(sp.jump)} vs ${sp.prev})${sp.sinceG != null ? `, from ${sp.since} ${b(signedPct(sp.sinceG))}` : ""}`
    : `${int(i.a.caveats.length)} caveat${i.a.caveats.length === 1 ? "" : "s"}${bench.length ? `, ${bench.length} coverage check${bench.length === 1 ? "" : "s"}` : ""}${i.a.basis ? `, cause is approximate (${i.a.basis === "codes" ? "IRS codes" : "keywords"})` : ""}`,
    [...checks, ...rest]);

  // 8. Reproduce.
  add("reproduce", "Reproduce", `${int(i.a.queries.length)} SQL quer${i.a.queries.length === 1 ? "y" : "ies"}${i.a.rows.length ? `, CSV with ${int(i.a.rows.length)} rows` : ""}`,
    i.a.queries.map((q, k) => `${k + 1}. ${q.title}`));
  return steps.map((x, k) => ({ n: k + 1, ...x }));
}
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
