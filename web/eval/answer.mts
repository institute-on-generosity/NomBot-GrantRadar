// Research answers test: each SQL building block in lib/answer.ts against an independent query written
// straight on the base tables (grants, orgs, filing_flag), plus timings. No Claude calls unless --route.
//   npm run test:answer               fixed specs + checks
//   npm run test:answer -- --route    also routes the sample questions through Claude (FAST_MODEL)
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }

const { db } = await import("../lib/db");
const { answer } = await import("../lib/answer");
const { DEFAULT_SPEC } = await import("../lib/answerSpec");
type Spec = import("../lib/answerSpec").Spec;

const spec = (s: Partial<Spec>): Spec => ({ ...DEFAULT_SPEC, ...s });
const climate = { name: "climate", label: "climate" as const, ntee: [], keywords: [] };
const women = { name: "women and girls", label: "women_girls" as const, ntee: [], keywords: [] };
const shelters = { name: "animal shelters", label: null, ntee: ["D20"], keywords: [] };
const opioid = { name: "opioid addiction", label: null, ntee: [], keywords: ["opioid", "opioids"] };
const substance = { name: "substance use and addiction", label: "substance_use" as const, ntee: [], keywords: [] };
const one = async (sql: string, params: unknown[] = []) => Number(Object.values((await db.query(sql, params)).rows[0])[0]);

// Independent checks: base tables, the miner's CLEAN filter written out again.
const CLEAN = `FROM grants g LEFT JOIN orgs o ON o.ein = g.recipient_ein
  WHERE g.amount > 0 AND g.recipient_kind IS NULL AND coalesce(o.foundation, '') NOT IN ('02','03','04')`;
// Schedule I grants (charity_grants), written out on the base table: US recipients, no foreign address,
// no private-foundation recipients, no placeholder lines ("SEE ATTACHED", generosity-data 050), no grants to
// other grantmakers (DAF sponsors, community foundations, United Ways). charity_funder_profile only supplies
// each funder's class.
const US_ST = `'^(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|PR|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$'`;
const CG = (cls: string | null) => `FROM charity_grants c ${cls ? `JOIN charity_funder_profile fp ON fp.ein = c.funder_ein AND fp.funder_class = '${cls}'` : ""} LEFT JOIN orgs o ON o.ein = c.recipient_ein
  WHERE c.amount > 0 AND c.recipient_country IS NULL AND c.recipient_state ~ ${US_ST} AND coalesce(o.foundation, '') NOT IN ('02','03','04')
    AND NOT is_placeholder_recipient(c.recipient_name)
    AND c.funder_ein IN (SELECT ein FROM charity_filers)
    AND coalesce(c.recipient_ein, '') NOT IN (SELECT ein FROM charity_funder_profile WHERE funder_class IN ('daf_sponsor','community_foundation','united_way'))`;
