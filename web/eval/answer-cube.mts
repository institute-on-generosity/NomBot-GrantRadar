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

// Grant-size answers (generosity-data 046): medians and 90th percentiles from the size histograms vs exact
// percentile_cont on grant_clean / charity_grant_clean / federal_awards. Counts and averages must match.
// Median and p90 within 1% (bucket bounds). Shown values equal, or marked "about" when a bucket can't pin them.
const g = (s: Partial<Spec>) => spec({ metric: "grant_size", ...s });
const sizeCases: [string, Spec][] = [
  ["size: all, US", g({})],
  ["size: all, 2024", g({ yearFrom: 2024, yearTo: 2024 })],
  ["size: rural US", g({ area: "rural" })],
  ["size: urban OH", g({ area: "urban", states: ["OH"] })],
  ["size: CA", g({ states: ["CA"] })],
  ["size: education US", g({ causes: [cause("education", ["B"])] })],
  ["size: higher ed", g({ causes: [cause("higher education", ["B4"])] })],
  ["size: hospitals E2", g({ causes: [cause("hospitals", ["E2"])] })],
  ["size: food banks K31 2023", g({ causes: [cause("food banks", ["K31"])], yearFrom: 2023, yearTo: 2023 })],
  ["size: arts rural", g({ causes: [cause("arts", ["A"])], area: "rural" })],
  ["size: religion TX", g({ causes: [cause("religion", ["X"])], states: ["TX"] })],
  ["size: climate", g({ causes: [climate] })],
  ["size: women & girls NY", g({ causes: [women], states: ["NY"] })],
  ["size: health, two states", g({ causes: [cause("health", ["E"])], states: ["MA", "CT"] })],
  ["size: recipients under $1M", g({ recipientSize: { min: null, max: 1e6 } })],
  ["size: recipients $1M-$10M, arts", g({ causes: [cause("arts", ["A"])], recipientSize: { min: 1e6, max: 1e7 } })],
  ["size: foundations $1B+", g({ funderSize: { min: 1e9, max: null } })],
  ["size: foundations under $10M, education", g({ causes: [cause("education", ["B"])], funderSize: { min: null, max: 1e7 } })],
  ["size: family foundations", g({ funderType: "family" })],
  ["size: family foundations, religion", g({ causes: [cause("religion", ["X"])], funderType: "family" })],
  ["size: school districts", g({ recipientKind: "school_district" })],
  ["size: public entities", g({ recipientKind: "public_entity" })],
  ["size: nonprofits only, rural", g({ recipientKind: "nonprofit", area: "rural" })],
  ["size: charity all", g({ source: "charity_grants" })],
  ["size: charity DAF", g({ source: "charity_grants", charityFunder: "daf_sponsor" })],
  ["size: charity DAF climate", g({ source: "charity_grants", charityFunder: "daf_sponsor", causes: [climate] })],
  ["size: charity community foundations OH arts", g({ source: "charity_grants", charityFunder: "community_foundation", causes: [cause("arts", ["A"])], states: ["OH"] })],
  ["size: charity United Ways rural", g({ source: "charity_grants", charityFunder: "united_way", area: "rural" })],
  ["size: charity education 2023", g({ source: "charity_grants", causes: [cause("education", ["B"])], yearFrom: 2023, yearTo: 2023 })],
  ["size: federal all", g({ source: "federal_awards" })],
  ["size: federal health", g({ source: "federal_awards", causes: [cause("health", ["E"])] })],
  ["size: federal TX", g({ source: "federal_awards", states: ["TX"] })],
  ["size: federal rural", g({ source: "federal_awards", area: "rural" })],
  ["size: federal climate", g({ source: "federal_awards", causes: [climate] })],
  ["size: federal recipients under $1M", g({ source: "federal_awards", recipientSize: { min: null, max: 1e6 } })],
  // fallbacks: county and keyword causes keep the exact query
  ["size: Cook County youth (exact path)", g({ causes: [cause("youth", ["O"])], county: "Cook County", states: ["IL"] })],
  ["size: opioid keywords (exact path)", g({ causes: [cause("opioid addiction", [], null, ["opioid", "opioids"])] })],
];
let sFail = 0, sOld = 0, sNew = 0, nStat = 0, nExact = 0, maxErr = 0, nShownSame = 0, nShown = 0;
for (const [name, s] of sizeCases) {
  const t0 = Date.now();
  const old = await answer(name, s, { cube: false });
  const t1 = Date.now();
  const neu = await answer(name, s, { cube: true });
  const t2 = Date.now();
  sOld += t1 - t0; sNew += t2 - t1;
  const diffs: string[] = [], errs: string[] = [];
  const rounded = /marked about/.test(neu.method);
  if (old.rows.length !== neu.rows.length) diffs.push(`rows: ${old.rows.length} vs ${neu.rows.length}`);
  else old.rows.forEach((r, i) => {
    for (const k of Object.keys(r)) {
      const x = num(r[k]), y = num(neu.rows[i][k]);
      if (k === "median" || k === "p90") {
        if (x == null || y == null) { diffs.push(`row ${i} ${k}: ${r[k]} vs ${neu.rows[i][k]}`); continue; }
        const e = Math.abs(y - x) / Math.max(1, Math.abs(x));
        nStat++; if (e < 1e-9) nExact++; maxErr = Math.max(maxErr, e);
        if (e > 0) errs.push(`${k} ${x} vs ${y.toFixed(1)} (${(e * 100).toFixed(3)}%)`);
        if (e > 0.01) diffs.push(`row ${i} ${k}: ${x} vs ${y} (${(e * 100).toFixed(2)}%)`);
      } else if (!same(r[k], neu.rows[i][k])) diffs.push(`row ${i} ${k}: ${r[k]} vs ${neu.rows[i][k]}`);
    }
  });
  old.numbers.forEach((o, i) => { nShown++; const v = neu.numbers[i]?.value ?? ""; if (o.value === v) nShownSame++; else if (!rounded || !v.startsWith("about ")) diffs.push(`tile ${i}: ${o.value} vs ${v}`); });
  if (!rounded && old.headline !== neu.headline) diffs.push(`headline: "${old.headline}" vs "${neu.headline}"`);
  const usedHist = neu.queries.some((q) => /size_hist/.test(q.sql));
  if (diffs.length) sFail++;
  console.log(`${diffs.length ? "✗" : "✓"} ${String(t1 - t0).padStart(5)} ms -> ${String(t2 - t1).padStart(5)} ms ${usedHist ? "[hist]" : "[exact]"}${rounded ? " [rounded]" : ""} ${name}${errs.length ? `  ${errs.join(", ")}` : ""}${diffs.length ? `\n    ${diffs.slice(0, 6).join("\n    ")}` : ""}`);
}
console.log(`\n${sizeCases.length - sFail}/${sizeCases.length} grant-size answers within tolerance. ${nExact}/${nStat} medians and p90s exact, max error ${(maxErr * 100).toFixed(3)}%. ${nShownSame}/${nShown} tiles identical. Total ${sOld} ms exact, ${sNew} ms on the histograms.`);
fail += sFail;
await db.end();
process.exit(fail ? 1 : 0);
