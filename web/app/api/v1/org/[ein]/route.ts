// One organization by EIN: profile, financials, health signals, leaders, grants received and given.
// GET /api/v1/org/550123456 (dashes allowed). Needs an API key; docs at /api/docs.
import type { NextRequest } from "next/server";
import { keyed, baseUrl, apiError } from "@/lib/apiAuth";
import { apiOrg } from "@/lib/api";

export const GET = keyed("/api/v1/org", async (request: NextRequest, { params }: { params: Promise<{ ein: string }> }) => {
  const r = await apiOrg((await params).ein, baseUrl(request));
  if ("error" in r) return r.error === "bad_ein" ? apiError(400, "bad_ein", "EIN must be 9 digits.") : apiError(404, "not_found", "No organization with this EIN.");
  return Response.json(r);
});