const cases: { name: string; s: Spec; check?: (a: Awaited<ReturnType<typeof answer>>) => Promise<[number, number]> }[] = [
  { name: "climate $ 2022-24 (any tier)", s: spec({ causes: [climate] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='climate')`)] },
  { name: "women & girls NY (any tier)", s: spec({ causes: [women], states: ["NY"] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_state='NY' AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='women_girls')`)] },
  { name: "gov grants to climate orgs 2024", s: spec({ causes: [climate], source: "government_grants" }),
    check: async (a) => [Number(a.numbers[0].value.replace(/[^0-9.]/g, "")) , await one(`SELECT round(sum(coalesce(government_grants,0)) FILTER (WHERE l.tier='primary') / 1e9, 1) FROM (SELECT DISTINCT ON (ein) * FROM filing_flag WHERE tax_year=2024 ORDER BY ein, object_id DESC) f JOIN org_labels l ON l.ein=f.ein AND l.label='climate' JOIN orgs o ON o.ein=f.ein WHERE coalesce(o.foundation,'') NOT IN ('02','03','04')`)] },
  { name: "states least per resident", s: spec({ metric: "by_state", perResident: true, order: "least" }),
    check: async (a) => [Number(a.rows[0].value), await one(`SELECT sum(g.amount) / (SELECT sum(population) FROM county_need WHERE state=$1 AND county_fips<>'00000') / 3 ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_state=$1`, [a.rows[0].state])] },
  { name: "animal shelters OH deficits", s: spec({ metric: "count_orgs", causes: [shelters], states: ["OH"], condition: "deficit" }),
    check: async (a) => [Number(a.rows[0].deficit), await one(`SELECT count(*) FROM (SELECT DISTINCT ON (f.ein) f.* FROM filing_flag f JOIN orgs o ON o.ein=f.ein WHERE o.ntee_cd LIKE 'D20%' AND o.state='OH' AND coalesce(o.foundation,'') NOT IN ('02','03','04') ORDER BY f.ein, f.tax_year DESC, f.object_id DESC) n WHERE cy_expenses > cy_revenue`)] },
  { name: "climate vs women & girls", s: spec({ metric: "compare", causes: [climate, women] }) },
  { name: "climate trend 2022-25", s: spec({ metric: "trend", causes: [climate], yearFrom: 2022, yearTo: 2025 }) },
  { name: "fastest-growing causes", s: spec({ metric: "fastest_causes" }) },
  { name: "rural vs urban, food banks", s: spec({ metric: "by_rurality", causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] }) },
  { name: "top funders climate", s: spec({ metric: "top_funders", causes: [climate] }),
    check: async (a) => [Number(a.rows[0].primary_usd), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.funder_ein=$1 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='climate' AND tier='primary')`, [a.rows[0].funder_ein])] },
  { name: "top recipients, gov grants, homeless shelters", s: spec({ metric: "top_recipients", source: "government_grants", causes: [{ name: "homeless shelters", label: null, ntee: ["L41"], keywords: [] }] }) },
  { name: "out-of-state funders, WV", s: spec({ metric: "out_of_state", states: ["WV"] }),
    check: async (a) => [Number(a.numbers[0].value.replace("%", "")), await one(`SELECT round(100.0 * sum(g.amount) FILTER (WHERE f.state <> g.recipient_state) / sum(g.amount) FILTER (WHERE f.state IS NOT NULL)) ${CLEAN.replace("WHERE", "LEFT JOIN funders f ON f.ein = g.funder_ein WHERE")} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_state='WV'`)] },
  { name: "median grant, women & girls", s: spec({ metric: "grant_size", causes: [women] }) },
  { name: "general support share, arts", s: spec({ metric: "general_support", causes: [{ name: "arts", label: null, ntee: ["A"], keywords: [] }] }) },
  { name: "concentration, climate", s: spec({ metric: "concentration", causes: [climate] }) },
  { name: "overlap climate x women", s: spec({ metric: "overlap_funders", causes: [climate, women] }) },
  { name: "opioid (keyword set) $", s: spec({ causes: [opioid] }) },
  { name: "substance use OH (any tier)", s: spec({ causes: [substance], states: ["OH"] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_state='OH' AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='substance_use')`)] },
  { name: "gov-reliant human services, KY", s: spec({ metric: "count_orgs", causes: [{ name: "human services", label: null, ntee: ["P"], keywords: [] }], states: ["KY"], condition: "gov_reliant" }) },
  { name: "low cash, Cook County", s: spec({ metric: "count_orgs", county: "Cook County", states: ["IL"], condition: "low_cash" }) },
  { name: "gov grants top funders (partial)", s: spec({ metric: "top_funders", source: "government_grants", causes: [climate] }) },
  { name: "individual giving (none)", s: spec({ metric: "none", missing: ["individual_giving"] }) },
  // Federal awards to nonprofits (USAspending, federal_awards), placed by place of performance
  { name: "federal awards to nonprofits, US FY2022-25", s: spec({ source: "federal_awards" }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(amount) FROM federal_awards WHERE fiscal_year BETWEEN 2022 AND 2025`)] },
  { name: "federal awards to climate orgs (primary), trend", s: spec({ source: "federal_awards", metric: "trend", causes: [climate] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.primary_usd), 0)), await one(`SELECT sum(amount) FROM federal_awards WHERE fiscal_year BETWEEN 2022 AND 2025 AND recipient_ein IN (SELECT ein FROM org_labels WHERE label='climate' AND tier='primary')`)] },
  { name: "federal $ per resident by state (top)", s: spec({ source: "federal_awards", metric: "by_state", perResident: true }),
    check: async (a) => [Number(a.rows[0].value), await one(`SELECT sum(amount) / (SELECT sum(population) FROM county_need WHERE state=$1 AND county_fips<>'00000') / 4 FROM federal_awards WHERE fiscal_year BETWEEN 2022 AND 2025 AND pop_state=$1`, [a.rows[0].key])] },
  { name: "top federal agencies, Ohio", s: spec({ source: "federal_awards", metric: "top_funders", states: ["OH"] }),
    check: async (a) => [Number(a.rows[0].usd), await one(`SELECT sum(amount) FROM federal_awards WHERE fiscal_year BETWEEN 2022 AND 2025 AND pop_state='OH' AND agency_name=$1`, [a.rows[0].key])] },
  { name: "federal $ by county poverty", s: spec({ source: "federal_awards", metric: "breakdown", by: "county_poverty" }),
    check: async (a) => [Number(a.rows.at(-1)!.usd), await one(`SELECT sum(amount) FROM federal_awards WHERE fiscal_year BETWEEN 2022 AND 2025 AND pop_county_fips IN (SELECT county_fips FROM county_acs WHERE level='county' AND poverty_rate >= 20)`)] },
  { name: "federal top recipients, food banks", s: spec({ source: "federal_awards", metric: "top_recipients", causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] }) },
  { name: "federal $ by program, Cook County", s: spec({ source: "federal_awards", metric: "breakdown", by: "program", county: "Cook County", states: ["IL"] }) },
  // Census ACS 5-year (county_acs): per person in poverty and counties grouped by poverty rate
  { name: "states most foundation $ per person in poverty", s: spec({ metric: "by_state", perPoverty: true }),
    check: async (a) => [Number(a.rows[0].value), await one(`SELECT sum(t.usd) / (SELECT sum(people_in_poverty) FROM county_acs WHERE level='county' AND state=$1) / 3 FROM grant_totals t WHERE t.tax_year BETWEEN 2022 AND 2024 AND t.state=$1`, [a.rows[0].state])] },
  { name: "foundation $ per resident by county poverty", s: spec({ metric: "breakdown", by: "county_poverty" }),
    check: async (a) => [Number(a.rows.at(-1)!.usd), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND z.county_fips IN (SELECT county_fips FROM county_acs WHERE level='county' AND poverty_rate >= 20)`.replace("LEFT JOIN orgs o", "JOIN zip_regions z ON z.zip5 = left(g.recipient_zip, 5)::char(5) LEFT JOIN orgs o"))] },
  { name: "DAF $ by county race/ethnicity, per person in poverty", s: spec({ source: "charity_grants", charityFunder: "daf_sponsor", metric: "breakdown", by: "county_race", perPoverty: true }) },
  // Schedule I: donor-advised fund sponsors, community foundations, United Ways
  { name: "DAF sponsors to climate 2022-24 (any tier)", s: spec({ source: "charity_grants", charityFunder: "daf_sponsor", causes: [climate] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(c.amount) ${CG("daf_sponsor")} AND c.tax_year BETWEEN 2022 AND 2024 AND c.recipient_ein IN (SELECT ein FROM org_labels WHERE label='climate')`)] },
  { name: "community foundations, all US 2022-24", s: spec({ source: "charity_grants", charityFunder: "community_foundation" }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.grants_usd), 0)), await one(`SELECT sum(c.amount) ${CG("community_foundation")} AND c.tax_year BETWEEN 2022 AND 2024`)] },
  { name: "top DAF sponsors, all causes", s: spec({ source: "charity_grants", charityFunder: "daf_sponsor", metric: "top_funders" }),
    check: async (a) => [Number(a.rows[0].usd), await one(`SELECT sum(c.amount) ${CG("daf_sponsor")} AND c.tax_year BETWEEN 2022 AND 2024 AND c.funder_ein=$1`, [a.rows[0].funder_ein])] },
  { name: "United Ways to food banks, by state (top)", s: spec({ source: "charity_grants", charityFunder: "united_way", metric: "by_state", causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] }),
    check: async (a) => [Number(a.rows[0].usd), await one(`SELECT sum(c.amount) ${CG("united_way")} AND c.tax_year BETWEEN 2022 AND 2024 AND c.recipient_state=$1 AND o.ntee_cd LIKE 'K31%'`, [a.rows[0].state])] },
  { name: "charity grants by funder group", s: spec({ source: "charity_grants", metric: "breakdown", by: "charity_funder" }),
    check: async (a) => [Number(a.rows.find((r) => r.key === "daf_sponsor")?.usd ?? 0), await one(`SELECT sum(c.amount) ${CG("daf_sponsor")} AND c.tax_year BETWEEN 2022 AND 2024`)] },
  { name: "DAF sponsors, top recipients in health", s: spec({ source: "charity_grants", charityFunder: "daf_sponsor", metric: "top_recipients", causes: [{ name: "health", label: null, ntee: ["E"], keywords: [] }] }),
    check: async (a) => [Number(a.rows[0].usd), await one(`SELECT sum(c.amount) ${CG("daf_sponsor")} AND c.tax_year BETWEEN 2022 AND 2024 AND c.recipient_ein=$1`, [a.rows[0].ein])] },
  // The largest 1% of nonprofits: by revenue on Form 990, and foundation money to the largest 1% by revenue
  { name: "largest 1% of nonprofits by revenue, 2024", s: spec({ metric: "concentration", source: "revenue" }),
    check: async (a) => [Number(a.rows[0].top1pct_usd), await one(`SELECT sum(v) FROM (SELECT greatest(coalesce(cy_revenue, 0), 0) AS v FROM (SELECT DISTINCT ON (f.ein) f.* FROM filing_flag f JOIN orgs o ON o.ein=f.ein WHERE f.tax_year=2024 AND coalesce(o.foundation,'') NOT IN ('02','03','04') ORDER BY f.ein, f.object_id DESC) x ORDER BY 1 DESC LIMIT $1) t`, [a.rows[0].top1pct_orgs])] },
  { name: "foundation $ to the largest 1% by revenue", s: spec({ metric: "concentration", by: "recipient_size" }),
    check: async (a) => [Number(a.rows[0].top1pct_grants_usd), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_ein IN (SELECT rp.ein FROM recipient_profile rp JOIN orgs o2 ON o2.ein=rp.ein WHERE coalesce(o2.foundation,'') NOT IN ('02','03','04') AND greatest(rp.revenue,0) >= $1)`, [a.rows[0].top1pct_cutoff_usd])] },
  // School districts and public colleges: never private colleges
  { name: "school districts and public colleges", s: spec({ recipientKind: "public_entity" }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_entity IN (SELECT id FROM public_entities WHERE kind IN ('school_district','college_public'))`)] },
  // Form 990 lines with a graded label: primary tier only (a partial-tier org's whole budget isn't the cause's)
  { name: "gov grants, climate, top recipient is primary", s: spec({ metric: "top_recipients", source: "government_grants", causes: [climate] }),
    check: async (a) => [await one(`SELECT count(*) FROM org_labels WHERE label='climate' AND tier<>'primary' AND ein = ANY($1)`, [a.rows.map((r) => r.ein)]), 0] },
  // Company (corporate) foundations: company_foundations (generosity-data 045), never the grant cube
  { name: "company foundations, all US 2022-24", s: spec({ funderType: "company" }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.funder_ein IN (SELECT ein FROM company_foundations)`)] },
  { name: "company foundations to education", s: spec({ funderType: "company", causes: [{ name: "education", label: null, ntee: ["B"], keywords: [] }] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND o.ntee_cd LIKE 'B%' AND g.funder_ein IN (SELECT ein FROM company_foundations)`)] },
  { name: "top company foundations, all causes", s: spec({ metric: "top_funders", funderType: "company" }),
    check: async (a) => [Number(a.rows[0].usd), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.funder_ein=$1 AND g.funder_ein IN (SELECT ein FROM company_foundations)`, [a.rows[0].funder_ein])] },
  { name: "top company foundations are all flagged", s: spec({ metric: "top_funders", funderType: "company" }),
    check: async (a) => [await one(`SELECT count(*) FROM unnest($1::text[]) e WHERE e NOT IN (SELECT ein FROM company_foundations)`, [a.rows.map((r) => r.funder_ein)]), 0] },
  // Inflation (BLS CPI-U, generosity-data 052): real dollars against the CPI table read directly. Tax years use the
  // calendar-year annual average (M13), federal fiscal years the October-September mean; base = newest annual average.
  { name: "climate trend, 2022 primary $ in base-year dollars", s: spec({ metric: "trend", causes: [climate] }),
    check: async (a) => { const r = a.rows.find((x) => x.tax_year === 2022)!; const k = Object.keys(r).find((x) => /_in_\d{4}_dollars$/.test(x))!;
      return [Number(r[k]), await one(`SELECT sum(g.amount) * (SELECT value FROM cpi_u WHERE period='M13' ORDER BY year DESC LIMIT 1) / (SELECT value FROM cpi_u WHERE period='M13' AND year=2022) ${CLEAN} AND g.tax_year=2022 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='climate' AND tier='primary')`)]; } },
  // a trend with no years runs 2020-2024 (G_TREND: first year e-filing was required)
  { name: "all foundation $ trend, growth after inflation", s: spec({ metric: "trend" }),
    check: async (a) => [Number(a.numbers[1].value.replace(/[^0-9.\-−]/g, "").replace("−", "-")), await one(`WITH t AS (SELECT tax_year, sum(g.amount) AS usd ${CLEAN} AND g.tax_year IN (2020, 2024) GROUP BY 1), c AS (SELECT year, value FROM cpi_u WHERE period='M13')
      SELECT round(100 * ((SELECT usd FROM t WHERE tax_year=2024) / (SELECT usd FROM t WHERE tax_year=2020) * (SELECT value FROM c WHERE year=2020) / (SELECT value FROM c WHERE year=2024) - 1), 1)`)] },
  // years before e-filing was required: the answer uses them and says how much smaller they are (generosity-data 057)
  { name: "trend since 2015: early-years coverage caveat", s: spec({ metric: "trend", yearFrom: 2015 }),
    check: async (a) => [a.caveats.some((c) => /E-filing was optional/.test(c)) && a.rows.some((x) => x.tax_year === 2015) ? 1 : 0, 1] },
  { name: "federal awards trend, fiscal-year CPI", s: spec({ source: "federal_awards", metric: "trend" }),
    check: async (a) => { const r = a.rows.find((x) => x.fiscal_year === 2022)!; const k = Object.keys(r).find((x) => /_in_\d{4}_dollars$/.test(x))!;
      return [Number(r[k]), await one(`SELECT sum(amount) * (SELECT value FROM cpi_u WHERE period='M13' ORDER BY year DESC LIMIT 1)
        / (SELECT avg(value) FROM cpi_u WHERE period <> 'M13' AND make_date(year, substr(period, 2)::int, 1) BETWEEN '2021-10-01' AND '2022-09-01') FROM federal_awards WHERE fiscal_year=2022`)]; } },
  { name: "gov grants trend (same orgs), 2023 $ in base-year dollars", s: spec({ metric: "trend", source: "government_grants" }),
    check: async (a) => { const r = a.rows.find((x) => x.tax_year === 2023)!; const k = Object.keys(r).find((x) => /_in_\d{4}_dollars$/.test(x))!;
      return [Number(r[k]), Number(r.usd) * await one(`SELECT (SELECT value FROM cpi_u WHERE period='M13' ORDER BY year DESC LIMIT 1) / (SELECT value FROM cpi_u WHERE period='M13' AND year=2023)`)]; } },
  // Benchmarks (generosity-data 053): national coverage share of IRS SOI grants paid (foundations + 4947 trusts)
  { name: "national foundation total: share of IRS SOI 2022", s: spec({ metric: "total" }),
    check: async (a) => [Number(a.coverage.find((c) => c.label.startsWith("Vs IRS SOI"))!.value.match(/^([\d.]+)%/)![1]), await one(`SELECT round(100 * (SELECT sum(usd) FROM grant_totals WHERE tax_year=2022) / (SELECT sum(value) FROM benchmarks WHERE source IN ('irs_soi_pf','irs_soi_trust') AND measure='grants_paid' AND year=2022))`)] },
  // Never mislead (Oct 17): regions, top-N funder sets, multi-year conditions, years outside the data, invalid NTEE keys.
  { name: "Appalachia (ARC counties), foundation $ 2022-24", s: spec({ region: "appalachia" }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.grants_usd), 0)), await one(`SELECT sum(amount) FROM grant_clean WHERE tax_year BETWEEN 2022 AND 2024 AND county_fips IN (SELECT county_fips FROM zip_regions WHERE appalachia)`)] },
  { name: "share from the 100 largest foundations", s: spec({ metric: "top_funders", topN: 100 }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(usd) FROM (SELECT sum(amount) AS usd FROM grant_clean WHERE tax_year BETWEEN 2022 AND 2024 GROUP BY funder_ein ORDER BY 1 DESC LIMIT 100) t`)] },
  { name: "deficits two years in a row", s: spec({ metric: "count_orgs", condition: "deficit", streak: 2 }),
    check: async (a) => [Number(a.numbers[0].value.replace(/,/g, "")), await one(`WITH y AS (SELECT f.ein, f.tax_year, f.expenses > f.revenue AS d, max(f.tax_year) OVER (PARTITION BY f.ein) AS newest FROM flag_year f JOIN orgs o ON o.ein = f.ein WHERE coalesce(o.foundation,'') NOT IN ('02','03','04'))
      SELECT count(*) FROM (SELECT ein FROM y WHERE tax_year > newest - 2 GROUP BY ein HAVING count(*) = 2 AND bool_and(coalesce(d, false))) t`)] },
  { name: "health 2015-2024: partial, names the years", s: spec({ metric: "trend", causes: [{ name: "health", label: null, ntee: ["E"], keywords: [] }], yearFrom: 2015, yearTo: 2024 }),
    check: async (a) => [a.status === "partial" && /starts in 2022/.test(a.headline) && a.missing.some((m) => /before 2022/.test(m.what)) ? 1 : 0, 1] },
  { name: "causes with the least money: no invalid NTEE key", s: spec({ metric: "breakdown", by: "cause", order: "least" }),
    check: async (a) => [/^\d|\(0\)|\(c\)/.test(a.headline) ? 1 : 0, 0] },
  { name: "router sentence note is the headline, not suffixed", s: spec({ metric: "none", missing: ["other"], missingNote: "Our grant data covers tax years 2022-2025 only, so 2008 giving is not available." }),
    check: async (a) => [/isn't in our IRS data$/.test(a.headline) ? 1 : 0, 0] },
  // Household giving (IRS SOI individual returns, generosity-data 054) against the tables directly.
  { name: "household: US charitable deductions 2023", s: spec({ source: "household_giving" }),
    check: async (a) => [Number(a.rows.find((r) => r.tax_year === 2023)!.charitable_deductions_usd), await one(`SELECT sum(charity_usd) FROM soi_individual_county WHERE level='state' AND tax_year=2023`)] },
  { name: "household: top state per return 2023", s: spec({ source: "household_giving", metric: "by_state", perResident: true }),
    check: async (a) => [Number(a.rows[0].per_return), await one(`SELECT sum(charity_usd)::float8 / sum(returns) FROM soi_individual_county WHERE level='state' AND tax_year=2023 AND state=$1`, [a.rows[0].key])] },
  { name: "household: Appalachia 2023", s: spec({ source: "household_giving", region: "appalachia" }),
    check: async (a) => [Number(a.rows.find((r) => r.tax_year === 2023)!.charitable_deductions_usd), await one(`SELECT sum(charity_usd) FROM soi_individual_county WHERE level='county' AND tax_year=2023 AND county_fips IN (SELECT county_fips FROM zip_regions WHERE appalachia)`)] },
  { name: "household: share of AGI, $200K and up, 2023", s: spec({ source: "household_giving", metric: "breakdown", by: "income" }),
    check: async (a) => [Number(a.rows.find((r) => r.key === "8")!.share_of_agi), await one(`SELECT sum(charity_usd)::float8 / sum(agi) FROM soi_individual_county WHERE level='state' AND tax_year=2023 AND agi_stub=8`)] },
  { name: "household: trend, 2013 in base-year dollars", s: spec({ source: "household_giving", metric: "trend" }),
    check: async (a) => { const r = a.rows.find((x) => x.tax_year === 2013)!; const k = Object.keys(r).find((x) => /_in_\d{4}_dollars$/.test(x))!;
      return [Number(r[k]), await one(`SELECT sum(charity_usd) * (SELECT value FROM cpi_u WHERE period='M13' ORDER BY year DESC LIMIT 1) / (SELECT value FROM cpi_u WHERE period='M13' AND year=2013) FROM soi_individual_county WHERE level='state' AND tax_year=2013`)]; } },
  { name: "household: Ohio counties per return (top)", s: spec({ source: "household_giving", metric: "breakdown", by: "county", states: ["OH"], perResident: true }),
    check: async (a) => [Number(a.rows[0].per_return), await one(`SELECT sum(charity_usd)::float8 / sum(returns) FROM soi_individual_county WHERE level='county' AND tax_year=2023 AND county_fips=$1`, [a.rows[0].key])] },
  // Foundation finances (generosity-data 055, foundation_finances, 990-PF): payout rate = qualifying distributions /
  // net investment assets, private operating foundations out, written on the base table (no view). Rates in basis points.
  { name: "payout: median rate 2024 (bp)", s: spec({ metric: "share", source: "foundation_finances" }),
    check: async (a) => [Math.round(Number(a.rows[0].median_payout_rate) * 1e4), Math.round(1e4 * await one(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(qualifying_distributions, 0)::numeric / net_investment_assets) FROM foundation_finances WHERE tax_year = 2024 AND net_investment_assets > 0 AND NOT coalesce(private_operating, false)`))] },
  { name: "payout: share at 5% or more 2024 (bp)", s: spec({ metric: "share", source: "foundation_finances" }),
    check: async (a) => [Math.round(Number(a.rows[0].share_at_5pct_or_more) * 1e4), Math.round(1e4 * await one(`SELECT avg((coalesce(qualifying_distributions, 0) >= 0.05 * net_investment_assets)::int) FROM foundation_finances WHERE tax_year = 2024 AND net_investment_assets > 0 AND NOT coalesce(private_operating, false)`))] },
  { name: "payout by size: $1B and up median (bp)", s: spec({ metric: "breakdown", by: "funder_size", source: "foundation_finances" }),
    check: async (a) => [Math.round(Number(a.rows.find((r) => r.group === "$1B and up")!.median_payout_rate) * 1e4), Math.round(1e4 * await one(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(qualifying_distributions, 0)::numeric / net_investment_assets) FROM foundation_finances WHERE tax_year = 2024 AND net_investment_assets > 0 AND NOT coalesce(private_operating, false) AND fmv_assets >= 1e9`))] },
  { name: "payout trend: 2022 dollar-weighted rate (bp)", s: spec({ metric: "trend", source: "foundation_finances" }),
    check: async (a) => [Math.round(Number(a.rows.find((r) => r.tax_year === 2022)!.dollar_weighted_payout_rate) * 1e4), Math.round(1e4 * await one(`SELECT sum(coalesce(qualifying_distributions, 0))::numeric / sum(net_investment_assets) FROM foundation_finances WHERE tax_year = 2022 AND net_investment_assets > 0 AND NOT coalesce(private_operating, false)`))] },
  { name: "foundation finances vs IRS SOI 2022: net investment assets within 2%", s: spec({ metric: "share", source: "foundation_finances" }),
    check: async (a) => [Math.abs(await one(`SELECT sum(net_investment_assets) / (SELECT value FROM benchmarks WHERE source = 'irs_soi_pf' AND measure = 'noncharitable_assets' AND year = 2022) FROM foundation_finances WHERE tax_year = 2022 AND NOT charitable_trust`) - 1) < 0.02 && a.coverage.some((c) => c.label === "Vs IRS SOI 2022") ? 1 : 0, 1] },
  // Nonprofit finance panel (generosity-data 056, org_finance_year), checked on filing_flag: own Form 990 for the year,
  // else the next year's Form 990 prior-year column.
  { name: "food banks: deficits 2024 (Form 990, by year)", s: spec({ metric: "count_orgs", condition: "deficit", by: "year", causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] }),
    check: async (a) => [Number(a.rows.find((r) => r.tax_year === 2024)!.met_condition), await one(`WITH own AS (SELECT DISTINCT ON (ein, tax_year) * FROM filing_flag ORDER BY ein, tax_year, object_id DESC),
      y AS (SELECT ein, form, cy_revenue AS rev, cy_expenses AS exp FROM own WHERE tax_year = 2024
            UNION ALL SELECT n.ein, '990', f.py_revenue, f.py_expenses FROM own n JOIN filing_flag f ON f.object_id = n.object_id
              WHERE n.tax_year = 2025 AND n.form = '990' AND f.py_revenue IS NOT NULL AND f.py_expenses IS NOT NULL AND NOT EXISTS (SELECT 1 FROM own x WHERE x.ein = n.ein AND x.tax_year = 2024))
      SELECT count(*) FROM y JOIN orgs o ON o.ein = y.ein WHERE y.form = '990' AND o.ntee_cd LIKE 'K31%' AND coalesce(o.foundation, '') NOT IN ('02','03','04') AND y.exp > y.rev`)] },
  { name: "deficits by revenue size: under $100K, 2024", s: spec({ metric: "count_orgs", condition: "deficit", by: "recipient_size" }),
    check: async (a) => [Number(a.rows.find((r) => r.revenue_band === "Under $100K")!.met_condition), await one(`SELECT count(*) FROM (SELECT DISTINCT ON (ein) * FROM filing_flag WHERE tax_year = 2024 ORDER BY ein, object_id DESC) f JOIN orgs o ON o.ein = f.ein
      WHERE coalesce(o.foundation, '') NOT IN ('02','03','04') AND f.cy_revenue < 100000 AND f.cy_expenses > f.cy_revenue`)] },
  { name: "median months of cash, nonprofits under $1M (x100)", s: spec({ metric: "count_orgs", condition: "low_cash", recipientSize: { min: null, max: 1e6 } }),
    check: async (a) => [Math.round(Number(a.rows[0].median_months_cash) * 100), Math.round(100 * await one(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n.cash * 12.0 / n.cy_expenses) FROM (SELECT DISTINCT ON (f.ein) f.* FROM filing_flag f JOIN orgs o ON o.ein = f.ein
      WHERE coalesce(o.foundation, '') NOT IN ('02','03','04') AND o.ein IN (SELECT ein FROM recipient_profile WHERE band BETWEEN 1 AND 3) ORDER BY f.ein, f.tax_year DESC, f.object_id DESC) n WHERE n.cy_expenses > 0 AND n.cash IS NOT NULL`))] },
];

