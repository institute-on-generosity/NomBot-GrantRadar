// The search summary's computed part (no Claude, no database): the facts object, the count line, the caveat line,
// and the post-check that keeps Claude's description to the names and numbers it was given (lib/searchSummary.ts).
// Pure functions, unit-tested in eval/summary.mts.

export type SummaryOrg = {
  name: string;                 // as shown in the list (title case)
  tier: string | null;          // place tier key ("in", "serves", "nearby", "county", "wider"), null without a place
  cause: string | null;         // IRS cause (NTEE) label
  label: "primary" | "partial" | null; // the cause label filter's tier for this org
  revenue: number | null;       // latest yearly income
  grants: number;               // foundation grants (990-PF), GRANT_YEARS
  hasText: boolean;             // has 990 mission or program text (false: known by name and cause code only)
  prefers: string[];            // soft preferences its filings mention
};

export type SummaryFacts = {
  strong: number;               // strong matches: what the list shows first
  weaker: number;               // scored under 50, folded under "Show weaker matches" (place tiers) or below the strong ones
  related: number;              // every organization the search matched
  scored: boolean;              // false: relevance scoring failed or is off, every row counts
  noun: string;                 // "youth sports programs", or "strong matches"
  tiers: { key: string; label: string; count: number }[] | null; // place searches: strong matches per tier, list order
  split: { label: string; count: number }[];                       // no place: main vs partial focus, or the top causes
  revenue: { reported: number; median: number; min: number; max: number; under250k: number; over1m: number } | null;
  funded: number;               // strong matches with foundation grants
  grantsTotal: number;
  grantYears: [number, number];
  nameOnly: number;             // no 990 text
  prefers: { label: string; count: number }[];
  largest: { name: string; revenue: number }[];
};

