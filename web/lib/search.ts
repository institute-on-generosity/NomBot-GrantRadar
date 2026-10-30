// Hybrid search: SQL filters + keyword (tsvector) + vector similarity over 990 text.
// Requirements ("must do workforce training") split results into exact matches and closest results.
import { db } from "./db";
import { webProfiles } from "./webProfile";
import { embedQuery, MODEL_ID, toSql } from "./embedder";
import { LABEL_SUBTYPES, isLabel } from "./labels";
import { nteeLabel } from "./ntee";
import { sources, type Source } from "./sources";
import type { PlaceEvidence } from "./place";
import { FILLER, topicHints } from "./topicHints";

export type Requirement = { label: string; pattern: string }; // pattern: Postgres/JS regex alternation
// A requirement's alternation as whole words: "van" never matches "advance", "bus" never "business". Plural and
// -ed/-ing endings still count ("mentor" finds "mentoring"). Same syntax in Postgres (ARE) and JavaScript.
export const wordRe = (pattern: string) => `(?<![a-z0-9])(?:${pattern})(?:s|es|ed|ing)?(?![a-z0-9])`;
export type Sort = "match" | "largest" | "smallest";
export type SearchInput = {
  q: string; semantic?: string; states?: string[]; cities?: string[]; appalachia?: boolean; maxRevenue?: number; minRevenue?: number; ntee?: string; nteeHint?: string;
  requirements?: Requirement[]; includeInactive?: boolean; sort?: Sort; limit?: number; offset?: number;
  label?: string; labelPartial?: boolean; // graded cause label (org_labels): primary tier only, or primary + partial
  keep?: string[]; // listed orgs always shown, with or without a topic match (named for the city, or serving it)
  zips?: string[]; eins?: string[]; // place scope (lib/place.ts): HQ ZIPs, or listed orgs (named for a city, or serving it); OR'd with cities
  prefer?: Requirement[]; preferLabel?: string; // soft preferences ("ideally girls", "especially mobile dental"): a ranking boost, never a filter
  boostLabels?: string[]; // graded labels the topic points to (youth development, women and girls; lib/parse.ts soften): a boost, and extra candidates in a small place
  nteeBoost?: string[]; // NTEE prefixes the topic points to (lib/topicHints): a boost, and extra candidates in a small place
  labelSub?: string; // sub-type of a label that has them (immigrants_refugees): services (default), policy, or all
  mode?: SearchMode;
  kwWeight?: number; // hybrid only: how much keyword matches add to meaning similarity (benchmark knob)
};
// hybrid: keyword + meaning (the app). keyword / vector: one method alone, for the search benchmark (eval/bench.mts).
export type SearchMode = "hybrid" | "keyword" | "vector";

