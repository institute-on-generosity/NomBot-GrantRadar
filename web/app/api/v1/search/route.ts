// Read-only JSON search API.
// GET /api/v1/search?q=food+bank+workforce+training&state=WV,KY&city=Huntington&max_revenue=500000&ntee=K3&limit=10
import type { NextRequest } from "next/server";
import { search } from "@/lib/search";

const hits = new Map<string, { n: number; reset: number }>();
const LIMIT = 60; // requests per minute per client

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + 60_000 });
  else if (++h.n > LIMIT) return Response.json({ error: "rate limit: 60 requests/minute" }, { status: 429 });

  const p = request.nextUrl.searchParams;
  const q = (p.get("q") ?? "").slice(0, 300);
  const state = (p.get("state") ?? "").toUpperCase().split(",").map((s) => s.trim()).filter((s) => /^[A-Z]{2}$/.test(s));
  const city = (p.get("city") ?? "").split(",").map((c) => c.trim()).filter(Boolean).slice(0, 10);
  const maxRaw = p.get("max_revenue");
  const max_revenue = maxRaw && /^\d+$/.test(maxRaw) ? Number(maxRaw) : undefined;
  const ntee = /^[A-Z][0-9A-Z]{0,4}$/.test(p.get("ntee") ?? "") ? p.get("ntee")! : undefined;
  const limit = Math.min(Math.max(Number(p.get("limit")) || 10, 1), 50);

  const res = await search({ q, states: state, cities: city, maxRevenue: max_revenue, ntee, limit });
  return Response.json({ query: { q, state, city, max_revenue: max_revenue ?? null, ntee: ntee ?? null }, ...res });
}
