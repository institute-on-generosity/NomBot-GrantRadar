// Organizations most like this one by their Form 990 mission and program text (generosity-data org_similar).
// GET /api/v1/orgs/341877332/similar, ?underfunded=true for peers with little or no foundation funding 2022-24.
import { keyed, apiError, baseUrl } from "@/lib/apiAuth";
import { BadParam } from "@/lib/apiData";
import { countRows, withRows } from "@/lib/apiLog";
import { apiSimilar } from "@/lib/similar";

type Ctx = { params: Promise<{ ein: string }> };
export const GET = keyed("/api/v1/orgs/similar", async (request: Request, { params }: Ctx) => {
  try {
    const out = await apiSimilar((await params).ein, Object.fromEntries(new URL(request.url).searchParams), baseUrl(request));
    return out == null ? apiError(404, "not_found", "No organization with this EIN.") : withRows(Response.json(out), countRows(out));
  } catch (e) {
    if (e instanceof BadParam) return apiError(400, "bad_param", e.message);
    throw e;
  }
});
