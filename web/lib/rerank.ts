// Relevance score (0–100) for search results: Claude reads the question and each
// candidate's filing text and scores how well it fits. Results are then ordered by
// that score, so the most relevant organization is first and scores highest.
// Without ANTHROPIC_API_KEY (or if the call fails), results keep search order, unscored.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { readable } from "../components/text";
import { claude, LLM_MODEL } from "./llm";
import { memo } from "./memo";
import type { Filters } from "./parse";
import { search, type Result } from "./search";

export const POOL = 40;  // candidates Claude scores per question
const BATCH = 10;        // scored in parallel batches: time is dominated by writing the reasons

export type Relevance = { score: number; why: string };
export type Ranked = Result & { relevance: Relevance | null };

const SYSTEM = `You score nonprofit search results for relevance to a plain-language question.
Score each organization 0-100 for how well its actual work (mission, programs, name, cause) fits what the user asked, including any specific activity, place or budget they named:
- 90-100: exactly what was asked, every part of it.
- 70-89: clearly the right kind of organization; a minor part unconfirmed.
- 40-69: related, but missing a key part of the request.
- 0-39: not what was asked (different cause, wrong place, only shares a word).
Scores are absolute, not relative: if nothing fits well, score everything low. Judge only from the facts given; when the description is missing, rely on the name and cause and stay below 70 unless the name makes the fit unmistakable.
"why": one or two plain sentences (under 30 words) explaining the score: what fits the question and what is missing or unconfirmed.`;

const schema = z.object({ results: z.array(z.object({ id: z.string(), score: z.number(), why: z.string() })) });

// The rubric is absolute, so batches scored separately stay comparable.
async function scoreFresh(question: string, results: Result[]): Promise<Map<string, Relevance>> {
  const batches = Array.from({ length: Math.ceil(results.length / BATCH) }, (_, i) => results.slice(i * BATCH, (i + 1) * BATCH));
  const maps = await Promise.all(batches.map((b) => scoreBatch(question, b)));
  return new Map(maps.flatMap((m) => [...m]));
}

async function scoreBatch(question: string, results: Result[]): Promise<Map<string, Relevance>> {
  const out = new Map<string, Relevance>();
  const client = claude();
  if (!client || !results.length) return out;
  // Short ids ("r1"…) come back reliably; EINs sometimes come back altered.
  const items = results.map((r, i) => ({
    id: `r${i + 1}`, name: r.name, place: [r.city, r.state].filter(Boolean).join(", "), cause: r.ntee?.label ?? null,
    revenue: r.revenue ? `$${r.revenue.amount.toLocaleString("en-US")}` : null,
    description: readable([r.mission, r.programs].filter(Boolean).join(" ")).slice(0, 600) || null,
  }));
  const res = await client.beta.messages.parse({
    model: LLM_MODEL,
    max_tokens: 4096,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Question: ${question}\n\nOrganizations:\n${JSON.stringify(items)}` }],
  });
  if (res.stop_reason === "refusal") return out;
  for (const v of res.parsed_output?.results ?? []) {
    const r = results[Number(v.id.replace(/\D/g, "")) - 1];
    if (r) out.set(r.ein, { score: Math.max(0, Math.min(100, Math.round(v.score))), why: v.why });
  }
  return out;
}

// Same question + same candidates -> same scores: "Show more", going back and CSV export reuse them.
const cached = memo<Map<string, Relevance>>("rerank", 300, 24 * 3600_000);
function score(question: string, results: Result[]) {
  const key = `${question.toLowerCase().replace(/\s+/g, " ").trim()}|${results.map((r) => r.ein).join(",")}`;
  return cached(key, () => scoreFresh(question, results).catch((err) => {
    console.error("Relevance scoring failed; keeping search order", err);
    return new Map<string, Relevance>();
  }));
}

type Found = Awaited<ReturnType<typeof search>>;

// Step 1: search candidates (fast, ~0.5s): enough for the page to show results right away.
export function searchCandidates(filters: Filters, { limit, includeInactive = false }: { limit: number; includeInactive?: boolean }) {
  return search({ ...filters, includeInactive, limit: Math.max(limit, POOL) });
}

// Step 2: score the top POOL candidates and order by score (ties and unscored keep search order).
export async function rank(question: string, res: Found, limit: number) {
  const scores = await score(question, res.results.slice(0, POOL));
  const ranked: Ranked[] = res.results.map((r) => ({ ...r, relevance: scores.get(r.ein) ?? null }));
  const order = new Map(ranked.map((r, i) => [r.ein, i]));
  ranked.sort((a, b) => (b.relevance?.score ?? -1) - (a.relevance?.score ?? -1) || order.get(a.ein)! - order.get(b.ein)!);
  return { results: ranked.slice(0, limit), scored: scores.size > 0 };
}

// Both steps, for callers that want the final order in one go (CSV export, eval).
export async function rankedSearch(question: string, filters: Filters, opts: { limit: number; includeInactive?: boolean }) {
  const res = await searchCandidates(filters, opts);
  return { ...res, ...(await rank(question, res, opts.limit)) };
}
