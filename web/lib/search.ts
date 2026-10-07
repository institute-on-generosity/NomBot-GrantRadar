// Hybrid search: SQL filters + keyword (tsvector) + vector similarity over 990 text.
import { db } from "./db";
import { embedQuery, MODEL_ID, toSql } from "./embedder";

export type SearchInput = { q: string; semantic?: string; states?: string[]; maxRevenue?: number; ntee?: string; limit?: number };

const NTEE_MAJOR: Record<string, string> = {
  A: "Arts, Culture & Humanities", B: "Education", C: "Environment", D: "Animal-Related", E: "Health Care",
  F: "Mental Health", G: "Diseases & Disorders", H: "Medical Research", I: "Crime & Legal", J: "Employment",
  K: "Food, Agriculture & Nutrition", L: "Housing & Shelter", M: "Public Safety & Disaster", N: "Recreation & Sports",
  O: "Youth Development", P: "Human Services", Q: "International Affairs", R: "Civil Rights & Advocacy",
  S: "Community Improvement", T: "Philanthropy & Grantmaking", U: "Science & Technology", V: "Social Science",
  W: "Public & Societal Benefit", X: "Religion-Related", Y: "Mutual & Membership Benefit", Z: "Unknown",
};
const NTEE_DETAIL: Record<string, string> = { K30: "Food Programs", K31: "Food Banks, Food Pantries", K34: "Congregate Meals", K35: "Soup Kitchens", K36: "Meals on Wheels" };

export async function search({ q, semantic, states = [], maxRevenue, ntee, limit = 10 }: SearchInput) {
  const words = q.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const tsq = words.join(" or ");
  let vec: string | null = null;
  if (q.trim()) {
    const { rows } = await db.query("SELECT 1 FROM filing_text WHERE embedding_model = $1 LIMIT 1", [MODEL_ID]);
    if (rows.length) vec = toSql(await embedQuery(semantic || q));
  }
  const { rows } = await db.query(
    `WITH t AS (
       SELECT DISTINCT ON (ein) ein, tax_year, mission, programs, embedding, embedding_model, search
       FROM filing_text ORDER BY ein, tax_year DESC NULLS LAST),
     f AS (SELECT DISTINCT ON (ein) ein, tax_year, revenue, expenses, assets FROM financials ORDER BY ein, tax_year DESC),
     scored AS (
       SELECT o.ein, o.name, o.city, o.state, o.ntee_cd, f.tax_year AS fin_year, f.revenue, f.expenses, f.assets,
              CASE WHEN t.mission IS NULL OR t.mission ~* '^\s*(see|refer to) (schedule|sch\.?) o' THEN coalesce(t.programs, t.mission) ELSE t.mission END AS mission, t.ein IS NOT NULL AS has_text, f.ein IS NOT NULL AS has_fin,
              CASE WHEN $1 <> '' THEN ts_rank(o.search || coalesce(t.search, ''::tsvector), websearch_to_tsquery('english', $1)) ELSE 0 END AS kw,
              CASE WHEN $2::vector IS NOT NULL AND t.embedding_model = $3 THEN 1 - (t.embedding <=> $2::vector) END AS sim
       FROM orgs o LEFT JOIN t USING (ein) LEFT JOIN f USING (ein)
       WHERE (cardinality($4::text[]) = 0 OR o.state = ANY($4))
         AND ($5::bigint IS NULL OR coalesce(f.revenue, o.revenue_amt) <= $5)
         AND ($6::text IS NULL OR o.ntee_cd LIKE $6 || '%'))
     SELECT *, coalesce(sim, 0) + least(kw, 0.5) AS score, count(*) OVER () AS total
     FROM scored WHERE $1 = '' OR kw > 0 OR sim IS NOT NULL
     ORDER BY score DESC, revenue DESC NULLS LAST LIMIT $7`,
    [tsq, vec, MODEL_ID, states, maxRevenue ?? null, ntee ?? null, limit],
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    semantic: vec !== null,
    model: vec ? MODEL_ID : null,
    results: rows.map((r) => ({
      ein: `${r.ein.slice(0, 2)}-${r.ein.slice(2)}`,
      name: r.name,
      city: r.city,
      state: r.state,
      ntee: r.ntee_cd ? { code: r.ntee_cd, label: NTEE_DETAIL[r.ntee_cd.slice(0, 3)] ?? NTEE_MAJOR[r.ntee_cd[0]] ?? null } : null,
      financials: r.has_fin ? { tax_year: r.fin_year, revenue: Number(r.revenue), expenses: Number(r.expenses), assets: Number(r.assets) } : null,
      mission: r.mission,
      score: Math.round(Number(r.score) * 100) / 100,
      data_completeness: r.has_text && r.has_fin ? "full" : r.has_text || r.has_fin ? "partial" : "basic",
    })),
  };
}
