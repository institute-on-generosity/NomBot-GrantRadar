// Relevance score (0–100) for search results: Claude reads the question and each
// candidate's filing text and scores how well it fits. Results are then ordered by
// that score, so the most relevant organization is first and scores highest.
// Without ANTHROPIC_API_KEY (or if the call fails), results keep search order, unscored.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { readable } from "../components/text";
import { claude, fallback, SCORE_MODEL } from "./llm";
import { diskMemo, memo } from "./memo";
import type { Filters } from "./parse";
import { confirmPrefs } from "./prefConfirm";
import { search, type Result } from "./search";
import { placeScope, tieredSearch, type TierBlock } from "./tiers";
import { TIER_ORDER } from "./place";
import { labelName, labelPhrase } from "./labels";

export const POOL = 40;
const THIN = 10; // fewer main-focus results than this: the label's partial tier is added  // candidates Claude scores per question
export const STRONG = 50; // scores below this are near-misses: shown only on request (rubric: 40-69 = missing a key part)
export const isStrong = (r: { relevance?: Relevance | null }) => !r.relevance || r.relevance.score >= STRONG;
const BATCH = 5;         // scored in parallel batches: time is dominated by writing the reasons, so smaller batches finish sooner (40 results: ~3.3s at 5, ~4.5s at 10)

export type Relevance = { score: number; why: string };
export type Ranked = Result & { relevance: Relevance | null };

const SYSTEM = `You score nonprofit search results for relevance to a plain-language question.
Score each organization 0-100 for how well its actual work (mission, programs, name, cause) fits what the user asked, including any specific activity, place or budget they named:
- 90-100: exactly what was asked, every part of it.
- 70-89: clearly the right kind of organization; a minor part unconfirmed.
- 40-69: related, but missing a key part of the request.
- 0-39: not what was asked (different cause, wrong place, only shares a word).
Judge the substance of the work, not exact words: a program that clearly does what was asked counts even when it uses other words (youth mentoring or youth development that builds confidence, life skills or leadership is youth leadership development, a basketball league is a youth sports program). If the work is that kind of program, don't mark it down because the request's word is "implied but not explicit".
Scores are absolute, not relative: if nothing fits well, score everything low. Judge only from the facts given; when the description is missing, rely on the name and cause and stay below 70 unless the name makes the fit unmistakable. "from_its_website" is what the organization says on its own website (no IRS filing text): treat it as evidence of its work, and say "per its website" in "why" when you rely on it.
"why": one or two plain sentences (under 30 words) explaining the score: what fits the question and what is missing or unconfirmed. No semicolons or dashes.`;
// Tiered place searches (lib/tiers.ts) group results by place themselves (in the city, serving it, nearby), so the
// score is about the work, and a soft preference ("ideally", "especially") raises a score without capping it.
const PLACE_NOTE = `
Results are already grouped by place (in the city, serving it from elsewhere, nearby), and "place" says why each one is listed. Judge how well the work fits; don't lower a score because the address is outside the city. When "place" quotes a grant purpose or filing that describes a program (for example a fiscal sponsor's project serving the city), that program is part of the organization's work: judge it too.
Words after "ideally", "especially" or "preferably" are preferences, not requirements: an organization that fits the main request scores 70+ even without them, and higher with them.`;

// A preferred cause label from the question ("girls mentoring and leadership programs", "ideally focused on girls"), not
// "only girls": it ranks first, but co-ed programs that otherwise fit are still good matches (Oct 26, Keith's test).
const softLabelNote = (name: string) => `
The user named ${name} as a focus but not as the only group served: organizations focused on it fit best and score higher, and organizations that serve everyone but clearly fit the rest of the request still score 70 or more. Not being focused on it is never by itself a reason to score below 70.`;
// The preferences read from the question, named: without them the scorer sometimes treated "especially mobile dental
// care" as required and scored Inglewood clinics with no dental program 45 (Oct 26).
const softPrefNote = (prefs: string[]) => `
Preferences in this question (nice to have, never required): ${prefs.join(", ")}. An organization that fits the rest of the request scores 70 or more even when none of them is confirmed: never score below 70 only because a preference is missing. One that also does them scores higher.`;

// UI copy has no semicolons or dashes as punctuation, even when the model slips: they become sentences or commas.
const plain = (t: string) => t.replace(/\s+[—–]\s+|\s*—\s*/g, ", ").replace(/\s*;\s*([a-z]?)/g, (_, c: string) => `. ${c.toUpperCase()}`).replace(/\s+/g, " ").trim();
const schema = z.object({ results: z.array(z.object({ id: z.string(), score: z.number(), why: z.string() })) });

// The rubric is absolute, so batches scored separately stay comparable.
async function scoreFresh(question: string, results: Result[], placed = false, note = ""): Promise<Map<string, Relevance>> {
  const batches = Array.from({ length: Math.ceil(results.length / BATCH) }, (_, i) => results.slice(i * BATCH, (i + 1) * BATCH));
  const maps = await Promise.all(batches.map((b) => scoreBatch(question, b, placed, note)));
  return new Map(maps.flatMap((m) => [...m]));
}

