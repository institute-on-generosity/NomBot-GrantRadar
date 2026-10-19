// Per-call API log for the /admin "API calls" tab (lib/admin.ts apiCalls). proxy.ts already requires the admin
// cookie for /api/admin/*; checked again here. GET ?key=&app=&route=&tool=&status=4xx&range=24h|from=&to=&page=&size=
// JSON: rows, total, summary (calls per minute, top apps today) and filter values. format=csv: the filtered view.
import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdminCookie } from "@/lib/adminAuth";
import { apiCalls, apiCallsCsv, callFacets, callSummary, type CallFilters } from "@/lib/admin";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!isAdminCookie((await cookies()).get(ADMIN_COOKIE)?.value)) return Response.json({ error: "admin_required" }, { status: 401, headers });
  const p = new URL(request.url).searchParams;
  const str = (k: string) => p.get(k)?.slice(0, 200) || undefined;
  const int = (k: string) => (p.has(k) && /^\d+$/.test(p.get(k)!) ? Number(p.get(k)) : undefined);
  const f: CallFilters = {
    key: str("key"), app: str("app"), route: str("route"), tool: str("tool"), status: str("status"),
    range: str("range"), from: str("from"), to: str("to"), page: int("page"), size: int("size"),
  };
  try {
    if (p.get("format") === "csv") {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      return new Response(await apiCallsCsv(f), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="api-calls-${stamp}.csv"` } });
    }
    const [list, summary, facets] = await Promise.all([apiCalls(f), callSummary(), callFacets()]);
    return Response.json({ ...list, summary, facets }, { headers });
  } catch (e) {
    console.error("admin calls failed", e);
    return Response.json({ error: "server_error" }, { status: 500, headers });
  }
}
