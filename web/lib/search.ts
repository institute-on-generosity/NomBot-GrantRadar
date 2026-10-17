// Hybrid search: SQL filters + keyword (tsvector) + vector similarity over 990 text.
// Requirements ("must do workforce training") split results into exact matches and closest results.
import { db } from "./db";
import { embedQuery, MODEL_ID, toSql } from "./embedder";
import { nteeLabel } from "./ntee";
import { sources, type Source } from "./sources";

export type Requirement = { label: string; pattern: string }; // pattern: Postgres/JS regex alternation
export type Sort = "match" | "largest" | "smallest";
export type SearchInput = {
  q: string; semantic?: string; states?: string[]; cities?: string[]; appalachia?: boolean; maxRevenue?: number; minRevenue?: number; ntee?: string; nteeHint?: string;
  requirements?: Requirement[]; includeInactive?: boolean; sort?: Sort; limit?: number; offset?: number;
  mode?: SearchMode;
  kwWeight?: number; // hybrid only: how much keyword matches add to meaning similarity (benchmark knob)
};
// hybrid: keyword + meaning (the app). keyword / vector: one method alone, for the search benchmark (eval/bench.mts).
export type SearchMode = "hybrid" | "keyword" | "vector";

export type Result = {
  ein: string; name: string; city: string | null; state: string | null;
  ntee: { code: string; label: string | null } | null;
  revenue: { amount: number; year: number | null; source: "IRS BMF" | "IRS SOI" } | null;
  financials: { tax_year: number; revenue: number; expenses: number; assets: number } | null;
  health: Health | null;
  mission: string | null; programs: string | null; team: { staff: number | null; volunteers: number | null } | null; filing: { year: number | null; form: string | null } | null;
  exact: boolean | null; score: number; data_completeness: "full" | "partial" | "basic"; sources: Source[];
};

