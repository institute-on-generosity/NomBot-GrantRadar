// Cause-label checks (climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity,
// immigrants_refugees, mental_health; generosity-data migration 032): the question parse sets the label
// only when the question names the cause, the filter edits work, search keeps only labeled orgs, and the
// API returns labels. No Claude calls unless --llm (then ~10 parses with PARSE_MODEL; tokens are printed).
//   npm run test:labels          rules, filters, search, API
//   npm run test:labels -- --llm also Claude's parse of the same phrasings
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }

const { labelFromText, subtypeFromText } = await import("../lib/labels");
const { applyOverrides } = await import("../lib/filters");
const { search } = await import("../lib/search");
const { apiSearch, apiOrg } = await import("../lib/api");
const { db } = await import("../lib/db");

const CASES: [string, string | null][] = [
  ["climate orgs in Ohio", "climate"],
  ["climate change nonprofits under $500K", "climate"],
  ["clean energy groups in Colorado", "climate"],
  ["women and girls nonprofits under $1M", "women_girls"],
  ["girls empowerment programs in Texas", "women_girls"],
  ["organizations serving women in Kentucky", "women_girls"],
  ["addiction recovery nonprofits in Ohio", "substance_use"],
  ["opioid overdose prevention groups in West Virginia", "substance_use"],
  ["sober living homes in Kentucky under $500K", "substance_use"],
  ["homeless shelters in Louisville", "housing_homelessness"],
  ["affordable housing nonprofits in Ohio", "housing_homelessness"],
  ["eviction prevention groups in Texas under $1M", "housing_homelessness"],
  ["coding bootcamps in Ohio", "ai_tech_learning_work"],
  ["computer science education nonprofits in California", "ai_tech_learning_work"],
  ["digital literacy programs for seniors in Florida", "ai_tech_learning_work"],
  ["AI literacy nonprofits", "ai_tech_learning_work"],
  ["tech workforce training in Chicago", "ai_tech_learning_work"],
  ["racial justice organizations in Georgia", "racial_equity"],
  ["anti-racism groups in Minnesota", "racial_equity"],
  ["racial equity nonprofits under $1M", "racial_equity"],
  ["refugee resettlement agencies in Texas", "immigrants_refugees"],
  ["immigration legal services in California", "immigrants_refugees"],
  ["organizations serving immigrants in Ohio", "immigrants_refugees"],
  ["mental health counseling for teens in Ohio", "mental_health"],
  ["suicide prevention groups in Colorado", "mental_health"],
  ["NAMI affiliates in Kentucky", "mental_health"],
  ["civil rights groups in Alabama", null],
  ["wildlife refuges in Oregon", null],
  ["Refuge shelters for women in Texas", "women_girls"],
  ["bird migration research in Texas", null],
  ["Great Depression history museums", null],
  ["environmental health groups in Ohio", null],
  ["medical coding schools in Texas", null],
  ["after-school programming in Ohio", null],
  ["STEM education in Oregon", null],
  ["food banks in West Virginia", null],
  ["boys and girls clubs in Ohio", null],
  ["environmental education in Oregon", null],
  ["youth mentoring in Kentucky under $500K", null],
  ["disaster recovery groups in Louisiana", null],
  ["animal shelters for homeless pets in Ohio", null],
];

let fails = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) fails++; };

// 1. Rules parser (no Claude) and the guard Claude's answer must pass: the question names the cause.
for (const [q, want] of CASES) check((labelFromText(q) ?? null) === want, `rules: "${q}" -> ${want ?? "no label"}`);

// 1b. Sub-types (immigrants_refugees, generosity-data 069): immigration policy questions count policy, the rest services.
const SUBS: [string, "services" | "policy"][] = [
  ["funding for immigrants", "services"], ["refugee resettlement agencies in Texas", "services"], ["immigration legal services in California", "services"],
  ["immigrant rights groups in Illinois", "services"], ["advocacy for immigrants in Ohio", "services"], ["organizations serving refugees", "services"],
  ["immigration policy groups", "policy"], ["Which foundations fund immigration policy research?", "policy"], ["immigration reform advocacy organizations", "policy"],
  ["think tanks on immigration", "policy"], ["groups that want less immigration", "policy"], ["immigration restrictionist groups", "policy"],
];
for (const [q, want] of SUBS) check(subtypeFromText(q, "immigrants_refugees") === want, `subtype: "${q}" -> ${want}`);
check(subtypeFromText("climate policy groups", "climate") === undefined, "subtype: labels without sub-types -> none");

