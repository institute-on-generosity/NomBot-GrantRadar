// Download the results of a plain-language search as a CSV spreadsheet.
// GET /export?question=...&all=1 (+ the filter edits: st, city, county, max, min, cause, label, tier, drop). Same order and
// scores as the page. A place search (a city or county) lists every tier with its evidence. Rows outside the scored
// pool say "unscored" in relevance_status. &unscored=1 skips relevance scoring (no Claude calls): every row unscored.
import type { NextRequest } from "next/server";
import { applyOverrides, OVERRIDE_KEYS } from "@/lib/filters";
import { parseQuestion } from "@/lib/parse";
import { fundingOf } from "@/lib/placeReport";
import { rankedSearch, searchCandidates, type Relevance } from "@/lib/rerank";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADER = ["relevance", "relevance_status", "relevance_reason", "place_tier", "place_evidence", "name", "ein", "street", "city", "state", "zip",
  "ntee_code", "cause", "cause_label", "revenue", "revenue_year", "latest_990_year", "foundation_grants_2022_24", "top_funder", "top_funder_grants_2022_24",
  "website", "exact_match", "mission", "nombot_page", "sources"];
const TIER: Record<string, string> = { in: "in the place", county: "in the county", serves: "serves the place, HQ elsewhere", nearby: "nearby", wider: "elsewhere in the county" };
const BASIS: Record<string, string> = { hq: "HQ", zip: "HQ ZIP", name: "name", text: "990 text", grant: "grant purpose", nearby: "nearby", county: "HQ", wider: "HQ" };

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const question = (p.get("question") ?? "").trim().slice(0, 300);
  if (!question) return new Response("Missing question", { status: 400 });
  const overrides = Object.fromEntries(OVERRIDE_KEYS.map((k) => [k, p.get(k) ?? undefined]));
  const filters = applyOverrides(await parseQuestion(question), overrides);
  const opts = { includeInactive: p.get("all") === "1", limit: 500 };
  const res = p.get("unscored") === "1" ? await searchCandidates(filters, opts) : await rankedSearch(question, filters, opts);
  const rows = res.results.map((r) => ({ ...r, relevance: "relevance" in r ? (r.relevance as Relevance | null) : null }));
  const funding = await fundingOf(rows.map((r) => r.ein));
  const origin = request.nextUrl.origin;

  const lines = rows.map((r) => {
    const f = funding.get(r.ein.replace("-", ""));
    return [
      r.relevance?.score, r.relevance ? "scored" : "unscored", r.relevance?.why,
      r.place ? TIER[r.place.tier] : "", r.place ? `${BASIS[r.place.basis]}: ${r.place.note}${r.place.quote ? `: "${r.place.quote}"` : ""}` : "",
      r.name, r.ein, r.street, r.city, r.state, r.zip, r.ntee?.code, r.ntee?.label, [...new Set([r.label, ...(r.topicLabels ?? [])].filter((l) => l != null).map((l) => `${l!.label} (${l!.tier})`))].join(", "),
      r.revenue?.amount, r.revenue?.year, r.filing?.year ?? r.health?.year ?? r.financials?.tax_year ?? "",
      f ? Math.round(f.total) : 0, f?.top?.name ?? "", f?.top ? Math.round(f.top.amount) : "",
      r.website ?? "", r.exact == null ? "" : r.exact ? "yes" : "no", r.mission, `${origin}/org/${r.ein}`,
      r.sources.map((s) => (s.url.startsWith("/") ? origin + s.url : s.url)).join(" "),
    ].map(cell).join(",");
  });

  const name = question.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return new Response([HEADER.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nombot-${name}.csv"` },
  });
}
