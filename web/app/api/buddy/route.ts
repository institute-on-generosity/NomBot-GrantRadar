// Research Buddy: answer a question about the current search results, citing them.
// POST /api/buddy { question, ask, overrides?, all?, history? } -> NDJSON stream, one event per line:
//   {"type":"sources","sources":[...]}  the numbered organizations Claude was given
//   {"type":"thinking","text":"..."}    summarized reasoning ("How I reasoned")
//   {"type":"text","text":"..."}        the answer, citing organizations as [n]
//   {"type":"tool","label":"..."}       a research_answer computed (the answer engine, lib/answer.ts)
//   {"type":"error","message":"..."}
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { buddyContext, buddyMessages, SYSTEM, ANSWER_RULES } from "@/lib/buddy";
import { claude, LLM_MODEL } from "@/lib/llm";
import { answer, answerBrief } from "@/lib/answer";
import { routeQuestion } from "@/lib/answerRoute";
import { DEFAULT_SPEC, normalizeSpec, specSchema } from "@/lib/answerSpec";
import { ANSWER_TOOL_DESCRIPTION, ANSWER_TOOL_NAME, answerToolSchema } from "@/lib/answerTool";

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [{ name: ANSWER_TOOL_NAME, description: ANSWER_TOOL_DESCRIPTION, input_schema: answerToolSchema }];
const MAX_TOOL_ROUNDS = 3;

const body = z.object({
  question: z.string().trim().min(1).max(300),
  ask: z.string().trim().min(1).max(1000),
  overrides: z.object({ st: z.string(), city: z.string(), region: z.string(), max: z.string(), min: z.string(), cause: z.string(), drop: z.string() }).partial().optional(),
  all: z.boolean().optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(12).optional(),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const { question, ask, overrides = {}, all = false, history = [] } = parsed.data;
  const client = claude();
  if (!client) return Response.json({ error: "Research Buddy needs ANTHROPIC_API_KEY." }, { status: 503 });

  // The search's own research answer (cached from the page), so follow-ups like "and for women and girls?"
  // or "by state?" can change one field of its spec.
  const [{ sources, context: orgContext }, routed] = await Promise.all([buddyContext(question, overrides, all), routeQuestion(question)]);
  let context = orgContext;
  if (routed.research) {
    const a = await answer(question, routed.spec).catch(() => null);
    if (a) context += `\n\nResearch answer shown above the results (from the research_answer tool):\n${JSON.stringify(answerBrief(a, 10))}`;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      send({ type: "sources", sources });
      try {
        const messages = buddyMessages(context, ask, history);
        for (let round = 0; ; round++) {
          const s = client.beta.messages.stream({
            model: LLM_MODEL,
            max_tokens: 16000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            thinking: { type: "adaptive", display: "summarized" },
            output_config: { effort: "medium" },
            system: `${SYSTEM}\n\n${ANSWER_RULES}`,
            tools: TOOLS,
            tool_choice: round >= MAX_TOOL_ROUNDS ? { type: "none" } : { type: "auto" },
            messages,
          });
          for await (const event of s) {
            if (event.type !== "content_block_delta") continue;
            if (event.delta.type === "thinking_delta") send({ type: "thinking", text: event.delta.thinking });
            else if (event.delta.type === "text_delta") send({ type: "text", text: event.delta.text });
          }
          const final = await s.finalMessage();
          if (final.stop_reason === "refusal") { send({ type: "error", message: "Research Buddy couldn't answer that one. Try rephrasing the question." }); break; }
          if (final.stop_reason !== "tool_use") break;
          // Run each research_answer call on the answer engine (fixed SQL, no model-written queries).
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            const spec = specSchema.safeParse({ ...DEFAULT_SPEC, ...(block.input as object) }); // older tool calls omit newer fields
            if (!spec.success) { results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: `Invalid spec: ${spec.error.message.slice(0, 400)}` }); continue; }
            try {
              const a = await answer(ask, normalizeSpec(spec.data));
              send({ type: "tool", label: a.headline });
              results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(answerBrief(a)) });
            } catch (e) {
              console.error("research_answer tool failed", e);
              results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: "The query failed. Answer without it and say so." });
            }
          }
          messages.push({ role: "assistant", content: final.content }, { role: "user", content: results });
        }
      } catch (err) {
        console.error("Research Buddy failed", err);
        send({ type: "error", message: "Research Buddy hit an error. Try again in a moment." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
