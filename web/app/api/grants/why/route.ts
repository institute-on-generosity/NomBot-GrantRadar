// "Why this funder?": POST /api/grants/why { mission, ein, filters? } -> NDJSON stream, one event per line:
//   {"type":"sources","sources":[...]}  the numbered grants Claude was given
//   {"type":"thinking","text":"..."}    summarized reasoning
//   {"type":"text","text":"..."}        the explanation, citing grants as [n]
//   {"type":"error","message":"..."}
import { z } from "zod";
import { SYSTEM, whyContext } from "@/lib/grantWhy";
import { claude, LLM_MODEL } from "@/lib/llm";

const body = z.object({
  mission: z.string().trim().min(1).max(1000),
  ein: z.string().regex(/^\d{2}-?\d{7}$/),
  filters: z.object({ state: z.string().length(2), open: z.boolean(), size: z.enum(["small", "mid", "large"]) }).partial().optional(),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const { mission, ein, filters = {} } = parsed.data;
  const client = claude();
  if (!client) return Response.json({ error: "Explanations need ANTHROPIC_API_KEY." }, { status: 503 });
  const ctx = await whyContext(mission, ein, filters);
  if (!ctx) return Response.json({ error: "No 990-PF on file for that foundation." }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      send({ type: "sources", sources: ctx.sources });
      try {
        const s = client.beta.messages.stream({
          model: LLM_MODEL,
          max_tokens: 8000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: "medium" },
          system: SYSTEM,
          messages: [{ role: "user", content: `${ctx.context}\n\nIs this foundation a good fit for this nonprofit, and why?` }],
        });
        for await (const event of s) {
          if (event.type !== "content_block_delta") continue;
          if (event.delta.type === "thinking_delta") send({ type: "thinking", text: event.delta.thinking });
          else if (event.delta.type === "text_delta") send({ type: "text", text: event.delta.text });
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") send({ type: "error", message: "Couldn't explain this match. Try another foundation." });
      } catch (err) {
        console.error("Why this funder failed", err);
        send({ type: "error", message: "The explanation hit an error. Try again in a moment." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
