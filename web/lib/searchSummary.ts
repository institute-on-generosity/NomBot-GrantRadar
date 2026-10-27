// Search summary: the card under the search bar. Line 1 is computed (lib/summaryFacts): right away, what the search
// found (pendingLine); once relevance scoring finishes, how many strong matches the list shows, by place tier or by
// focus/cause (countLine). Then 2-3 sentences Claude writes from the CLOSEST unscored matches (names, missions,
// income, grants) and a facts object computed from that same set, so the text lands with or before the old overview
// instead of waiting 9-14 s for scoring (Oct 27, Hunter: prefer speed). The text describes "the closest matches" and
// never states the count (statesCount), so it can't contradict the line above. Checked afterwards: a sentence with an
// organization name or number not in the inputs is dropped (checkSummary). When scoring shows that under 60% of the
// orgs it read are strong matches, it is rewritten from the strong matches in the background and swapped in.
// A caveat line and the panel's Key facts (same set as the count line, grants GRANT_YEARS) are computed too.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { orgName, readable, titleCase } from "../components/text";

// Display names for the largest list: readable casing, no "Inc"-style suffix, IRS run-ons split ("CENTERINC").
export const displayName = (raw: string) => orgName(raw.replace(/\b(center|centre|foundation|association)inc\b/gi, "$1 Inc"), 60).replace(/[, ]+(inc|incorporated|corp|corporation|co|ltd|llc)\.?$/i, "").trim();
import { claude, fallback, FAST_MODEL } from "./llm";
import { diskMemo } from "./memo";
import type { Filters } from "./parse";
import { tierTitle, TIER_ORDER, type Scope } from "./place";
import { fundingOf, GRANT_YEARS } from "./placeReport";
import { isStrong, POOL, rank, searchCandidates, type Ranked } from "./rerank";
import type { Result } from "./search";
import { healthOf } from "./landscape";
import { allowedFrom, caveatLine, checkSummary, countLine, factsText, keyFactTiles, money, overlap, pendingLine, REGEN_OVERLAP, summaryPoints, summaryFacts, tidy, type SummaryFacts, type SummaryOrg } from "./summaryFacts";

export type KeyFacts = ReturnType<typeof keyFactTiles>;
export type SummaryHead = { facts: SummaryFacts; line: ReturnType<typeof countLine>; caveat: string | null; keyFacts: KeyFacts; largest: { ein: string; name: string; revenue: number }[]; shown: Result[] }; // shown: the strong set, for the panel (server only)
export type Basis = "closest" | "strong";
export type SummaryText = { text: string; explore: string[]; dropped: number; basis: Basis; computed?: boolean }; // computed: the fallback lead
// pending: instant. ai: the first description (closest matches). head: after scoring (count line, caveat, Key facts).
// later: the description rewritten from the strong matches when they differ a lot from what ai read, else null.
export type Summary = { pending: ReturnType<typeof pendingLine>; ai: Promise<SummaryText | null>; head: Promise<SummaryHead>; later: Promise<SummaryText | null> };

const MAX_ORGS = 30; // strong matches Claude reads (most relevant first per tier)
const CLOSEST = 20;  // unscored candidates the first description reads (69% relevant in the top 10, eval/bench.mts)

const SYSTEM = `You write the one-line lead of the summary shown under a nonprofit search box, above the list of results.
You get the user's question, figures computed from a set of matching organizations, and those organizations (IRS data, with their place when the question names one).
Write "summary": ONE complete plain sentence of at most 12 words (a hard limit: count them) saying what kinds of work these matches do, like "Mentoring and after-school leadership programs, mostly in Louisville and Lexington." Start with the kinds of programs. No filler such as "Most of these matches" or "These organizations".
The page shows the count, typical size, foundation funding and the largest organizations under your sentence, computed from the data, so leave all of that out.
Rules, strictly:
- No numbers and no organization names.
- Name only places that appear in the question or the organization lines (cities, states). No regions or neighborhoods from your own knowledge.
- Never say how many matches or results there are.
- Describe only the organizations that fit the question. Ignore the ones that clearly don't, and never mention an organization to say it doesn't fit.
- No semicolons, no dashes as punctuation, no colons, no lists, no citations, no advice, no hype.
- Plain words for a busy reader.
Also write "explore": 3 related searches the user might run next, phrased like their question (at most 9 words each), each a different angle (a nearby cause, another place, or a narrower activity). Don't repeat the question.`;

