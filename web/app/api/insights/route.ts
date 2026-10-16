// Insights feed data: GET /api/insights → { ready, insights } (verified rows, best first).
// ready=false means the insights table doesn't exist yet.
import { connection } from "next/server";
import { listInsights } from "@/lib/insights";

export async function GET() {
  await connection();
  try {
    return Response.json(await listInsights(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("insights failed", err);
    return Response.json({ error: "Research is unavailable right now." }, { status: 500 });
  }
}