// One organization's financial signals, for the badges on its result row. Prefers the newest e-filed
// 990 (generosity-data filing_flag): its own prior-year column gives the trend, and cash the reserves.
// Without one: the newest SOI year, with the master file's newer revenue for the trend.
// margin: (revenue - expenses) / revenue; reserveMonths: cash (990) or net assets (SOI) / monthly spending.
export type Health = {
  trend: { change: number; from: { year: number; amount: number }; to: { year: number; amount: number } } | null;
  margin: number | null; year: number; revenue: number; expenses: number; reserveMonths: number | null; reserveBasis: "cash" | "net assets";
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function orgHealth(r: any): Health | null {
  if (r.x_year != null && Number(r.x_rev) > 0) {
    const rev = Number(r.x_rev), exp = Number(r.x_exp ?? 0), prev = r.x_prev == null ? null : Number(r.x_prev);
    return {
      trend: prev != null && prev > 10_000 ? { change: (rev - prev) / prev, from: { year: r.x_year - 1, amount: prev }, to: { year: r.x_year, amount: rev } } : null,
      margin: (rev - exp) / rev, year: r.x_year, revenue: rev, expenses: exp,
      reserveMonths: exp > 0 && r.x_cash != null ? Number(r.x_cash) / (exp / 12) : null, reserveBasis: "cash",
    };
  }
  if (!r.has_fin) return null;
  const rev = Number(r.fin_rev), exp = Number(r.expenses), net = r.net_assets == null ? null : Number(r.net_assets);
  const trend = r.rev_src === "bmf" && rev > 10_000 && r.revenue_amt != null
    ? { change: (Number(r.revenue_amt) - rev) / rev, from: { year: r.fin_year, amount: rev }, to: { year: r.rev_year, amount: Number(r.revenue_amt) } } : null;
  return { trend, margin: rev > 0 ? (rev - exp) / rev : null, year: r.fin_year, revenue: rev, expenses: exp, reserveMonths: exp > 0 && net != null ? net / (exp / 12) : null, reserveBasis: "net assets" };
}

// Place and cause filters, applied inside every candidate source (o = orgs).
const PLACE = `(cardinality($4::text[]) = 0 OR o.state = ANY($4))
         AND ($6::text IS NULL OR o.ntee_cd LIKE $6 || '%')
         AND (cardinality($12::text[]) = 0 OR upper(o.city) = ANY($12))
         AND (NOT $14::boolean OR EXISTS (SELECT 1 FROM zip_regions z WHERE z.zip5 = left(o.zip, 5)::char(5) AND z.appalachia))`; // char(5): zip5 is char(5), and comparing it as text skips its index (15s searches)
const NEAREST = 2000; // closest filings by meaning per search (1000 halves the HNSW reads but changed 4% of the top 40)
const KW_CAP = 1000;  // keyword candidates per source (names, filing text), so a broad word can't pull in 200K rows
const REQ_CAP = 300;  // filings that state a required activity, closest by meaning first
const REQ_SCAN = 5000; // filings a requirement's regex checks at most, twice: any that mention it (all of them for most
                       // requirements) and those that also mention a topic word (the likely close matches when it's broad:
                       // "students" or "tutoring" would otherwise scan 100K+ filings)
const KW_WEIGHT = 0.1; // keyword boost in hybrid ranking: 0.1 beat 1 on the 50-question benchmark (68% vs 65% relevant, 67% vs 57% found; eval/bench.mts)

// A requirement's regex alternation ("workforce|job training") as a full-text prefilter ("workforc:* | job:* & train:*"),
// so the regex runs only on filings the GIN index finds instead of on every filing. Prefix matching on stems keeps
// it a superset of the regex in practice ("mentor" finds "mentorship"); the regex still decides.
export function reqTsquery(patterns: string[]) {
  const terms = patterns.flatMap((p) => p.split(/(?<!\\)\|/)).map((t) => t.replace(/\\(.)/g, "$1").toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return [...new Set(terms.filter((w) => w.length).map((w) => w.map((x) => `${x}:*`).join(" & ")))].join(" | ");
}

// Postgres can't cache a plan across embeddings, and the check below never changes while the server runs.
let hasVectors: Promise<boolean> | undefined;

export async function search({ q, semantic, states = [], cities = [], appalachia = false, maxRevenue, minRevenue, ntee, nteeHint, requirements = [], includeInactive = false, sort = "match", limit = 10, offset = 0, mode = "hybrid", kwWeight = KW_WEIGHT }: SearchInput) {
  const words = q.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const tsq = words.join(" or ");
  let vec: string | null = null;
  if (q.trim() && mode !== "keyword") {
    hasVectors ??= db.query("SELECT 1 FROM filing_latest WHERE embedding_model = $1 LIMIT 1", [MODEL_ID]).then((r) => r.rows.length > 0);
    hasVectors.catch(() => { hasVectors = undefined; });
    const [ok, v] = await Promise.all([hasVectors, embedQuery(semantic || q)]); // in parallel: the check is a round trip
    if (ok) vec = toSql(v);
  }
  // Keyword candidates. Hybrid: filings and names with EVERY topic word (the OR query below still scores the
  // boost), up to KW_CAP; meaning similarity ranks them, so which ones a broad word returns matters little.
  // Keyword-only (benchmark): any word, best ts_rank first, since there's nothing else to rank by.
  const kwOnly = mode === "keyword";
  const kwq = "websearch_to_tsquery('english', $18::text)"; // $18: the AND words (hybrid) or the OR query (keyword-only)
  const kwCap = (col: string) => (kwOnly ? `ORDER BY ts_rank(${col}, ${kwq}) DESC ` : "") + `LIMIT ${KW_CAP}`;
  const reqq = reqTsquery(requirements.map((r) => r.pattern));
  const { rows } = await db.query(
    // Candidates first, from indexes, so a search never scores every US nonprofit: the closest filings by
    // meaning (HNSW over half-precision vectors, generosity-data migration 036: half the size of the full
    // index, so it stays in memory; filtered to the place as it scans; similarity below is full precision),
    // capped keyword hits on names and filing text, and filings that state a required activity (GIN prefilter,
    // capped, then the regex). Without a topic, everything in the place. A few thousand candidates at most,
    // so the joins below are index lookups, not table scans.
    // Newest rows per org come from generosity-data's *_latest views (migration 015).
    `WITH cand AS (
       (SELECT t.ein FROM filing_latest t JOIN orgs o USING (ein)
        WHERE $2::vector IS NOT NULL AND t.embedding_model = $3 AND ${PLACE}
        ORDER BY t.embedding::halfvec(512) <=> $2::halfvec(512) LIMIT ${NEAREST})
       UNION
       (SELECT o.ein FROM orgs o WHERE $1 <> '' AND $16 <> 'vector' AND o.search @@ ${kwq} AND ${PLACE} ${kwCap("o.search")})
       UNION
       (SELECT t.ein FROM filing_latest t JOIN orgs o USING (ein) WHERE $1 <> '' AND $16 <> 'vector' AND t.search @@ ${kwq} AND ${PLACE} ${kwCap("t.search")})
       UNION
       (SELECT t.ein FROM ((SELECT ein, mission, programs, embedding FROM filing_latest
                             WHERE $19::text <> '' AND search @@ to_tsquery('english', $19) LIMIT ${REQ_SCAN})
                            UNION ALL
                            (SELECT ein, mission, programs, embedding FROM filing_latest
                             WHERE $19 <> '' AND $1 <> '' AND search @@ (to_tsquery('english', $19) && websearch_to_tsquery('english', $1)) LIMIT ${REQ_SCAN})) t
        JOIN orgs o USING (ein)
        WHERE ${PLACE}
          AND EXISTS (SELECT 1 FROM unnest($8::text[]) p WHERE coalesce(t.mission, '') || ' ' || coalesce(t.programs, '') ~* p)
        ${vec ? "ORDER BY t.embedding <=> $2::vector " : ""}LIMIT ${REQ_CAP})
       UNION
       (SELECT o.ein FROM orgs o WHERE $1 = '' AND ${PLACE})),
     t AS (SELECT t.ein, object_id, tax_year, form, mission, programs, employees, volunteers, embedding, embedding_model, search
           FROM filing_latest t JOIN cand USING (ein)),
     f AS (SELECT f.* FROM financials_latest f JOIN cand USING (ein)),
     x AS (SELECT x.ein, tax_year AS x_year, cy_revenue AS x_rev, py_revenue AS x_prev, cy_expenses AS x_exp, cash AS x_cash
           FROM flag_latest x JOIN cand USING (ein)),
     base AS (
       SELECT o.ein, o.name, o.city, o.state, o.ntee_cd, o.search AS osearch, o.revenue_amt, o.tax_period,
              t.ein IS NOT NULL AS has_text, t.object_id, t.tax_year AS text_year, t.form AS text_form,
              t.mission AS raw_mission, t.programs, t.employees, t.volunteers, t.embedding, t.embedding_model, t.search AS tsearch,
              f.ein IS NOT NULL AS has_fin, f.tax_year AS fin_year, f.form AS fin_form, f.revenue AS fin_rev, f.expenses, f.assets, f.net_assets,
              x.x_year, x.x_rev, x.x_prev, x.x_exp, x.x_cash,
              -- one revenue figure, the newest of the IRS master file (BMF) and the SOI extract, used for filtering AND display
              CASE WHEN o.revenue_amt IS NOT NULL AND (f.ein IS NULL OR left(o.tax_period, 4)::int > f.tax_year) THEN 'bmf'
                   WHEN f.ein IS NOT NULL THEN 'soi' END AS rev_src
       FROM cand JOIN orgs o USING (ein) LEFT JOIN t USING (ein) LEFT JOIN f USING (ein) LEFT JOIN x USING (ein)),
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
         AND ($15::bigint IS NULL OR rev >= $15)
         AND ($9 OR rev IS NULL OR rev > 0))   -- hide $0 / inactive orgs unless asked
     SELECT *, CASE $16 WHEN 'keyword' THEN kw WHEN 'vector' THEN coalesce(sim, 0)
                 ELSE coalesce(sim, 0) + least(kw * 5, 0.5) * $17
                      + CASE WHEN $13::text IS NOT NULL AND ntee_cd LIKE $13 || '%' THEN 0.1 ELSE 0 END END AS score,  -- guessed cause: a nudge, not a filter
            count(*) OVER () AS total, count(*) FILTER (WHERE exact) OVER () AS exact_total
     FROM scored WHERE $1 = '' OR (kw > 0 AND $16 <> 'vector') OR sim IS NOT NULL OR exact
     ORDER BY exact DESC NULLS LAST,
              CASE WHEN $10 = 'largest' THEN rev END DESC NULLS LAST,
              CASE WHEN $10 = 'smallest' THEN rev END ASC NULLS LAST,
              score DESC, rev DESC NULLS LAST
     LIMIT $7 OFFSET $11`,
    [tsq, vec, MODEL_ID, states, maxRevenue ?? null, ntee ?? null, limit, requirements.map((r) => r.pattern), includeInactive, sort, offset, cities.map((c) => c.toUpperCase()), nteeHint ?? null, appalachia, minRevenue ?? null, mode, kwWeight, kwOnly ? tsq : words.join(" "), reqq],
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
      health: orgHealth(r),
      mission: r.mission,
      programs: r.programs,
      team: r.has_text ? { staff: r.employees ?? null, volunteers: r.volunteers ?? null } : null,
      filing: r.has_text ? { year: r.text_year, form: r.text_form } : null,
      exact: r.exact,
      score: Math.round(Number(r.score) * 100) / 100,
      data_completeness: r.has_text && r.has_fin ? "full" : r.has_text || r.has_fin ? "partial" : "basic",
      sources: sources({ ein: r.ein, state: r.state, revSrc: r.rev_src, finForm: r.fin_form, finYear: r.fin_year, objectId: r.object_id, textYear: r.text_year, textForm: r.text_form }),
    })),
  };
}