export const money = (n: number) => {
  const a = Math.abs(n);
  if (a >= 999.5e6) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  return a >= 1e3 ? `$${Math.round(a / 1e3)}K` : `$${Math.round(a)}`;
};
const num = (n: number) => n.toLocaleString("en-US");
const pct = (n: number, of: number) => `${Math.round((100 * n) / Math.max(1, of))}%`;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// "youth sports programs" reads as a count noun; "climate" or "health" doesn't, so those say "strong matches".
// The count's noun from the query: a group noun as is ("youth sports programs", "food banks"), a cause word plus
// "groups" ("arts groups"), else "organizations".
const GROUP = /(programs|groups|organizations|nonprofits|charities|banks|pantries|shelters|clubs|centers|centres|foundations|leagues|clinics|schools|museums|theaters|theatres|orchestras|libraries|camps|teams|hospitals|ministries|councils|associations|societies|funds|trusts|coalitions|networks|agencies|academies|homes|initiatives|projects|services)$/;
export function countNoun(topic: string | undefined, scored: boolean) {
  const t = (topic ?? "").trim().toLowerCase();
  if (scored && t && t.split(/\s+/).length <= 5 && GROUP.test(t)) return t;
  // A cause word gets "groups": "arts" -> "arts groups", "youth leadership" -> "youth leadership groups"
  if (scored && t && t.split(/\s+/).length <= 3 && /^[a-z][a-z &'-]*$/.test(t)) return `${t} groups`;
  return scored ? "organizations" : "results";
}

export function summaryFacts(orgs: SummaryOrg[], o: {
  weaker: number; related: number; scored: boolean; topic?: string; grantYears: [number, number];
  tiers?: { key: string; label: string }[]; labelFilter?: boolean;
}): SummaryFacts {
  const revs = orgs.map((r) => r.revenue).filter((x): x is number => x != null && x > 0);
  const causes = new Map<string, number>();
  for (const r of orgs) if (r.cause) causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);
  let split: { label: string; count: number }[] = [];
  if (!o.tiers && o.labelFilter) {
    const main = orgs.filter((r) => r.label === "primary").length, part = orgs.filter((r) => r.label === "partial").length;
    split = [{ label: "main focus", count: main }, { label: "partial focus", count: part }].filter((s) => s.count > 0);
  } else if (!o.tiers) {
    const top = [...causes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2);
    split = top.map(([label, count]) => ({ label, count }));
    const rest = orgs.length - top.reduce((a, [, n]) => a + n, 0);
    if (top.length && rest > 0) split.push({ label: rest === 1 ? "other cause" : "other causes", count: rest });
  }
  const prefLabels = [...new Set(orgs.flatMap((r) => r.prefers))];
  return {
    strong: orgs.length, weaker: o.weaker, related: o.related, scored: o.scored, noun: countNoun(o.topic, o.scored),
    tiers: o.tiers ? o.tiers.map((t) => ({ ...t, count: orgs.filter((r) => r.tier === t.key).length })) : null,
    split,
    revenue: revs.length ? { reported: revs.length, median: median(revs), min: Math.min(...revs), max: Math.max(...revs),
      under250k: revs.filter((x) => x < 250_000).length, over1m: revs.filter((x) => x >= 1_000_000).length } : null,
    funded: orgs.filter((r) => r.grants > 0).length, grantsTotal: orgs.reduce((a, r) => a + r.grants, 0), grantYears: o.grantYears,
    nameOnly: orgs.filter((r) => !r.hasText).length,
    prefers: prefLabels.map((label) => ({ label, count: orgs.filter((r) => r.prefers.includes(label)).length })),
    largest: orgs.filter((r) => r.revenue != null && r.revenue > 0).sort((a, b) => b.revenue! - a.revenue!).slice(0, 2).map((r) => ({ name: r.name, revenue: r.revenue! })),
  };
}

// Line 1 of the summary, the same counts as the list: "23 youth sports programs · 8 in Inglewood · 4 serving Inglewood · 11 nearby".
export function countLine(f: SummaryFacts): { main: string; parts: string[]; more: string | null } {
  // Unscored plain search: the list says "N results" for everything the search matched.
  const main = !f.scored && !f.tiers ? `${num(f.related)} ${f.related === 1 ? "result" : "results"}`
    : `${num(f.strong)} ${f.strong === 1 ? (f.noun === "results" ? "result" : "organization") : f.noun}`;
  // Chips only for place searches (the tiers); a cause or focus split stays in the panel's Breakdown.
  const parts = f.tiers ? f.tiers.filter((t) => t.count > 0).map((t) => `${num(t.count)} ${t.label}`) : [];
  const more = !f.scored ? null
    : f.tiers ? null // weaker matches: the list folds them per tier ("Show N weaker matches"), the summary doesn't repeat it
    : null; // "N related" lives once, in the list header
  return { main, parts, more };
}

// One short caveat, only when it matters: a preference no match confirms, or many matches known only by name.
export function caveatLine(f: SummaryFacts, o: { prefer?: string[]; must?: string; noMention?: boolean } = {}): string | null {
  const out: string[] = [];
  if (o.noMention && o.must) out.push(`No organization's filings mention ${o.must}.`);
  for (const p of o.prefer ?? []) if (f.strong > 0 && !f.prefers.some((x) => x.label === p && x.count > 0)) out.push(`No match's filings mention ${p}.`);
  if (f.nameOnly >= 3 && f.nameOnly / Math.max(1, f.strong) >= 0.2)
    out.push(`${num(f.nameOnly)} ${f.nameOnly === 1 ? "is" : "are"} known by name only (no IRS program details).`);
  return out.length ? out.slice(0, 2).join(" ") : null;
}

// While relevance scores are still coming in: what the search found, by place tier when there are tiers
// (the same totals as the list's tier headings). Replaced by countLine once the list is scored.
export function pendingLine(total: number, tiers?: { label: string; count: number }[]): { main: string; parts: string[]; more: string } {
  // Labelled as provisional (UX audit S3): candidates, not matches, until scoring decides.
  return { main: `${num(total)} ${total === 1 ? "candidate" : "candidates"}`, parts: (tiers ?? []).filter((t) => t.count > 0).map((t) => `${num(t.count)} ${t.label}`), more: "ranking by relevance…" };
}

// Share of the organizations the first description read (the closest matches) that the list now counts as strong.
// Under REGEN_OVERLAP, the description is rewritten from the strong matches in the background.
export const REGEN_OVERLAP = 0.6;
export function overlap(read: string[], strong: string[]): number {
  if (!read.length) return 1;
  const s = new Set(strong);
  return read.filter((e) => s.has(e)).length / read.length;
}

// Key facts in the analysis panel: the same set as the summary (the N shown in the list) and the same grant years.
export type KeyTile = { value: string; label: string; note?: string };
export function keyFactTiles(f: SummaryFacts, deficit: { count: number; of: number } | null): { tiles: KeyTile[]; basis: string; shown: number } {
  const n = f.strong, of = `of the ${num(n)} shown`;
  const [g0, g1] = f.grantYears;
  // Only facts the summary doesn't show (it has the count, median income and the share with grants): the panel adds
  // the median years tax-exempt as a third (components/Landscape).
  const tiles: KeyTile[] = [];
  if (f.grantsTotal > 0) tiles.push({ value: money(f.grantsTotal), label: `from foundations, ${g0}–${g1}`, note: of });
  if (deficit && deficit.of >= 5) tiles.push({ value: pct(deficit.count, deficit.of), label: "overspent last year", note: `${num(deficit.of)} ${of} report` });
  return { tiles: tiles.slice(0, 3), basis: `${num(n)} shown · grants ${g0}–${g1}`, shown: n };
}

// The computed points under the summary's lead sentence (the scored set): typical size, foundation grants, and the
// largest strong matches by income (relevance-checked, so never an off-topic org).
export function summaryPoints(f: SummaryFacts, largest: { name: string; revenue: number }[]): { key: string; text: string }[] {
  const [g0, g1] = f.grantYears;
  const out: { key: string; text: string }[] = [];
  if (f.revenue) out.push({ key: "size", text: `${money(f.revenue.median)} median yearly income` });
  if (f.strong > 0) out.push({ key: "grants", text: `${num(f.funded)} of ${num(f.strong)} got foundation grants, ${g0}–${String(g1).slice(2)}` });
  if (largest.length) out.push({ key: "largest", text: `Largest: ${largest.map((l) => `${l.name} ${money(l.revenue)}`).join(", ")}` });
  return out;
}

// The figures Claude may quote, as plain lines. Every number in the description must come from these or the org list.
// basis "closest": the first description, written from the closest matches while relevance scoring runs.
export function factsText(f: SummaryFacts, basis: "closest" | "strong" = "strong"): string {
  const [g0, g1] = f.grantYears;
  return [
    basis === "closest" ? `Closest matches read (by meaning, not yet checked one by one): ${f.strong}` : `Strong matches read: ${f.strong}`,
    f.tiers ? `By place: ${f.tiers.map((t) => `${t.count} ${t.label}`).join(", ")}` : null,
    f.split.length ? `By ${f.split.some((s) => s.label.includes("focus")) ? "focus" : "cause"}: ${f.split.map((s) => `${s.count} ${s.label}`).join(", ")}` : null,
    f.scored && f.weaker ? `Weaker matches (folded, don't describe them): ${f.weaker}` : null,
    f.revenue ? `Yearly income (${f.revenue.reported} report it): median ${money(f.revenue.median)}, smallest ${money(f.revenue.min)}, largest ${money(f.revenue.max)}, under $250K: ${f.revenue.under250k}, $1M or more: ${f.revenue.over1m}` : "Yearly income: none reported",
    `Foundation grants ${g0} to ${g1}: ${f.funded} of ${f.strong} got any (${pct(f.funded, f.strong)}), ${money(f.grantsTotal)} in all`,
    `Known by name only (no 990 program text): ${f.nameOnly} of ${f.strong}`,
    ...f.prefers.map((p) => `Filings mention "${p.label}": ${p.count} of ${f.strong}`),
    f.largest.length ? `Largest by income: ${f.largest.map((l) => `${l.name} ${money(l.revenue)}`).join(", ")}` : null,
  ].filter(Boolean).join("\n");
}

// ---------- Post-check ----------

// UI copy: no semicolons or em dashes (or spaced en dashes) as punctuation. Ranges like "$100K–$1M" keep their en dash.
export const tidy = (t: string) => t.replace(/\s+[—–]\s+|\s*—\s*/g, ", ").replace(/\s*;\s*/g, ". ").replace(/\.\s+([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`).replace(/\s+/g, " ").trim();

const WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, dozen: 12 };
// Every number in a text, as values: "$1.4M" → 1400000, "44%" → 44, "1,234" → 1234, "eight" → 8. "one" is skipped ("one of the largest").
export function numbersIn(t: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = [];
  const re = /(\$?)(\d[\d,]*(?:\.\d+)?)\s*(K\b|M\b|B\b|thousand\b|million\b|billion\b|%|percent\b)?/gi;
  for (const m of t.matchAll(re)) {
    let v = Number(m[2].replace(/,/g, ""));
    const u = (m[3] ?? "").toLowerCase();
    if (u === "k" || u === "thousand") v *= 1e3; else if (u === "m" || u === "million") v *= 1e6; else if (u === "b" || u === "billion") v *= 1e9;
    out.push({ raw: m[0].trim(), value: v });
  }
  for (const m of t.matchAll(/\b([A-Za-z]+)\b/g)) {
    const w = m[1].toLowerCase();
    if (w in WORDS && w !== "one" && w !== "hundred") out.push({ raw: m[1], value: WORDS[w] });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim();
// Words that can start a sentence or sit capitalized without naming anything.
const COMMON = new Set(["the", "a", "an", "most", "many", "several", "only", "about", "these", "they", "their", "its", "it", "this", "that", "some", "all", "nearly", "half",
  "in", "of", "with", "among", "few", "no", "none", "both", "each", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "more", "fewer", "less",
  "just", "around", "almost", "over", "under", "together", "across", "while", "but", "and", "for", "at", "by", "on", "as", "smaller", "larger", "big", "small", "largest",
  "irs", "form", "990", "990-pf", "ntee", "us", "u.s.", "most", "groups", "programs", "organizations", "nonprofits", "foundation", "foundations", "every", "half", "roughly", "funding", "income"]);
const JOIN = new Set(["of", "the", "and", "for", "&", "de", "la", "at", "in"]);

export type Allowed = { names: string[]; numbers: number[] };
// Builds the allowed sets from what Claude was given: every name and place string, and every number in the inputs.
export function allowedFrom(texts: string[], names: string[]): Allowed {
  return { names: names.map(norm).filter(Boolean), numbers: texts.flatMap((t) => numbersIn(t).map((n) => n.value)) };
}

// Capitalized runs ("Girl Scouts Of Greater Los Angeles", "Laxpoint") that might name an organization or place.
// first: the run starts the sentence, so its first word may just be capitalized ("Typical", "Small groups").
function nameRuns(sentence: string): { run: string; first: boolean }[] {
  const toks = sentence.match(/[A-Za-z0-9][A-Za-z0-9.&'’-]*|[,:()"“”]/g) ?? [];
  const runs: { run: string; first: boolean }[] = [];
  let cur: string[] = [], start = true, runStart = false;
  const flush = () => {
    while (cur.length && JOIN.has(cur[cur.length - 1].toLowerCase())) cur.pop();
    if (cur.length) runs.push({ run: cur.join(" "), first: runStart });
    cur = [];
  };
  for (const w of toks) {
    if (/^[,:()"“”]$/.test(w)) { flush(); start = false; continue; }
    const cap = /^[A-Z]/.test(w);
    if (cap) { if (!cur.length) runStart = start; cur.push(w); }
    else if (cur.length && JOIN.has(w.toLowerCase())) cur.push(w);
    else flush();
    start = false;
  }
  flush();
  return runs;
}

// A run passes as it stands, or (at the start of a sentence) without its first word.
const runOk = ({ run, first }: { run: string; first: boolean }, a: Allowed) => {
  if (nameOk(run, a)) return true;
  if (!first) return false;
  const rest = run.split(" ").slice(1);
  while (rest.length && JOIN.has(rest[0].toLowerCase())) rest.shift();
  return !rest.length || nameOk(rest.join(" "), a);
};

function nameOk(run: string, a: Allowed): boolean {
  const r = norm(run);
  // "Inglewood Little League and Inglewood Sc": two names joined by "and" pass when each does.
  if (!nameOne(r, a) && / (and|&) /.test(r)) return r.split(/ (?:and|&) /).every((p) => nameOne(p, a));
  return nameOne(r, a);
}
function nameOne(r: string, a: Allowed) {
  if (!r) return true;
  const words = r.split(" ").filter((w) => !COMMON.has(w));
  if (!words.length) return true;
  return a.names.some((n) => ` ${n} `.includes(` ${r} `)) || (words.length === 1 && a.names.some((n) => ` ${n} `.includes(` ${words[0]} `)));
}
const numOk = (v: number, a: Allowed) => a.numbers.some((x) => x === v || (x > 0 && Math.abs(x - v) / x < 0.051));

// A sentence that states how many matches or results there are ("There are 23 strong matches", "42 results").
// The count line says that and changes once scoring finishes, so the description must not. "9 of the 20" is fine.
const NUMWORD = Object.keys(WORDS).join("|");
export const statesCount = (s: string) =>
  new RegExp(`(?<!\\bof\\s(?:the\\s|these\\s)?)\\b(?:\\d[\\d,]*|${NUMWORD})\\s+(?:(?:strong|closest|relevant|top)\\s+)?(?:matches|results)\\b`, "i").test(s)
  || /\bthere (?:are|were) (?:\d|about \d)/i.test(s);

// Keeps the sentences whose names and numbers all come from the inputs; drops the rest (logged by the caller).
export function checkSummary(text: string, a: Allowed): { text: string; dropped: { sentence: string; why: string }[] } {
  // Sentence ends: a stop then a space and a capital, so "$1.4M" and "U.S. groups" stay whole.
  const merged = tidy(text).split(/(?<=[.!?])\s+(?=[A-Z0-9"“$])/).map((s) => s.trim()).filter(Boolean);
  const kept: string[] = [], dropped: { sentence: string; why: string }[] = [];
  for (const s of merged) {
    const badName = nameRuns(s).find((r) => !runOk(r, a))?.run;
    const badNum = numbersIn(s).find((n) => !numOk(n.value, a));
    const count = statesCount(s);
    if (badName || badNum || count) dropped.push({ sentence: s, why: badName ? `name "${badName}"` : badNum ? `number "${badNum.raw}"` : "states the count" });
    else kept.push(s);
  }
  return { text: kept.join(" "), dropped };
}
