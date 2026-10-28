// Org hover card data: GET /api/org-preview/123456789 -> the few facts the card shows (lib/orgPreview), cached per EIN.
import { connection } from "next/server";
import { orgPreview } from "@/lib/orgPreview";

export async function GET(_req: Request, ctx: { params: Promise<{ ein: string }> }) {
  await connection();
  const { ein } = await ctx.params;
  const p = await orgPreview(ein).catch((e) => { console.error("org preview failed", e); return null; });
  if (!p) return Response.json({ error: "Not matched to an IRS record" }, { status: 404 });
  return Response.json(p, { headers: { "Cache-Control": "private, max-age=600" } });
}
