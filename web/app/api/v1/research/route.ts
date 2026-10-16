// Verified research findings, best first, without their data rows or charts.
// GET /api/v1/research?section=funding-gaps&state=WV&cause=food&limit=50. Needs an API key; docs at /api/docs.
import type { NextRequest } from "next/server";
import { keyed, baseUrl } from "@/lib/apiAuth";
import { apiResearchList } from "@/lib/api";

export const GET = keyed("/api/v1/research", async (request: NextRequest) => {
  const p = request.nextUrl.searchParams;
  return Response.json(await apiResearchList({ section: p.get("section") ?? undefined, state: p.get("state") ?? undefined, cause: p.get("cause") ?? undefined, limit: p.get("limit") ?? undefined }, baseUrl(request)));
});
