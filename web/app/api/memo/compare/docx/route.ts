// GET /api/memo/compare/docx?ein=a,b,c&by=Name → the options memo as an editable Word file (lib/briefDocx)
import { connection } from "next/server";
import { optionsMemo, preparedBy } from "@/lib/brief";
import { optionsMemoDocx } from "@/lib/briefDocx";
import { parseEins } from "@/lib/compare";

export async function GET(req: Request) {
  await connection();
  const sp = new URL(req.url).searchParams;
  const m = await optionsMemo(parseEins(sp.get("ein") ?? undefined)).catch(() => null);
  if (!m) return Response.json({ error: "Pick 2 to 4 organizations" }, { status: 400 });
  const buf = await optionsMemoDocx(m, preparedBy(sp.get("by")));
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": 'attachment; filename="options-memo.docx"', "Cache-Control": "no-store" } });
}
