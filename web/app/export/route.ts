// Download the results of a plain-language search as a CSV spreadsheet.
// GET /export?question=...&all=1 (+ the filter edits: st, max, cause, drop). Same order and scores as the page.
import type { NextRequest } from "next/server";
import { applyOverrides } from "@/lib/filters";
import { parseQuestion } from "@/lib/parse";
import { rankedSearch } from "@/lib/rerank";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const question = (p.get("question") ?? "").trim().slice(0, 300);
  if (!question) return new Response("Missing question", { status: 400 });
  const overrides = { st: p.get("st") ?? undefined, city: p.get("city") ?? undefined, max: p.get("max") ?? undefined, cause: p.get("cause") ?? undefined, drop: p.get("drop") ?? undefined };
  const filters = applyOverrides(await parseQuestion(question), overrides);
  const res = await rankedSearch(question, filters, { includeInactive: p.get("all") === "1", limit: 500 });
  const origin = request.nextUrl.origin;

  const header = ["relevance", "relevance_reason", "name", "ein", "city", "state", "cause", "revenue", "revenue_year", "exact_match", "mission", "nombot_page", "sources"];
  const lines = res.results.map((r) => [
    r.relevance?.score, r.relevance?.why, r.name, r.ein, r.city, r.state, r.ntee?.label, r.revenue?.amount, r.revenue?.year,
    r.exact == null ? "" : r.exact ? "yes" : "no", r.mission, `${origin}/org/${r.ein}`, r.sources.map((s) => (s.url.startsWith("/") ? origin + s.url : s.url)).join(" "),
  ].map(cell).join(","));

  const name = question.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nombot-${name}.csv"` },
  });
}
