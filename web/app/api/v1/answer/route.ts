// Research answer as JSON. Needs an API key (Authorization: Bearer nb_live_...); docs at /api/docs.
// GET /api/v1/answer?q=how+much+foundation+money+goes+to+climate   one small Claude routing call (FAST_MODEL,
//     about $0.006 per new question, cached 24 h), then fixed SQL
// GET /api/v1/answer?spec={"metric":"total","causes":[...],...}   no Claude call: the spec is used as given
import type { NextRequest } from "next/server";
import { keyed, apiError } from "@/lib/apiAuth";
import { answer, answerBrief } from "@/lib/answer";
import { routeQuestion, type RouteUsage } from "@/lib/answerRoute";
import { DEFAULT_SPEC, normalizeSpec, specSchema } from "@/lib/answerSpec";

export const GET = keyed("/api/v1/answer", async (request: NextRequest) => {
  const p = request.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 300);
  const rawSpec = p.get("spec");
  let spec;
  const bench = request.headers.get("x-app") === "nightly-benchmark";
  let router: { usage: RouteUsage | null } | null = null;
  if (rawSpec) {
    let json: unknown;
    try { json = JSON.parse(rawSpec); } catch { return apiError(400, "bad_spec", "spec must be JSON."); }
    const parsed = specSchema.safeParse({ ...DEFAULT_SPEC, ...(json as object) });
    if (!parsed.success) return apiError(400, "bad_spec", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 500));
    spec = normalizeSpec(parsed.data);
  } else {
    if (!q) return apiError(400, "missing_q", "Pass q (a question) or spec (JSON).");
    // The nightly benchmark (Linux helper, X-App: nightly-benchmark) gets the router's token usage back to report
    // its cost. null = no Claude call (cached for 24 h, or the regex screen sent it to search).
    if (bench) router = { usage: null };
    const r = await routeQuestion(q, bench ? (u) => { router = { usage: u }; } : undefined);
    if (!r.research) return Response.json({ research: false, question: q, message: "This reads as an organization search. Try /api/v1/search.", ...(router ? { router } : {}) });
    spec = r.spec;
  }
  const a = await answer(q || "research answer", spec);
  return Response.json({ research: true, question: q || null, ...answerBrief(a, 200, { steps: true }), chart: a.chart, queries: a.queries, ms: a.ms, ...(router ? { router } : {}) });
});
