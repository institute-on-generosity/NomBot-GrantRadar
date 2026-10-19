// Read-only JSON search. Needs an API key (Authorization: Bearer nb_live_...); docs at /api/docs.
// GET /api/v1/search?q=food+bank+workforce+training&state=WV,KY&city=Huntington&max_revenue=500000&ntee=K3&limit=10
// Graded cause label: &label=climate (or women_girls, substance_use, housing_homelessness), &label_tier=all to add partial-tier orgs.
// No Claude calls: meaning search runs on the local embedding model, so a partner can't run up LLM costs.
import type { NextRequest } from "next/server";
import { keyed, baseUrl } from "@/lib/apiAuth";
import { countRows, withRows } from "@/lib/apiLog";
import { apiSearch } from "@/lib/api";

export const GET = keyed("/api/v1/search", async (request: NextRequest) => {
  const p = request.nextUrl.searchParams;
  const params = Object.fromEntries(["q", "state", "city", "max_revenue", "ntee", "label", "label_tier", "limit"].map((k) => [k, p.get(k) ?? undefined]));
  const out = await apiSearch(params, baseUrl(request));
  return withRows(Response.json(out), countRows(out));
});
