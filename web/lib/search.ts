// Hybrid search: SQL filters + keyword (tsvector) + vector similarity over 990 text.
// Requirements ("must do workforce training") split results into exact matches and closest results.
import { db } from "./db";
import { embedQuery, MODEL_ID, toSql } from "./embedder";
import { nteeLabel } from "./ntee";
import { sources, type Source } from "./sources";

export type Requirement = { label: string; pattern: string }; // pattern: Postgres/JS regex alternation
export type Sort = "match" | "largest" | "smallest";
export type SearchInput = {
  q: string; semantic?: string; states?: string[]; cities?: string[]; maxRevenue?: number; ntee?: string; nteeHint?: string;
  requirements?: Requirement[]; includeInactive?: boolean; sort?: Sort; limit?: number; offset?: number;
};

export type Result = {
  ein: string; name: string; city: string | null; state: string | null;
  ntee: { code: string; label: string | null } | null;
  revenue: { amount: number; year: number | null; source: "IRS BMF" | "IRS SOI" } | null;
  financials: { tax_year: number; revenue: number; expenses: number; assets: number } | null;
  mission: string | null; programs: string | null; filing: { year: number | null; form: string | null } | null;
  exact: boolean | null; score: number; data_completeness: "full" | "partial" | "basic"; sources: Source[];
};

export async function search({ q, semantic, states = [], cities = [], maxRevenue, ntee, nteeHint, requirements = [], includeInactive = false, sort = "match", limit = 10, offset = 0 }: SearchInput) {
  const words = q.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const tsq = words.join(" or ");
  let vec: string | null = null;
  if (q.trim()) {
    const { rows } = await db.query("SELECT 1 FROM filing_text WHERE embedding_model = $1 LIMIT 1", [MODEL_ID]);
    if (rows.length) vec = toSql(await embedQuery(semantic || q));
  }
  const { rows } = await db.query(
    `WITH t AS (
       SELECT DISTINCT ON (ein) ein, object_id, tax_year, form, mission, programs, embedding, embedding_model, search
       FROM filing_text ORDER BY ein, tax_year DESC NULLS LAST),
     f AS (SELECT DISTINCT ON (ein) ein, tax_year, form, revenue, expenses, assets FROM financials ORDER BY ein, tax_year DESC),
     base AS (
       SELECT o.ein, o.name, o.city, o.state, o.ntee_cd, o.search AS osearch, o.revenue_amt, o.tax_period,
              t.ein IS NOT NULL AS has_text, t.object_id, t.tax_year AS text_year, t.form AS text_form,
              t.mission AS raw_mission, t.programs, t.embedding, t.embedding_model, t.search AS tsearch,
              f.ein IS NOT NULL AS has_fin, f.tax_year AS fin_year, f.form AS fin_form, f.revenue AS fin_rev, f.expenses, f.assets,
              -- one revenue figure, the newest of the IRS master file (BMF) and the SOI extract, used for filtering AND display
              CASE WHEN o.revenue_amt IS NOT NULL AND (f.ein IS NULL OR left(o.tax_period, 4)::int > f.tax_year) THEN 'bmf'
                   WHEN f.ein IS NOT NULL THEN 'soi' END AS rev_src
       FROM orgs o LEFT JOIN t USING (ein) LEFT JOIN f USING (ein)
       WHERE (cardinality($4::text[]) = 0 OR o.state = ANY($4))
         AND ($6::text IS NULL OR o.ntee_cd LIKE $6 || '%')
         AND (cardinality($12::text[]) = 0 OR upper(o.city) = ANY($12))),  -- headquarters city
     v AS (
       SELECT *, CASE rev_src WHEN 'bmf' THEN revenue_amt WHEN 'soi' THEN fin_rev END AS rev,
                 CASE rev_src WHEN 'bmf' THEN left(tax_period, 4)::int WHEN 'soi' THEN fin_year END AS rev_year
       FROM base),
     scored AS (
       SELECT v.*,
              CASE WHEN raw_mission IS NULL OR raw_mission ~* '^\\s*(see|refer to) (schedule|sch\\.?) o' THEN coalesce(programs, raw_mission) ELSE raw_mission END AS mission,
              CASE WHEN $1 <> '' THEN ts_rank(osearch || coalesce(tsearch, ''::tsvector), websearch_to_tsquery('english', $1)) ELSE 0 END AS kw,
              CASE WHEN $2::vector IS NOT NULL AND embedding_model = $3 THEN 1 - (embedding <=> $2::vector) END AS sim,
              CASE WHEN cardinality($8::text[]) = 0 THEN NULL
                   ELSE NOT EXISTS (SELECT 1 FROM unnest($8::text[]) p WHERE coalesce(raw_mission, '') || ' ' || coalesce(programs, '') !~* p) END AS exact
       FROM v
       WHERE ($5::bigint IS NULL OR rev <= $5)
         AND ($9 OR rev IS NULL OR rev > 0))   -- hide $0 / inactive orgs unless asked
     SELECT *, coalesce(sim, 0) + least(kw * 5, 0.5)
              + CASE WHEN $13::text IS NOT NULL AND ntee_cd LIKE $13 || '%' THEN 0.1 ELSE 0 END AS score,  -- guessed cause: a nudge, not a filter
            count(*) OVER () AS total, count(*) FILTER (WHERE exact) OVER () AS exact_total
     FROM scored WHERE $1 = '' OR kw > 0 OR sim IS NOT NULL OR exact
     ORDER BY exact DESC NULLS LAST,
              CASE WHEN $10 = 'largest' THEN rev END DESC NULLS LAST,
              CASE WHEN $10 = 'smallest' THEN rev END ASC NULLS LAST,
              score DESC, rev DESC NULLS LAST
     LIMIT $7 OFFSET $11`,
    [tsq, vec, MODEL_ID, states, maxRevenue ?? null, ntee ?? null, limit, requirements.map((r) => r.pattern), includeInactive, sort, offset, cities.map((c) => c.toUpperCase()), nteeHint ?? null],
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    exact_total: requirements.length ? Number(rows[0]?.exact_total ?? 0) : null,
    semantic: vec !== null,
    model: vec ? MODEL_ID : null,
    results: rows.map((r): Result => ({
      ein: `${r.ein.slice(0, 2)}-${r.ein.slice(2)}`,
      name: r.name,
      city: r.city,
      state: r.state,
      ntee: r.ntee_cd ? { code: r.ntee_cd, label: nteeLabel(r.ntee_cd) } : null,
      revenue: r.rev != null ? { amount: Number(r.rev), year: r.rev_year, source: r.rev_src === "bmf" ? "IRS BMF" : "IRS SOI" } : null,
      financials: r.has_fin ? { tax_year: r.fin_year, revenue: Number(r.fin_rev), expenses: Number(r.expenses), assets: Number(r.assets) } : null,
      mission: r.mission,
      programs: r.programs,
      filing: r.has_text ? { year: r.text_year, form: r.text_form } : null,
      exact: r.exact,
      score: Math.round(Number(r.score) * 100) / 100,
      data_completeness: r.has_text && r.has_fin ? "full" : r.has_text || r.has_fin ? "partial" : "basic",
      sources: sources({ ein: r.ein, state: r.state, revSrc: r.rev_src, finForm: r.fin_form, finYear: r.fin_year, objectId: r.object_id, textYear: r.text_year, textForm: r.text_form }),
    })),
  };
}
