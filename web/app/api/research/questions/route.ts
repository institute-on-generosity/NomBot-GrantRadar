// Asked research questions for the Research page: GET /api/research/questions → { recent, top }.
import { connection } from "next/server";
import { askedQuestions } from "@/lib/researchQuestions";

export async function GET() {
  await connection();
  try {
    const [recent, top] = await Promise.all([askedQuestions("recent", 5), askedQuestions("top", 5)]);
    return Response.json({ recent, top }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("asked questions failed", err);
    return Response.json({ recent: [], top: [] });
  }
}
