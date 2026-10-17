// Answered research questions (generosity-data migration 035, research_questions): each distinct question
// once, with how often and when it was asked. Shown as "Asked questions" on /research. No personal data.
import { db } from "./db";
import type { Spec } from "./answerSpec";

export type AskedQuestion = { question: string; headline: string; status: string; asked_count: number; last_asked_at: string };

export const normalizeQuestion = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim().replace(/[?.!\s]+$/, "");
export const askHref = (q: string) => `/research/ask?${new URLSearchParams({ q })}`;

export async function recordQuestion(question: string, spec: Spec, headline: string, status: string) {
  await db.query(
    `INSERT INTO research_questions (question, normalized_question, spec, headline, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (normalized_question) DO UPDATE SET
       -- a page render can repeat within seconds (redirect, prefetch, reload): count those once
       asked_count = research_questions.asked_count + (research_questions.last_asked_at < now() - interval '30 seconds')::int,
       last_asked_at = now(), spec = EXCLUDED.spec, headline = EXCLUDED.headline, status = EXCLUDED.status`,
    [question.trim().slice(0, 300), normalizeQuestion(question).slice(0, 300), JSON.stringify(spec), headline, status],
  );
}

// order: "recent" (last asked first) or "top" (most asked first).
export async function askedQuestions(order: "recent" | "top", limit = 8): Promise<AskedQuestion[]> {
  const r = await db.query(
    `SELECT question, headline, status, asked_count, last_asked_at FROM research_questions
     WHERE status <> 'unanswerable'
     ORDER BY ${order === "top" ? "asked_count DESC, last_asked_at DESC" : "last_asked_at DESC"} LIMIT $1`, [limit]);
  return r.rows;
}
