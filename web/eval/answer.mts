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
const one = async (sql: string, params: unknown[] = []) => Number(Object.values((await db.query(sql, params)).rows[0])[0]);

// Independent checks: base tables, the miner's CLEAN filter written out again.
const CLEAN = `FROM grants g LEFT JOIN orgs o ON o.ein = g.recipient_ein
  WHERE g.amount > 0 AND g.recipient_kind IS NULL AND coalesce(o.foundation, '') NOT IN ('02','03','04')`;
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
  { name: "gov-reliant human services, KY", s: spec({ metric: "count_orgs", causes: [{ name: "human services", label: null, ntee: ["P"], keywords: [] }], states: ["KY"], condition: "gov_reliant" }) },
  { name: "low cash, Cook County", s: spec({ metric: "count_orgs", county: "Cook County", states: ["IL"], condition: "low_cash" }) },
  { name: "gov grants top funders (partial)", s: spec({ metric: "top_funders", source: "government_grants", causes: [climate] }) },
  { name: "individual giving (none)", s: spec({ metric: "none", missing: ["individual_giving"] }) },
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
  const qs = ["how much government money has gone to climate change?", "how much foundation money goes to women and girls in New York",
    "which states give the least foundation money per resident", "how many animal shelters in Ohio run deficits", "how much do individuals give to churches each year?",
    "food banks in Ohio"];
  for (const q of qs) {
    const t = Date.now();
    const r = await routeQuestion(q);
    console.log(`${Date.now() - t} ms route  ${q}\n   ${JSON.stringify(r)}`);
  }
}
await db.end();
process.exit(fail ? 1 : 0);
