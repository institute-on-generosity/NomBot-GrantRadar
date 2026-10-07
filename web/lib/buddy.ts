// Research Buddy's shared core: which organizations it reads, how they're presented to
// Claude, and the rules it answers by. Used by the API route and by eval/buddy.mts.
import type Anthropic from "@anthropic-ai/sdk";
import { readable, titleCase } from "../components/text";
import { applyOverrides, type Overrides } from "./filters";
import { parseQuestion } from "./parse";
import { rankedSearch } from "./rerank";

export const TOP = 15; // organizations Research Buddy reads: the top of the ranked results

export const SYSTEM = `You are Research Buddy, helping a nonprofit researcher make sense of search results drawn only from public IRS data.
You get numbered organizations with their IRS master-file facts, latest financials and, when filed, the mission and program text from their Form 990.

Rules:
- Use only the organizations and facts provided. If the filings don't say something, say so plainly; never guess or use outside knowledge.
- Cite every claim about an organization with its number in square brackets, e.g. "runs a job-training kitchen [3]". Cite each organization you mention.
- Be concise: lead with a one- or two-sentence direct answer, then at most 5 short bullets. Stay under about 150 words unless the user asks for more detail. Plain language, no jargon, no headings. Use **bold** for organization names on first mention.
- Every sentence that says something about the organizations needs citations, including the opening answer and any summary ("all of them…", "most…"): cite each organization it covers, or don't say it.
- Don't state counts ("six of them", "twelve groups"); list the matching organizations with citations instead.
- Use the filing's own words. Never add descriptors it doesn't state (faith-based, licensed, accredited, only, largest, first), and don't infer who they serve beyond what's written.
- Give numbers exactly as provided; don't compute ratios, percentages or rankings from them.
- When comparing, name the trade-off (size, focus, evidence in the filing) instead of declaring one "best" without a reason.`;

type Org = Awaited<ReturnType<typeof rankedSearch>>["results"][number];
export type BuddySource = { n: number; ein: string; name: string; place: string; filing: string | null };

export function orgBlock(i: number, r: Org) {
  return [
    `[${i + 1}] ${titleCase(r.name)} — ${[r.city && titleCase(r.city), r.state].filter(Boolean).join(", ")}`,
    r.ntee?.label ? `Cause: ${r.ntee.label}` : null,
    r.revenue ? `Revenue: $${r.revenue.amount.toLocaleString("en-US")} (${r.revenue.year ?? "?"}, ${r.revenue.source})` : null,
    r.financials ? `Expenses: $${r.financials.expenses.toLocaleString("en-US")}; assets: $${r.financials.assets.toLocaleString("en-US")} (${r.financials.tax_year})` : null,
    r.filing ? `Filing: Form ${r.filing.form} (${r.filing.year})` : "Filing: no e-filed 990 text loaded",
    r.mission ? `Mission: ${readable(r.mission).slice(0, 1200)}` : null,
    r.programs ? `Programs: ${readable(r.programs).slice(0, 1200)}` : null,
  ].filter(Boolean).join("\n");
}

// The same filters and ranking as the results page (both cached, so usually instant).
export async function buddyContext(question: string, overrides: Overrides = {}, all = false) {
  const filters = applyOverrides(await parseQuestion(question), overrides);
  const { results } = await rankedSearch(question, filters, { limit: TOP, includeInactive: all });
  const sources: BuddySource[] = results.map((r, i) => ({
    n: i + 1, ein: r.ein, name: titleCase(r.name), place: [r.city && titleCase(r.city), r.state].filter(Boolean).join(", "),
    filing: r.filing ? `Form ${r.filing.form} (${r.filing.year})` : null,
  }));
  const blocks = results.map((r, i) => orgBlock(i, r));
  const context = `Search question: ${question}\n\nOrganizations (top ${results.length} by relevance):\n\n${blocks.join("\n\n")}`;
  return { sources, blocks, context };
}

export function buddyMessages(context: string, ask: string, history: { role: "user" | "assistant"; content: string }[] = []): Anthropic.Beta.BetaMessageParam[] {
  return [
    { role: "user", content: context },
    { role: "assistant", content: "I've read the organizations. What would you like to know?" },
    ...history,
    { role: "user", content: ask },
  ];
}