const schema = z.object({ summary: z.string(), explore: z.array(z.string()) });

const shortTier = (t: string, s: Scope) => {
  const city = s.kind === "city" ? titleCase(s.city) : s.label;
  return t === "in" ? `in ${city}` : t === "serves" ? `serving ${city}` : t === "nearby" ? "nearby" : t === "county" ? `in ${s.label}` : t === "wider" ? tierTitle("wider", s).toLowerCase() : t;
};

type Found = { total: number; results: Result[]; tiers?: { tier: string; total: number; results: Result[] }[]; scope?: Scope | null; exact_total: number | null; softPrefs?: string[] };

type Ranking = { results: Ranked[]; scored: boolean };
// The strong matches exactly as the page's list counts them (app/page.tsx): a place search counts the rows it shows
// (TieredList: unscored rows count as strong, weaker ones are folded per tier); a plain search counts the strong
// matches among every scored candidate (RankedList strongTotal), or every result when scoring is off.
export function listStrong(res: { tiers?: unknown[] }, shown: Ranking, all: Ranking) {
  if (res.tiers) return { strong: shown.results.filter((r) => !r.relevance || isStrong(r)), weaker: shown.results.filter((r) => r.relevance && !isStrong(r)).length, scored: shown.scored };
  if (!all.scored) return { strong: all.results.slice(0, 20), weaker: 0, scored: false };
  return { strong: all.results.filter((r) => r.relevance && isStrong(r)), weaker: all.results.filter((r) => r.relevance && !isStrong(r)).length, scored: true };
}

// The closest unscored candidates, before relevance scoring: the search's top CLOSEST, or with place tiers the top
// of each tier in turn (in the city, serving it, nearby, ...) so every tier the list shows is represented.
export function closestOf(res: Found): Result[] {
  if (!res.tiers) return res.results.slice(0, CLOSEST);
  const tiers = TIER_ORDER.flatMap((t) => res.tiers!.filter((b) => b.tier === t)).map((b) => b.results);
  const out: Result[] = [];
  for (let k = 0; out.length < CLOSEST && tiers.some((t) => t.length > k); k++) for (const t of tiers) if (t[k] && out.length < CLOSEST) out.push(t[k]);
  return out;
}

const tiersOf = (res: Found) => res.tiers && res.scope ? TIER_ORDER.filter((t) => res.tiers!.some((b) => b.tier === t)).map((t) => ({ key: t, label: shortTier(t, res.scope!) })) : undefined;

// A set of organizations as the summary reads them (funding from grant_clean, GRANT_YEARS).
async function orgsOf(rs: Result[]): Promise<(SummaryOrg & { r: Result })[]> {
  const funding = await fundingOf(rs.map((r) => r.ein));
  return rs.map((r) => ({
    r, name: titleCase(r.name), tier: r.place?.tier ?? null, cause: r.ntee?.label ?? null, label: r.label?.tier ?? null,
    revenue: r.revenue?.amount ?? null, grants: funding.get(r.ein.replace("-", ""))?.total ?? 0,
    hasText: Boolean(r.mission || r.programs), prefers: r.prefer ?? [],
  }));
}
type Input = { facts: SummaryFacts; orgs: (SummaryOrg & { r: Result })[]; scope: Scope | null };

// The first description's input: the closest matches and a facts object from that same set (no place-tier counts,
// which would be counts of this sample, not of the list).
async function closestInput(filters: Filters, res: Found): Promise<Input> {
  const orgs = await orgsOf(closestOf(res));
  const facts = summaryFacts(orgs, { weaker: 0, related: res.total, scored: false, topic: filters.topic, grantYears: [GRANT_YEARS[0], GRANT_YEARS[1]], labelFilter: Boolean(filters.label) });
  return { facts, orgs, scope: res.scope ?? null };
}

