// OpenAPI 3.1 description of the partner API (public, like /api/docs). Built from lib/apiDocs.ts.
import { baseUrl } from "@/lib/apiAuth";
import { openapi } from "@/lib/apiDocs";

export function GET(request: Request) {
  return Response.json(openapi(baseUrl(request)), { headers: { "Cache-Control": "public, max-age=3600" } });
}
