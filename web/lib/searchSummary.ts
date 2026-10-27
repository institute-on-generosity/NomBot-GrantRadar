// Search summary: the card under the search bar. Line 1 is computed (lib/summaryFacts countLine): how many strong
// matches the list shows, by place tier or by focus/cause. Then 2-3 sentences Claude writes ONLY from the strong
// matches (names, missions, income, grants, tiers) and a computed facts object, checked afterwards: a sentence with
// an organization name or number not in the inputs is dropped (checkSummary). A caveat line is computed too.
// It replaces the AI overview (lib/overview, removed Oct 26): one AI blurb per search. Cached per query + matches.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { readable, titleCase } from "../components/text";
import { claude, fallback, FAST_MODEL } from "./llm";
import { memo } from "./memo";
import type { Filters } from "./parse";
import { tierTitle, TIER_ORDER, type Scope } from "./place";
import { fundingOf, GRANT_YEARS } from "./placeReport";
import { isStrong, POOL, rank, searchCandidates, type Ranked } from "./rerank";
import type { Result } from "./search";
import { allowedFrom, caveatLine, checkSummary, countLine, factsText, money, summaryFacts, tidy, type SummaryFacts, type SummaryOrg } from "./summaryFacts";

export type SummaryHead = { facts: SummaryFacts; line: ReturnType<typeof countLine>; caveat: string | null };
export type SummaryText = { text: string; explore: string[]; dropped: number };
export type Summary = SummaryHead & { ai: Promise<SummaryText | null> };

const MAX_ORGS = 30; // strong matches Claude reads (most relevant first per tier)

const SYSTEM = `You write the short summary shown under a nonprofit search box, above the list of results.
You get the user's question, figures computed from the strong matches, and the strong matches themselves (IRS data, grouped by place when the question names one).
Write "summary": 2 or 3 plain sentences that describe the whole set, like a researcher's one-paragraph brief:
- what kinds of organizations or programs these are (name the main kinds of work you see in the missions)
- how big they typically are and how they are funded (median income, how many get foundation grants)
- the largest or most notable one or two, by name
Rules, strictly:
- Use ONLY numbers that appear in the Figures or the organization lines, written the same way (for example "$195K", "9 of 30", "44%"). Never compute, round or estimate a new number. Words like "most", "a few" and "about half" are fine.
- Use ONLY organization names from the list, written exactly as given or as a shorter piece of the exact name. Never invent or guess a name.
- Name only places that appear in the question or the organization lines (cities, states). No regions or neighborhoods from your own knowledge.
- Describe the strong matches only, not the weaker ones.
- No semicolons, no dashes as punctuation, no colons, no lists, no citations, no advice, no hype.
- Plain words for a busy reader: "income" not "revenue", "spent more than it took in" not "deficit".
- Do not start with the count of results (the line above already says it).
Also write "explore": 3 related searches the user might run next, phrased like their question (at most 9 words each), each a different angle (a nearby cause, another place, or a narrower activity). Don't repeat the question.`;

const schema = z.object({ summary: z.string(), explore: z.array(z.string()) });

const shortTier = (t: string, s: Scope) => {
  const city = s.kind === "city" ? titleCase(s.city) : s.label;
  return t === "in" ? `in ${city}` : t === "serves" ? `serving ${city}` : t === "nearby" ? "nearby" : t === "county" ? `in ${s.label}` : t === "wider" ? tierTitle("wider", s).toLowerCase() : t;
};

type Found = { total: number; tiers?: { tier: string }[]; scope?: Scope | null; exact_total: number | null; softPrefs?: string[] };

type Ranking = { results: Ranked[]; scored: boolean };
// The strong matches exactly as the page's list counts them (app/page.tsx): a place search counts the rows it shows
// (TieredList: unscored rows count as strong, weaker ones are folded per tier); a plain search counts the strong
// matches among every scored candidate (RankedList strongTotal), or every result when scoring is off.
export function listStrong(res: { tiers?: unknown[] }, shown: Ranking, all: Ranking) {
  if (res.tiers) return { strong: shown.results.filter((r) => !r.relevance || isStrong(r)), weaker: shown.results.filter((r) => r.relevance && !isStrong(r)).length, scored: shown.scored };
  if (!all.scored) return { strong: all.results.slice(0, 20), weaker: 0, scored: false };
  return { strong: all.results.filter((r) => r.relevance && isStrong(r)), weaker: all.results.filter((r) => r.relevance && !isStrong(r)).length, scored: true };
}