export async function summaryHead(question: string, filters: Filters, res: Found, shown: Ranking, all: Ranking): Promise<SummaryHead & Input> {
  const { strong, weaker, scored } = listStrong(res, shown, all);
  const [orgs, health] = await Promise.all([orgsOf(strong), healthOf(strong.map((r) => r.ein.replace("-", "")))]);
  const facts = summaryFacts(orgs, { weaker, related: res.total, scored, topic: filters.topic, grantYears: [GRANT_YEARS[0], GRANT_YEARS[1]], tiers: tiersOf(res), labelFilter: Boolean(filters.label) });
  const must = filters.requirements.map((r) => r.label).join(" + ");
  const caveat = caveatLine(facts, { prefer: filters.prefer?.map((p) => p.label), must, noMention: res.exact_total === 0 && Boolean(must) });
  const def = health.signals.find((s) => s.key === "deficit");
  // The largest strong matches by income (relevance-checked, so never an off-topic org), linked from the summary.
  const largest = orgs.filter((o) => o.revenue != null && o.revenue > 0).sort((a, b) => b.revenue! - a.revenue!).slice(0, 2).map((o) => ({ ein: o.r.ein, name: displayName(o.r.name), revenue: o.revenue! }));
  return { facts, line: countLine(facts), caveat, keyFacts: keyFactTiles(facts, def ? { count: def.orgs.length, of: def.of } : null), largest, shown: strong, orgs, scope: res.scope ?? null };
}

