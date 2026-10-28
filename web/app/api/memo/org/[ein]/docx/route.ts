// GET /api/memo/org/123456789/docx?by=Name → the organization brief as an editable Word file (lib/briefDocx)
import { connection } from "next/server";
import { orgBrief, preparedBy } from "@/lib/brief";
import { orgBriefDocx } from "@/lib/briefDocx";

export async function GET(req: Request, ctx: { params: Promise<{ ein: string }> }) {
  await connection();
  const { ein } = await ctx.params;
  const b = await orgBrief(ein).catch(() => null);
  if (!b) return Response.json({ error: "Not found" }, { status: 404 });
  const buf = await orgBriefDocx(b, preparedBy(new URL(req.url).searchParams.get("by")));
  const file = `${b.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-brief.docx`;
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" } });
}
