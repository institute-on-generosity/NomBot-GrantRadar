// Place scope and soft preference checks (Oct 26, Keith's Inglewood, CA test case; generosity-data 083-085).
//   whole words in "must mention" (van is not advance), soft preferences (ideally, especially) never filter,
//   the rule parser reads "in Inglewood, CA" / "near" / "Los Angeles County", city and county scopes,
//   and the tiered search finds the hand-checked "clearly relevant" orgs for the three Inglewood questions
//   within the candidates Claude scores (ground truth: ~/Desktop/inglewood-test/q*_ground_truth.csv, EINs below).
// No Claude calls unless --llm (then Claude parses the Inglewood questions and their rephrasings, ~9 calls).
//   npm run test:place            rules, scopes, search
//   npm run test:place -- --llm   also Claude's parse of the questions
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const llm = process.argv.includes("--llm");
if (!llm) process.env.ANTHROPIC_API_KEY = ""; // rule parser, unscored search

const { wordRe } = await import("../lib/search");
const { soften, parseQuestion } = await import("../lib/parse");
const { cityScope, countyScope, cityPointers } = await import("../lib/place");
const { searchCandidates, TIER_POOL } = await import("../lib/rerank");
const { db } = await import("../lib/db");
type Filters = import("../lib/parse").Filters;

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`); if (!ok) fail++; };

// 1. Whole words: a must-mention phrase never matches inside another word.
const re = (p: string) => new RegExp(wordRe(p), "i");
check("van does not match advance", !re("van").test("to advance health equity") && re("van").test("a mobile van clinic"));
check("bus does not match business", !re("bus").test("small business support") && re("bus").test("a dental bus visits schools"));
check("mentor matches mentoring and mentors", re("mentor").test("youth mentoring") && re("mentor").test("trained mentors"));
check("dental bus phrase", re("dental bus|mobile dental").test("our Mobile Dental unit") && !re("dental bus").test("dental business"));
{
  const { rows: [r] } = await db.query(`SELECT 'to advance health' ~* $1 AS adv, 'mobile van' ~* $1 AS van, 'business' ~* $2 AS biz`, [wordRe("van"), wordRe("bus")]);
  check("Postgres reads the same pattern", !r.adv && r.van && !r.biz);
}

// 2. Soft preferences and must-mention conditions (soften runs on every parse, Claude's or the rules').
const base: Filters = { q: "", semantic: "", states: ["CA"], cities: ["INGLEWOOD"], requirements: [], parser: "llm", topic: "" };
const req = (label: string, ...syn: string[]) => ({ label, pattern: [label, ...syn].join("|") });
{
  const f = soften("Health nonprofits in Inglewood, CA, especially mobile dental care (dental bus)", { ...base, q: "health", semantic: "health", topic: "health", requirements: [req("mobile dental care", "dental bus", "mobile dental")] });
  check("especially X: a preference, not a must-mention", f.requirements.length === 0 && f.prefer?.[0]?.label === "mobile dental care", JSON.stringify(f.prefer?.map((p) => p.label)));
  check("especially X: the meaning query keeps it", /mobile dental care/.test(f.semantic));
}
{
  const f = soften("Youth leadership development nonprofits in Inglewood, CA, ideally focused on girls", { ...base, q: "youth leadership development", semantic: "youth leadership development", topic: "youth leadership development", label: "women_girls" });
  check("ideally girls: women and girls is a preferred label, not a filter", !f.label && f.preferLabel === "women_girls");
  check("youth leadership: NTEE O boost", (f.nteeBoost ?? []).includes("O"));
}
{
  const f = soften("youth leadership programs Inglewood, CA", { ...base, q: "youth leadership programs", semantic: "youth leadership", topic: "youth leadership", requirements: [req("leadership development", "leadership")] });
  check("the topic restated is not a must-mention", f.requirements.length === 0 && f.prefer?.length === 1);
}
{
  const f = soften("dental van programs in Los Angeles County that serve Inglewood", { ...base, q: "mobile dental van programs", semantic: "mobile dental van programs", topic: "mobile dental van programs", requirements: [req("mobile dental van", "dental van")] });
  check("the topic restated after a place clause is not a must-mention", f.requirements.length === 0 && f.prefer?.length === 1);
}
{
  const f = soften("food banks in rural Appalachia that do workforce training", { ...base, cities: [], q: "food banks", semantic: "food banks", topic: "food banks", requirements: [req("workforce training", "job training")] });
  check("that do X: still a must-mention", f.requirements.length === 1 && !f.prefer);
}
{
  const f = soften("climate nonprofits in Ohio", { ...base, cities: [], states: ["OH"], q: "climate", semantic: "climate", topic: "climate", label: "climate" });
  check("a named cause stays a label", f.label === "climate" && !f.preferLabel);
}
{
  const f = soften("Youth sports programs in Inglewood, CA", { ...base, q: "youth sports programs", semantic: "youth sports programs", topic: "youth sports programs" });
  check("youth sports: N6 and N4 boost", ["N6", "N4"].every((n) => (f.nteeBoost ?? []).includes(n)), (f.nteeBoost ?? []).join(","));
}

// 3. Rule parser places (no Claude): city, near, county.
if (!llm) {
  const a = await parseQuestion("youth sports programs in Inglewood, CA");
  check("rules: in Inglewood, CA", a.cities[0] === "INGLEWOOD" && a.states.includes("CA") && !a.near, JSON.stringify([a.cities, a.states]));
  const b = await parseQuestion("food pantries near Inglewood, CA");
  check("rules: near Inglewood, CA", b.cities[0] === "INGLEWOOD" && b.near === true);
  const c = await parseQuestion("dental clinics in Los Angeles County, CA");
  check("rules: Los Angeles County, CA", /los angeles county/i.test(c.county ?? "") && c.cities.length === 0, c.county);
}

// 4. Scopes: Inglewood's ZIPs, its nearby ring (Census ZCTA points), its county; a county's ZIPs.
const ing = (await cityScope("Inglewood", "CA"))!;
check("Inglewood ZIPs 90301-90305", ["90301", "90302", "90303", "90304", "90305"].every((z) => ing.zips.includes(z)), ing.zips.join(","));
const near = new Set(ing.near.map((n) => n.zip));
check("nearby: Westchester 90045, Hawthorne 90250, Lawndale 90260, Baldwin Hills 90008", ["90045", "90250", "90260", "90008", "90047", "90043", "90044", "90056"].every((z) => near.has(z)), [...near].join(","));
check("nearby leaves out downtown LA 90012 and Venice 90291", !near.has("90012") && !near.has("90291"));
check("Inglewood is in Los Angeles County", ing.county?.fips === "06037");
const la = await countyScope("Los Angeles County", "CA");
check("Los Angeles County scope", la?.fips === "06037" && (la?.zips.length ?? 0) > 200, `${la?.zips.length} ZIPs`);
check("unknown city is null", (await cityScope("Notatown", "CA")) === null);
const ptr = await cityPointers(ing);
check("named for Inglewood, mailed from LA 90065: Inglewood Little League", ptr.get("843026438")?.tier === "in" && ptr.get("843026438")?.basis === "name");
check("grant purpose names Inglewood: Planned Parenthood LA", ptr.get("952408623")?.basis === "grant" && /Inglewood/i.test(ptr.get("952408623")?.quote ?? ""));
check("990 text names Inglewood: Central Neighborhood Health", ptr.get("752986675")?.basis === "text");

// 5. Tiered search on the three questions: every hand-checked "clearly relevant" org is a candidate Claude scores
// (top TIER_POOL of its tier). Filters written out as Claude reads the question, so no Claude call is needed.
const CASES: { q: string; f: Partial<Filters>; eins: string[] }[] = [
  { q: "Health nonprofits in Inglewood, CA, especially mobile dental care (dental bus)", f: { q: "health", semantic: "health clinics", topic: "health", nteeHint: "E", requirements: [req("mobile dental care", "dental bus", "mobile dental", "dental van")] },
    eins: ["952408623", "952769432", "752986675", "954702923", "954533883", "452749493", "882962296"] },
  { q: "Youth leadership development nonprofits in Inglewood, CA, ideally focused on girls", f: { q: "youth leadership development", semantic: "youth leadership development", topic: "youth leadership development", nteeHint: "O", label: "women_girls" },
    eins: ["954302067", "951644033", "237203822", "263413373", "450508517", "954295918", "954845105", "954801559", "861626430", "454320402"] },
  { q: "Youth sports programs in Inglewood, CA", f: { q: "youth sports programs", semantic: "youth sports programs", topic: "youth sports", nteeHint: "N" },
    eins: ["334463604", "843026438", "474068904", "931724843", "922270458", "800228843", "824575394", "844965829"] },
];
for (const c of CASES) {
  const f = soften(c.q, { ...base, ...c.f } as Filters);
  const t = Date.now();
  const res = await searchCandidates(f, { limit: 10 });
  const ms = Date.now() - t;
  const pooled = new Set((res.tiers ?? []).flatMap((b) => b.results.slice(0, TIER_POOL[b.tier]).map((r) => r.ein.replace("-", ""))));
  const found = c.eins.filter((e) => pooled.has(e));
  check(`search: ${c.q.slice(0, 48)}… clearly relevant in the scored pool >= 80%`, found.length / c.eins.length >= 0.8,
    `${found.length}/${c.eins.length}, ${ms} ms, tiers ${(res.tiers ?? []).map((b) => `${b.tier} ${b.total}`).join(", ")}${found.length < c.eins.length ? `, missing ${c.eins.filter((e) => !pooled.has(e)).join(" ")}` : ""}`);
}

// 6. Claude's parse of the questions and their rephrasings (raw/ captures): soft parts never filter.
if (llm) {
  const qs = ["Health nonprofits in Inglewood, CA, especially mobile dental care (dental bus)", "mobile dental clinics Inglewood, CA", "mobile dental van programs Inglewood, CA",
    "Youth leadership development nonprofits in Inglewood, CA, ideally focused on girls", "girls mentoring and leadership programs Inglewood, CA", "youth leadership programs Inglewood, CA",
    "Youth sports programs in Inglewood, CA", "youth sports leagues Inglewood, CA", "dental clinics in Los Angeles County"];
  for (const q of qs) {
    const f = await parseQuestion(q);
    const soft = /ideally|especially/i.test(q);
    const ok = f.cities[0] === "INGLEWOOD" || /los angeles/i.test(f.county ?? "");
    check(`llm: ${q}`, ok && (!soft || (f.requirements.length === 0 && !f.label)), JSON.stringify({ cities: f.cities, county: f.county, req: f.requirements.map((r) => r.label), prefer: f.prefer?.map((r) => r.label), label: f.label, preferLabel: f.preferLabel }));
  }
}

await db.end();
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
