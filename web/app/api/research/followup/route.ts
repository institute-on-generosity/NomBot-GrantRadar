// A text follow-up in a research thread ("why might that be?", "what does this mean for a donor?").
// POST { q, f: string[], i } → NDJSON {"type":"text","text":…} … from FAST_MODEL, grounded in the numbers
// of the thread's answer cards (answerBrief). General knowledge must be marked as such.
import { z } from "zod";
import { answerBrief } from "@/lib/answer";
import { claude, FAST_MODEL } from "@/lib/llm";
import { memo } from "@/lib/memo";
import { MAX_FOLLOW_UPS, resolveThread } from "@/lib/thread";

const body = z.object({ q: z.string().trim().min(1).max(300), f: z.array(z.string().trim().min(1).max(300)).max(MAX_FOLLOW_UPS), i: z.number().int().min(0) });

const SYSTEM = `You help a philanthropy researcher interpret research answers computed from US IRS data (990-PF foundation grants, Form 990 lines).
You get the thread's answers as JSON (headline, numbers, method, caveats, data rows) and a follow-up that asks why, what it means or what to do.
- Answer in at most 120 words: one or two direct sentences, then up to 3 short bullets.
- Quote numbers only from the answers, exactly as given. When there are several answers, name the one you mean by its topic ("the women and girls total"), never by a number.
- Possible reasons or advice not shown by the data: mark them clearly with "(general knowledge)" and keep them tentative.
- Name the most relevant caveat in plain words when it limits the answer.
- Plain language, no headings, no semicolons or em dashes.`;

// Same thread + same question → same answer for a day (reloading a shared link doesn't pay again).
const cached = memo<string>("follow-up-text:v2", 300, 24 * 3600_000);

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.i >= parsed.data.f.length) return Response.json({ error: "invalid request" }, { status: 400 });
  const { q, f, i } = parsed.data;
  const client = claude();
  if (!client) return Response.json({ error: "Follow-up answers need ANTHROPIC_API_KEY." }, { status: 503 });
  const turns = await resolveThread(q, f.slice(0, i));
  if (!turns) return Response.json({ error: "Not a research thread." }, { status: 400 });
  const context = turns.filter((t) => t.kind === "answer").map((t, k) => `Answer ${k + 1} (question: ${t.standalone})\n${JSON.stringify(answerBrief((t as Extract<typeof t, { kind: "answer" }>).answer, 12))}`).join("\n\n");
  const ask = f[i];
  const key = JSON.stringify([q, f.slice(0, i + 1)]);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: object) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        let streamed = false;
        const text = await cached(key, async () => {
          streamed = true;
          const s = client.beta.messages.stream({
            model: FAST_MODEL, max_tokens: 1200, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
            output_config: { effort: "low" }, system: SYSTEM,
            messages: [{ role: "user", content: `${context}\n\nFollow-up: ${ask}` }],
          });
          let out = "";
          for await (const ev of s) if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") { out += ev.delta.text; send({ type: "text", text: ev.delta.text }); }
          return out;
        });
        if (!streamed) send({ type: "text", text });
      } catch (err) {
        console.error("follow-up text failed", err);
        send({ type: "error", message: "This follow-up couldn't be answered. Try rephrasing it." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
