// Download the results of a plain-language search as a CSV spreadsheet.
// GET /export?question=...&sort=match|largest|smallest&all=1
import type { NextRequest } from "next/server";
import { parseQuestion } from "@/lib/parse";
import { search, type Sort } from "@/lib/search";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const question = (p.get("question") ?? "").trim().slice(0, 300);
  if (!question) return new Response("Missing question", { status: 400 });
  const sort = (["match", "largest", "smallest"].includes(p.get("sort") ?? "") ? p.get("sort") : "match") as Sort;
  const filters = await parseQuestion(question);
  const res = await search({ ...filters, sort, includeInactive: p.get("all") === "1", limit: 500 });
  const origin = request.nextUrl.origin;

  const header = ["name", "ein", "city", "state", "cause", "revenue", "revenue_year", "exact_match", "mission", "nombot_page", "sources"];
  const lines = res.results.map((r) => [
    r.name, r.ein, r.city, r.state, r.ntee?.label, r.revenue?.amount, r.revenue?.year,
    r.exact == null ? "" : r.exact ? "yes" : "no", r.mission, `${origin}/org/${r.ein}`, r.sources.map((s) => (s.url.startsWith("/") ? origin + s.url : s.url)).join(" "),
  ].map(cell).join(","));

  const name = question.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nombot-${name}.csv"` },
  });
}
