// OpenAPI 3.1 description of the partner API (public, like /api/docs). Built from lib/apiDocs.ts.
// Public: read-scope endpoints only. With a Bearer key holding iog_internal it also lists /api/v1/iog/*.
import { authenticate, baseUrl } from "@/lib/apiAuth";
import { openapi } from "@/lib/apiDocs";

export async function GET(request: Request) {
  const internal = request.headers.has("authorization") && !((await authenticate(request, "iog_internal")) instanceof Response);
  return Response.json(openapi(baseUrl(request), internal), { headers: { "Cache-Control": internal ? "private, no-store" : "public, max-age=3600", Vary: "Authorization" } });
}