// 2. Claude's parse (opt-in: costs tokens).
if (process.argv.includes("--llm")) {
  const { claude } = await import("../lib/llm");
  const client = claude();
  if (!client) console.log("SKIP  llm: no API key");
  else {
    let input = 0, output = 0;
    const parse = client.beta.messages.parse.bind(client.beta.messages);
    // Count tokens as they go by.
    client.beta.messages.parse = (async (...args: Parameters<typeof parse>) => {
      const r = await parse(...args);
      input += r.usage.input_tokens; output += r.usage.output_tokens;
      return r;
    }) as typeof parse;
    const { parseQuestion } = await import("../lib/parse");
    for (const [q, want] of CASES) {
      const f = await parseQuestion(q);
      check(f.parser === "llm" && (f.label ?? null) === want, `llm:   "${q}" -> ${f.label ?? "no label"} (want ${want ?? "no label"}, parser ${f.parser})`);
    }
    console.log(`      llm tokens: ${input} in, ${output} out`);
  }
}

// 3. Filter edits: chip options ride in the URL as label= and tier=.
const base = { q: "climate", semantic: "climate", states: ["OH"], cities: [], requirements: [], parser: "rules" as const, topic: "climate", label: "climate" as const };
check(applyOverrides(base, { tier: "all" }).labelPartial === true, "override tier=all adds partial");
check(applyOverrides({ ...base, labelPartial: true }, { tier: "primary" }).labelPartial === undefined, "override tier=primary drops partial");
check(applyOverrides(base, { label: "none" }).label === undefined, "override label=none removes it");
check(applyOverrides({ ...base, label: undefined }, { label: "women_girls" }).label === "women_girls", "override label=women_girls sets it");
check(applyOverrides(base, { label: "bogus" }).label === "climate", "unknown label ignored");

// 4. Search: every result carries the label, primary only by default; partial adds orgs.
const labeled = async (label: string, partial: boolean) => {
  const r = await search({ q: { climate: "climate", women_girls: "women and girls", substance_use: "addiction recovery", housing_homelessness: "homeless shelter", ai_tech_learning_work: "coding", racial_equity: "racial justice", immigrants_refugees: "refugee", mental_health: "mental health" }[label] ?? label, label, labelPartial: partial, limit: 50 });
  const eins = r.results.map((x) => x.ein.replace("-", ""));
  const { rows } = await db.query("SELECT ein, tier FROM org_labels WHERE label = $1 AND ein = ANY($2)", [label, eins]);
  const tier = new Map(rows.map((x) => [x.ein.trim(), x.tier]));
  return { r, all: eins.every((e) => tier.has(e)), primaryOnly: eins.every((e) => tier.get(e) === "primary") };
};
for (const label of ["climate", "women_girls", "substance_use", "housing_homelessness", "ai_tech_learning_work", "racial_equity", "immigrants_refugees", "mental_health"]) {
  const p = await labeled(label, false), a = await labeled(label, true);
  check(p.r.total > 0 && p.all && p.primaryOnly && p.r.results.every((x) => x.label?.tier === "primary"), `search label=${label}: ${p.r.total} primary orgs, all labeled primary`);
  check(a.all && a.r.total > p.r.total, `search label=${label} + partial: ${a.r.total} orgs (> ${p.r.total}), all labeled`);
}
const plain = await search({ q: "food bank", states: ["WV"], limit: 5 });
check(plain.total > 0 && plain.results.every((x) => x.label === null), "search without a label: unchanged, label null");

