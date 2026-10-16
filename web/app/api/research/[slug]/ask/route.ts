// Ask about one research finding: Claude answers from that finding's headline, method, caveats and data rows.
// POST /api/research/<slug>/ask { ask, history? } -> NDJSON stream, one event per line:
//   {"type":"text","text":"..."}      the answer
//   {"type":"error","message":"..."}
import { z } from "zod";
import { getInsight, orgsByEin } from "@/lib/insights";
import { findingEins, toCsv } from "@/lib/insightMeta";
import { claude, FAST_MODEL } from "@/lib/llm";
import { titleCase } from "@/components/text";

const body = z.object({
  ask: z.string().trim().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(12).optional(),
});

const SYSTEM = `You help philanthropic researchers and advisors understand one research finding computed by NomBot from public IRS filings.
You get the finding (headline, summary, method, caveats, key numbers), its data table as CSV, and sometimes the organizations behind it.

Rules:
- Answer from the finding and its data first. Quote the exact numbers from the table and name the rows they come from.
- You may add general knowledge about the nonprofit sector when it helps, but mark each such sentence with "(General knowledge)" so it is never mistaken for this data.
- If the data can't answer the question, say so plainly in the first sentence, then say what data would answer it.
- Respect the caveats: don't claim more precision or coverage than the method allows.
- You may do simple arithmetic on the table (differences, ratios, ranks); show the inputs when you do.
- Be concise: a one- or two-sentence direct answer, then at most 5 short bullets. Under about 180 words unless asked for more. Plain language, no headings. Use **bold** for the key number.`;

const MAX_CSV = 60_000; // characters of table; ~500 rows of the miner's output fit, bigger tables are cut with a note

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const { ask, history = [] } = parsed.data;
  const client = claude();
  if (!client) return Response.json({ error: "Asking about findings needs an Anthropic API key on the server (ANTHROPIC_API_KEY)." }, { status: 503 });
  const i = await getInsight((await ctx.params).slug);
  if (!i) return Response.json({ error: "This finding isn't available." }, { status: 404 });

  const csv = toCsv(i.data ?? []);
  const table = csv.length > MAX_CSV ? `${csv.slice(0, csv.lastIndexOf("\n", MAX_CSV))}\n(table cut here: ${i.data.length} rows in all)` : csv;
  const eins = findingEins(i);
  const orgs = eins.length ? await orgsByEin(eins) : [];
  const context = [
    `Headline: ${i.headline}`,
    `Summary: ${i.summary}`,
    i.points?.length ? `Key points:\n${i.points.map((p) => `- ${p.replace(/\*\*/g, "")}`).join("\n")}` : null,
    i.stats?.length ? `Key numbers: ${i.stats.map((s) => `${s.label}: ${s.value}`).join(" | ")}` : null,
    i.method ? `Method: ${i.method}` : null,
    i.caveats ? `Caveats: ${i.caveats}` : null,
    i.sources?.length ? `Sources: ${i.sources.map((s) => s.label).join(" | ")}` : null,
    `Data (${i.data?.length ?? 0} rows, CSV):\n${table}`,
    orgs.length ? `Organizations behind this finding (largest first):\n${orgs.map((o) => `- ${titleCase(o.name)}, ${[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ")}${o.revenue_amt ? `, revenue $${Number(o.revenue_amt).toLocaleString("en-US")}` : ""}`).join("\n")}` : null,
  ].filter(Boolean).join("\n\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const s = client.beta.messages.stream({
          model: FAST_MODEL,
          max_tokens: 8000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: [{ type: "text", text: SYSTEM }, { type: "text", text: `<finding>\n${context}\n</finding>`, cache_control: { type: "ephemeral" } }],
          messages: [...history, { role: "user", content: ask }],
        });
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") send({ type: "text", text: event.delta.text });
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") send({ type: "error", message: "That question couldn't be answered. Try rephrasing it." });
      } catch (err) {
        console.error("finding ask failed", err);
        send({ type: "error", message: "Something went wrong. Try again in a moment." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