async function fresh(question: string, input: Input, basis: Basis): Promise<SummaryText | null> {
  const client = claude("search-summary");
  const { facts, orgs, scope } = input;
  if (!client || orgs.length < 2) return null;
  const read = orgs.slice(0, MAX_ORGS);
  const lines = read.map(({ r, ...o }) => [
    o.name, o.tier && scope ? shortTier(o.tier, scope) : [r.city && titleCase(r.city), r.state].filter(Boolean).join(", "), o.cause,
    o.revenue ? `income ${money(o.revenue)}` : "income not reported", o.grants ? `foundation grants ${money(o.grants)}` : null,
    o.hasText ? readable([r.mission, r.programs].filter(Boolean).join(" ")).slice(0, 220) : "known by name only, no 990 program text",
  ].filter(Boolean).join(" · "));
  const figures = factsText(facts, basis);
  const places = [...new Set(read.flatMap(({ r }) => [r.city && titleCase(r.city), r.state]).filter(Boolean) as string[])];
  const names = [...read.map((o) => o.name), ...places, ...(scope ? [scope.label, scope.kind === "city" ? titleCase(scope.city) : scope.name, scope.kind === "city" ? scope.county?.name ?? "" : ""] : []),
    ...read.map((o) => o.cause ?? ""), ...(facts.tiers ?? []).map((t) => t.label), question, figures];
  const head = basis === "closest" ? "The closest matches (by meaning, not yet checked one by one: a few may not fit)" : `The strong matches${orgs.length > read.length ? ` (the ${read.length} most relevant)` : ""}`;
  const res = await client.beta.messages.parse({
    model: FAST_MODEL,
    max_tokens: 1500,
    ...fallback(FAST_MODEL),
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Question: ${question}\n\nFigures:\n${figures}\n\n${head}:\n${lines.join("\n")}` }],
  });
  const o = res.parsed_output;
  if (res.stop_reason === "refusal" || !o) return null;
  const checked = checkSummary(o.summary, allowedFrom([figures, ...lines, question], names));
  if (checked.dropped.length) console.warn("search summary: dropped", JSON.stringify(checked.dropped));
  // Never shown cut off: a lead over 18 words (or none left after the check) becomes a computed sentence.
  const words = checked.text.split(/\s+/).filter(Boolean).length;
  const text = checked.text && words <= 18 ? checked.text : fallbackLead(input); // 18: room for a complete 16-17 word sentence
  if (text !== checked.text) console.warn("search summary: computed lead used", JSON.stringify({ words, text: checked.text }));
  if (!text) return null;
  return { text, explore: o.explore.slice(0, 3).map(tidy), dropped: checked.dropped.length, basis, computed: text !== checked.text };
}

// The computed lead: the most common cause and the two most common cities ("Recreation & Sports groups, mostly in
// Inglewood and Los Angeles."). Only names and places from the data, so it needs no check.
export function fallbackLead(input: { facts: SummaryFacts; orgs: (SummaryOrg & { r: Result })[] }): string | null {
  const count = (xs: (string | null | undefined)[]) => { const m = new Map<string, number>(); for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  const cause = count(input.orgs.map((o) => o.cause))[0]?.[0];
  const cities = count(input.orgs.map((o) => o.r.city && titleCase(o.r.city))).filter(([, n]) => n >= 2).slice(0, 2).map(([c]) => c);
  if (!cause) return null;
  return `Mostly ${cause.toLowerCase()}${cities.length ? `, based in ${cities.join(" and ")}` : ""}.`;
}

const cached = diskMemo<SummaryText | null>("search-summary:v11", 200, 7 * 24 * 3600_000, { toJSON: (v) => v, fromJSON: (j) => j as SummaryText | null, keep: (v) => v != null && !v.computed }); // fallbacks stay in memory only // bump when the prompt changes (v11: ≤12 asked, ≤18 kept; v10: ≤15 asked; v9: 6 to 12 words; v8: complete sentence ≤15 words, no filler, computed fallback; v7: 8 to 12 words; v6: at most 15 words; v5: at most 18 words; v4: one lead sentence, no names or numbers; v3: closest matches first, no counts; v2: no outside place names)
const safe = (p: Promise<SummaryText | null>) => p.catch((err) => { console.error("search summary failed", err); return null; });
const keyOf = (basis: Basis, question: string, eins: string[]) => `${basis}|${question.toLowerCase().replace(/\s+/g, " ").trim()}|${eins.join(",")}`;

// The whole summary for a search, without waiting for relevance scores: the pending line now, the description from
// the closest matches in parallel with scoring, then the scored count line (and, rarely, a rewritten description).
// ranking / rankingAll: the page's own rank() promises (the list's rows and every scored candidate).
export function searchSummary(question: string, filters: Filters, res: Found, ranking: Promise<Ranking>, rankingAll: Promise<Ranking>): Summary {
  const tiers = tiersOf(res);
  const pending = pendingLine(res.total, tiers && res.tiers ? tiers.map((t) => ({ label: t.label, count: res.tiers!.find((b) => b.tier === t.key)?.total ?? 0 })) : undefined);
  const first = closestInput(filters, res);
  const ai = safe(first.then((input) => cached(keyOf("closest", question, input.orgs.map((o) => o.r.ein)), () => fresh(question, input, "closest"))));
  const head = Promise.all([ranking, rankingAll]).then(([shown, all]) => summaryHead(question, filters, res, shown, all));
  // Background rewrite: only when scoring finds that most of what the first description read isn't a strong match.
  const later = safe(Promise.all([first, head, ai]).then(([input, h, t]) => {
    const strongEins = h.orgs.map((o) => o.r.ein);
    if (!h.facts.scored || strongEins.length < 2) return null;
    if (t && overlap(input.orgs.map((o) => o.r.ein), strongEins) >= REGEN_OVERLAP) return null;
    return cached(keyOf("strong", question, strongEins), () => fresh(question, h, "strong"));
  }));
  return { pending, ai, head: head.then(({ facts, line, caveat, keyFacts, largest, shown }) => ({ facts, line, caveat, keyFacts, largest, shown })), later };
}

// The page's default view (10 rows, no "Show more"), for the CSV export and /report: same scores, same summary cache.
export async function summaryFor(question: string, filters: Filters, includeInactive: boolean) {
  const res = await searchCandidates(filters, { includeInactive, limit: 10 });
  return searchSummary(question, filters, res, rank(question, res, 10), rank(question, res, POOL));
}

// For exports (CSV, /report): the summary as plain text lines (the scored count line, the newest description).
export async function summaryLines(s: Summary): Promise<string[]> {
  const [head, ai, later] = await Promise.all([s.head, s.ai, s.later]);
  const t = later ?? ai;
  return [[head.line.main, ...head.line.parts].join(" · ") + (head.line.more ? ` (${head.line.more})` : ""), t?.text ?? "", ...summaryPoints(head.facts, head.largest).map((p) => p.text), head.caveat ?? ""].filter(Boolean);
}

