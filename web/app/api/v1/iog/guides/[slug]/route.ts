// IoG internal: one Giving Guide in full, as Markdown text and as sections (heading, path, text).
// GET /api/v1/iog/guides/<slug>. Needs a key with the iog_internal scope (others get 403); docs at /api/docs.
import { keyed, apiError } from "@/lib/apiAuth";
import { apiIogGuide, IOG_SCOPE } from "@/lib/apiIog";

export const GET = keyed("/api/v1/iog/guides/[slug]", async (_request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const r = await apiIogGuide((await params).slug);
  return r ? Response.json(r) : apiError(404, "not_found", "No guide with this slug. See /api/v1/iog/guides.");
}, IOG_SCOPE);
