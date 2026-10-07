// GrantRadar's Research Buddy: answer a question about the matched foundations, citing them.
// POST /api/grants/buddy { question: mission, ask, overrides?: { st, open, size, type }, history? } -> NDJSON stream
// with the same events as /api/buddy: sources, thinking, text, error.
import { z } from "zod";
import { grantBuddyContext, SYSTEM } from "@/lib/grantBuddy";
import { SIZES, type MatchFilters, type Size } from "@/lib/grants";
import { claude, LLM_MODEL } from "@/lib/llm";

const body = z.object({
  question: z.string().trim().min(1).max(1000),
  ask: z.string().trim().min(1).max(1000),
  overrides: z.object({ st: z.string().max(3), open: z.string(), size: z.string(), type: z.string() }).partial().optional(),
  all: z.boolean().optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(12).optional(),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const { question: mission, ask, overrides: o = {}, history = [] } = parsed.data;
  const client = claude();
  if (!client) return Response.json({ error: "Research Buddy needs ANTHROPIC_API_KEY." }, { status: 503 });

  const filters: MatchFilters = {
    state: o.st && /^[A-Z]{2}$/.test(o.st) ? o.st : undefined,
    open: o.open === "1",
    size: o.size && o.size in SIZES ? (o.size as Size) : undefined,
    type: o.type === "general" || o.type === "program" ? o.type : undefined,
  };
  const { sources, context } = await grantBuddyContext(mission, filters);

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
            { role: "assistant", content: "I've read the foundations. What would you like to know?" },
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
        console.error("GrantRadar Research Buddy failed", err);
        send({ type: "error", message: "Research Buddy hit an error. Try again in a moment." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
