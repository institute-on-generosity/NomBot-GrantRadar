// IoG internal: hybrid keyword and meaning search over Giving Guide passages.
// GET /api/v1/iog/search?q=how+to+do+a+site+visit&guide=<slug>&limit=5. Needs a key with the iog_internal scope.
import type { NextRequest } from "next/server";
import { keyed, apiError } from "@/lib/apiAuth";
import { apiIogSearch, IogBadParam, IOG_SCOPE } from "@/lib/apiIog";

export const GET = keyed("/api/v1/iog/search", async (request: NextRequest) => {
  const p = request.nextUrl.searchParams;
  try {
    return Response.json(await apiIogSearch({ q: p.get("q") ?? undefined, guide: p.get("guide") ?? undefined, limit: p.get("limit") ?? undefined }));
  } catch (e) {
    if (e instanceof IogBadParam) return apiError(400, "bad_param", e.message);
    throw e;
  }
}, IOG_SCOPE);
