// Research Buddy: answer a question about the current search results, citing them.
// POST /api/buddy { question, ask, overrides?, all?, history? } -> NDJSON stream, one event per line:
//   {"type":"sources","sources":[...]}  the numbered organizations Claude was given
//   {"type":"thinking","text":"..."}    summarized reasoning ("How I reasoned")
//   {"type":"text","text":"..."}        the answer, citing organizations as [n]
//   {"type":"error","message":"..."}
import { z } from "zod";
import { buddyContext, buddyMessages, SYSTEM } from "@/lib/buddy";
import { claude, LLM_MODEL } from "@/lib/llm";

const body = z.object({
  question: z.string().trim().min(1).max(300),
  ask: z.string().trim().min(1).max(1000),
  overrides: z.object({ st: z.string(), city: z.string(), region: z.string(), max: z.string(), cause: z.string(), drop: z.string() }).partial().optional(),
  all: z.boolean().optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(12).optional(),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const { question, ask, overrides = {}, all = false, history = [] } = parsed.data;
  const client = claude();
  if (!client) return Response.json({ error: "Research Buddy needs ANTHROPIC_API_KEY." }, { status: 503 });

  const { sources, context } = await buddyContext(question, overrides, all);

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
          messages: buddyMessages(context, ask, history),
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