async function scoreBatch(question: string, results: Result[], placed = false, note = ""): Promise<Map<string, Relevance>> {
  const out = new Map<string, Relevance>();
  const client = claude("rerank");
  if (!client || !results.length) return out;
  // Short ids ("r1"…) come back reliably; EINs sometimes come back altered.
  const items = results.map((r, i) => ({
    id: `r${i + 1}`, name: r.name, place: [r.city, r.state].filter(Boolean).join(", ") + (r.place ? ` (${r.place.note}${r.place.quote ? `: "${r.place.quote}"` : ""})` : ""), cause: r.ntee?.label ?? null,
    revenue: r.revenue ? `$${r.revenue.amount.toLocaleString("en-US")}` : null,
    // Graded labels (Claude read the org's filings, or its name when it filed no text): evidence for orgs with no description.
    ...(r.topicLabels?.length ? { graded_labels: r.topicLabels.map((l) => `${labelName(l.label)} (${l.tier === "primary" ? "main focus" : "part of their work"})`).join(", ") } : {}),
    description: readable([r.mission, r.programs].filter(Boolean).join(" ")).slice(0, 600) || null,
    // No 990 text: what its own website says (checked as the same org, lib/webProfile), labeled as such
    ...(r.web ? { from_its_website: `${r.web.description}${r.web.servesPlaces.length ? ` Says it serves: ${r.web.servesPlaces.join(", ")}.` : ""}` } : {}),
  }));
  const res = await client.beta.messages.parse({
    model: SCORE_MODEL,
    max_tokens: 4096,
    ...fallback(SCORE_MODEL),
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    system: (placed ? SYSTEM + PLACE_NOTE : SYSTEM) + note,
    messages: [{ role: "user", content: `Question: ${question}\n\nOrganizations:\n${JSON.stringify(items)}` }],
  });
  if (res.stop_reason === "refusal") return out;
  for (const v of res.parsed_output?.results ?? []) {
    const r = results[Number(v.id.replace(/\D/g, "")) - 1];
    if (r) out.set(r.ein, { score: Math.max(0, Math.min(100, Math.round(v.score))), why: plain(v.why) });
  }
  return out;
}

// Same question + same candidates -> same scores: "Show more", going back and CSV export reuse them.
const cached = diskMemo<Map<string, Relevance>>("rerank:v10", 300, 7 * 24 * 3600_000, { // on disk too: stable across restarts
  toJSON: (m) => [...m], fromJSON: (j) => new Map(j as [string, Relevance][]), keep: (m) => m.size > 0 }); // v10: no mark-down for an implied word; v9: a co-ed or preference-free org that otherwise fits scores 70 or more, website-read orgs ride into the pool; v8: judge substance not exact words, programs in place quotes count, website text for every org that has one; v7: website descriptions for orgs with no 990 text; v6: graded labels as evidence, notes naming the preferences and a preferred label; v5: no semicolons in reasons; v4: wider grant quotes; v3: place tiers and their evidence
function score(question: string, results: Result[], placed = false, note = "") {
  const key = `${placed ? "placed|" : ""}${note ? "soft|" : ""}${question.toLowerCase().replace(/\s+/g, " ").trim()}|${results.map((r) => r.ein).join(",")}`;
  return cached(key, () => scoreFresh(question, results, placed, note).catch((err) => {
    console.error("Relevance scoring failed; keeping search order", err);
    return new Map<string, Relevance>();
  }));
}

type Found = Awaited<ReturnType<typeof search>> & { tiers?: TierBlock[]; scope?: Awaited<ReturnType<typeof placeScope>>; widened?: string; softLabel?: string; softPrefs?: string[] };
// Candidates scored per tier: the city's own orgs first, then the evidence and nearby tiers.
export const TIER_POOL: Record<string, number> = { in: POOL, county: POOL, serves: 25, nearby: 40, wider: 25 };
// Orgs carrying a boosted label (the topic's, or a preferred one) just below a tier's pool are scored too, up to this
// many from the next LABEL_REACH: the label is graded evidence the meaning search can miss (a girls' leadership group
// for "youth leadership programs").
// Orgs with no 990 text sit low in search order (only their name and cause code match), so one whose own website was
// read and confirmed rides along to the scorer the same way (Oct 29: Beautiful I Am Foundation, an Inglewood girls'
// leadership group, was never scored).
const LABEL_EXTRA = 10, LABEL_REACH = 60, WEB_EXTRA = 10;
export const scoredPool = (results: Result[], n: number) => {
  const rest = results.slice(n, n + LABEL_REACH);
  const extra = [...rest.filter((r) => r.topicLabels?.length).slice(0, LABEL_EXTRA), ...results.slice(n).filter((r) => r.web && !r.topicLabels?.length).slice(0, WEB_EXTRA)];
  return [...results.slice(0, n), ...extra];
};

