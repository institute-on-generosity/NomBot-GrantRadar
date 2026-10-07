// Save one person's 👍/👎 on one search result (vote 0 clears it).
// POST /api/feedback { clientId, question, ein, vote: 1 | -1 | 0, rank?, filters? }
import { z } from "zod";
import { db } from "@/lib/db";
import { historyKey } from "@/lib/history";

const body = z.object({
  clientId: z.string().min(8).max(64),
  question: z.string().trim().min(1).max(300),
  ein: z.string().transform((s) => s.replace(/\D/g, "")).pipe(z.string().length(9)),
  vote: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
  rank: z.number().int().min(1).max(1000).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid feedback" }, { status: 400 });
  const { clientId, question, ein, vote, rank, filters } = parsed.data;
  const key = historyKey(question);
  if (vote === 0) {
    await db.query("DELETE FROM feedback WHERE client_id = $1 AND question_key = $2 AND ein = $3", [clientId, key, ein]);
  } else {
    await db.query(
      `INSERT INTO feedback (client_id, question, question_key, ein, vote, rank, filters)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (client_id, question_key, ein)
       DO UPDATE SET vote = EXCLUDED.vote, rank = EXCLUDED.rank, filters = EXCLUDED.filters, updated_at = now()`,
      [clientId, question, key, ein, vote, rank ?? null, filters ? JSON.stringify(filters) : null],
    );
  }
  return Response.json({ ok: true });
}
