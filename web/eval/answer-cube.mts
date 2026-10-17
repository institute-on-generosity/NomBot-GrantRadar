// Research layer check: every spec answered twice, once on the original grant_clean queries and once on
// the research layer (grant_cube, grant_recipient_year, grant_county_year; generosity-data 038-040).
// Numbers, rows and headlines must match. Prints both timings. No Claude calls.
//   npx tsx eval/answer-cube.mts
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }

const { db } = await import("../lib/db");
const { answer } = await import("../lib/answer");
const { DEFAULT_SPEC } = await import("../lib/answerSpec");
type Spec = import("../lib/answerSpec").Spec;

const spec = (s: Partial<Spec>): Spec => ({ ...DEFAULT_SPEC, ...s });
const cause = (name: string, ntee: string[] = [], label: "climate" | "women_girls" | null = null, keywords: string[] = []) => ({ name, label, ntee, keywords });
const climate = cause("climate", [], "climate"), women = cause("women and girls", [], "women_girls");
const cases: [string, Spec][] = [
  ["all, US", spec({})],
  ["all, rural US", spec({ area: "rural" })],
  ["all, urban OH", spec({ area: "urban", states: ["OH"] })],
  ["climate total", spec({ causes: [climate] })],
  ["women & girls NY", spec({ causes: [women], states: ["NY"] })],
  ["education TX", spec({ causes: [cause("education", ["B"])], states: ["TX"] })],
  ["health share", spec({ metric: "share", causes: [cause("health", ["E"])] })],
  ["education US (largest set)", spec({ causes: [cause("education", ["B"])] })],
  ["animal shelters 2023", spec({ causes: [cause("animal shelters", ["D20"])], yearFrom: 2023, yearTo: 2023 })],
  ["arts rural", spec({ causes: [cause("arts", ["A"])], area: "rural" })],
  ["food banks trend 2022-25", spec({ metric: "trend", causes: [cause("food banks", ["K31"])], yearFrom: 2022, yearTo: 2025 })],
  ["civil rights vs international", spec({ metric: "compare", causes: [cause("civil rights", ["R"]), cause("international", ["Q"])] })],
  ["climate vs women", spec({ metric: "compare", causes: [climate, women] })],
  ["fastest causes US", spec({ metric: "fastest_causes" })],
  ["fastest causes OH", spec({ metric: "fastest_causes", states: ["OH"] })],
  ["fastest causes rural", spec({ metric: "fastest_causes", area: "rural" })],
  ["by state, all", spec({ metric: "by_state" })],
  ["by state per resident, least", spec({ metric: "by_state", perResident: true, order: "least" })],
  ["by state, mental health per resident", spec({ metric: "by_state", causes: [cause("mental health", ["F"])], perResident: true })],
  ["by state, climate", spec({ metric: "by_state", causes: [climate] })],
  ["by state, religion", spec({ metric: "by_state", causes: [cause("religion", ["X"])] })],
  ["rurality, all", spec({ metric: "by_rurality" })],
  ["rurality, food banks", spec({ metric: "by_rurality", causes: [cause("food banks", ["K31"])] })],
  ["rurality, climate TX", spec({ metric: "by_rurality", causes: [climate], states: ["TX"] })],
  ["general support, arts", spec({ metric: "general_support", causes: [cause("arts", ["A"])] })],
  ["general support, environment CA", spec({ metric: "general_support", causes: [cause("environment", ["C"])], states: ["CA"] })],
  ["general support, all", spec({ metric: "general_support" })],
  ["concentration, climate", spec({ metric: "concentration", causes: [climate] })],
  ["concentration, higher ed", spec({ metric: "concentration", causes: [cause("higher education", ["B4"])] })],
  ["concentration, all", spec({ metric: "concentration" })],
  ["concentration, Cook County youth", spec({ metric: "concentration", causes: [cause("youth", ["O"])], county: "Cook County", states: ["IL"] })],
  ["concentration, opioid keywords", spec({ metric: "concentration", causes: [cause("opioid addiction", [], null, ["opioid", "opioids"])] })],
  ["Cook County youth total", spec({ causes: [cause("youth", ["O"])], county: "Cook County", states: ["IL"] })],
  ["opioid keywords total", spec({ causes: [cause("opioid addiction", [], null, ["opioid", "opioids"])] })],
  // New questions (filters, breakdowns): the grant_clean path joins recipient_profile / funder_profile /
  // public_entities directly, so a match also checks the cube's dimensions.
  ["recipients under $1M", spec({ metric: "share", recipientSize: { min: null, max: 1e6 } })],
  ["small nonprofits rural (under $500K)", spec({ recipientSize: { min: null, max: 5e5 }, area: "rural" })],
  ["family foundations to religion", spec({ causes: [cause("religion", ["X"])], funderType: "family" })],
  ["foundations $1B+ to education", spec({ causes: [cause("education", ["B"])], funderSize: { min: 1e9, max: null } })],
  ["school districts and colleges", spec({ metric: "share", recipientKind: "public_entity" })],
  ["climate, recipients $1M-$10M, by state", spec({ metric: "by_state", causes: [climate], recipientSize: { min: 1e6, max: 1e7 } })],
  ["breakdown by cause", spec({ metric: "breakdown", by: "cause" })],
  ["breakdown by NTEE code, health", spec({ metric: "breakdown", by: "cause", causes: [cause("health", ["E"])] })],
  ["breakdown by recipient size", spec({ metric: "breakdown", by: "recipient_size" })],
  ["breakdown by funder size, arts grants", spec({ metric: "breakdown", by: "funder_size", causes: [cause("arts", ["A"])], measure: "grants" })],
  ["breakdown by funder type, climate", spec({ metric: "breakdown", by: "funder_type", causes: [climate] })],
  ["breakdown by recipient kind", spec({ metric: "breakdown", by: "recipient_kind" })],
  ["average grant to hospitals by state", spec({ metric: "grant_size", by: "state", causes: [cause("hospitals", ["E2"])] })],
  ["breakdown by county, CA", spec({ metric: "breakdown", by: "county", states: ["CA"] })],
  ["breakdown by county per resident, OH arts", spec({ metric: "breakdown", by: "county", states: ["OH"], causes: [cause("arts", ["A"])], perResident: true })],
  ["breakdown by year, women & girls", spec({ metric: "breakdown", by: "year", causes: [women] })],
  ["taxonomy: veterans (no code from router)", spec({ causes: [cause("veterans", [], null, ["veterans"])] })],
  ["by county poverty, all", spec({ metric: "breakdown", by: "county_poverty" })],
  ["by county income, education OH", spec({ metric: "breakdown", by: "county_income", causes: [cause("education", ["B"])], states: ["OH"] })],
  ["by state per person in poverty, arts", spec({ metric: "breakdown", by: "state", measure: null, perPoverty: true, causes: [cause("arts", ["A"])] })],
  // Schedule I grants by charities (generosity-data 041-042): charity_grant_cube vs charity_grant_clean.
  ["charity: all, US", spec({ source: "charity_grants" })],
  ["charity: DAF sponsors to climate", spec({ source: "charity_grants", charityFunder: "daf_sponsor", causes: [climate] })],
  ["charity: community foundations, arts OH", spec({ source: "charity_grants", charityFunder: "community_foundation", causes: [cause("arts", ["A"])], states: ["OH"] })],
  ["charity: DAF trend, education", spec({ source: "charity_grants", charityFunder: "daf_sponsor", metric: "trend", causes: [cause("education", ["B"])], yearFrom: 2022, yearTo: 2024 })],
  ["charity: by funder group", spec({ source: "charity_grants", metric: "breakdown", by: "charity_funder" })],
  ["charity: by cause, DAF", spec({ source: "charity_grants", charityFunder: "daf_sponsor", metric: "breakdown", by: "cause" })],
  ["charity: by state per resident, United Ways", spec({ source: "charity_grants", charityFunder: "united_way", metric: "by_state", perResident: true })],
  ["charity: rurality, community foundations", spec({ source: "charity_grants", charityFunder: "community_foundation", metric: "by_rurality" })],
  ["charity: general support, DAF", spec({ source: "charity_grants", charityFunder: "daf_sponsor", metric: "general_support" })],
  ["charity: fastest causes, DAF", spec({ source: "charity_grants", charityFunder: "daf_sponsor", metric: "fastest_causes" })],
];

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !isNaN(Number(v)) ? Number(v) : null);
function same(a: unknown, b: unknown): boolean {
  const x = num(a), y = num(b);
  if (x != null && y != null) return Math.abs(x - y) <= Math.max(1e-6, Math.abs(y) * 1e-9);
  return JSON.stringify(a) === JSON.stringify(b);
}
let fail = 0, tOld = 0, tNew = 0;
for (const [name, s] of cases) {
  const t0 = Date.now();
  const old = await answer(name, s, { cube: false });
  const t1 = Date.now();
  const neu = await answer(name, s, { cube: true });
  const t2 = Date.now();
  tOld += t1 - t0; tNew += t2 - t1;
  const diffs: string[] = [];
  if (old.headline !== neu.headline) diffs.push(`headline: "${old.headline}" vs "${neu.headline}"`);
  if (JSON.stringify(old.numbers) !== JSON.stringify(neu.numbers)) diffs.push(`numbers: ${JSON.stringify(old.numbers)} vs ${JSON.stringify(neu.numbers)}`);
  if (old.rows.length !== neu.rows.length) diffs.push(`rows: ${old.rows.length} vs ${neu.rows.length}`);
  else old.rows.forEach((r, i) => { for (const k of Object.keys(r)) if (!same(r[k], neu.rows[i][k])) diffs.push(`row ${i} ${k}: ${r[k]} vs ${neu.rows[i][k]}`); });
  const usedCube = neu.queries.some((q) => /grant_cube|grant_recipient_year|grant_county_year/.test(q.sql)); // charity_grant_cube too
  if (diffs.length) fail++;
  console.log(`${diffs.length ? "✗" : "✓"} ${String(t1 - t0).padStart(5)} ms -> ${String(t2 - t1).padStart(5)} ms ${usedCube ? "[layer]" : "[grant_clean]"} ${name}${diffs.length ? `\n    ${diffs.slice(0, 6).join("\n    ")}` : ""}`);
}
console.log(`\n${cases.length - fail}/${cases.length} match. Total ${tOld} ms on grant_clean, ${tNew} ms on the research layer.`);
await db.end();
process.exit(fail ? 1 : 0);