// Step 1: search candidates (fast, ~0.5s): enough for the page to show results right away.
// One search serves the results, "Show more" and the landscape (its 200 closest): fetched once at SHARED
// rows and cached briefly, instead of the same candidate query running twice per page.
const SHARED = 200; // = LANDSCAPE (lib/landscape.ts)
const found = memo<Found>("candidates:v3", 200, 10 * 60_000); // v3: confirmed soft preferences on rows; v2: place tiers (city, serving, nearby, county)
export async function searchCandidates(filters: Filters, { limit, includeInactive = false }: { limit: number; includeInactive?: boolean }): Promise<Found> {
  const want = Math.max(limit, POOL), size = Math.max(want, SHARED);
  const res = await found(JSON.stringify([filters, includeInactive, size]), async () => {
    const run = async (f: Filters) => {
      const scope = await placeScope(f);
      return scope ? tieredSearch(f, scope, { includeInactive, limit: size }) : search({ ...f, includeInactive, limit: size });
    };
    const first: Found = await run(filters);
    // Thin results on a cause label's main focus: include its partial tier too, and say so.
    const out = filters.label && !filters.labelPartial && first.total < THIN ? { ...(await run({ ...filters, labelPartial: true })), widened: labelPhrase(filters.label) } : first;
    // Soft preferences a website or place program confirms, on each row (lib/prefConfirm)
    await confirmPrefs([...(out.tiers ?? []).flatMap((t) => t.results), ...out.results], filters, out.scope).catch((err) => console.error("confirmPrefs failed", err));
    return out;
  });
  const softLabel = filters.preferLabel && filters.preferLabel !== filters.label ? labelPhrase(filters.preferLabel) : undefined;
  const softPrefs = filters.prefer?.length ? filters.prefer.map((p) => p.label) : undefined;
  const keep = want + LABEL_REACH; // the label reach below a pool rides along (lib/rerank scoredPool)
  if (!res.tiers) return { ...res, softLabel, softPrefs, results: res.results.slice(0, keep) };
  // Website-read orgs further down a tier stay too (at most WEB_EXTRA), so the scorer can see them (scoredPool)
  const withWeb = (rs: Result[]) => [...rs.slice(0, keep), ...rs.slice(keep).filter((r) => r.web).slice(0, WEB_EXTRA)];
  const tiers = res.tiers.map((t) => ({ ...t, results: withWeb(t.results) }));
  return { ...res, softLabel, softPrefs, tiers, results: tiers.flatMap((t) => t.results) };
}

// Step 2: score the top POOL candidates and order by score (ties and unscored keep search order).
// Tiered: each tier's top TIER_POOL are scored, each tier is ordered on its own and keeps up to limit rows.
export async function rank(question: string, res: Found, limit: number) {
  const pool = res.tiers ? res.tiers.flatMap((t) => scoredPool(t.results, TIER_POOL[t.tier] ?? POOL)) : scoredPool(res.results, POOL);
  const scores = await score(question, pool, Boolean(res.tiers), (res.softPrefs ? softPrefNote(res.softPrefs) : "") + (res.softLabel ? softLabelNote(res.softLabel) : ""));
  const ranked: Ranked[] = res.results.map((r) => ({ ...r, relevance: scores.get(r.ein) ?? null }));
  const order = new Map(ranked.map((r, i) => [r.ein, i]));
  const tierOf = (r: Ranked) => (r.place ? TIER_ORDER.indexOf(r.place.tier) : 0);
  ranked.sort((a, b) => tierOf(a) - tierOf(b) || (b.relevance?.score ?? -1) - (a.relevance?.score ?? -1) || order.get(a.ein)! - order.get(b.ein)!);
  if (!res.tiers) return { results: ranked.slice(0, limit), scored: scores.size > 0 };
  // Each tier keeps every strong match it has (they're few: only TIER_POOL are scored), then fills up to limit.
  const seen = new Map<number, number>();
  return { results: ranked.filter((r) => { const t = tierOf(r), n = seen.get(t) ?? 0; seen.set(t, n + 1); return n < limit || (r.relevance != null && isStrong(r)); }), scored: scores.size > 0 };
}

// Local first across tiers (Oct 29, Inglewood v3): when one list mixes places (the report's top picks, the CSV's
// overall_rank), an org based in the place gets a small boost over a nearby one, so close scores go to the local org
// (HOOP Foundation 80 in Inglewood above a nearby club at 82) but a clearly better nearby match still wins.
// Not a filter: each tier still lists its own orgs.
export const LOCAL_BOOST: Record<string, number> = { in: 5, county: 5, serves: 3, nearby: 0, wider: -3 };
export const localScore = (r: { relevance?: Relevance | null; place?: { tier: string } | null }) => (r.relevance?.score ?? -1) + (r.relevance ? LOCAL_BOOST[r.place?.tier ?? "in"] ?? 0 : 0);
export function localFirst<T extends { relevance?: Relevance | null; place?: { tier: string } | null }>(rows: T[]): T[] {
  return rows.map((r, i) => [r, i] as const).sort(([a, i], [b, j]) => localScore(b) - localScore(a) || i - j).map(([r]) => r);
}

// Both steps, for callers that want the final order in one go (CSV export, eval).
export async function rankedSearch(question: string, filters: Filters, opts: { limit: number; includeInactive?: boolean }) {
  const res = await searchCandidates(filters, opts);
  return { ...res, ...(await rank(question, res, opts.limit)) };
}
