// Asked research questions (keyed): GET /api/v1/research/questions?order=recent|top&limit=20. No Claude calls.
import type { NextRequest } from "next/server";
import { keyed, baseUrl } from "@/lib/apiAuth";
import { askedQuestions, askHref } from "@/lib/researchQuestions";

export const GET = keyed("/api/v1/research/questions", async (request: NextRequest) => {
  const p = request.nextUrl.searchParams;
  const order = p.get("order") === "top" ? "top" : "recent";
  const limit = Math.min(Math.max(Number(p.get("limit")) || 20, 1), 100);
  const rows = await askedQuestions(order, limit);
  const base = baseUrl(request);
  return Response.json({ order, questions: rows.map((r) => ({ ...r, url: `${base}${askHref(r.question)}` })) });
});