// 5. API: label filter echoed and applied; org has labels with tier and why.
const api = await apiSearch({ q: "climate", state: "CA", label: "climate", label_tier: "all", limit: 5 }, "http://x");
check(api.query.label === "climate" && api.query.label_tier === "all" && api.results.length > 0 && api.results.every((x) => x.label), `api search label=climate&label_tier=all: ${api.total} orgs`);
const bad = await apiSearch({ q: "climate", state: "CA", label: "nope", limit: 1 }, "http://x");
check(bad.query.label === null, "api search: unknown label ignored");
const org = await apiOrg("261797336", "http://x"); // Climate Central
check(!("error" in org) && org.org.labels.some((l) => l.label === "climate" && l.tier === "primary" && Boolean(l.why)), "api org Climate Central: climate, primary, with why");
const su = await apiOrg("237013149", "http://x"); // Phoenix House Foundation
check(!("error" in su) && su.org.labels.some((l) => l.label === "substance_use" && l.tier === "primary" && Boolean(l.why)), "api org Phoenix House Foundation: substance_use, primary, with why");
const hh = await apiOrg("042516093", "http://x"); // Pine Street Inn (Boston)
check(!("error" in hh) && hh.org.labels.some((l) => l.label === "housing_homelessness" && l.tier === "primary" && Boolean(l.why)), "api org Pine Street Inn: housing_homelessness, primary, with why");
const tech = await apiOrg("460858543", "http://x"); // Code.org
check(!("error" in tech) && tech.org.labels.some((l) => l.label === "ai_tech_learning_work" && l.name === "Tech and AI skills" && l.tier === "primary" && Boolean(l.why)), "api org Code.org: ai_tech_learning_work, primary, with why");
const re = await apiOrg("942759879", "http://x"); // Race Forward
check(!("error" in re) && re.org.labels.some((l) => l.label === "racial_equity" && l.name === "Racial equity" && l.tier === "primary" && Boolean(l.why)), "api org Race Forward: racial_equity, primary, with why");
const ir = await apiOrg("135633307", "http://x"); // HIAS
check(!("error" in ir) && ir.org.labels.some((l) => l.label === "immigrants_refugees" && l.name === "Immigrants and refugees" && l.tier === "primary" && Boolean(l.why)), "api org HIAS: immigrants_refugees, primary, with why");
const mh = await apiOrg("581575080", "http://x"); // National Alliance on Mental Illness (NAMI)
check(!("error" in mh) && mh.org.labels.some((l) => l.label === "mental_health" && l.name === "Mental health" && l.tier === "primary" && Boolean(l.why)), "api org NAMI: mental_health, primary, with why");
// Sub-types: resettlement agencies are services, restriction and research groups policy (org pages, API, search filter).
// Services orgs may also run named policy work (both); restriction groups are policy only.
const sub = async (ein: string, name: string, want: "services" | "policy") => {
  const o = await apiOrg(ein, "http://x");
  const got = ("error" in o ? undefined : o.org.labels.find((x) => x.label === "immigrants_refugees"))?.subtypes ?? [];
  check(want === "policy" ? got.join("+") === "policy" : got.includes("services"), `api org ${name}: immigrants_refugees ${want}${want === "policy" ? " only" : ""} (got ${got.join("+") || "none"})`);
};
await sub("135633307", "HIAS", "services");
await sub("135660870", "International Rescue Committee", "services");
await sub("521136126", "FAIR", "policy");
await sub("521449368", "Center for Immigration Studies", "policy");
const sv = await search({ q: "immigration", label: "immigrants_refugees", labelPartial: true, limit: 50 });
const pv = await search({ q: "immigration", label: "immigrants_refugees", labelPartial: true, labelSub: "policy", limit: 50 });
const av = await search({ q: "immigration", label: "immigrants_refugees", labelPartial: true, labelSub: "all", limit: 50 });
check(sv.total > 0 && sv.results.every((x) => x.label?.subtypes?.includes("services")), `search immigrants_refugees: services by default (${sv.total})`);
check(pv.total > 0 && pv.results.every((x) => x.label?.subtypes?.includes("policy")) && pv.total < sv.total, `search immigrants_refugees sub=policy: ${pv.total} orgs, all policy`);
check(av.total >= sv.total && av.total >= pv.total, `search immigrants_refugees sub=all: ${av.total} orgs (both)`);
check(applyOverrides({ ...base, label: "immigrants_refugees" }, { sub: "policy" }).labelSub === "policy", "override sub=policy sets it");
check(applyOverrides({ ...base, label: "immigrants_refugees", labelSub: "policy" }, { label: "climate" }).labelSub === undefined, "override: a new label resets sub");
const ai = await apiSearch({ q: "refugee", label: "immigrants_refugees", label_subtype: "policy", limit: 5 }, "http://x");
check(ai.query.label_subtype === "policy" && ai.results.every((x) => x.label?.subtypes?.includes("policy")), "api search label_subtype=policy");
const none = await apiOrg("341877332", "http://x"); // Mid-Ohio Youth Mentoring
check(!("error" in none) && none.org.labels.length === 0, "api org without labels: empty list");

await db.end();
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
