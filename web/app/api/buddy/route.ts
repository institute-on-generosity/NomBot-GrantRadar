// Research Buddy: answer a question about the current search results, citing them.
// POST /api/buddy { question, ask, overrides?, all?, history? } -> NDJSON stream, one event per line:
//   {"type":"sources","sources":[...]}  the numbered organizations Claude was given
//   {"type":"thinking","text":"..."}    summarized reasoning ("How I reasoned")
//   {"type":"text","text":"..."}        the answer, citing organizations as [n]
//   {"type":"error","message":"..."}
import { z } from "zod";
import { readable, titleCase } from "@/components/text";
import { applyOverrides } from "@/lib/filters";
import { claude, LLM_MODEL } from "@/lib/llm";
import { parseQuestion } from "@/lib/parse";
import { rankedSearch } from "@/lib/rerank";

const TOP = 15; // organizations Research Buddy reads: the top of the ranked results

const body = z.object({
  question: z.string().trim().min(1).max(300),
  ask: z.string().trim().min(1).max(1000),
  overrides: z.object({ st: z.string(), city: z.string(), max: z.string(), cause: z.string(), drop: z.string() }).partial().optional(),
  all: z.boolean().optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(12).optional(),
});

const SYSTEM = `You are Research Buddy, helping a nonprofit researcher make sense of search results drawn only from public IRS data.
You get numbered organizations with their IRS master-file facts, latest financials and, when filed, the mission and program text from their Form 990.

Rules:
- Use only the organizations and facts provided. If the filings don't say something, say so plainly; never guess or use outside knowledge.
- Cite every claim about an organization with its number in square brackets, e.g. "runs a job-training kitchen [3]". Cite each organization you mention.
- Be concise: lead with a one- or two-sentence direct answer, then at most 5 short bullets. Stay under about 150 words unless the user asks for more detail. Plain language, no jargon, no headings. Use **bold** for organization names on first mention.
- When comparing, name the trade-off (size, focus, evidence in the filing) instead of declaring one "best" without a reason.`;

function orgBlock(i: number, r: Awaited<ReturnType<typeof rankedSearch>>["results"][number]) {
  const lines = [
    `[${i + 1}] ${titleCase(r.name)} — ${[r.city && titleCase(r.city), r.state].filter(Boolean).join(", ")}`,
    r.ntee?.label ? `Cause: ${r.ntee.label}` : null,
    r.revenue ? `Revenue: $${r.revenue.amount.toLocaleString("en-US")} (${r.revenue.year ?? "?"}, ${r.revenue.source})` : null,
    r.financials ? `Expenses: $${r.financials.expenses.toLocaleString("en-US")}; assets: $${r.financials.assets.toLocaleString("en-US")} (${r.financials.tax_year})` : null,
    r.filing ? `Filing: Form ${r.filing.form} (${r.filing.year})` : "Filing: no e-filed 990 text loaded",
    r.mission ? `Mission: ${readable(r.mission).slice(0, 1200)}` : null,
    r.programs ? `Programs: ${readable(r.programs).slice(0, 1200)}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const { question, ask, overrides = {}, all = false, history = [] } = parsed.data;
  const client = claude();
  if (!client) return Response.json({ error: "Research Buddy needs ANTHROPIC_API_KEY." }, { status: 503 });

  // Same filters and ranking as the results page (both cached, so usually instant).
  const filters = applyOverrides(await parseQuestion(question), overrides);
  const { results } = await rankedSearch(question, filters, { limit: TOP, includeInactive: all });
  const sources = results.map((r, i) => ({
    n: i + 1, ein: r.ein, name: titleCase(r.name), place: [r.city && titleCase(r.city), r.state].filter(Boolean).join(", "),
    filing: r.filing ? `Form ${r.filing.form} (${r.filing.year})` : null,
  }));
  const context = `Search question: ${question}\n\nOrganizations (top ${results.length} by relevance):\n\n${results.map((r, i) => orgBlock(i, r)).join("\n\n")}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      send({ type: "sources", sources });
      try {
        const s = client.beta.messages.stream({
          model: LLM_MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: "medium" },
          system: SYSTEM,
          messages: [
            { role: "user", content: context },
            { role: "assistant", content: "I've read the organizations. What would you like to know?" },
            ...history,
            { role: "user", content: ask },
          ],
        });
        for await (const event of s) {
          if (event.type !== "content_block_delta") continue;
          if (event.delta.type === "thinking_delta") send({ type: "thinking", text: event.delta.thinking });
          else if (event.delta.type === "text_delta") send({ type: "text", text: event.delta.text });
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") send({ type: "error", message: "Research Buddy couldn't answer that one. Try rephrasing the question." });
      } catch (err) {
        console.error("Research Buddy failed", err);
        send({ type: "error", message: "Research Buddy hit an error. Try again in a moment." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
