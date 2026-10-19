// IoG internal: the Giving Guides (GG2026) with slug, edition, notes, size and Drive link. No guide text here.
// GET /api/v1/iog/guides. Needs a key with the iog_internal scope (others get 403); docs at /api/docs.
import { keyed, baseUrl } from "@/lib/apiAuth";
import { apiIogGuides, IOG_SCOPE } from "@/lib/apiIog";

export const GET = keyed("/api/v1/iog/guides", async (request: Request) => Response.json(await apiIogGuides(baseUrl(request))), IOG_SCOPE);