export async function summaryHead(question: string, filters: Filters, res: Found, shown: Ranking, all: Ranking) {
  const { strong, weaker, scored } = listStrong(res, shown, all);
  const funding = await fundingOf(strong.map((r) => r.ein));
  const orgs: (SummaryOrg & { r: Result })[] = strong.map((r) => ({
    r, name: titleCase(r.name), tier: r.place?.tier ?? null, cause: r.ntee?.label ?? null, label: r.label?.tier ?? null,
    revenue: r.revenue?.amount ?? null, grants: funding.get(r.ein.replace("-", ""))?.total ?? 0,
    hasText: Boolean(r.mission || r.programs), prefers: r.prefer ?? [],
  }));
  const scope = res.scope ?? null;
  const tiers = res.tiers && scope ? TIER_ORDER.filter((t) => res.tiers!.some((b) => b.tier === t)).map((t) => ({ key: t, label: shortTier(t, scope) })) : undefined;
  const facts = summaryFacts(orgs, { weaker, related: res.total, scored, topic: filters.topic, grantYears: [GRANT_YEARS[0], GRANT_YEARS[1]], tiers, labelFilter: Boolean(filters.label) });
  const must = filters.requirements.map((r) => r.label).join(" + ");
  const caveat = caveatLine(facts, { prefer: filters.prefer?.map((p) => p.label), must, noMention: res.exact_total === 0 && Boolean(must) });
  return { facts, line: countLine(facts), caveat, orgs, scope };
}

async function fresh(question: string, head: Awaited<ReturnType<typeof summaryHead>>): Promise<SummaryText | null> {
  const client = claude("search-summary");
  const { facts, orgs, scope } = head;
  if (!client || orgs.length < 2) return null;
  const read = orgs.slice(0, MAX_ORGS);
  const lines = read.map(({ r, ...o }) => [
    o.name, o.tier && scope ? shortTier(o.tier, scope) : [r.city && titleCase(r.city), r.state].filter(Boolean).join(", "), o.cause,
    o.revenue ? `income ${money(o.revenue)}` : "income not reported", o.grants ? `foundation grants ${money(o.grants)}` : null,
    o.hasText ? readable([r.mission, r.programs].filter(Boolean).join(" ")).slice(0, 220) : "known by name only, no 990 program text",
  ].filter(Boolean).join(" · "));
  const figures = factsText(facts);
  const places = [...new Set(read.flatMap(({ r }) => [r.city && titleCase(r.city), r.state]).filter(Boolean) as string[])];
  const names = [...read.map((o) => o.name), ...places, ...(scope ? [scope.label, scope.kind === "city" ? titleCase(scope.city) : scope.name, scope.kind === "city" ? scope.county?.name ?? "" : ""] : []),
    ...read.map((o) => o.cause ?? ""), ...(facts.tiers ?? []).map((t) => t.label), question, figures];
  const res = await client.beta.messages.parse({
    model: FAST_MODEL,
    max_tokens: 1500,
    ...fallback(FAST_MODEL),
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Question: ${question}\n\nFigures:\n${figures}\n\nStrong matches${orgs.length > read.length ? ` (the ${read.length} most relevant of ${orgs.length})` : ""}:\n${lines.join("\n")}` }],
  });
  const o = res.parsed_output;
  if (res.stop_reason === "refusal" || !o) return null;
  const checked = checkSummary(o.summary, allowedFrom([figures, ...lines, question], names));
  if (checked.dropped.length) console.warn("search summary: dropped", JSON.stringify(checked.dropped));
  if (!checked.text) return null;
  return { text: checked.text, explore: o.explore.slice(0, 3).map(tidy), dropped: checked.dropped.length };
}

const cached = memo<SummaryText | null>("search-summary:v2", 200, 24 * 3600_000); // bump when the prompt changes (v2: no outside place names)
// The whole summary for a search: the head (computed) right away, the AI text as a promise.
// ranking / rankingAll: the page's own rank() promises (the list's rows and every scored candidate).
export async function searchSummary(question: string, filters: Filters, res: Found, ranking: Promise<Ranking>, rankingAll: Promise<Ranking>): Promise<Summary> {
  const [shown, all] = await Promise.all([ranking, rankingAll]);
  const head = await summaryHead(question, filters, res, shown, all);
  const key = `${question.toLowerCase().replace(/\s+/g, " ").trim()}|${head.orgs.map((o) => o.r.ein).join(",")}`;
  const ai = cached(key, () => fresh(question, head).catch((err) => { console.error("search summary failed", err); return null; }));
  return { facts: head.facts, line: head.line, caveat: head.caveat, ai };
}

// The page's default view (10 rows, no "Show more"), for the CSV export and /report: same scores, same summary cache.
export async function summaryFor(question: string, filters: Filters, includeInactive: boolean) {
  const res = await searchCandidates(filters, { includeInactive, limit: 10 });
  return searchSummary(question, filters, res, rank(question, res, 10), rank(question, res, POOL));
}

// For exports (CSV, /report): the summary as plain text lines.
export async function summaryLines(s: Summary): Promise<string[]> {
  const ai = await s.ai;
  return [[s.line.main, ...s.line.parts].join(" · ") + (s.line.more ? ` (${s.line.more.replace(" folded in the list", "")})` : ""), ai?.text ?? "", s.caveat ?? ""].filter(Boolean);
}
