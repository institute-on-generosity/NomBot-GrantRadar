// Similar organizations: each org's nearest neighbors by the meaning of its newest 990 mission and program text
// (cosine of nomic-embed-text-v1.5 vectors), precomputed weekly on the Linux helper into org_similar
// (generosity-data migration 070, etl/linux/org_similar.py). list 'less_funded' = peers with little or no foundation
// funding 2022-24. Shared by the org page, /api/v1/org/{ein} (similar), /api/v1/orgs/{ein}/similar and MCP
// find_similar_orgs. No Claude calls.
import { db } from "./db";
import { nteeLabel } from "./ntee";
import { BadParam } from "./apiData";

export const SIMILAR_NOTE = "Nearest organizations by the meaning of their newest Form 990 mission and program text (cosine similarity of nomic-embed-text-v1.5 vectors, 0 to 1), rebuilt weekly. Only pairs at 0.80 or above are kept, up to 10 per org: 0.90+ very similar, 0.85-0.90 similar, 0.80-0.85 somewhat similar. Similar text, not a judgment of quality or fit.";
export const LESS_FUNDED_NOTE = "less_funded: the nearest active organizations (latest revenue $50K or more) that got under $25K in linked private-foundation grants (990-PF) in tax years 2022-2024, searched within each org's 50 nearest. Foundation grants are about two thirds linked to EINs, so some got grants we could not link. Public-charity and federal funding are not counted.";

export type SimilarOrg = {
  rank: number; ein: string; name: string; city: string | null; state: string | null;
  ntee: { code: string; label: string | null } | null;
  revenue: number | null; revenue_year: number | null;
  foundation_grants_2022_2024: number;
  similarity: number; similarity_words: string;
};

export function similarityWords(s: number) {
  return s >= 0.9 ? "very similar" : s >= 0.85 ? "similar" : "somewhat similar";
}

// Up to `limit` similar orgs for one EIN, best first. null when the table isn't there yet (migration 070).
export async function similarOrgs(ein: string, opts: { lessFunded?: boolean; limit?: number } = {}): Promise<SimilarOrg[] | null> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 10);
  try {
    const { rows } = await db.query(
      `SELECT s.rank, s.similar_ein AS ein, s.similarity, o.name, o.city, o.state, o.ntee_cd,
              coalesce(fl.revenue, o.revenue_amt) AS revenue, CASE WHEN fl.revenue IS NOT NULL THEN fl.tax_year END AS revenue_year,
              (SELECT coalesce(sum(amount), 0) FROM grant_clean g WHERE g.recipient_ein = s.similar_ein AND g.tax_year BETWEEN 2022 AND 2024) AS fdn
         FROM org_similar s JOIN orgs o ON o.ein = s.similar_ein
         LEFT JOIN financials_latest fl ON fl.ein = s.similar_ein
        WHERE s.ein = $1 AND s.list = $2 ORDER BY s.rank LIMIT $3`,
      [ein, opts.lessFunded ? "less_funded" : "all", limit]);
    return rows.map((r) => ({
      rank: r.rank, ein: r.ein, name: r.name, city: r.city, state: r.state,
      ntee: r.ntee_cd ? { code: r.ntee_cd, label: nteeLabel(r.ntee_cd) } : null,
      revenue: r.revenue == null ? null : Number(r.revenue), revenue_year: r.revenue_year ?? null,
      foundation_grants_2022_2024: Number(r.fdn),
      similarity: Math.round(Number(r.similarity) * 1000) / 1000, similarity_words: similarityWords(Number(r.similarity)),
    }));
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return null;
    throw e;
  }
}

// GET /api/v1/orgs/{ein}/similar and MCP find_similar_orgs. null = unknown EIN (404).
export async function apiSimilar(einRaw: string, p: { underfunded?: unknown; less_funded?: unknown; limit?: unknown }, base: string) {
  const ein = einRaw.replace(/-/g, "");
  if (!/^\d{9}$/.test(ein)) throw new BadParam("ein", "EIN must be 9 digits.");
  const flag = (k: "underfunded" | "less_funded") => {
    const v = p[k];
    if (v == null || v === "") return false;
    if (v === true || v === "true" || v === "1") return true;
    if (v === false || v === "false" || v === "0") return false;
    throw new BadParam(k, `${k} must be true or false.`);
  };
  const lessFunded = flag("underfunded") || flag("less_funded");
  let limit = 10;
  if (p.limit != null && p.limit !== "") {
    limit = Number(p.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new BadParam("limit", "limit must be a whole number from 1 to 10.");
  }
  const { rows: [o] } = await db.query("SELECT name FROM orgs WHERE ein = $1", [ein]);
  if (!o) return null;
  const list = (await similarOrgs(ein, { lessFunded, limit })) ?? [];
  return {
    ein, name: o.name as string, list: lessFunded ? "less_funded" : "all", count: list.length,
    results: list.map((s) => ({ ...s, url: `${base}/org/${s.ein}`, api_url: `${base}/api/v1/org/${s.ein}` })),
    notes: lessFunded ? [SIMILAR_NOTE, LESS_FUNDED_NOTE] : [SIMILAR_NOTE],
  };
}
