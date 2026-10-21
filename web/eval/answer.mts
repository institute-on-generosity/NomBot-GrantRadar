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
const housing = { name: "housing and homelessness", label: "housing_homelessness" as const, ntee: [], keywords: [] };
const tech = { name: "tech and AI skills", label: "ai_tech_learning_work" as const, ntee: [], keywords: [] };
const racial = { name: "racial equity", label: "racial_equity" as const, ntee: [], keywords: [] };
const immig = { name: "immigrants and refugees", label: "immigrants_refugees" as const, ntee: [], keywords: [] };
const mental = { name: "mental health", label: "mental_health" as const, ntee: [], keywords: [] };
const one = async (sql: string, params: unknown[] = []) => Number(Object.values((await db.query(sql, params)).rows[0])[0]);

// Independent checks: base tables, the miner's CLEAN filter written out again.
const CLEAN = `FROM grants g LEFT JOIN orgs o ON o.ein = g.recipient_ein
  WHERE g.amount > 0 AND g.recipient_kind IS NULL AND coalesce(o.foundation, '') NOT IN ('02','03','04')`;
// Schedule I grants (charity_grants), written out on the base table: US recipients, no foreign address,
// no private-foundation recipients, no placeholder lines ("SEE ATTACHED", generosity-data 050), no transfers
// between related organizations (grant_transfers, 067), no grants to
// other grantmakers (DAF sponsors, community foundations, United Ways). charity_funder_profile only supplies
// each funder's class.
const US_ST = `'^(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|PR|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$'`;
const CG = (cls: string | null) => `FROM charity_grants c ${cls ? `JOIN charity_funder_profile fp ON fp.ein = c.funder_ein AND fp.funder_class = '${cls}'` : ""} LEFT JOIN orgs o ON o.ein = c.recipient_ein
  WHERE c.amount > 0 AND c.recipient_country IS NULL AND c.recipient_state ~ ${US_ST} AND coalesce(o.foundation, '') NOT IN ('02','03','04')
    AND NOT is_placeholder_recipient(c.recipient_name)
    AND NOT EXISTS (SELECT 1 FROM grant_transfers t WHERE t.source = 'si' AND t.id = c.id)
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
  { name: "housing & homelessness CA (any tier)", s: spec({ causes: [housing], states: ["CA"] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_state='CA' AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='housing_homelessness')`)] },
  { name: "tech and AI skills US (any tier)", s: spec({ causes: [tech] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='ai_tech_learning_work')`)] },
  { name: "top funders tech and AI skills", s: spec({ metric: "top_funders", causes: [tech] }),
    check: async (a) => [Number(a.rows[0].primary_usd), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.funder_ein=$1 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='ai_tech_learning_work' AND tier='primary')`, [a.rows[0].funder_ein])] },
  { name: "racial equity US (any tier)", s: spec({ causes: [racial] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='racial_equity')`)] },
  // Sub-types (generosity-data 069): a question about immigrants counts services, one about immigration policy counts policy.
  { name: "immigrants & refugees NY, services by default (any tier)", s: spec({ causes: [immig], states: ["NY"] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_state='NY' AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='immigrants_refugees' AND 'services' = ANY(subtypes))`)] },
  { name: "immigration policy US, policy sub-type (any tier)", s: spec({ causes: [{ ...immig, name: "immigration policy" }] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='immigrants_refugees' AND 'policy' = ANY(subtypes))`)] },
  { name: "immigrants & refugees US, all sub-types (any tier)", s: spec({ causes: [{ ...immig, subtype: "all" }] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='immigrants_refugees')`)] },
  { name: "top funders immigrants & refugees, services", s: spec({ metric: "top_funders", causes: [immig] }),
    check: async (a) => [Number(a.rows[0].primary_usd), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.funder_ein=$1 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='immigrants_refugees' AND tier='primary' AND 'services' = ANY(subtypes))`, [a.rows[0].funder_ein])] },
  { name: "top funders immigration policy", s: spec({ metric: "top_funders", causes: [{ ...immig, name: "immigration policy" }] }),
    check: async (a) => [Number(a.rows[0].primary_usd), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.funder_ein=$1 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='immigrants_refugees' AND tier='primary' AND 'policy' = ANY(subtypes))`, [a.rows[0].funder_ein])] },
  { name: "mental health US (any tier)", s: spec({ causes: [mental] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='mental_health')`)] },
  { name: "top funders mental health", s: spec({ metric: "top_funders", causes: [mental] }),
    check: async (a) => [Number(a.rows[0].primary_usd), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.funder_ein=$1 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='mental_health' AND tier='primary')`, [a.rows[0].funder_ein])] },
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
  // A cause that names a federal program matches its assistance listings, any recipient (lib/fedPrograms); a cause
  // with no federal match is unanswerable, never "$0" (Oct 19: Head Start as NTEE P23 read $0).
  { name: "federal Head Start (93.600 + 93.356), NTEE ignored", s: spec({ source: "federal_awards", causes: [{ name: "Head Start providers", label: null, ntee: ["P23"], keywords: [] }] }),
    check: async (a) => [Number(a.rows.reduce((t, r) => t + Number(r.usd), 0)), await one(`SELECT sum(amount) FROM federal_awards WHERE fiscal_year BETWEEN 2022 AND 2025 AND cfda_number IN ('93.600', '93.356')`)] },
  { name: "federal Head Start per resident, top state", s: spec({ source: "federal_awards", metric: "by_state", perResident: true, causes: [{ name: "Head Start", label: null, ntee: [], keywords: ["head start"] }] }),
    check: async (a) => [Number(a.rows[0].value), await one(`SELECT sum(amount) / (SELECT sum(population) FROM county_need WHERE state=$1 AND county_fips<>'00000') / 4 FROM federal_awards WHERE fiscal_year BETWEEN 2022 AND 2025 AND pop_state=$1 AND cfda_number IN ('93.600', '93.356')`, [a.rows[0].key])] },
  { name: "federal cause with no match: unanswerable, no $0", s: spec({ source: "federal_awards", causes: [{ name: "zither makers", label: null, ntee: ["P23"], keywords: [] }] }),
    check: async (a) => [a.status === "unanswerable" && !/^\$0|awarded \$0/.test(a.headline) && /couldn't be matched/.test(a.headline) ? 1 : 0, 1] },
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
  // Two causes asked separately (Oct 19): both ranked lists and the overlap, never the first cause alone.
  { name: "two-cause top funders: women & girls #1 (primary)", s: spec({ metric: "top_funders", causes: [climate, women] }),
    check: async (a) => { const r = a.rows.find((x) => x.cause === "women and girls" && x.rank === 1)!;
      return [Number(r.primary_usd), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.funder_ein=$1 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='women_girls' AND tier='primary')`, [r.funder_ein])]; } },
  { name: "two-cause top funders: funders in both top 50", s: spec({ metric: "top_funders", causes: [climate, women] }),
    check: async (a) => [a.rows.filter((r) => r.cause === "climate" && r.top_50_in_both).length, await one(`WITH t AS (${["climate", "women_girls"].map((l) => `SELECT '${l}' AS label, g.funder_ein, sum(g.amount) AS usd ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024
        AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label = '${l}' AND tier = 'primary') GROUP BY 2`).join(" UNION ALL ")}),
      r AS (SELECT *, row_number() OVER (PARTITION BY label ORDER BY usd DESC, funder_ein) AS rk FROM t)
      SELECT count(*) FROM r a JOIN r z ON z.funder_ein = a.funder_ein AND z.label = 'women_girls' AND z.rk <= 50 WHERE a.label = 'climate' AND a.rk <= 50`)] },
  { name: "two-cause top funders: both causes in the headline", s: spec({ metric: "top_funders", causes: [climate, women] }),
    check: async (a) => [/climate/.test(a.headline) && /women and girls/.test(a.headline) && a.status === "ok" ? 1 : 0, 1] },
  { name: "two-cause top recipients: climate #1 $", s: spec({ metric: "top_recipients", causes: [climate, women] }),
    check: async (a) => { const r = a.rows.find((x) => x.cause === "climate" && x.rank === 1)!;
      return [Number(r.usd), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year BETWEEN 2022 AND 2024 AND g.recipient_ein=$1 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label='climate')`, [r.ein])]; } },
  { name: "two-cause top recipients: women & girls list present", s: spec({ metric: "top_recipients", causes: [climate, women] }),
    check: async (a) => [a.rows.filter((r) => r.cause === "women and girls").length >= 10 && /women and girls/.test(a.headline) ? 1 : 0, 1] },
  // The cause guard: a second cause an answer can't split by is a visible "not included" note, status partial.
  { name: "guard: grant size with two causes names the second", s: spec({ metric: "grant_size", causes: [climate, women] }),
    check: async (a) => [a.status === "partial" && a.missing.some((m) => /women and girls/i.test(m.what)) && /women and girls/i.test(a.headline) ? 1 : 0, 1] },
  { name: "guard: gov grants top recipients with two causes", s: spec({ metric: "top_recipients", source: "government_grants", causes: [climate, women] }),
    check: async (a) => [a.status === "partial" && a.missing.some((m) => /women and girls/i.test(m.what)) ? 1 : 0, 1] },
  // "Show the steps" (lib/answerSteps): a per-year total in the Counted step against direct SQL, the Computed step
  // against the headline tile, and the start-year spike (2020 food banks) against 2019 in SQL.
  { name: "steps: food banks 2020 total in Counted = direct SQL", s: spec({ metric: "trend", causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] }),
    check: async (a) => { const { money } = await import("../components/money");
      const want = money(await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year = 2020 AND o.ntee_cd LIKE 'K31%'`));
      return [a.steps?.find((x) => x.key === "count")?.details.some((d) => d.startsWith(`2020: **${want}**`)) ? 1 : 0, 1]; } },
  { name: "steps: food banks Computed = headline tile, spike flagged vs SQL", s: spec({ metric: "trend", causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] }),
    check: async (a) => { const [y19, y20] = [await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year = 2019 AND o.ntee_cd LIKE 'K31%'`), await one(`SELECT sum(g.amount) ${CLEAN} AND g.tax_year = 2020 AND o.ntee_cd LIKE 'K31%'`)];
      const comp = a.steps?.find((x) => x.key === "compute")?.line ?? "", chk = a.steps?.find((x) => x.key === "check")?.line ?? "";
      const spike = y20 / y19 - 1 > 0.3;
      return [comp.includes(a.numbers[0].value) && spike === /spike/.test(chk) && spike === a.bullets.some((x) => /spike/.test(x)) ? 1 : 0, 1]; } },
  // Data recency (Joshua Elder, Oct 19): the years covered, and the partial share read from filings per tax year,
  // checked on the base tables (one 990-PF / Form 990 return per org and year, the fullest year as 100%).
  { name: "recency: grants 2022-24 by default, 2025 share of 990-PF returns (permille)", s: spec({ causes: [climate] }),
    check: async (a) => { const r = a.recency; const p = r?.partial.find((x) => x.year === 2025);
      const want = await one(`WITH y AS (SELECT tax_year, count(DISTINCT ein) AS n FROM foundation_finances GROUP BY 1) SELECT round(1000.0 * (SELECT n FROM y WHERE tax_year = 2025) / max(n)) FROM y`);
      return [r && r.from === 2022 && r.to === 2024 && /2025 is still incomplete/.test(r.note) && p ? Math.round(p.share * 1000) : -1, want]; } },
  { name: "recency: trend through 2025 flags the partial last year", s: spec({ metric: "trend", yearFrom: 2020, yearTo: 2025, causes: [climate] }),
    check: async (a) => [a.recency?.trend_end_partial && a.recency.partial_in_range.includes(2025) && /A dip in 2025 is likely late filings/.test(a.recency.note) ? 1 : 0, 1] },
  { name: "recency: Form 990 government grants, 2025 share of returns (permille)", s: spec({ source: "government_grants", metric: "trend", yearTo: 2025, causes: [climate] }),
    check: async (a) => { const p = a.recency?.partial.find((x) => x.year === 2025);
      const want = await one(`WITH y AS (SELECT tax_year, count(DISTINCT ein) AS n FROM filing_flag GROUP BY 1) SELECT round(1000.0 * (SELECT n FROM y WHERE tax_year = 2025) / max(n)) FROM y`);
      return [a.recency?.form === "Form 990" && a.recency.trend_end_partial && p ? Math.round(p.share * 1000) : -1, want]; } },
  { name: "recency: newest return per org names its year range", s: spec({ metric: "count_orgs", condition: "deficit", causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] }),
    check: async (a) => [a.recency?.newest_per_org && /newest Form 990, from tax years \d{4} to \d{4}/.test(a.recency.note) ? 1 : 0, 1] },
  { name: "recency: no filing note on household giving (IRS SOI)", s: spec({ source: "household_giving" }),
    check: async (a) => [a.recency == null ? 1 : 0, 1] },
  // Oct 21: a trend through a partial year headlines the change to the newest full year and names the partial one.
  { name: "partial end: government grants trend through 2025 headlines 2023 to 2024", s: spec({ source: "government_grants", metric: "trend", yearFrom: 2023, yearTo: 2025, causes: [climate] }),
    check: async (a) => [/from 2023 to 2024 /.test(a.headline) && !/to 2025/.test(a.headline) && a.bullets.some((x) => /2025 is partial .*ends at 2024/.test(x)) && JSON.stringify(a.chart?.spec ?? {}).includes("2025 (partial)") ? 1 : 0, 1] },
  { name: "partial end: payout trend through 2025 headlines 2024", s: spec({ source: "foundation_finances", metric: "trend", yearFrom: 2022, yearTo: 2025 }),
    check: async (a) => [/in 2024 \. |in 2024\./.test(a.headline) && !/2025/.test(a.headline) && a.bullets.some((x) => /2025 is partial/.test(x)) ? 1 : 0, 1] },
  { name: "partial end: deficits by year through 2025 headlines 2024", s: spec({ metric: "count_orgs", condition: "deficit", by: "year", yearFrom: 2023, yearTo: 2025, causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] }),
    check: async (a) => [/in 2024/.test(a.headline) && !/in 2025/.test(a.headline) && a.bullets.some((x) => /2025 is partial/.test(x)) ? 1 : 0, 1] },
  // Under-funded orgs (Oct 21): each listed org's linked 990-PF grants 2022-24 against direct SQL, all under a quarter of
  // the peer median, all in the state asked, and the unlinked-grants caveat in plain words.
  { name: "underfunded: mental health in California, listed orgs vs direct SQL", s: spec({ metric: "underfunded", causes: [mental], states: ["CA"] }),
    check: async (a) => {
      const os = a.orgs ?? [];
      const direct = await Promise.all(os.map((o) => one(`SELECT coalesce(sum(amount), 0) FROM grant_clean WHERE recipient_ein = $1 AND tax_year BETWEEN 2022 AND 2024`, [o.ein])));
      const ok = os.length > 0 && os.every((o, i) => Math.abs(o.foundation_usd_a_year - direct[i] / 3) <= 1 && o.state === "CA" && o.foundation_usd_a_year <= 0.25 * o.peer_median_usd_a_year + 1);
      return [ok && a.caveats.some((c) => /can't link/.test(c)) ? 1 : 0, 1];
    } },
  { name: "underfunded: food banks (NTEE) nationwide lists orgs", s: spec({ metric: "underfunded", causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] }),
    check: async (a) => [(a.orgs?.length ?? 0) >= 5 && /established food banks/.test(a.headline) ? 1 : 0, 1] },
  { name: "underfunded: no cause is unanswerable with a plain reason", s: spec({ metric: "underfunded" }),
    check: async (a) => [a.status === "unanswerable" && /Name a cause/.test(a.headline) ? 1 : 0, 1] },
  { name: "steps: climate total share = headline", s: spec({ causes: [climate] }),
    check: async (a) => [(a.steps?.find((x) => x.key === "compute")?.line ?? "").includes(a.numbers.find((n) => n.value.endsWith("%"))!.value) ? 1 : 0, 1] },
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
  // Every answered case has the evidence chain, and a trend's Computed step carries the headline's change.
  if (a.status !== "unanswerable") {
    const keys: string[] = (a.steps ?? []).map((x) => x.key);
    const bad = ["question", "data", "check", "reproduce"].filter((k) => !keys.includes(k));
    const comp = a.steps?.find((x) => x.key === "compute")?.line ?? "";
    if (c.s.metric === "trend" && a.numbers[0] && /^[+−]/.test(a.numbers[0].value) && !comp.includes(a.numbers[0].value)) bad.push(`compute "${comp}" lacks ${a.numbers[0].value}`);
    if ((a.steps ?? []).some((x) => /[;—]/.test(x.line + x.details.join(" ")))) bad.push("semicolon or em dash");
    // Answers on 990 or grant data say which filing years they cover and that the newest are still arriving.
    const filed = ["foundation_grants", "charity_grants", "government_grants", "contributions", "revenue", "foundation_finances"].includes(c.s.source);
    if (filed && !(a.recency && /tax years? \d{4}/.test(a.recency.note) && /1 to 2 years late/.test(a.recency.note))) bad.push(`recency note missing: ${a.recency?.note ?? "none"}`);
    if (a.recency && /[;—]/.test(a.recency.note)) bad.push("recency note has a semicolon or em dash");
    if (bad.length) { fail++; console.log(`         ✗ ${bad.join(", ")}`); }
  }
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
