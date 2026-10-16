// One verified finding in full: key points, stats, data rows, chart, method, caveats, SQL, sources.
// GET /api/v1/research/<slug>. Needs an API key; docs at /api/docs.
import type { NextRequest } from "next/server";
import { keyed, baseUrl, apiError } from "@/lib/apiAuth";
import { apiResearch } from "@/lib/api";

export const GET = keyed("/api/v1/research/[slug]", async (request: NextRequest, { params }: { params: Promise<{ slug: string }> }) => {
  const r = await apiResearch((await params).slug, baseUrl(request));
  return r ? Response.json(r) : apiError(404, "not_found", "No verified finding with this slug.");
});