export type Result = {
  ein: string; name: string; city: string | null; state: string | null; street?: string | null; zip?: string | null; website?: string | null;
  ntee: { code: string; label: string | null } | null;
  revenue: { amount: number; year: number | null; source: "IRS BMF" | "IRS SOI" } | null;
  financials: { tax_year: number; revenue: number; expenses: number; assets: number } | null;
  health: Health | null;
  mission: string | null; programs: string | null; team: { staff: number | null; volunteers: number | null } | null; filing: { year: number | null; form: string | null } | null;
  exact: boolean | null; score: number; data_completeness: "full" | "partial" | "basic"; sources: Source[];
  label: { label: string; tier: "primary" | "partial"; subtypes?: string[] } | null; // the cause label filter's tier for this org (null without one); subtypes for labels with them
  prefer?: string[]; // soft preferences this org's name or filing text mentions
  topicLabels?: { label: string; tier: "primary" | "partial" }[]; // boosted labels (preferred or the topic's) this org carries
  preferConfirmed?: { label: string; via: "website" | "program" }[]; // soft preferences its website or a place program confirms (lib/prefConfirm)
  preferLabel?: { label: string; tier: "primary" | "partial" }; // the preferred cause label and its tier ("ideally focused on girls"), lib/prefConfirm
  place?: PlaceEvidence; // tiered place search (lib/tiers.ts): which tier and why
  web?: { description: string; url: string; site: string; fetched: string; servesPlaces: string[] } | null; // its own website, for orgs with no 990 text (lib/webProfile)
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
// City ($12), ZIPs ($23) and listed orgs ($24) are alternatives: an org in any of them is in the place.
const SMALL = `(cardinality($12::text[]) > 0 OR cardinality($23::text[]) > 0 OR cardinality($24::text[]) > 0)`;
// Listed orgs only (a city's or a nearby ring's orgs, resolved by lib/tiers.ts, or those serving it): small enough
// to read every filing by primary key instead of walking the HNSW index until enough pass the place filter.
const TINY = `(cardinality($24::text[]) > 0 AND cardinality($12::text[]) = 0 AND cardinality($23::text[]) = 0)`;
const PLACE = `(cardinality($4::text[]) = 0 OR o.state = ANY($4))
         AND ($6::text IS NULL OR o.ntee_cd LIKE $6 || '%')
         AND (NOT ${SMALL} OR upper(o.city) = ANY($12) OR left(o.zip, 5) = ANY($23::text[]) OR o.ein = ANY($24::char(9)[]))
         AND (NOT $14::boolean OR EXISTS (SELECT 1 FROM zip_regions z WHERE z.zip5 = left(o.zip, 5)::char(5) AND z.appalachia))`; // char(5): zip5 is char(5), and comparing it as text skips its index (15s searches)
const NEAREST = 2000; // closest filings by meaning per search (1000 halves the HNSW reads but changed 4% of the top 40)
const KW_CAP = 1000;  // keyword candidates per source (names, filing text), so a broad word can't pull in 200K rows
const HINT_CAP = 600; // small place only: orgs whose name has a topic word or whose NTEE code fits (most have no 990 text)
const NO_TEXT = 0.45; // stand-in meaning similarity for a name or NTEE match with no 990 text (typical on-topic text scores 0.5-0.7)
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

export async function search({ q, semantic, states = [], cities = [], appalachia = false, maxRevenue, minRevenue, ntee, nteeHint, requirements = [], includeInactive = false, sort = "match", limit = 10, offset = 0, mode = "hybrid", kwWeight = KW_WEIGHT, label, labelPartial = false, labelSub, zips = [], eins = [], prefer = [], preferLabel, nteeBoost = [], keep = [], boostLabels = [] }: SearchInput) {
  // A label with sub-types filters to one (the default unless asked); "all" or a label without them: no filter.
  const subs = isLabel(label) ? LABEL_SUBTYPES[label] : undefined;
  const sub = subs && labelSub !== "all" ? (labelSub === "services" || labelSub === "policy" ? labelSub : subs.default) : null;
  // Filler words ("programs", "organizations") are never required: "youth sports programs" finds "Youth Sports League".
  const all = q.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const words = all.filter((w) => !FILLER.has(w)).length ? all.filter((w) => !FILLER.has(w)) : all;
  const tsq = words.join(" or ");
  // Small place: name words and NTEE codes the topic points to (lib/topicHints) are candidates too.
  const hints = topicHints(`${q} ${semantic ?? ""} ${prefer.map((p) => p.label).join(" ")}`);
  const nameWords = [...new Set([...words.filter((w) => w.length > 2), ...hints.names])].filter((w) => /^[a-z0-9]+$/.test(w));
  const nameq = nameWords.join(" | ");
  const boost = [...new Set([...nteeBoost, ...hints.ntee])].map((n) => `${n}%`);
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
        WHERE $2::vector IS NOT NULL AND $20::text IS NULL AND t.embedding_model = $3 AND NOT ${TINY} AND ${PLACE}
        ORDER BY t.embedding::halfvec(512) <=> $2::halfvec(512) LIMIT ${NEAREST})
       UNION
       -- Listed orgs: every filing is a candidate (a few thousand at most), ranked below by exact similarity.
       (SELECT t.ein FROM filing_latest t WHERE $2::vector IS NOT NULL AND $20::text IS NULL AND ${TINY} AND t.ein = ANY($24::char(9)[]))
       UNION
       (SELECT o.ein FROM orgs o WHERE $1 <> '' AND $16 <> 'vector' AND $20::text IS NULL AND o.search @@ ${kwq} AND ${PLACE} ${kwCap("o.search")})
       UNION
       (SELECT t.ein FROM filing_latest t JOIN orgs o USING (ein) WHERE $1 <> '' AND $16 <> 'vector' AND $20::text IS NULL AND t.search @@ ${kwq} AND ${PLACE} ${kwCap("t.search")})
       UNION
       (SELECT t.ein FROM ((SELECT ein, mission, programs, embedding FROM filing_latest
                             WHERE $19::text <> '' AND $20::text IS NULL AND search @@ to_tsquery('english', $19) LIMIT ${REQ_SCAN})
                            UNION ALL
                            (SELECT ein, mission, programs, embedding FROM filing_latest
                             WHERE $19 <> '' AND $1 <> '' AND $20::text IS NULL AND search @@ (to_tsquery('english', $19) && websearch_to_tsquery('english', $1)) LIMIT ${REQ_SCAN})) t
        JOIN orgs o USING (ein)
        WHERE ${PLACE}
          AND EXISTS (SELECT 1 FROM unnest($8::text[]) p WHERE coalesce(t.mission, '') || ' ' || coalesce(t.programs, '') ~* p)
        ${vec ? "ORDER BY t.embedding <=> $2::vector " : ""}LIMIT ${REQ_CAP})
       UNION
       (SELECT o.ein FROM orgs o WHERE $1 = '' AND $20::text IS NULL AND ${PLACE})
       UNION
       -- Small place (a city, nearby ZIPs, a county, listed orgs): orgs named for the topic or coded for it, most of
       -- them with no 990 text at all, and every listed org.
       (SELECT o.ein FROM orgs o WHERE ${SMALL} AND $20::text IS NULL AND ${PLACE}
          AND (($28::text <> '' AND o.search @@ to_tsquery('english', $28)) OR (cardinality($27::text[]) > 0 AND o.ntee_cd LIKE ANY($27::text[])))
        LIMIT ${HINT_CAP})
       UNION
       (SELECT o.ein FROM orgs o WHERE cardinality($24::text[]) > 0 AND $20::text IS NULL AND o.ein = ANY($24::char(9)[]) AND ${PLACE})
       UNION
       -- Small place: every org carrying a label the topic points to or the user prefers (youth development, women and girls), most of
       -- them named-only small groups the meaning search can't see.
       (SELECT o.ein FROM org_labels l JOIN orgs o USING (ein)
        WHERE ${SMALL} AND $20::text IS NULL AND (l.label = ANY($30::text[]) OR l.label = $26) AND ${PLACE} LIMIT ${HINT_CAP})
       UNION
       -- A cause label (climate, women and girls): every labeled org in the place is a candidate (a few
       -- thousand at most, from org_labels_label_tier), ranked below by meaning like any other search.
       (SELECT o.ein FROM org_labels l JOIN orgs o USING (ein)
        WHERE $20::text IS NOT NULL AND l.label = $20 AND (l.tier = 'primary' OR $21) AND ($22::text IS NULL OR $22 = ANY(l.subtypes)) AND ${PLACE})),
     t AS (SELECT t.ein, object_id, tax_year, form, mission, programs, employees, volunteers, embedding, embedding_model, search, website
           FROM filing_latest t JOIN cand USING (ein)),
     f AS (SELECT f.* FROM financials_latest f JOIN cand USING (ein)),
     lab AS (SELECT l.ein, l.tier AS label_tier, l.subtypes AS label_subtypes FROM org_labels l JOIN cand USING (ein) WHERE l.label = $20),
     plab AS (SELECT l.ein, l.tier AS pref_tier FROM org_labels l JOIN cand USING (ein) WHERE l.label = $26),
     blab AS (SELECT l.ein, sum(CASE WHEN l.label = $26 THEN 0 WHEN l.tier = 'primary' THEN 0.06 ELSE 0.03 END) AS lab_boost,
                     array_agg(l.label || ':' || l.tier ORDER BY l.label = $26 DESC, l.tier DESC) AS lab_hits
              FROM org_labels l JOIN cand USING (ein) WHERE l.label = ANY($30::text[]) OR l.label = $26 GROUP BY l.ein),
     x AS (SELECT x.ein, tax_year AS x_year, cy_revenue AS x_rev, py_revenue AS x_prev, cy_expenses AS x_exp, cash AS x_cash
           FROM flag_latest x JOIN cand USING (ein)),
     base AS (
       SELECT o.ein, o.name, o.city, o.state, o.street, o.zip, o.ntee_cd, o.search AS osearch, o.revenue_amt, o.tax_period, t.website, plab.pref_tier, coalesce(blab.lab_boost, 0) AS lab_boost, blab.lab_hits,
              t.ein IS NOT NULL AS has_text, t.object_id, t.tax_year AS text_year, t.form AS text_form,
              t.mission AS raw_mission, t.programs, t.employees, t.volunteers, t.embedding, t.embedding_model, t.search AS tsearch,
              f.ein IS NOT NULL AS has_fin, f.tax_year AS fin_year, f.form AS fin_form, f.revenue AS fin_rev, f.expenses, f.assets, f.net_assets,
              x.x_year, x.x_rev, x.x_prev, x.x_exp, x.x_cash, lab.label_tier, lab.label_subtypes,
              -- one revenue figure, the newest of the IRS master file (BMF) and the SOI extract, used for filtering AND display
              CASE WHEN o.revenue_amt IS NOT NULL AND (f.ein IS NULL OR left(o.tax_period, 4)::int > f.tax_year) THEN 'bmf'
                   WHEN f.ein IS NOT NULL THEN 'soi' END AS rev_src
       FROM cand JOIN orgs o USING (ein) LEFT JOIN t USING (ein) LEFT JOIN f USING (ein) LEFT JOIN x USING (ein) LEFT JOIN lab USING (ein) LEFT JOIN plab USING (ein) LEFT JOIN blab USING (ein)),
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
                   ELSE NOT EXISTS (SELECT 1 FROM unnest($8::text[]) p WHERE coalesce(raw_mission, '') || ' ' || coalesce(programs, '') !~* p) END AS exact,
              ${SMALL} AND (($28::text <> '' AND osearch @@ to_tsquery('english', $28)) OR (cardinality($27::text[]) > 0 AND ntee_cd LIKE ANY($27::text[])) OR lab_hits IS NOT NULL) AS hint,
              cardinality($27::text[]) > 0 AND ntee_cd LIKE ANY($27::text[]) AS ntee_fit,
              ARRAY(SELECT i FROM generate_subscripts($25::text[], 1) i WHERE name || ' ' || coalesce(raw_mission, '') || ' ' || coalesce(programs, '') ~* ($25::text[])[i]) AS pref_hits
       FROM v
       WHERE ($5::bigint IS NULL OR rev <= $5)
         AND ($15::bigint IS NULL OR rev >= $15)
         AND ($9 OR rev IS NULL OR rev > 0      -- hide $0 / inactive orgs unless asked; in a small place, $0 filers with a
              OR (${SMALL} AND left(tax_period, 4) ~ '^[0-9]{4}$' AND left(tax_period, 4)::int >= extract(year FROM now())::int - 2)))  -- recent return are active (most file a 990-N)
     SELECT *, CASE $16 WHEN 'keyword' THEN kw WHEN 'vector' THEN coalesce(sim, 0)
                 ELSE coalesce(sim, CASE WHEN hint THEN ${NO_TEXT} ELSE 0 END) + least(kw * 5, 0.5) * $17
                      + CASE WHEN $13::text IS NOT NULL AND ntee_cd LIKE $13 || '%' THEN 0.1 ELSE 0 END  -- guessed cause: a nudge, not a filter
                      + CASE WHEN ntee_fit THEN 0.05 ELSE 0 END                                           -- topic's NTEE codes (youth sports: N6, N4)
                      + least(cardinality(pref_hits), 2) * 0.05                                           -- soft preferences named in the text
                      + CASE pref_tier WHEN 'primary' THEN 0.08 WHEN 'partial' THEN 0.04 ELSE 0 END       -- preferred cause label
                      + least(lab_boost, 0.1)                                                             -- labels the topic points to
                      + CASE WHEN label_tier = 'primary' AND $21 THEN 0.05 ELSE 0 END END AS score,      -- with partial included, primary first on ties
            count(*) OVER () AS total, count(*) FILTER (WHERE exact) OVER () AS exact_total
     FROM scored WHERE $1 = '' OR $20::text IS NOT NULL OR (kw > 0 AND $16 <> 'vector') OR sim IS NOT NULL OR exact OR hint OR ein = ANY($29::char(9)[])
     ORDER BY exact DESC NULLS LAST,
              CASE WHEN $10 = 'largest' THEN rev END DESC NULLS LAST,
              CASE WHEN $10 = 'smallest' THEN rev END ASC NULLS LAST,
              score DESC, rev DESC NULLS LAST
     LIMIT $7 OFFSET $11`,
    [tsq, vec, MODEL_ID, states, maxRevenue ?? null, ntee ?? null, limit, requirements.map((r) => wordRe(r.pattern)), includeInactive, sort, offset, cities.map((c) => c.toUpperCase()), nteeHint ?? null, appalachia, minRevenue ?? null, mode, kwWeight, kwOnly ? tsq : words.join(" "), reqq, label ?? null, labelPartial, sub,
     zips, eins.map((e) => e.replace("-", "")), prefer.map((r) => wordRe(r.pattern)), preferLabel ?? null, boost, nameq, keep.map((e) => e.replace("-", "")),
     boostLabels.filter((l) => l !== label && isLabel(l))],
  );
  // Orgs with no 990 text: what their own website says (generosity-data org_web_profile), shown apart from IRS data
  const web = await webProfiles(rows.filter((r) => !r.mission && !r.programs).map((r) => r.ein));
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
      street: r.street ?? null,
      zip: r.zip ?? null,
      website: r.website ?? null,
      ntee: r.ntee_cd ? { code: r.ntee_cd, label: nteeLabel(r.ntee_cd) } : null,
      revenue: r.rev != null ? { amount: Number(r.rev), year: r.rev_year, source: r.rev_src === "bmf" ? "IRS BMF" : "IRS SOI" } : null,
      financials: r.has_fin ? { tax_year: r.fin_year, revenue: Number(r.fin_rev), expenses: Number(r.expenses), assets: Number(r.assets) } : null,
      health: orgHealth(r),
      mission: r.mission,
      programs: r.programs,
      team: r.has_text ? { staff: r.employees ?? null, volunteers: r.volunteers ?? null } : null,
      filing: r.has_text ? { year: r.text_year, form: r.text_form } : null,
      exact: r.exact,
      ...(prefer.length ? { prefer: (r.pref_hits as number[]).map((i) => prefer[i - 1].label) } : {}),
      ...(r.lab_hits?.length ? { topicLabels: (r.lab_hits as string[]).map((x) => { const [l, t] = x.split(":"); return { label: l, tier: t as "primary" | "partial" }; }) } : {}),
      label: label && r.label_tier ? { label, tier: r.label_tier, ...(r.label_subtypes ? { subtypes: r.label_subtypes } : {}) } : null,
      score: Math.round(Number(r.score) * 100) / 100,
      data_completeness: r.has_text && r.has_fin ? "full" : r.has_text || r.has_fin ? "partial" : "basic",
      sources: sources({ ein: r.ein, state: r.state, revSrc: r.rev_src, finForm: r.fin_form, finYear: r.fin_year, objectId: r.object_id, textYear: r.text_year, textForm: r.text_form }),
      web: (() => { const w = web.get(r.ein); return w ? { description: w.description, url: w.url, site: w.site, fetched: w.fetched, servesPlaces: w.servesPlaces } : null; })(),
    })),
  };
}