let fail = 0;
for (const c of cases) {
  const t = Date.now();
  const a = await answer(c.name, c.s);
  const ms = Date.now() - t;
  let check = "";
  if (c.check) {
    const [got, want] = await c.check(a);
    const ok = Math.abs(got - want) <= Math.max(1, Math.abs(want) * 0.001);
    if (!ok) fail++;
    check = ok ? " ✓ matches direct SQL" : ` ✗ got ${got}, direct SQL ${want}`;
  }
  console.log(`${String(ms).padStart(5)} ms  [${a.status}] ${c.name}\n         ${a.headline}${check}\n         ${a.bullets.join(" · ")}`);
  for (const bl of a.bullets) if (bl.split(/\s+/).length > 16 || /[;—]/.test(bl)) console.log(`         ! bullet rule: ${bl}`);
}

if (process.argv.includes("--route")) {
  const { routeQuestion } = await import("../lib/answerRoute");
  const qs = ["How much do donor-advised funds give to climate?", "Which federal agencies give the most to nonprofits in Ohio?", "Do high-poverty counties get less foundation money per resident?", "Which states get the most foundation money per person in poverty?", "Do community foundations or DAF sponsors give more to education?", "how much government money has gone to climate change?", "how much foundation money goes to women and girls in New York",
    "which states give the least foundation money per resident", "how many animal shelters in Ohio run deficits", "how much do individuals give to churches each year?",
    "food banks in Ohio", "Are foundations paying out more than 5%?", "What is the median payout rate by foundation size?", "Is foundation payout rising or falling?",
    "What share of food banks ran deficits each year?", "How many months of cash do small nonprofits have?"];
  for (const q of qs) {
    const t = Date.now();
    const r = await routeQuestion(q);
    console.log(`${Date.now() - t} ms route  ${q}\n   ${JSON.stringify(r)}`);
  }
}
await db.end();
process.exit(fail ? 1 : 0);
