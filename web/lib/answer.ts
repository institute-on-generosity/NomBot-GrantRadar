// Research answers: a Spec (lib/answerSpec) -> a number, a chart, 2-3 bullets and an honest method.
// Only fixed, parameterized SQL building blocks below; no SQL written by a model. Each block records its
// query (shown under "How we got this") and runs on the slim views of generosity-data migration 033:
//   grant_clean   990-PF grants 2022-2025 to US orgs (no individuals, placeholders, foreign or
//                 private-foundation recipients), with recipient NTEE, county and funder state
//   grant_totals  their sums per tax year and recipient state (denominators, link rates)
//   flag_year     one Form 990 / 990-EZ per org per tax year (revenue lines incl. government grants)
// and on charity_grant_clean / charity_grant_cube (generosity-data 042): Schedule I grants by public
// charities (DAF sponsors, community foundations, United Ways), same columns, so one set of blocks reads both.
// Causes: a graded label (org_labels) when one fits, else NTEE prefixes, else a keyword set over org
// names and 990 mission/program text (marked approximate). Headlines and bullets are templates over
// computed numbers, never model-written.
import { db } from "./db";
import { memo } from "./memo";
import { nteeLabel } from "./ntee";
import { LOADED_STATES } from "./filters";
import { money } from "../components/money";
import { normalizeSpec, type Cause, type Spec } from "./answerSpec";

export type Num = { value: string; label: string; note?: string };
export type Row = Record<string, string | number | boolean | null>;
export type Answer = {
  question: string;
  spec: Spec;
  status: "ok" | "partial" | "unanswerable";
  headline: string;
  numbers: Num[];
  bullets: string[];               // ≤16 words, **bold** numbers, no semicolons or em dashes
  chart: { title: string; sub: string; spec: Record<string, unknown> } | null;
  rows: Row[];                     // the chart's data, for CSV
  causeNote: string;               // how the cause set was defined
  method: string;
  caveats: string[];
  coverage: { label: string; value: string }[];
  missing: { what: string; why: string; source: string; url: string }[];
  queries: { title: string; sql: string }[];
  sources: { label: string; url: string }[];
  searchQuery: string | null;      // an org search to drill down
  orgCount?: number;               // organizations behind the answer, for "See the N organizations" 
  premise?: { claim: string; holds: boolean } | null; // a direction the question assumed (spec.premise), checked against the data
  basis?: "codes" | "keywords" | null; // a cause counted without a checked label: shown under the answer as a trust note
  ms: number;
};

// ------------------------------------------------------------------ constants
const G_FIRST = 2022, G_LAST = 2025, G_FULL = 2024; // grants: 2025 returns are still arriving
const F_FIRST = 2023, F_LAST = 2025, F_FULL = 2024; // Form 990 lines: 2023 partly, 2024 most complete
const RURAL_POP = 50000;
const STATE_NAME = Object.fromEntries(LOADED_STATES) as Record<string, string>;
const stateName = (s: string) => STATE_NAME[s] ?? s;

const SRC = {
  pf: { label: "IRS Form 990-PF e-file (Part XV grants)", url: "https://www.irs.gov/charities-non-profits/form-990-series-downloads" },
  si: { label: "IRS Form 990 e-file (Schedule I grants, Schedule D donor-advised funds)", url: "https://www.irs.gov/charities-non-profits/form-990-series-downloads" },
  f990: { label: "IRS Form 990 / 990-EZ e-file (Part I, Part VIII)", url: "https://www.irs.gov/charities-non-profits/form-990-series-downloads" },
  bmf: { label: "IRS Exempt Organizations Business Master File", url: "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf" },
  pop: { label: "Census population estimates 2024", url: "https://www.census.gov/programs-surveys/popest.html" },
  fed: { label: "USAspending.gov federal assistance (grants and cooperative agreements)", url: "https://www.usaspending.gov/download_center/award_data_archive" },
  acs: { label: "Census American Community Survey 5-year estimates, 2020-2024", url: "https://www.census.gov/programs-surveys/acs/data/summary-file.html" },
  ntee: { label: "NCCS NTEE codes", url: "https://urbaninstitute.github.io/nccs-legacy/ntee/ntee.html" },
  labels: { label: "NomBot cause labels (generosity-data docs/labels)", url: "https://github.com/institute-on-generosity/generosity-data/tree/main/docs/labels" },
};

const MISSING_TEXT: Record<string, { what: string; why: string; source: string; url: string }> = {
  individual_giving: { what: "Individual giving", why: "Gifts from individual donors aren't itemized in nonprofit filings.", source: "Giving USA; IRS SOI individual returns (itemized deductions)", url: "https://www.irs.gov/statistics/soi-tax-stats-individual-income-tax-returns" },
  corporate_giving: { what: "Corporate giving outside company foundations", why: "Only company foundations file a 990-PF. Direct corporate gifts aren't public.", source: "CECP Giving in Numbers; Giving USA", url: "https://cecp.co/home/resources/giving-in-numbers/" },
  federal_awards: { what: "Federal money beyond nonprofits", why: "We load federal grants to nonprofits and private colleges. Grants to governments, public universities and companies, and federal contracts, aren't loaded.", source: "USAspending.gov (federal awards by agency, program and recipient)", url: "https://www.usaspending.gov/search" },
  daf_grants: { what: "Grants by individual donor-advised funds", why: "Schedule I shows each DAF sponsor's grants, not which donor's fund advised each one.", source: "NPT Donor-Advised Fund Report", url: "https://www.nptrust.org/reports/daf-report/" },
  foreign_giving: { what: "Money to other countries", why: "Grants to foreign recipients can't be linked to an organization, so they're left out.", source: "Candid; OECD private philanthropy for development", url: "https://www.oecd.org/en/topics/private-philanthropy-for-development.html" },
  forecast: { what: "Forecasts", why: "We report what filed returns show for 2022–2025, not predictions.", source: "Giving USA outlooks", url: "https://givingusa.org/" },
  volunteering: { what: "Volunteering", why: "990s give only a volunteer headcount, not hours or value.", source: "AmeriCorps Volunteering and Civic Life survey", url: "https://americorps.gov/about/our-impact/volunteering-civic-life" },
};

// Names for the NTEE codes the router uses most (NCCS); one-letter codes use lib/ntee's major groups.
const NTEE_NAMES: Record<string, string> = {
  D20: "Animal Protection & Welfare", D30: "Wildlife Preservation", K31: "Food Banks & Pantries", K3: "Food Programs", L41: "Homeless Shelters",
  L4: "Temporary Housing", B2: "Elementary & Secondary Schools", B4: "Higher Education", B6: "Adult Education", E2: "Hospitals",
  E3: "Ambulatory & Primary Health Care", A5: "Museums", A6: "Performing Arts", M2: "Disaster Preparedness & Relief", I8: "Legal Services",
  W30: "Military & Veterans", F3: "Mental Health Treatment", F2: "Substance Abuse Treatment", P2: "Human Service Organizations",
  P3: "Children & Youth Services", P7: "Residential Care & Adult Day Programs", O2: "Youth Centers & Clubs", C3: "Natural Resources Conservation",
};

// ------------------------------------------------------------------ formatting
const pct = (x: number) => (!isFinite(x) ? "n/a" : Math.abs(x) >= 0.095 ? `${Math.round(x * 100)}%` : x >= 0.0095 ? `${(x * 100).toFixed(1)}%` : `${(x * 100).toFixed(2)}%`);
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${pct(Math.abs(x))}`;
const int = (n: number) => Math.round(n).toLocaleString("en-US");
const b = (s: string) => `**${s}**`;
const perRes = (x: number) => (x >= 100 ? `$${int(x)}` : `$${x.toFixed(2)}`);
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
// "animal shelters" names organizations already; "climate" needs "organizations" after it.
const orgsOf = (name: string) => (/(shelters|banks|pantries|kitchens|schools|colleges|universities|hospitals|museums|clinics|organizations|orgs|groups|charities|nonprofits|centers|libraries|theaters|churches|programs|clubs|trusts|funds)$/i.test(name) ? name : `${name} organizations`);
const yrs = (a: number, z: number) => (a === z ? `${a}` : `${a}–${String(z).slice(2)}`);

// ------------------------------------------------------------------ SQL plumbing
class P {
  vals: unknown[] = [];
  add(v: unknown) { this.vals.push(v); return `$${this.vals.length}`; }
}
// For display only: the query with its parameters written in.
function inline(sql: string, vals: unknown[]): string {
  const lit = (v: unknown): string => Array.isArray(v) ? `ARRAY[${v.map(lit).join(", ")}]` : typeof v === "number" ? String(v) : v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
  return sql.replace(/\$(\d+)/g, (_, i) => lit(vals[Number(i) - 1])).replace(/\n\s*\n/g, "\n").trim();
}
class Ctx {
  queries: { title: string; sql: string }[] = [];
  constructor(public cube = true) {} // false: the original grant_clean queries only (eval/answer-cube.mts compares both)
  async q<T = Row>(title: string, sql: string, p: P): Promise<T[]> {
    this.queries.push({ title, sql: inline(sql, p.vals) });
    const r = await db.query(sql, p.vals);
    return r.rows as T[];
  }
}

// A cause as SQL: a join and/or WHERE terms on the alias's EIN and NTEE columns. tier: the label's tier column.
// all: a subject with no cause restriction (e.g. "organizations under $1M", where only the filters apply).
type C = Cause & { all?: boolean; via?: string }; // via: the cause_terms / NTEE name a plain-English cause matched
type CauseSql = { join: string; where: string[]; tier: string | null; kind: "label" | "ntee" | "keyword" | "all"; primaryOnly?: boolean };
function tsq(keywords: string[]): string {
  return keywords.map((k) => k.split(/[^a-z0-9]+/).filter(Boolean).join(" <-> ")).filter(Boolean).map((k) => `(${k})`).join(" | ");
}
// primaryOnly: a graded label counts only orgs where the cause is the main stated purpose. Used for whole-org
// money (Form 990 lines, federal awards): a partial-tier org's entire budget isn't money for the cause (a
// credit-union network with one green-lending program would count all its government grants as climate).
function causeSql(c: C | null, p: P, ein: string, ntee: string, sfx = "", primaryOnly = false): CauseSql {
  if (!c || c.all) return { join: "", where: [], tier: null, kind: "all" };
  if (c.label) return { join: `JOIN org_labels l${sfx} ON l${sfx}.ein = ${ein} AND l${sfx}.label = ${p.add(c.label)}${primaryOnly ? ` AND l${sfx}.tier = 'primary'` : ""}`, where: [], tier: `l${sfx}.tier`, kind: "label", primaryOnly };
  if (c.ntee.length) return { join: "", where: [`${ntee} LIKE ANY(${p.add(c.ntee.map((n) => `${n}%`))}::text[])`], tier: null, kind: "ntee" };
  const kws = c.keywords.length ? c.keywords : [c.name.toLowerCase()];
  const q = tsq(kws);
  const t = p.add(q || "nothing");
  // A passing mention isn't the org's cause: 990 text counts only when a keyword is in the mission or the lead
  // program (first 60 words of mission + programs) or comes up at least twice. One "opioid" line deep in PATH's
  // global-health programs put $477M in Washington (Oct 17).
  const kw = p.add(kws.join(" "));
  return {
    join: `JOIN (SELECT ein FROM orgs WHERE search @@ to_tsquery('english', ${t})
         UNION SELECT fl.ein FROM filing_latest fl WHERE fl.search @@ to_tsquery('english', ${t})
           AND (SELECT count(*) >= 2 OR min(pos) <= 60 FROM unnest(fl.search) u, unnest(u.positions) pos
                WHERE u.lexeme = ANY(tsvector_to_array(to_tsvector('english', ${kw}))))) k${sfx} ON k${sfx}.ein = ${ein}`,
    where: [], tier: null, kind: "keyword",
  };
}
const primarySum = (cs: CauseSql, amt: string) => (cs.tier ? `coalesce(sum(${amt}) FILTER (WHERE ${cs.tier} = 'primary'), 0)::float8` : `coalesce(sum(${amt}), 0)::float8`);

// Filters from the research layer (generosity-data 038-040): recipient revenue band, funder asset band,
// funder type, recipient kind. Bands are fixed edges (size_bands); a requested cutoff snaps to the nearest.
type Filt = {
  rb: [number, number] | null; fb: [number, number] | null; ftype: string | null; kinds: string[] | null;
  to: string;         // recipient side: "organizations with under $1M in revenue", "school districts"
  from: string;       // funder side: "family-named foundations", "foundations with $1B and up in assets"
  notes: string[];    // caveats the filters add
};
const NO_FILT: Filt = { rb: null, fb: null, ftype: null, kinds: null, to: "", from: "", notes: [] };
const R_EDGES = [1e5, 5e5, 1e6, 5e6, 1e7, 5e7, 1e8], F_EDGES = [1e6, 1e7, 5e7, 1e8, 1e9];
const edgeText = (x: number) => (x >= 1e9 ? `$${x / 1e9}B` : x >= 1e6 ? `$${x / 1e6}M` : `$${x / 1e3}K`);
function bandRange(r: { min: number | null; max: number | null }, edges: number[], notes: string[], what: string): { b: [number, number]; text: string } {
  const near = (x: number) => edges.reduce((best, e, i) => (Math.abs(Math.log(x / e)) < Math.abs(Math.log(x / edges[best])) ? i : best), 0);
  const snap = (x: number) => { const i = near(x); if (Math.abs(edges[i] - x) / x > 0.01) notes.push(`${cap(what)} uses fixed bands, so ${edgeText(x)} is rounded to the nearest band edge, ${edgeText(edges[i])}.`); return i; };
  const lo = r.min != null ? snap(r.min) + 2 : 1, hi = r.max != null ? snap(r.max) + 1 : edges.length + 1;
  if (lo > hi) throw new Unanswerable(`That ${what} range is empty once rounded to our size bands.`);
  const text = r.min != null && r.max != null ? `${edgeText(edges[lo - 2])} to ${edgeText(edges[hi - 1])}` : r.max != null ? `under ${edgeText(edges[hi - 1])}` : r.min != null ? `${edgeText(edges[lo - 2])} and up` : "any";
  return { b: [lo, hi], text };
}
// public_entity = government recipients only (school districts and public colleges). Private colleges are
// private nonprofits, so they're their own kind, never folded in.
const KIND_SQL: Record<string, string[]> = { nonprofit: ["nonprofit"], school_district: ["school_district"], public_college: ["college_public"], private_college: ["college_private"], public_entity: ["school_district", "college_public"] };
const KIND_NAME: Record<string, string> = { nonprofit: "identified nonprofits", school_district: "school districts", public_college: "public colleges", private_college: "private colleges", public_entity: "school districts and public colleges", college_public: "public colleges", college_private: "private colleges", unidentified: "unidentified recipients" };
const FTYPE_NAME: Record<string, string> = { family: "family-named foundations", family_named: "family-named foundations", operating: "private operating foundations", trust: "charitable trusts", other: "other private foundations", company: "company foundations" };
function filtersOf(s: Spec): Filt {
  const notes: string[] = [], to: string[] = [], from: string[] = [];
  let rb: Filt["rb"] = null, fb: Filt["fb"] = null;
  if (s.recipientSize) {
    const r = bandRange(s.recipientSize, R_EDGES, notes, "recipient revenue");
    rb = r.b; to.push(`organizations with ${r.text} in revenue`);
    notes.push("Recipient size = annual revenue on its newest e-filed 990 or 990-EZ, else the IRS master file. Orgs with neither (mostly 990-N filers under $50K) and unidentified recipients are left out.");
  }
  if (s.funderSize) {
    const r = bandRange(s.funderSize, F_EDGES, notes, "foundation assets");
    fb = r.b; from.push(`foundations with ${r.text} in assets`);
    notes.push("Foundation size = fair market value of assets on its newest 990-PF, not the year of each grant.");
  }
  const ftype = s.funderType ? (s.funderType === "family" ? "family_named" : s.funderType) : null;
  if (ftype) {
    from.unshift(FTYPE_NAME[ftype]);
    notes.push(ftype === "family_named"
      ? "The IRS doesn't flag family foundations. Family-named = \"Family\" in the foundation's name, so this is a floor: most family foundations carry a person's name instead."
      : ftype === "operating" ? "Private operating foundations run their own programs (IRS master file foundation code 02 or 03) and give few grants."
      : ftype === "company" ? "The IRS doesn't flag company foundations. Company = a business gives to the foundation on its 990-PF, the name says so, or the name matches an SEC-listed company. Giving programs run inside a company aren't counted."
      : "Charitable trusts = nonexempt trusts that file a 990-PF (section 4947(a)(1)).");
  }
  const kinds = s.recipientKind ? KIND_SQL[s.recipientKind] : null;
  if (kinds) {
    to.unshift(KIND_NAME[s.recipientKind!]);
    if (s.recipientKind !== "nonprofit") notes.push("School districts and colleges are matched from the grant's recipient name and address to NCES and IPEDS lists. Grants to them that name only a school or a department can be missed.");
  }
  // "family-named foundations with $1B and up in assets"; "school districts, organizations with ..."
  return { rb, fb, ftype, kinds, to: to.join(", "), from: from.length === 2 ? `${from[0]} with ${from[1].replace(/^foundations with /, "")}` : from.join(""), notes };
}
const hasFilt = (f: Filt) => !!(f.rb || f.fb || f.ftype || f.kinds);
// Filter terms on grant_clean (alias g): profiles joined by EIN, public-entity kind through grants.
function filtGc(f: Filt, p: P, g = "g"): string[] {
  const w: string[] = [];
  if (f.rb) w.push(`${g}.recipient_ein IN (SELECT ein FROM recipient_profile WHERE band BETWEEN ${p.add(f.rb[0])} AND ${p.add(f.rb[1])})`);
  const ft = f.ftype === "company" ? null : f.ftype; // company foundations: their own table (generosity-data 045), not a funder_profile type
  if (f.ftype === "company") w.push(`${g}.funder_ein IN (SELECT ein FROM company_foundations)`);
  if (f.fb || ft) w.push(`${g}.funder_ein IN (SELECT ein FROM funder_profile WHERE ${[...(f.fb ? [`asset_band BETWEEN ${p.add(f.fb[0])} AND ${p.add(f.fb[1])}`] : []), ...(ft ? [`funder_type = ${p.add(ft)}`] : [])].join(" AND ")})`);
  if (f.kinds) {
    const ent = f.kinds.filter((k) => k !== "nonprofit");
    if (ent.length) w.push(`${g}.id IN (SELECT gr.id FROM grants gr JOIN public_entities pe ON pe.id = gr.recipient_entity WHERE pe.kind = ANY(${p.add(ent)}::text[]))`);
    else w.push(`${g}.recipient_ein IS NOT NULL`, `${g}.id NOT IN (SELECT gr.id FROM grants gr WHERE gr.recipient_entity IS NOT NULL)`);
  }
  return w;
}
// Filter terms on an organization's EIN (Form 990 lines, org counts): only recipient size applies.
const filtEin = (f: Filt, p: P, ein: string) => (f.rb ? [`${ein} IN (SELECT ein FROM recipient_profile WHERE band BETWEEN ${p.add(f.rb[0])} AND ${p.add(f.rb[1])})`] : []);

// ------------------------------------------------------------------ research layer: grant_cube / grant_recipient_year
// Sums come from grant_cube (alias x) when the cause is a label or NTEE prefixes of up to 3 characters
// and there's no county; otherwise from grant_clean. Same grants, same numbers (eval/answer-cube.mts).
const cubeCause = (c: C | null) => !c || c.all || !!c.label || (c.ntee.length > 0 && c.ntee.every((n) => n.length <= 3));
const cubeOk = (ctx: Ctx, c: C | null, pl: Place) => ctx.cube && !pl.county && cubeCause(c) && !(pl.g.kind === "charity" && pl.f.rb) && pl.f.ftype !== "company"; // no company column in the cube
type CubeSql = { where: string[]; primary: (() => string) | null }; // primary: adds its parameter only when used
function cubeWhere(c: C | null, p: P, pl: Place, y: { from: number; to: number }, linkedOnly: boolean, x = "x"): CubeSql {
  const w = [`${x}.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`];
  let primary: CubeSql["primary"] = null;
  if (linkedOnly || (c && !c.all)) w.push(`${x}.linked`);
  if (c && !c.all) {
    if (c.label) { const l = c.label; w.push(`${x}.labels <> '{}'`, `${x}.labels && ${p.add([`${l}:primary`, `${l}:partial`])}::text[]`); primary = () => `${p.add(`${l}:primary`)}::text = ANY(${x}.labels)`; }
    else w.push(`${x}.ntee3 LIKE ANY(${p.add(c.ntee.map((n) => `${n}%`))}::text[])`);
  }
  if (pl.states.length) w.push(`${x}.recipient_state = ANY(${p.add(pl.states)}::text[])`);
  if (pl.area) w.push(`${x}.rural IS ${pl.area === "rural" ? "TRUE" : "FALSE"}`);
  const f = pl.f;
  if (f.rb) w.push(`${x}.recipient_band BETWEEN ${p.add(f.rb[0])} AND ${p.add(f.rb[1])}`);
  if (f.fb) w.push(`${x}.funder_band BETWEEN ${p.add(f.fb[0])} AND ${p.add(f.fb[1])}`);
  if (f.ftype) w.push(`${x}.funder_type = ${p.add(f.ftype)}`);
  if (f.kinds) w.push(`${x}.recipient_kind = ANY(${p.add(f.kinds)}::text[])`);
  w.push(...gExtra(pl, p, x));
  return { where: w, primary };
}
const cubeSum = (cs: CubeSql, col = "usd", x = "x") => (cs.primary ? `coalesce(sum(${x}.${col}) FILTER (WHERE ${cs.primary()}), 0)::float8` : `coalesce(sum(${x}.${col}), 0)::float8`);
// grant_recipient_year (alias r): identified recipients by year and grant address; no funder columns.
const ryOk = (ctx: Ctx, pl: Place) => ctx.cube && pl.g.kind === "pf" && !pl.f.fb && !pl.f.ftype && !pl.f.kinds;
function ryWhere(c: C | null, p: P, pl: Place, y: { from: number; to: number }, r = "r"): { join: string; where: string[] } {
  const w = [`${r}.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`];
  let join = "";
  if (c && !c.all) {
    if (c.label) w.push(`${r}.labels <> '{}'`, `${r}.labels && ${p.add([`${c.label}:primary`, `${c.label}:partial`])}::text[]`);
    else if (c.ntee.length) w.push(`${r}.recipient_ntee LIKE ANY(${p.add(c.ntee.map((n) => `${n}%`))}::text[])`);
    else join = causeSql(c, p, `${r}.recipient_ein`, `${r}.recipient_ntee`).join;
  }
  w.push(...placeWhere(pl, p, `${r}.recipient_state`, `${r}.county_fips`));
  if (pl.f.rb) w.push(`${r}.recipient_band BETWEEN ${p.add(pl.f.rb[0])} AND ${p.add(pl.f.rb[1])}`);
  return { join, where: w };
}

// ------------------------------------------------------------------ cause taxonomy (generosity-data 039)
// A cause the router left without a label or NTEE code is looked up by its name, then its keywords, in
// cause_lookup (curated plain-English terms + every NTEE code's own name). Keyword search stays the fallback.
type Term = { ntee: string[]; label: string | null; term: string };
const termKey = (x: string) => x.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9' -]/g, " ").replace(/\s+/g, " ").trim();
const taxoMemo = memo<{ terms: Map<string, Term>; names: Map<string, string> }>("answer-taxonomy", 2, 3600_000);
const taxonomy = () => taxoMemo("all", async () => {
  const [t, n] = await Promise.all([db.query(`SELECT term, ntee, label FROM cause_lookup ORDER BY source = 'curated' DESC, term`), db.query(`SELECT code, name FROM ntee_codes`)]);
  const terms = new Map<string, Term>();
  for (const r of t.rows) { const k = termKey(r.term); if (!terms.has(k)) terms.set(k, { ntee: r.ntee, label: r.label, term: r.term }); }
  return { terms, names: new Map(n.rows.map((r) => [r.code, r.name])) };
});
function lookupTerm(terms: Map<string, Term>, raw: string): Term | null {
  const k = termKey(raw).replace(/\b(organizations?|orgs|nonprofits?|groups|charities|programs|causes?|sector)$/, "").trim();
  if (!k) return null;
  for (const v of [k, k.replace(/s$/, ""), `${k}s`, k.replace(/ies$/, "y"), k.replace(/y$/, "ies")]) { const hit = terms.get(v); if (hit) return hit; }
  return null;
}
async function resolveCauses(s: Spec): Promise<Spec> {
  if (!s.causes.some((c) => !c.label && !c.ntee.length)) return s;
  const { terms } = await taxonomy();
  return {
    ...s, causes: s.causes.map((c) => {
      if (c.label || c.ntee.length) return c;
      const hit = [c.name, ...c.keywords].map((w) => lookupTerm(terms, w)).find(Boolean);
      if (!hit) return c;
      return { ...c, label: (hit.label as Cause["label"]) ?? null, ntee: hit.label ? [] : hit.ntee, via: hit.term } as C;
    }),
  };
}

type Place = { states: string[]; county: { fips: string; name: string; state: string } | null; area: "rural" | "urban" | null; label: string; f: Filt; g: GSrc };

// ------------------------------------------------------------------ grant sources: 990-PF or Schedule I
// Foundation grants (grant_clean, grant_cube) and Schedule I grants by public charities (charity_grant_clean,
// charity_grant_cube) share column names; GSrc names the tables and the words for each.
type GSrc = {
  kind: "pf" | "charity";
  clean: string; cube: string; funders: string; // grant rows, sums, funder names (ein, name, state)
  who: string;      // "Foundations", "Donor-advised fund sponsors"
  givers: string;   // "foundations", "DAF sponsors"
  grants: string;   // "foundation grants", "grants from DAF sponsors"
  money: string;    // "foundation money", "money from DAF sponsors"
  form: string;     // "990-PF grants", "Schedule I grants"
  adj: string;      // "foundation", "DAF sponsor": before dollars, funder
  src: { label: string; url: string };
  cls: string | null; // charity funder class (charityFunder)
};
const PF: GSrc = { kind: "pf", clean: "grant_clean", cube: "grant_cube", funders: "funders", who: "Foundations", givers: "foundations", grants: "foundation grants", money: "foundation money", form: "990-PF grants", adj: "foundation", src: SRC.pf, cls: null };
const CLASS_NAME: Record<string, [string, string, string]> = {
  daf_sponsor: ["Donor-advised fund sponsors", "DAF sponsors", "DAF sponsor"], community_foundation: ["Community foundations", "community foundations", "community foundation"],
  united_way: ["United Ways", "United Ways", "United Way"], other: ["Other grantmaking charities", "other grantmaking charities", "charity"],
};
function gsrcOf(s: Spec): GSrc {
  if (s.source !== "charity_grants") return PF;
  const [who, givers, adj] = s.charityFunder ? CLASS_NAME[s.charityFunder] : ["Grantmaking charities", "grantmaking charities", "charity"];
  return { kind: "charity", clean: "charity_grant_clean", cube: "charity_grant_cube", funders: "charity_funder_profile", who, givers, grants: `grants from ${givers}`, money: `money from ${givers}`, form: "Schedule I grants", adj, src: SRC.si, cls: s.charityFunder };
}
// Schedule I: leave out grants to other grantmakers (counted when they grant it on), keep the funder class.
const gExtra = (pl: Place, p: P, a: string): string[] => (pl.g.kind === "charity" ? [`NOT ${a}.to_grantmaker`, ...(pl.g.cls ? [`${a}.funder_class = ${p.add(pl.g.cls)}`] : [])] : []);
const isGrantSrc = (s: Spec) => s.source === "foundation_grants" || s.source === "charity_grants";
function placeWhere(pl: Place, p: P, stateCol: string, countyCol: string): string[] {
  const w: string[] = [];
  if (pl.county) w.push(`${countyCol} = ${p.add(pl.county.fips)}`);
  else if (pl.states.length) w.push(`${stateCol} = ANY(${p.add(pl.states)}::text[])`);
  if (pl.area) w.push(`${countyCol} IN (SELECT county_fips FROM county_need WHERE county_fips <> '00000' AND population ${pl.area === "rural" ? "<" : ">="} ${RURAL_POP})`);
  return w;
}
const and = (w: string[]) => (w.length ? w.join("\n  AND ") : "true");

async function resolvePlace(s: Spec): Promise<Place> {
  let county: Place["county"] = null;
  if (s.county) {
    const base = s.county.replace(/\s+(county|parish|borough)$/i, "").trim();
    const r = await db.query(
      `SELECT county_fips AS fips, name, state FROM county_need WHERE county_fips <> '00000'
         AND lower(name) IN (lower($1), lower($1 || ' County'), lower($1 || ' Parish'), lower($1 || ' Borough'))
         AND ($2::text[] IS NULL OR state = ANY($2)) ORDER BY population DESC NULLS LAST LIMIT 1`,
      [base, s.states.length ? s.states : null]);
    county = r.rows[0] ?? null;
  }
  const where = county ? `${county.name}, ${county.state}` : s.states.length ? (s.states.length <= 3 ? s.states.map(stateName).join(", ") : `${s.states.length} states`) : "the US";
  const area = s.area ? `${s.area} counties of ` : "";
  const g = gsrcOf(s);
  const f = filtersOf(s);
  // Foundation size, foundation type and recipient kind exist only for 990-PF grants.
  return { states: s.states, county, area: s.area, label: `${area}${where}`, f: g.kind === "charity" ? { ...f, fb: null, ftype: null, kinds: null, from: "" } : f, g };
}

// ------------------------------------------------------------------ label grades (for caveats)
type Grade = { name: string; primary?: number; partial?: number; recall?: number; nPrimary?: number; nPartial?: number };
const gradeMemo = memo<Record<string, Grade>>("answer-grades", 2, 3600_000);
const grades = () => gradeMemo("all", async () => {
  const r = await db.query(`SELECT label, name, grading FROM cause_labels`);
  return Object.fromEntries(r.rows.map((x) => [x.label, {
    name: x.name, primary: x.grading?.primary?.exact?.p, partial: x.grading?.partial?.in_label?.p ?? x.grading?.partial?.in_label_weighted,
    recall: x.grading?.recall_est, nPrimary: x.grading?.primary?.exact?.n, nPartial: x.grading?.partial?.in_label?.n,
  }]));
});

const linkMemo = memo<{ grants: number; dollars: number }>("answer-link:v3", 4, 3600_000);
const linkRate = (g: GSrc = PF) => linkMemo(g.kind, async () => {
  const r = await db.query(g.kind === "pf"
    ? `SELECT sum(linked_n)::float8 / sum(n) AS g, sum(linked_usd)::float8 / sum(usd) AS d FROM grant_totals WHERE tax_year BETWEEN 2022 AND 2024`
    : `SELECT (sum(n) FILTER (WHERE linked))::float8 / sum(n) AS g, (sum(usd) FILTER (WHERE linked))::float8 / sum(usd) AS d FROM charity_grant_cube WHERE tax_year BETWEEN 2022 AND 2024 AND NOT to_grantmaker`);
  return { grants: r.rows[0].g, dollars: r.rows[0].d };
});

async function causeNote(c: C | null, cs: CauseSql, caveats: string[]): Promise<string> {
  if (!c || cs.kind === "all") return c?.all ? `All causes, ${c.name}.` : "All causes.";
  const via = c.via ? ` Matched to codes through our cause taxonomy (term "${c.via}").` : "";
  if (cs.kind === "label") {
    const g = (await grades())[c.label!];
    caveats.push(`${g?.name ?? c.label} is a graded label: Claude read each candidate's 990 mission and programs. On a fresh sample, ${g?.primary != null ? `primary was ${pct(g.primary)} right (${g.nPrimary} graded)` : "primary is graded"}${g?.partial != null ? `, partial ${pct(g.partial)} (${g.nPartial} graded)` : ""}${g?.recall != null ? `, estimated recall ${pct(g.recall)}` : ""}. ${cs.primaryOnly ? "Only primary orgs are counted here." : "Primary is a floor, primary + partial an upper bound."}`);
    return cs.primaryOnly
      ? `${g?.name ?? c.label} label (org_labels), primary tier only: orgs whose main stated purpose it is. Orgs where it's one program among others are left out, because their whole budget would count.${via}`
      : `${g?.name ?? c.label} label (org_labels): primary = the main stated purpose, partial = one program among others.${via}`;
  }
  if (cs.kind === "ntee") {
    if (c.ntee.some((n) => n.startsWith("X"))) caveats.push("Churches and other houses of worship don't have to file Form 990 or apply for recognition, so most congregations are missing from these figures.");
    if (c.ntee.some((n) => /^B4|^E2/.test(n))) caveats.push("Public universities and government hospitals often don't file Form 990, so they're missing here.");
    caveats.push("NTEE codes describe each org's main activity as the IRS coded it. About a third of orgs have no code, and multi-purpose orgs are coded once.");
    const names = (await taxonomy().catch(() => null))?.names;
    return `NTEE codes ${c.ntee.map((n) => { const l = names?.get(n) ?? NTEE_NAMES[n] ?? (n.length === 1 ? nteeLabel(n) : null); return l ? `${n} (${l})` : n; }).join(", ")}.${via}`;
  }
  caveats.push(`Approximate set: "${c.name}" has no IRS code or graded label, so it means orgs whose name, 990 mission or lead program mentions ${c.keywords.map((k) => `"${k}"`).join(", ") || `"${c.name}"`}, or whose program text mentions it more than once. A single passing mention doesn't count. It can still include orgs where it's a side program and miss orgs without e-filed text.`);
  return `Approximate keyword set (name, 990 mission or lead program mentions ${c.keywords.join(", ") || c.name}, or program text mentions it twice or more).`;
}

// ------------------------------------------------------------------ charts (Vega-Lite, InsightChart theme)
function unit(max: number) {
  return max >= 1e9 ? { div: 1e9, title: "$ billions", fmt: "$,.1f" } : max >= 1e6 ? { div: 1e6, title: "$ millions", fmt: "$,.0f" } : { div: 1e3, title: "$ thousands", fmt: "$,.0f" };
}
const BASE = { $schema: "https://vega.github.io/schema/vega-lite/v5.json", width: "container" };
function vbar(values: Row[], x: string, y: string, xTitle: string, yTitle: string, fmt: string, series?: string) {
  return {
    ...BASE, height: 200, data: { values }, mark: { type: "bar" },
    encoding: {
      x: { field: x, type: "nominal", title: xTitle, sort: null, axis: { labelAngle: 0, labelLimit: 140 } },
      y: { field: y, type: "quantitative", title: yTitle, axis: { format: fmt } },
      ...(series ? { color: { field: series, type: "nominal", title: null, legend: { orient: "top", direction: "vertical", labelLimit: 400 } }, xOffset: { field: series } } : {}),
      tooltip: [{ field: x, type: "nominal" }, ...(series ? [{ field: series, type: "nominal" }] : []), { field: y, type: "quantitative", format: fmt }],
    },
  };
}
function hbar(values: Row[], y: string, x: string, xTitle: string, fmt: string, highlight?: string) {
  return {
    ...BASE, height: Math.min(220, Math.max(120, 22 * values.length)), data: { values }, mark: { type: "bar" },
    encoding: {
      y: { field: y, type: "nominal", sort: null, title: null, axis: { labelLimit: 240 } },
      x: { field: x, type: "quantitative", title: xTitle, axis: { format: fmt } },
      ...(highlight ? { color: { condition: { test: `datum['${y}'] === ${JSON.stringify(highlight)}`, value: "#d97706" }, value: "#4c78a8" } } : {}),
      tooltip: [{ field: y, type: "nominal" }, { field: x, type: "quantitative", format: fmt }],
    },
  };
}

// Bars for the cause, a muted line for the comparison, both as percent change.
function trendSpec(values: Row[], cause: string, all = "All foundation grants") {
  const color = { field: "series", type: "nominal", title: null, scale: { domain: [cause, all], range: ["#30a14e", "#8e8e93"] }, legend: { orient: "top", direction: "horizontal" } };
  const tooltip = [{ field: "year" }, { field: "series" }, { field: "change", type: "quantitative", format: "+.1%" }];
  return {
    ...BASE, height: 200, data: { values },
    encoding: { x: { field: "year", type: "nominal", title: null, sort: null, axis: { labelAngle: 0 } }, y: { field: "change", type: "quantitative", title: null, axis: { format: "+.0%" } }, color, tooltip },
    layer: [
      { transform: [{ filter: `datum.series === ${JSON.stringify(cause)}` }], mark: { type: "bar", width: { band: 0.4 } } },
      { transform: [{ filter: `datum.series !== ${JSON.stringify(cause)}` }], mark: { type: "line", point: true, strokeDash: [4, 3] } },
    ],
  };
}

// ------------------------------------------------------------------ years
type Years = { from: number; to: number; full: number[]; partial: boolean; note: string | null };
function grantYears(s: Spec): Years {
  const reqFrom = s.yearFrom ?? null, reqTo = s.yearTo ?? null;
  let from = Math.min(Math.max(reqFrom ?? G_FIRST, G_FIRST), G_LAST);
  let to = Math.min(Math.max(reqTo ?? (reqFrom && reqFrom > G_FULL ? reqFrom : G_FULL), from), G_LAST);
  if (reqFrom == null && reqTo != null && reqTo < G_FIRST) { from = G_FIRST; to = G_FIRST; }
  const note = (reqFrom != null && reqFrom < G_FIRST) || (reqTo != null && reqTo < G_FIRST) ? `Foundation grants here start in tax year ${G_FIRST}.` : null;
  const full = Array.from({ length: Math.min(to, G_FULL) - from + 1 }, (_, i) => from + i).filter((y) => y <= G_FULL);
  return { from, to, full, partial: to > G_FULL, note };
}
function flagYear(s: Spec): { year: number; note: string | null } {
  const want = s.yearTo ?? s.yearFrom ?? F_FULL;
  const year = Math.min(Math.max(want, F_FIRST), F_LAST);
  return { year, note: want !== year ? `Form 990 revenue lines here cover tax years ${F_FIRST}–${F_LAST}; showing ${year}.` : year === F_LAST ? `${F_LAST} returns are still arriving, so ${F_LAST} is incomplete.` : null };
}
const yearLabel = (y: number) => (y > G_FULL ? `${y} (partial)` : String(y));

// ------------------------------------------------------------------ building blocks: foundation grants
type YearRow = { year: number | null; usd: number; primary_usd: number; grants: number; orgs: number; funders: number };
// Money to a cause (or a filtered subject) by tax year, with distinct recipients and funders. Sums from
// grant_cube when it can, distinct counts from grant_clean (exact, hashed per year instead of sorted).
async function fMoney(ctx: Ctx, c: C | null, pl: Place, y: Years, title: string) {
  const linked = !!c && !c.all;
  if (!ctx.cube) {
    // The original single query (kept for eval/answer-cube.mts).
    const p = new P();
    const cs = causeSql(c, p, "g.recipient_ein", "g.recipient_ntee");
    const where = [...(linked || !c ? ["g.recipient_ein IS NOT NULL"] : []), `g.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`, ...cs.where, ...placeWhere(pl, p, "g.recipient_state", "g.county_fips"), ...filtGc(pl.f, p), ...gExtra(pl, p, "g")];
    const rows = await ctx.q<YearRow>(title, `SELECT g.tax_year AS year, sum(g.amount)::float8 AS usd, ${primarySum(cs, "g.amount")} AS primary_usd,
       count(*)::int AS grants, count(DISTINCT g.recipient_ein)::int AS orgs, count(DISTINCT g.funder_ein)::int AS funders
FROM ${pl.g.clean} g ${cs.join}
WHERE ${and(where)}
GROUP BY GROUPING SETS ((g.tax_year), ()) ORDER BY 1 NULLS LAST`, p);
    const total = rows.find((r) => r.year == null) ?? { year: null, usd: 0, primary_usd: 0, grants: 0, orgs: 0, funders: 0 };
    return { cs: causeSql(c, new P(), "", ""), years: rows.filter((r) => r.year != null), total };
  }
  const p = new P(), pd = new P();
  const gw = grantWhere(c, pd, pl, y, linked);
  let sums: Promise<{ year: number | null; usd: number; primary_usd: number; grants: number }[]>;
  if (cubeOk(ctx, c, pl)) {
    const cw = cubeWhere(c, p, pl, y, linked);
    sums = ctx.q(`${title} (research cube)`, `SELECT x.tax_year::int AS year, coalesce(sum(x.usd), 0)::float8 AS usd, ${cubeSum(cw)} AS primary_usd, coalesce(sum(x.n), 0)::int AS grants
FROM ${pl.g.cube} x
WHERE ${and(cw.where)}
GROUP BY GROUPING SETS ((x.tax_year), ()) ORDER BY 1 NULLS LAST`, p);
  } else {
    const gs = grantWhere(c, p, pl, y, linked);
    sums = ctx.q(title, `SELECT g.tax_year AS year, sum(g.amount)::float8 AS usd, ${primarySum(gs.cs, "g.amount")} AS primary_usd, count(*)::int AS grants
FROM ${pl.g.clean} g ${gs.cs.join}
WHERE ${and(gs.where)}
GROUP BY GROUPING SETS ((g.tax_year), ()) ORDER BY 1 NULLS LAST`, p);
  }
  // Distinct recipients from grant_recipient_year when no funder or recipient-kind filter applies, distinct
  // funders from grant_clean: two parallel hashed counts instead of one sorted GROUPING SETS pass.
  const label = title.replace(/, by tax year$/, "");
  const pr = new P();
  const rw = ryOk(ctx, pl) ? ryWhere(c, pr, pl, y) : null;
  const recips = rw
    ? ctx.q<{ k: string; year: number | null; n: number }>(`Distinct recipients: ${label} (research layer)`, `WITH r AS (SELECT r.tax_year, r.recipient_ein FROM grant_recipient_year r ${rw.join} WHERE ${and(rw.where)} GROUP BY 1, 2)
SELECT 'r' AS k, tax_year::int AS year, count(*)::int AS n FROM r GROUP BY 2
UNION ALL SELECT 'r', NULL, count(DISTINCT recipient_ein)::int FROM r`, pr)
    : Promise.resolve(null);
  const distinct = ctx.q<{ k: string; year: number | null; n: number }>(`Distinct ${rw ? "funders" : "recipients and funders"}: ${label}`, `WITH s AS MATERIALIZED (SELECT g.tax_year, g.recipient_ein, g.funder_ein FROM ${pl.g.clean} g ${gw.cs.join} WHERE ${and(gw.where)}),
${rw ? "" : `r AS (SELECT tax_year, recipient_ein FROM s WHERE recipient_ein IS NOT NULL GROUP BY 1, 2),
`}f AS (SELECT tax_year, funder_ein FROM s GROUP BY 1, 2)
${rw ? "" : `SELECT 'r' AS k, tax_year AS year, count(*)::int AS n FROM r GROUP BY 2
UNION ALL SELECT 'r', NULL, count(DISTINCT recipient_ein)::int FROM r
UNION ALL `}SELECT 'f'${rw ? " AS k" : ""}, tax_year${rw ? " AS year" : ""}, count(*)::int${rw ? " AS n" : ""} FROM f GROUP BY 2
UNION ALL SELECT 'f', NULL, count(DISTINCT funder_ein)::int FROM f`, pd);
  const [srows, d1, d2] = await Promise.all([sums, distinct, recips]);
  const drows = [...d1, ...(d2 ?? [])];
  const d = (k: string, yr: number | null) => drows.find((r) => r.k === k && r.year === yr)?.n ?? 0;
  const rows: YearRow[] = srows.map((r) => ({ ...r, orgs: d("r", r.year), funders: d("f", r.year) }));
  const total = rows.find((r) => r.year == null) ?? { year: null, usd: 0, primary_usd: 0, grants: 0, orgs: 0, funders: 0 };
  return { cs: gw.cs, years: rows.filter((r) => r.year != null), total };
}

type DenomRow = { year: number | null; usd: number; n: number; linked_usd: number; linked_n: number; gos_usd: number; gos_n: number };
// All grants in the place and years (no cause, no filters): the denominator for shares and link rates.
async function fDenom(ctx: Ctx, pl: Place, y: Years) {
  const p = new P();
  let rows: DenomRow[];
  if (!pl.county && !pl.area && pl.g.kind === "pf") {
    const w = [`t.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`, ...(pl.states.length ? [`t.state = ANY(${p.add(pl.states)}::text[])`] : [])];
    rows = await ctx.q<DenomRow>("All foundation grants in the place (denominator, link rate)", `SELECT t.tax_year AS year, sum(t.usd)::float8 AS usd, sum(t.n)::int AS n, sum(t.linked_usd)::float8 AS linked_usd,
       sum(t.linked_n)::int AS linked_n, sum(t.gos_usd)::float8 AS gos_usd, sum(t.gos_n)::int AS gos_n
FROM grant_totals t WHERE ${and(w)}
GROUP BY GROUPING SETS ((t.tax_year), ()) ORDER BY 1 NULLS LAST`, p);
  } else if (cubeOk(ctx, null, pl)) {
    const cw = cubeWhere(null, p, { ...pl, f: NO_FILT }, y, false);
    rows = await ctx.q<DenomRow>(`All ${pl.g.grants} in the place (denominator, link rate; research cube)`, `SELECT x.tax_year::int AS year, sum(x.usd)::float8 AS usd, sum(x.n)::int AS n,
       coalesce(sum(x.usd) FILTER (WHERE x.linked), 0)::float8 AS linked_usd, coalesce(sum(x.n) FILTER (WHERE x.linked), 0)::int AS linked_n,
       sum(x.gos_usd)::float8 AS gos_usd, sum(x.gos_n)::int AS gos_n
FROM ${pl.g.cube} x WHERE ${and(cw.where)}
GROUP BY GROUPING SETS ((x.tax_year), ()) ORDER BY 1 NULLS LAST`, p);
  } else {
    const w = [`g.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`, ...placeWhere(pl, p, "g.recipient_state", "g.county_fips"), ...gExtra(pl, p, "g")];
    rows = await ctx.q<DenomRow>(`All ${pl.g.grants} in the place (denominator, link rate)`, `SELECT g.tax_year AS year, sum(g.amount)::float8 AS usd, count(*)::int AS n,
       coalesce(sum(g.amount) FILTER (WHERE g.recipient_ein IS NOT NULL), 0)::float8 AS linked_usd, count(g.recipient_ein)::int AS linked_n,
       coalesce(sum(g.amount) FILTER (WHERE g.gos), 0)::float8 AS gos_usd, count(*) FILTER (WHERE g.gos)::int AS gos_n
FROM ${pl.g.clean} g WHERE ${and(w)}
GROUP BY GROUPING SETS ((g.tax_year), ()) ORDER BY 1 NULLS LAST`, p);
  }
  const total = rows.find((r) => r.year == null) ?? { year: null, usd: 0, n: 0, linked_usd: 0, linked_n: 0, gos_usd: 0, gos_n: 0 };
  return { years: rows.filter((r) => r.year != null), total };
}

// Restrict a grant query's WHERE to the cause (any tier) or, with no cause, to all clean grants; plus the filters.
function grantWhere(c: C | null, p: P, pl: Place, y: Years | { from: number; to: number }, linkedOnly: boolean, sfx = "") {
  const cs = causeSql(c, p, "g.recipient_ein", "g.recipient_ntee", sfx);
  const where = [...(linkedOnly || (c && !c.all) ? ["g.recipient_ein IS NOT NULL"] : []), `g.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`, ...cs.where, ...placeWhere(pl, p, "g.recipient_state", "g.county_fips"), ...filtGc(pl.f, p), ...gExtra(pl, p, "g")];
  return { cs, where };
}

// ------------------------------------------------------------------ building blocks: Form 990 lines
const FIELD: Record<string, { col: string; name: string; short: string }> = {
  government_grants: { col: "f.government_grants", name: "government grants reported on Form 990", short: "government grants" },
  contributions: { col: "f.contributions", name: "contributions reported on Form 990/990-EZ", short: "contributions" },
  revenue: { col: "f.revenue", name: "total revenue reported on Form 990/990-EZ", short: "revenue" },
};
type FlagSum = { orgs: number; full990: number; reporting: number; usd: number; primary_usd: number; revenue: number };
async function flagMoney(ctx: Ctx, c: Cause | null, pl: Place, year: number, source: string, title: string) {
  const fd = FIELD[source];
  const p = new P();
  const cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
  const where = [`f.tax_year = ${p.add(year)}`, "coalesce(f.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "f.state", "f.county_fips"), ...filtEin(pl.f, p, "f.ein")];
  const [r] = await ctx.q<FlagSum>(title, `SELECT count(*)::int AS orgs, count(*) FILTER (WHERE f.form = '990')::int AS full990,
       count(*) FILTER (WHERE coalesce(${fd.col}, 0) > 0)::int AS reporting,
       coalesce(sum(coalesce(${fd.col}, 0)), 0)::float8 AS usd, ${primarySum(cs, `coalesce(${fd.col}, 0)`)} AS primary_usd,
       coalesce(sum(f.revenue), 0)::float8 AS revenue
FROM flag_year f ${cs.join}
WHERE ${and(where)}`, p);
  return { cs, ...r };
}
async function orgUniverse(ctx: Ctx, c: Cause | null, pl: Place): Promise<number> {
  const p = new P();
  const cs = causeSql(c, p, "o.ein", "o.ntee_cd", "", true);
  const zip = pl.county || pl.area ? "LEFT JOIN zip_regions z ON z.zip5 = left(o.zip, 5)::char(5)" : "";
  const where = ["coalesce(o.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "o.state", "z.county_fips"), ...filtEin(pl.f, p, "o.ein")];
  const [r] = await ctx.q<{ n: number }>("Organizations in the set (IRS master file)", `SELECT count(*)::int AS n FROM orgs o ${cs.join} ${zip}
WHERE ${and(where)}`, p);
  return r.n;
}

// ------------------------------------------------------------------ the engine
// change / versus: what a premise is checked against (checkPremise), dropped before the answer is returned.
type Change = { subject: string; g: number; from: string; to: string };
type Versus = { first: string; second: string; a: number; z: number };
type Out = Omit<Answer, "question" | "spec" | "ms" | "queries" | "missing" | "status"> & { status?: Answer["status"]; change?: Change; versus?: Versus };

// v11: research layer (grant_cube, filters, breakdowns, cause taxonomy, DC note). v12: Schedule I charity grants,
// federal awards (USAspending), Census ACS (per person in poverty, county groups). v13: IRS 05B batches loaded
// (2025-26 returns the index files under 05A), so 2023-25 totals rose; Fidelity 2023 caveat dropped.
// v15: largest 1% by revenue (concentration), public_entity without private colleges, Form 990 lines and federal
// awards count a graded label's primary tier only, follow-up chips for breakdowns and federal answers.
// v16: grant-size medians and 90th percentiles from the size histograms (generosity-data 046).
// v18: premise check (spec.premise), keyword causes ignore passing mentions, single-organization note in state rankings.
const answerMemo = memo<Answer>("answer:v20", 500, 6 * 3600_000);
// opts.cube false: the original grant_clean queries, uncached (eval/answer-cube.mts compares both paths).
export function answer(question: string, spec: Spec, opts: { cube?: boolean } = {}): Promise<Answer> {
  const s = normalizeSpec(spec);
  if (opts.cube === false) return compute(question, s, false);
  return answerMemo(JSON.stringify(s), () => compute(question, s, true)).then((a) => ({ ...a, question }));
}

async function compute(question: string, s: Spec, cube: boolean): Promise<Answer> {
  const t0 = Date.now();
  const ctx = new Ctx(cube);
  const missing = [...new Set(s.missing)].map((m) => m === "other" ? { what: s.missingNote || "Part of the question", why: "It isn't in IRS nonprofit filings.", source: "Not in our data", url: "" } : MISSING_TEXT[m]).filter(Boolean);
  let out: Out;
  try {
    out = await run(ctx, s);
  } catch (e) {
    if (!(e instanceof Unanswerable)) throw e;
    out = { status: "unanswerable", headline: e.message, numbers: [], bullets: [], chart: null, rows: [], causeNote: "", method: "", caveats: [], coverage: [], sources: [], searchQuery: null };
    if (e.missing) missing.push(e.missing);
  }
  const premise = out.status === "unanswerable" ? null : checkPremise(s, out);
  delete out.change; delete out.versus;
  slim(out);
  const status: Answer["status"] = out.status ?? (missing.length ? "partial" : "ok");
  // Nothing answerable: lead with exactly what's missing, not a generic refusal.
  if (status === "unanswerable" && missing.length && s.metric === "none") out.headline = `${missing.map((m) => m.what).join(" and ")} ${missing.length > 1 || /s$/.test(missing[0].what) ? "aren't" : "isn't"} in our IRS data`;
  if (status === "unanswerable" && !missing.length) missing.push({ what: "This question", why: out.headline, source: "Not in our data", url: "" });
  // Causes without a graded label are counted by IRS codes or keywords: say so on the answer itself, not only in
  // "How we got this". Keywords is the rougher of the two, so it wins when both appear.
  const basis = /Approximate keyword set/.test(out.causeNote) ? "keywords" : /NTEE codes /.test(out.causeNote) ? "codes" : null;
  return { ...out, question, spec: s, status, missing, premise, basis, queries: ctx.queries, ms: Date.now() - t0 };
}

// A direction the question took as given ("why did education funding fall") against the computed change or
// comparison. When the data disagrees, the headline leads with a plain correction. Deterministic: the router
// only extracts the premise, the check and the wording are here. Under 1% counts as flat.
const FLAT = 0.01;
function checkPremise(s: Spec, out: Out): Answer["premise"] {
  const pm = s.premise;
  if (!pm) return null;
  if ((pm === "rise" || pm === "fall") && out.change) {
    const { subject, g, from, to } = out.change;
    const holds = pm === "rise" ? g >= FLAT : g <= -FLAT;
    const claim = `${subject} ${pm === "rise" ? "rose" : "fell"}`;
    if (holds) return { claim, holds };
    const actual = Math.abs(g) < FLAT ? `The total stayed about flat (${signed(g)}) from ${from} to ${to}` : `The total ${g > 0 ? "grew" : "fell"} ${pct(Math.abs(g))} from ${from} to ${to}`;
    const fix = `${cap(subject)} didn't ${pm}. ${actual}`;
    // A trend headline only restated the change: the correction replaces it. Other headlines follow it.
    out.headline = s.metric === "trend" ? fix : `${fix}. ${out.headline}`;
    return { claim, holds };
  }
  if ((pm === "more" || pm === "less") && out.versus) {
    const { first, second, a, z } = out.versus;
    const near = Math.abs(a - z) / Math.max(1, Math.max(a, z)) < FLAT;
    const holds = !near && (pm === "more" ? a > z : a < z);
    const lc = (x: string) => (/^[A-Z][a-z]/.test(x) ? x[0].toLowerCase() + x.slice(1) : x); // "Food banks" mid-sentence
    const claim = `${lc(first)} got ${pm} than ${lc(second)}`;
    if (holds) return { claim, holds };
    out.headline = `${cap(first)} didn't get ${pm} than ${lc(second)}${near ? ". They got about the same" : ""}. ${out.headline}`;
    return { claim, holds };
  }
  return null; // nothing in this answer to check it against
}

// One hero: at most 3 tiles, and at most 2 bullets that add something the headline and tiles don't say.
function slim(o: Out) {
  o.numbers = o.numbers.slice(0, 3);
  const tiles = new Set(o.numbers.map((n) => n.value));
  o.bullets = o.bullets.filter((bl) => {
    const nums = [...bl.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
    return !nums.some((n) => tiles.has(n)) && !(nums.length && nums.every((n) => o.headline.includes(n)));
  }).slice(0, 2);
}

class Unanswerable extends Error {
  constructor(msg: string, public missing?: Answer["missing"][number]) { super(msg); }
}

const GOV_CAVEAT = "Government grants as reported on recipients' Form 990 (Part VIII line 1e). Excludes direct federal awards to agencies, universities and companies, government contracts (fees for service are program revenue), and 990-EZ and 990-N filers.";
const PF_CAVEATS = (lr: { grants: number; dollars: number }) => [
  `Only private-foundation grants (990-PF). Community foundations and donor-advised funds are a separate source (Schedule I grants by charities). Corporate giving programs outside company foundations aren't public.`,
  `Recipients are identified for ${pct(lr.grants)} of 2022–24 grants to US organizations (${pct(lr.dollars)} of those dollars; grants to individuals, foreign recipients and placeholder lines are left out first). Cause totals count only identified recipients, so they run low.`,
];

const SI_CAVEATS = (lr: { grants: number; dollars: number }, cls: string | null) => [
  "Schedule I grants: what public charities filing Form 990 report giving to US organizations and governments, usually grants over $5,000. Private foundations are a separate source. Some filers list only part of their grants by recipient (2022–24: 93% of the grants they report in total; Silicon Valley Community Foundation 2022: $2.06B of $3.63B), so totals run low.",
  ...(cls === "daf_sponsor" ? ["DAF sponsor = a charity that holds donor-advised funds and whose DAF grants (Schedule D) are at least half of its Schedule I grants. Community foundations and United Ways are counted separately."] : []),
  ...(cls === "community_foundation" ? ["Community foundation = \"Community Foundation\", \"Community Fund\" or \"Community Trust\" in the name, or NTEE code T31 when DAF grants aren't most of its giving."] : []),
  ...(cls == null || cls === "daf_sponsor" || cls === "community_foundation" ? ["Schedule I doesn't say which grants a donor advised. DAF sponsors' grants are mostly DAF grants, and community foundations' mix DAF and their own grants."] : []),
  "Grants to another DAF sponsor, community foundation or United Way are left out, so the money isn't counted twice.",
  ...(cls == null || cls === "other" ? ["Amounts include goods given in kind (food banks, donated supplies) at the value the filer reports."] : []),
  `Recipients are identified for ${pct(lr.grants)} of 2022–24 Schedule I grants (${pct(lr.dollars)} of those dollars). Cause totals count only identified recipients.`,
];
async function grantCaveats(pl: Place): Promise<string[]> {
  const lr = await linkRate(pl.g);
  return pl.g.kind === "pf" ? PF_CAVEATS(lr) : SI_CAVEATS(lr, pl.g.cls);
}

async function run(ctx: Ctx, s0: Spec): Promise<Out> {
  if (s0.metric === "none") throw new Unanswerable("Our IRS data can't answer this question.");
  const s = await resolveCauses(s0);
  const pl = await resolvePlace(s);
  if (s.county && !pl.county) throw new Unanswerable(`We couldn't find a county named "${s.county}"${s.states.length ? ` in ${s.states.join(", ")}` : ""}.`);
  const out = await dispatch(ctx, s, pl);
  // Filters: say what they mean. Funder and recipient-kind filters exist only for foundation grants.
  if (s.source !== "foundation_grants" && (s.funderSize || s.funderType || s.recipientKind)) out.caveats = ["Foundation size, foundation type and recipient kind apply only to foundation grants, so they're not applied here.", ...out.caveats];
  else if (hasFilt(pl.f)) out.caveats = [...pl.f.notes, ...out.caveats];
  return out;
}

async function dispatch(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  if (s.source === "federal_awards") {
    if (s.metric === "count_orgs") return countOrgs(ctx, s, pl);
    if (s.metric === "by_rurality" || (s.metric === "breakdown" && s.by === "rurality")) return byCountyGroup(ctx, { ...s, by: "rurality" as Spec["by"] }, pl);
    if (s.by && ACS_BANDS[s.by]) return byCountyGroup(ctx, s, pl);
    return federal(ctx, s, pl);
  }
  // "The largest 1% of nonprofits": by revenue (or contributions, government grants) on Form 990, and,
  // for grant sources split by recipient size, the grant money those largest orgs receive.
  if (s.metric === "concentration" && !isGrantSrc(s)) return flagConcentration(ctx, s, pl);
  if (s.metric === "concentration" && s.by === "recipient_size") return sizeConcentration(ctx, s, pl);
  const gm = ["top_funders", "out_of_state", "grant_size", "general_support", "concentration", "overlap_funders", "fastest_causes"];
  if (!isGrantSrc(s) && gm.includes(s.metric)) {
    // Form 990 reports one government-grants (or contributions) total per org: no funder, grant or purpose.
    const why = s.source === "government_grants"
      ? "Form 990 reports government grants as one total per organization. It doesn't name the agency, the grants or their purpose."
      : "Form 990 reports contributions as one total per organization, without donors or gift sizes.";
    if (s.metric === "top_funders" || s.metric === "overlap_funders") {
      const sub = await run(ctx, { ...s, metric: "top_recipients" });
      return { ...sub, status: "partial", caveats: [why, ...sub.caveats] };
    }
    throw new Unanswerable(why, s.source === "government_grants" ? MISSING_TEXT.federal_awards : undefined);
  }
  // Breakdowns that an existing metric already answers, and grant size split by a dimension.
  if (isGrantSrc(s)) {
    if (s.metric === "grant_size" && s.by) return breakdown(ctx, { ...s, metric: "breakdown", measure: "average_grant" }, pl);
    if (s.metric === "by_state" && s.measure) return breakdown(ctx, { ...s, metric: "breakdown", by: "state" }, pl);
    if (s.metric === "breakdown" && s.by === "state" && !s.measure) return byState(ctx, s, pl);
  }
  if (s.metric === "breakdown" && s.by === "rurality") return byRurality(ctx, s, pl);
  if (s.by && ACS_BANDS[s.by]) return byCountyGroup(ctx, s, pl);
  switch (s.metric) {
    case "breakdown":
      if (!isGrantSrc(s)) throw new Unanswerable("Breakdowns by cause, size, funder or county cover foundation and charity grants only. Form 990 lines have no funder or grant detail.");
      return breakdown(ctx, s, pl);
    case "total": case "share": case "compare": case "trend":
      return isGrantSrc(s) ? foundationTotal(ctx, s, pl) : flagTotal(ctx, s, pl);
    case "fastest_causes": return fastestCauses(ctx, s, pl);
    case "by_state": return byState(ctx, s, pl);
    case "by_rurality": return byRurality(ctx, s, pl);
    case "top_funders": return topFunders(ctx, s, pl);
    case "top_recipients": return topRecipients(ctx, s, pl);
    case "out_of_state": return outOfState(ctx, s, pl);
    case "grant_size": return grantSize(ctx, s, pl);
    case "general_support": return generalSupport(ctx, s, pl);
    case "concentration": return concentration(ctx, s, pl);
    case "overlap_funders": return overlap(ctx, s, pl);
    case "count_orgs": return countOrgs(ctx, s, pl);
    default: throw new Unanswerable("Our IRS data can't answer this question.");
  }
}

// The cause as named, plus the recipient-side filter when there is one ("arts (organizations with under $1M in revenue)").
const causeName = (c: Cause | null, pl?: Place) => {
  const base = c ? c.name : pl?.f.to || "all causes";
  return c && pl?.f.to ? `${base} (${pl.f.to})` : base;
};
const searchFor = (s: Spec, pl: Place) => (s.causes[0] ? `${s.causes[0].name}${pl.county ? ` in ${pl.county.name}, ${pl.county.state}` : s.states.length === 1 ? ` in ${stateName(s.states[0])}` : ""}` : null);

// Residents of the place (Census 2024 county estimates), for per-resident figures.
async function placePop(ctx: Ctx, pl: Place): Promise<number> {
  const p = new P();
  const w = ["county_fips <> '00000'", ...placeWhere(pl, p, "state", "county_fips")];
  const [r] = await ctx.q<{ pop: number }>("Population of the place (Census 2024)", `SELECT coalesce(sum(population), 0)::float8 AS pop FROM county_need WHERE ${and(w)}`, p);
  return r?.pop ?? 0;
}
// Grants are placed at the recipient's address. DC hosts many national organizations' headquarters, so its
// totals and per-resident figures run far above any state. Shown, flagged, never dropped.
const HQ_CAVEAT = "Grants are counted where the recipient is headquartered, not where the work happens. National groups' head offices pull money toward DC, New York and other hubs.";
const DC_NOTE = "DC is an outlier: many national organizations are headquartered there, and it has few residents, so its totals and per-resident figures run far above any state. It's shown, not removed.";
const DC_NOTE_SHORT = "Outlier: national groups' headquarters";

// The subject of a filtered question with no cause ("organizations under $1M", "family-named foundations"):
// all causes, restricted by the filters only.
const subjectOf = (pl: Place): C => ({ name: pl.f.to || "all causes", label: null, ntee: [], keywords: [], all: true });
// Who gave: "Foundations", or the funder group the question names.
const whoGave = (pl: Place) => (pl.f.from ? cap(pl.f.from) : pl.g.who);
// Identified-recipient dollars from the funder group alone (no cause, no recipient filters): the share base
// when a question names a funder group ("what share of family foundations' giving goes to religion").
async function funderGroupBase(ctx: Ctx, pl: Place, y: Years): Promise<number> {
  const p = new P();
  const fp: Place = { ...pl, f: { ...NO_FILT, fb: pl.f.fb, ftype: pl.f.ftype } };
  if (cubeOk(ctx, null, fp)) {
    const cw = cubeWhere(null, p, fp, y, true);
    const [r] = await ctx.q<{ usd: number }>("All identified grant dollars from the foundation group (share base; research cube)", `SELECT coalesce(sum(x.usd), 0)::float8 AS usd FROM grant_cube x WHERE ${and(cw.where)}`, p);
    return r.usd;
  }
  const gw = grantWhere(null, p, fp, y, true);
  const [r] = await ctx.q<{ usd: number }>("All identified grant dollars from the foundation group (share base)", `SELECT coalesce(sum(g.amount), 0)::float8 AS usd FROM grant_clean g WHERE ${and(gw.where)}`, p);
  return r.usd;
}
// Share base: identified recipients' dollars, or all grant dollars when the subject includes unidentified
// recipients (school districts and colleges are mostly matched without an EIN).
const allBase = (pl: Place, c: C | null) => !!(c?.all && !pl.f.rb && !(pl.f.kinds && pl.f.kinds.every((k) => k === "nonprofit")));

// ---- total / share / compare / trend, foundation grants
async function foundationTotal(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const y = grantYears(s);
  const causes: (C | null)[] = s.causes.length ? s.causes.slice(0, s.metric === "compare" ? 2 : 1) : [hasFilt(pl.f) ? subjectOf(pl) : null];
  const [den, gcav, ...ms] = await Promise.all([fDenom(ctx, pl, y), grantCaveats(pl), ...causes.map((c) => c ? fMoney(ctx, c, pl, y, `${cap(pl.g.grants)} to ${c.name}, by tax year`) : null)]);
  const caveats: string[] = [];
  const notes = await Promise.all(causes.map((c, i) => causeNote(c, ms[i]?.cs ?? causeSql(null, new P(), "", ""), caveats)));
  if (y.note) caveats.push(y.note);
  if (y.partial) caveats.push(`${G_LAST} returns are still arriving, so ${G_LAST} is incomplete.`);
  caveats.push(...gcav);
  const fullYears = y.full.length || 1;
  const placeLinkRate = den.total.usd ? den.total.linked_usd / den.total.usd : 0;
  const coverage = [
    { label: "Grants counted", value: int(den.total.n) },
    { label: "Recipients identified here", value: `${pct(den.total.linked_n / Math.max(1, den.total.n))} of grants, ${pct(placeLinkRate)} of $` },
  ];
  const yr = yrs(y.from, y.to);
  const where = pl.label;

  if (!causes[0]) {
    // All foundation money in a place.
    const vals = den.years.map((r) => ({ year: yearLabel(r.year!), usd: r.usd }));
    const u = unit(Math.max(...vals.map((v) => v.usd), 1));
    const fullSum = den.years.filter((r) => r.year! <= G_FULL).reduce((a, r) => a + r.usd, 0);
    const first = den.years.find((r) => r.year === y.full[0]), last = den.years.find((r) => r.year === y.full.at(-1));
    const growth = first && last && first !== last ? last.usd / first.usd - 1 : null;
    const pop0 = s.perResident || pl.states.includes("DC") ? await placePop(ctx, pl) : 0;
    if (pl.states.includes("DC")) caveats.push(DC_NOTE);
    return {
      headline: `${pl.g.who} gave ${money(den.total.usd)} to organizations in ${where}, ${yr}${pop0 > 0 ? `: ${perRes(fullSum / fullYears / pop0)} per resident a year` : ""}`,
      numbers: [{ value: money(den.total.usd), label: `${pl.g.grants}, ${yr}` }, ...(pop0 > 0 ? [{ value: perRes(fullSum / fullYears / pop0), label: "per resident a year", note: pl.states.includes("DC") ? DC_NOTE_SHORT : undefined }] : []), { value: money(fullSum / fullYears), label: "a year (full years)" },
        ...(growth != null ? [{ value: signed(growth), label: `${y.full[0]} to ${y.full.at(-1)}` }] : [])],
      bullets: [`${b(money(fullSum / fullYears))} a year in ${pl.g.kind === "pf" ? "private-foundation grants" : pl.g.grants} to ${where}`,
        `${b(int(den.total.n))} grants counted, all recipients, by recipient address`,
        ...(growth != null ? [`Grant dollars changed ${b(signed(growth))} from ${y.full[0]} to ${y.full.at(-1)}`] : [])],
      chart: { title: `${cap(pl.g.grants)} to ${where}, by tax year`, sub: u.title, spec: vbar(vals.map((v) => ({ year: v.year, amount: +(v.usd / u.div).toFixed(3) })), "year", "amount", "Tax year", u.title, u.fmt) },
      rows: den.years.map((r) => ({ tax_year: r.year, grants_usd: r.usd, grants: r.n, linked_usd: r.linked_usd })),
      causeNote: notes[0], coverage, caveats,
      method: `Sum of ${pl.g.form} paid in tax years ${yr} to US organizations in ${where} (by the recipient's address), excluding grants to individuals, unitemized lines, foreign recipients and transfers to other private foundations${pl.g.kind === "charity" ? " and to other DAF sponsors, community foundations and United Ways" : ""}.`,
      sources: [pl.g.src], searchQuery: null,
      ...(growth != null ? { change: { subject: `${pl.g.money} to organizations in ${where}`, g: growth, from: String(y.full[0]), to: String(y.full.at(-1)) } } : {}),
    };
  }

  // One or two causes.
  const label = causes.map((c) => c!.label != null);
  const rowsOut: Row[] = [];
  const series: Row[] = [];
  causes.forEach((c, i) => {
    const m = ms[i]!;
    for (const r of m.years) {
      const d = den.years.find((x) => x.year === r.year);
      rowsOut.push({ cause: c!.name, tax_year: r.year, usd: r.usd, primary_usd: label[i] ? r.primary_usd : null, recipients: r.orgs, funders: r.funders, share_of_linked: d ? r.usd / d.linked_usd : null });
      if (causes.length === 1 && label[i]) {
        series.push({ year: yearLabel(r.year!), tier: "Main purpose (primary)", usd: r.primary_usd });
        series.push({ year: yearLabel(r.year!), tier: "One program among others (partial)", usd: r.usd - r.primary_usd });
      } else series.push({ year: yearLabel(r.year!), tier: c!.name, usd: label[i] ? r.primary_usd : r.usd });
    }
  });
  const u = unit(Math.max(...series.map((v) => Number(v.usd)), 1));
  const chartVals = series.map((v) => ({ ...v, amount: +(Number(v.usd) / u.div).toFixed(3) }));
  const m0 = ms[0]!, c0 = causes[0]!;
  const floor0 = label[0] ? m0.total.primary_usd : m0.total.usd;
  // Share base: all grants (subject includes unidentified recipients), the named foundation group's
  // identified grants, or all identified grants.
  const wide = allBase(pl, c0);
  const group = !wide && !!(pl.f.fb || pl.f.ftype);
  const baseUsd = wide ? den.total.usd : group ? await funderGroupBase(ctx, pl, y) : den.total.linked_usd;
  const ofWhat = wide ? `all ${pl.g.adj} grant` : group ? "these foundations' identified grant" : `identified ${pl.g.adj} grant`;
  const share0 = floor0 / Math.max(1, baseUsd);
  const who = whoGave(pl);
  const entities = !!pl.f.kinds && !pl.f.kinds.includes("nonprofit");
  const fullYearSum = (m: typeof m0, prim: boolean) => m.years.filter((r) => r.year! <= G_FULL).reduce((a, r) => a + (prim ? r.primary_usd : r.usd), 0);
  const perYear0 = fullYearSum(m0, label[0]) / fullYears;
  const pop = s.perResident ? await placePop(ctx, pl) : 0;
  const perResTile = pop > 0 ? [{ value: perRes(perYear0 / pop), label: "per resident a year" }] : [];
  const firstLast = (m: typeof m0, prim: boolean) => {
    const a = m.years.find((r) => r.year === y.full[0]), z = m.years.find((r) => r.year === y.full.at(-1));
    return a && z && a !== z ? (prim ? z.primary_usd / a.primary_usd : z.usd / a.usd) - 1 : null;
  };
  const denGrowth = (() => { const a = den.years.find((r) => r.year === y.full[0]), z = den.years.find((r) => r.year === y.full.at(-1)); return a && z && a !== z ? z.linked_usd / a.linked_usd - 1 : null; })();
  const upper = label[0] ? ` (up to ${money(m0.total.usd)} with partial)` : "";
  const method = `Sum of ${pl.g.form} paid in tax years ${yr} to identified recipients in ${where} (by the recipient's address) whose organization is in the cause set. Share = over all identified-recipient grant dollars in the same place and years${pl.g.kind === "charity" ? ` from the same ${pl.g.givers}` : ""}. Grants to individuals, unitemized lines, foreign recipients and other private foundations are excluded${pl.g.kind === "charity" ? ", and so are grants to other DAF sponsors, community foundations and United Ways" : ""}.`;
  const chart = { title: `${cap(pl.g.grants)} to ${causes.map((c) => c!.name).join(" vs ")}${where !== "the US" ? ` in ${where}` : ""}, by tax year`, sub: u.title, spec: vbar(chartVals, "year", "amount", "Tax year", u.title, u.fmt, causes.length > 1 || label[0] ? "tier" : undefined) };
  const base = { chart, rows: rowsOut, causeNote: notes.join(" "), coverage, caveats, method, orgCount: m0.total.orgs, sources: [pl.g.src, ...(causes.some((c) => c?.label) ? [SRC.labels] : []), ...(causes.some((c) => c?.ntee.length) ? [SRC.ntee] : [])], searchQuery: searchFor(s, pl) };

  if (s.metric === "compare" && causes.length === 2) {
    const m1 = ms[1]!;
    const v = (i: number) => (label[i] ? ms[i]!.total.primary_usd : ms[i]!.total.usd);
    const [a, z] = [v(0), v(1)];
    const big = a >= z ? 0 : 1;
    const ratio = Math.max(a, z) / Math.max(1, Math.min(a, z));
    return {
      ...base,
      headline: ratio >= 1.95
        ? `${cap(causes[big]!.name)} got ${ratio.toFixed(ratio >= 10 ? 0 : 1)}x the ${pl.g.adj} dollars of ${causes[1 - big]!.name}, ${yr}`
        : `${cap(causes[big]!.name)} got ${pct(ratio - 1)} more ${pl.g.money} than ${causes[1 - big]!.name.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())}, ${yr}`,
      numbers: [{ value: money(a), label: `${causes[0]!.name}${label[0] ? " (primary)" : ""}` }, { value: money(z), label: `${causes[1]!.name}${label[1] ? " (primary)" : ""}` },
        { value: `${pct(a / baseUsd)} vs ${pct(z / baseUsd)}`, label: `share of ${ofWhat.replace(/^identified \S+( sponsor| foundation| Way)?/, "identified")} $` }],
      bullets: [`${b(money(a))} to ${causes[0]!.name}, ${b(pct(a / baseUsd))} of ${ofWhat.replace(/^identified \S+( sponsor| foundation| Way)?/, "identified")} dollars`,
        `${b(money(z))} to ${causes[1]!.name}, ${b(pct(z / baseUsd))}`,
        `${b(int(m0.total.funders))} and ${b(int(m1.total.funders))} ${pl.g.givers} funded each`],
      versus: { first: causes[0]!.name, second: causes[1]!.name, a, z },
    };
  }

  if (s.metric === "trend") {
    const g = firstLast(m0, label[0]);
    // Both lines as change since the first full year, so the cause reads against all foundation grants.
    const y0 = m0.years.find((r) => r.year === y.full[0]), d0 = den.years.find((r) => r.year === y.full[0]);
    const idx: Row[] = y0 && d0 ? y.full.flatMap((yy) => {
      const r = m0.years.find((x) => x.year === yy), d = den.years.find((x) => x.year === yy);
      if (!r || !d) return [];
      const v = label[0] ? r.primary_usd / y0.primary_usd : r.usd / y0.usd;
      return [{ year: String(yy), series: cap(c0.name), change: +(v - 1).toFixed(4) }, { year: String(yy), series: `All ${pl.g.grants}`, change: +(d.linked_usd / d0.linked_usd - 1).toFixed(4) }];
    }) : [];
    return {
      ...base,
      chart: idx.length ? { title: `Change since ${y.full[0]}: ${c0.name} vs all ${pl.g.grants}`, sub: "Percent change", spec: trendSpec(idx, cap(c0.name), `All ${pl.g.grants}`) } : base.chart,
      headline: g == null ? `${cap(pl.g.grants)} to ${c0.name}: ${money(floor0)} in ${yr}` : `${cap(pl.g.money)} for ${c0.name} ${g >= 0 ? "grew" : "fell"} ${pct(Math.abs(g))} from ${y.full[0]} to ${y.full.at(-1)}`,
      numbers: [...(g != null ? [{ value: signed(g), label: `${y.full[0]} to ${y.full.at(-1)}${label[0] ? ", primary" : ""}` }] : []),
        { value: money(perYear0), label: `a year${label[0] ? ", primary" : ""}` },
        { value: int(m0.total.orgs), label: "recipient orgs" }],
      bullets: [denGrowth != null && g != null ? `All ${pl.g.grants} ${denGrowth >= 0 ? "grew" : "fell"} ${b(pct(Math.abs(denGrowth)))} over the same years` : "",
        `${b(int(m0.total.funders))} ${pl.g.givers} gave to ${c0.name}${upper ? `, ${b(money(fullYearSum(m0, false) / fullYears))} a year counting partial` : ""}`].filter(Boolean),
      ...(g != null ? { change: { subject: `${pl.g.money} for ${c0.name}`, g, from: String(y.full[0]), to: String(y.full.at(-1)) } } : {}),
    };
  }

  return {
    ...base,
    headline: `${who} gave ${money(floor0)} to ${c0.name}${where !== "the US" ? ` in ${where}` : ""}, ${yr}: ${pct(share0)} of ${wide ? "all" : group ? "their identified" : "identified"} grant dollars`,
    numbers: [{ value: money(floor0), label: `${label[0] ? "primary, " : ""}${yr}`, note: upper ? upper.trim().replace(/^\(|\)$/g, "") : undefined },
      ...perResTile,
      { value: pct(share0), label: `of ${ofWhat} $` },
      { value: money(perYear0), label: "a year" },
      ...(entities ? [] : [{ value: int(m0.total.orgs), label: "recipient orgs" }])],
    bullets: [`${b(money(perYear0))} a year to ${c0.name}${label[0] ? ` as a main purpose, ${b(money(fullYearSum(m0, false) / fullYears))} with partial` : ""}`,
      `${b(pct(share0))} of ${ofWhat} dollars${where !== "the US" ? ` in ${where}` : ""}`,
      // School districts and public colleges are matched by name, mostly without an EIN: count funders only.
      entities ? `${b(int(m0.total.funders))} ${pl.g.givers} gave to them` : `${b(int(m0.total.funders))} ${pl.g.givers} funded ${b(int(m0.total.orgs))} organizations`],
    ...((g0 => g0 != null ? { change: { subject: `${pl.g.money} for ${c0.name}`, g: g0, from: String(y.full[0]), to: String(y.full.at(-1)) } } : {})(firstLast(m0, label[0]))),
  };
}

// ---- breakdown: foundation grants split by one dimension (research layer)
const R_NAMES = ["Under $100K", "$100K to $500K", "$500K to $1M", "$1M to $5M", "$5M to $10M", "$10M to $50M", "$50M to $100M", "$100M and up"];
const F_NAMES = ["Under $1M", "$1M to $10M", "$10M to $50M", "$50M to $100M", "$100M to $1B", "$1B and up"];
const BY_TITLE: Record<string, string> = { state: "state", county: "county", cause: "cause area (NTEE major group)", cause_detail: "NTEE code", recipient_size: "recipient revenue", funder_size: "foundation assets", funder_type: "foundation type", recipient_kind: "recipient kind", year: "tax year", charity_funder: "funder group" };
const ORDINAL = new Set(["recipient_size", "funder_size", "year"]);
async function breakdown(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  let by = s.by ?? "cause";
  const c: C | null = s.causes[0] ?? null;
  if (by === "cause" && c) by = "cause_detail"; // "which kinds of health orgs": codes inside the cause
  if (by === "county" && pl.county) throw new Unanswerable("Pick a state or the whole US to rank counties.");
  if (pl.g.kind === "charity" && ["funder_size", "funder_type", "recipient_kind"].includes(by)) throw new Unanswerable("Splits by foundation size, foundation type or recipient kind cover foundation grants only. Charity grants split by funder group instead (DAF sponsors, community foundations, United Ways).");
  if (pl.g.kind === "pf" && by === "charity_funder") throw new Unanswerable("Funder groups (DAF sponsors, community foundations, United Ways) come from Schedule I grants by charities, not foundation grants.");
  const measure = s.measure ?? "dollars";
  const y = grantYears(s);
  // Identified recipients only when the dimension or the cause needs the recipient's EIN.
  const linked = !!c || ["cause", "cause_detail", "recipient_size"].includes(by);
  const p = new P();
  let sql: string, cs: CauseSql;
  if (by === "county" && ctx.cube && pl.g.kind === "pf" && !hasFilt(pl.f) && (!c || (!c.label && c.ntee.length > 0 && c.ntee.every((n) => n.length === 1)))) {
    cs = causeSql(c, new P(), "", "");
    const w = [`cy.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`, "cy.county_fips IS NOT NULL", ...(linked ? ["cy.linked"] : []), ...(c ? [`cy.ntee_major = ANY(${p.add(c.ntee)}::text[])`] : []), ...placeWhere({ ...pl, county: null }, p, "cy.recipient_state", "cy.county_fips")];
    sql = `SELECT cy.county_fips AS k, sum(cy.usd)::float8 AS usd, sum(cy.usd)::float8 AS primary_usd, sum(cy.n)::int AS n, sum(cy.n)::int AS primary_n
FROM grant_county_year cy WHERE ${and(w)} GROUP BY 1`;
  } else if (by !== "county" && cubeOk(ctx, c, pl)) {
    cs = causeSql(c, new P(), "", "");
    const cw = cubeWhere(c, p, pl, y, linked);
    const dim: Record<string, string> = { state: "x.recipient_state", cause: "coalesce(left(x.ntee3, 1), '?')", cause_detail: "coalesce(x.ntee3, '?')", recipient_size: "x.recipient_band::text", funder_size: "x.funder_band::text", funder_type: "x.funder_type", recipient_kind: "x.recipient_kind", year: "x.tax_year::text", charity_funder: "x.funder_class" };
    sql = `SELECT ${dim[by]} AS k, coalesce(sum(x.usd), 0)::float8 AS usd, ${cubeSum(cw)} AS primary_usd, coalesce(sum(x.n), 0)::int AS n, ${cubeSum(cw, "n")}::int AS primary_n
FROM ${pl.g.cube} x WHERE ${and(cw.where)} GROUP BY 1`;
  } else {
    const gw = grantWhere(c, p, pl, y, linked);
    cs = gw.cs;
    const dim: Record<string, string> = { state: "g.recipient_state", county: "g.county_fips", cause: "coalesce(left(g.recipient_ntee, 1), '?')", cause_detail: "coalesce(left(g.recipient_ntee, 3), '?')", recipient_size: "rp.band::text", funder_size: "fp.asset_band::text", funder_type: "fp.funder_type", recipient_kind: "CASE WHEN pe.kind IS NOT NULL THEN pe.kind WHEN g.recipient_ein IS NOT NULL THEN 'nonprofit' ELSE 'unidentified' END", year: "g.tax_year::text", charity_funder: "g.funder_class" };
    const joins = by === "recipient_size" ? "LEFT JOIN recipient_profile rp ON rp.ein = g.recipient_ein" : by === "funder_size" || by === "funder_type" ? "LEFT JOIN funder_profile fp ON fp.ein = g.funder_ein" : by === "recipient_kind" ? "JOIN grants gr ON gr.id = g.id LEFT JOIN public_entities pe ON pe.id = gr.recipient_entity" : "";
    const tierN = cs.tier ? `(count(*) FILTER (WHERE ${cs.tier} = 'primary'))::int` : "count(*)::int";
    sql = `SELECT ${dim[by]} AS k, sum(g.amount)::float8 AS usd, ${primarySum(cs, "g.amount")} AS primary_usd, count(*)::int AS n, ${tierN} AS primary_n
FROM ${pl.g.clean} g ${cs.join} ${joins}
WHERE ${and([...gw.where, ...(by === "county" ? ["g.county_fips IS NOT NULL"] : [])])} GROUP BY 1`;
  }
  const raw = await ctx.q<{ k: string | null; usd: number; primary_usd: number; n: number; primary_n: number }>(`${cap(pl.g.grants)} by ${BY_TITLE[by]}${ctx.cube && !/grant_clean/.test(sql) ? " (research layer)" : ""}`, sql, p);
  const caveats: string[] = [];
  const note = await causeNote(c, cs, caveats);
  const isLabel = !!c?.label;
  const names = by === "cause_detail" ? (await taxonomy()).names : null;
  // Places: names and population for per-resident figures.
  let place = new Map<string, { name: string; pop: number }>();
  if (by === "state" || by === "county") {
    const pp = new P();
    const col = s.perPoverty ? "a.people_in_poverty" : "n.population";
    const r = await ctx.q<{ k: string; name: string; pop: number }>(s.perPoverty ? "People in poverty (Census ACS 2020-24)" : "Population (Census 2024)", by === "state"
      ? `SELECT n.state AS k, n.state AS name, sum(${col})::float8 AS pop FROM county_need n LEFT JOIN county_acs a USING (county_fips) WHERE n.county_fips <> '00000' GROUP BY 1`
      : `SELECT n.county_fips AS k, n.name || ', ' || n.state AS name, ${col}::float8 AS pop FROM county_need n LEFT JOIN county_acs a USING (county_fips) WHERE n.county_fips <> '00000'`, pp);
    place = new Map(r.map((x) => [x.k, { name: by === "state" ? stateName(x.k) : x.name, pop: x.pop }]));
  }
  const nameOf = (k: string | null): string => {
    if (k == null) return by === "recipient_size" ? "Revenue unknown" : by === "funder_size" ? "Assets unknown" : "Unknown";
    switch (by) {
      case "state": case "county": return place.get(k)?.name ?? k;
      case "cause": return k === "?" ? "No NTEE code" : `${nteeLabel(k) ?? k} (${k})`;
      case "cause_detail": return k === "?" ? "No NTEE code" : `${names?.get(k) ?? nteeLabel(k) ?? k} (${k})`;
      case "recipient_size": return R_NAMES[Number(k) - 1] ?? k;
      case "funder_size": return F_NAMES[Number(k) - 1] ?? k;
      case "funder_type": return cap(FTYPE_NAME[k] ?? k);
      case "recipient_kind": return cap(KIND_NAME[k] ?? k);
      case "year": return yearLabel(Number(k));
      case "charity_funder": return CLASS_NAME[k]?.[0] ?? k;
      default: return k;
    }
  };
  const nYears = y.to - y.from + 1;
  const per = (s.perResident || s.perPoverty) && (by === "state" || by === "county");
  const perWord = s.perPoverty ? "per person in poverty" : "per resident";
  const MIN_N = 30; // averages over fewer grants are left out of the ranking
  const groups = raw.map((r) => {
    const usd = isLabel ? r.primary_usd : r.usd, n = isLabel ? r.primary_n : r.n;
    const pop = r.k != null ? place.get(r.k)?.pop ?? 0 : 0;
    const v = measure === "grants" ? n : measure === "average_grant" ? (n ? usd / n : 0) : per ? (pop ? usd / pop / nYears : 0) : usd;
    return { k: r.k, name: nameOf(r.k), usd, n, avg: n ? usd / n : 0, pop, v };
  }).filter((g) => (measure !== "average_grant" || g.n >= MIN_N) && (!per || g.pop > 0) && !(by === "state" && g.k != null && !place.has(g.k)));
  if (!groups.length) throw new Unanswerable(`No ${pl.g.grants} found for ${causeName(c, pl)} in ${pl.label}.`);
  const totalUsd = groups.reduce((a, g) => a + g.usd, 0), totalN = groups.reduce((a, g) => a + g.n, 0);
  const ranked = [...groups].sort((a, z) => (s.order === "least" ? a.v - z.v : z.v - a.v) || String(a.k).localeCompare(String(z.k)));
  const shown = ORDINAL.has(by) ? [...groups].sort((a, z) => (a.k == null ? 1 : z.k == null ? -1 : Number(a.k) - Number(z.k))) : ranked.slice(0, 12);
  const top = ranked[0];
  const fmtV = (x: number) => (measure === "grants" ? int(x) : per ? perRes(x) : money(x));
  const what = measure === "grants" ? pl.g.grants : measure === "average_grant" ? `average ${pl.g.adj} grant` : per ? `${pl.g.money} ${perWord}` : pl.g.money;
  const forX = c ? ` for ${c.name}` : pl.f.to ? ` to ${pl.f.to}` : "";
  const fromX = pl.f.from ? ` from ${pl.f.from}` : "";
  const inX = pl.label !== "the US" ? ` in ${pl.label}` : "";
  const yr = yrs(y.from, y.to);
  // Places: counted where headquartered, DC flagged when it stands out.
  if (by === "state" || by === "county") caveats.push(HQ_CAVEAT);
  const sortedV = groups.filter((g) => g.k !== "DC").map((g) => g.v).sort((a, z) => a - z);
  const median = sortedV[Math.floor(sortedV.length / 2)] ?? 0;
  const dcAt = by === "state" ? ranked.findIndex((g) => g.k === "DC") : -1;
  const dcOutlier = dcAt >= 0 && ranked.length > 3 && (dcAt < 3 || ranked[dcAt].v > 3 * median);
  if (dcOutlier) caveats.unshift(DC_NOTE);
  const nextNonDc = ranked.find((g) => g.k !== "DC");
  if (by === "cause" || by === "cause_detail") caveats.push("Grouped by the recipient's NTEE code as the IRS assigned it. Unidentified recipients have no code and are left out.");
  if (by === "recipient_size") caveats.push("Recipient revenue = newest e-filed 990 or 990-EZ, else the IRS master file. Revenue unknown = mostly small 990-N filers.");
  if (by === "funder_size") caveats.push("Foundation assets = fair market value on its newest 990-PF, not the grant year.");
  if (by === "funder_type") caveats.push("The IRS doesn't flag family or company foundations. Family-named = \"Family\" in the name, a floor.");
  if (by === "recipient_kind") caveats.push("School districts and colleges are matched from the grant's recipient name and address to NCES and IPEDS lists.");
  if (measure === "average_grant") caveats.push(`Averages leave out groups with fewer than ${MIN_N} grants. One row per grant line on a ${pl.g.kind === "pf" ? "990-PF" : "Schedule I"}, so installments count separately.`);
  if (by === "charity_funder") caveats.push("Funder groups come from each charity's name, NTEE code and Schedule D donor-advised fund lines. A DAF sponsor's DAF grants are at least half of its Schedule I grants.");
  if (y.partial) caveats.push(`${G_LAST} returns are still arriving, so ${G_LAST} is incomplete.`);
  caveats.push(...(await grantCaveats(pl)));
  const most = s.order === "least" ? "least" : "most";
  const verb = measure === "average_grant" ? (s.order === "least" ? "smallest" : "largest") : most;
  const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  // The leading group as a subject that reads in a sentence ("Foundations with $1B and up in assets gave the most").
  const lead = (g: { k: string | null; name: string }) => {
    if (g.k == null) return { who: g.name, gave: false };
    if (by === "funder_size") return { who: `Foundations with ${lower(g.name)} in assets`, gave: true };
    if (by === "funder_type" || by === "charity_funder") return { who: g.name, gave: true };
    if (by === "recipient_size") return { who: `Organizations with ${lower(g.name)} in revenue`, gave: false };
    if (by === "year") return { who: `Tax year ${g.name}`, gave: false };
    return { who: g.name, gave: false };
  };
  const topLead = lead(ranked[0]);
  const sentence = measure === "average_grant"
    ? `${topLead.who} ${topLead.gave ? "made" : "got"} the ${verb} average ${pl.g.adj} grant${forX}`
    : `${topLead.who} ${topLead.gave ? "gave" : "got"} the ${most} ${topLead.gave && pl.g.kind === "charity" ? (measure === "grants" ? "grants" : per ? `money ${perWord}` : "money") : measure === "grants" ? pl.g.grants : per ? `${pl.g.money} ${perWord}` : pl.g.money}${topLead.gave ? (forX || "") : `${forX}${fromX}`}`;
  const share = (g: { usd: number }) => g.usd / Math.max(1, totalUsd);
  const dcTag = (g: { k: string | null }) => (dcOutlier && g.k === "DC" ? DC_NOTE_SHORT : undefined);
  const u = unit(Math.max(...shown.map((g) => g.v), 1));
  const chartV = (x: number) => (measure === "dollars" && !per ? +(x / u.div).toFixed(3) : measure === "grants" ? x : +x.toFixed(2));
  const axis = measure === "dollars" && !per ? u.title : measure === "grants" ? "Grants" : "$";
  const fmt = measure === "dollars" && !per ? u.fmt : measure === "grants" ? ",.0f" : "$,.0f";
  // Recipient kinds: identified nonprofits always lead, so lead with the schools and colleges people ask about.
  const ents = by === "recipient_kind" ? ["school_district", "college_public", "college_private"].map((k) => groups.find((g) => g.k === k)).filter((g): g is (typeof groups)[number] => !!g) : [];
  const kindLine = ents.length ? `${whoGave(pl)} gave ${ents.map((g) => `${fmtV(g.v)} to ${KIND_NAME[g.k!]}`).join(", ").replace(/, ([^,]*)$/, " and $1")}${inX}, ${yr}` : null;
  return {
    headline: kindLine ?? `${sentence}${inX}: ${fmtV(top.v)}${measure === "dollars" && !per ? `, ${pct(share(top))} of the total` : per ? " a year" : ""}, ${yr}${dcOutlier && top.k === "DC" && nextNonDc ? `. Without DC, ${nextNonDc.name} at ${fmtV(nextNonDc.v)}` : ""}`,
    numbers: (ents.length ? ents : ranked.slice(0, 3)).map((g) => ({ value: fmtV(g.v), label: g.name, note: dcTag(g) })),
    bullets: [
      ...(measure === "dollars" && !per ? [`Top 3 ${BY_TITLE[by].replace(/ \(.+\)$/, "").replace(/ group$/, "")} groups got ${b(pct(ranked.slice(0, 3).reduce((a, g) => a + share(g), 0)))} of ${b(money(totalUsd))}`] : [`${b(money(totalUsd))} in ${b(int(totalN))} grants across ${b(int(groups.length))} groups`]),
      ...(dcOutlier && top.k === "DC" && nextNonDc ? [`Without DC, ${nextNonDc.name} leads with ${b(fmtV(nextNonDc.v))}`] : []),
      `${b(int(groups.length))} groups compared, ${yr}`,
    ],
    chart: { title: `${cap(what)}${forX}${fromX} by ${BY_TITLE[by]}${inX}, ${yr}`, sub: axis, spec: hbar(shown.map((g) => ({ group: g.name, value: chartV(g.v) })), "group", "value", axis, fmt) },
    rows: ranked.map((g) => ({ key: g.k, name: g.name, usd: g.usd, grants: g.n, average: g.avg, share: share(g), ...(by === "state" || by === "county" ? (s.perPoverty ? { people_in_poverty: g.pop, per_person_in_poverty_year: g.pop ? g.usd / g.pop / nYears : null } : { population: g.pop, per_resident_year: g.pop ? g.usd / g.pop / nYears : null }) : {}) })),
    causeNote: note, caveats, coverage: [{ label: "Groups", value: int(groups.length) }, { label: "Grants", value: int(totalN) }],
    method: `${pl.g.form}, tax years ${yr}, to ${linked ? "identified recipients" : "all recipients"}${c ? " in the cause set" : ""}${inX}, summed by ${BY_TITLE[by]}${measure === "average_grant" ? ", then dollars divided by grant lines" : ""}${per ? `, divided by ${s.perPoverty ? "people in poverty (Census ACS 2020-24)" : "2024 Census population"} and ${nYears} years` : ""}. From the research layer (${pl.g.kind === "pf" ? "grant_cube, grant_county_year" : "charity_grant_cube"}) where it covers the question, else ${pl.g.clean}.`,
    sources: [pl.g.src, ...(by === "state" || by === "county" ? [SRC.pop] : []), ...(isLabel ? [SRC.labels] : []), ...(by.startsWith("cause") || c?.ntee.length ? [SRC.ntee] : [])], searchQuery: searchFor(s, pl),
  };
}


// ---- total / share / compare / trend from Form 990 lines (government grants, contributions, revenue)
async function flagTotal(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const fd = FIELD[s.source];
  const fy = flagYear(s);
  const causes: (Cause | null)[] = s.causes.length ? s.causes.slice(0, s.metric === "compare" ? 2 : 1) : [null];
  const caveats: string[] = [];
  if (s.source === "government_grants") caveats.push(GOV_CAVEAT);
  else caveats.push("Form 990 and 990-EZ e-filers only. Small orgs filing the 990-N postcard report no amounts.");
  if (fy.note) caveats.push(fy.note);

  if (s.metric === "trend") {
    const c = causes[0];
    const from = Math.max(s.yearFrom ?? F_FIRST, F_FIRST), to = Math.min(Math.max(s.yearTo ?? F_FULL, from + 1), F_LAST);
    const p = new P();
    const cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
    const where = [`f.tax_year BETWEEN ${p.add(from)} AND ${p.add(to)}`, "coalesce(f.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "f.state", "f.county_fips"), ...filtEin(pl.f, p, "f.ein")];
    const rows = await ctx.q<{ year: number; usd: number; orgs: number }>(`Same organizations each year: ${fd.short}`, `WITH s AS (
  SELECT f.ein, f.tax_year, coalesce(${fd.col}, 0) AS v FROM flag_year f ${cs.join} WHERE ${and(where)}),
panel AS (SELECT ein FROM s GROUP BY ein HAVING count(*) = ${p.add(to - from + 1)})
SELECT s.tax_year AS year, sum(s.v)::float8 AS usd, count(*)::int AS orgs FROM s JOIN panel USING (ein) GROUP BY 1 ORDER BY 1`, p);
    const note = await causeNote(c, cs, caveats);
    caveats.push("Trend uses only organizations with a filing in every year shown, so new and late filers don't distort it.");
    const a = rows[0], z = rows.at(-1);
    const g = a && z && a !== z && a.usd ? z.usd / a.usd - 1 : null;
    const u = unit(Math.max(...rows.map((r) => r.usd), 1));
    return {
      headline: g == null ? `Not enough organizations filed in every year to show a trend` : `${fd.short[0].toUpperCase() + fd.short.slice(1)} to ${causeName(c, pl)} ${g >= 0 ? "rose" : "fell"} ${pct(Math.abs(g))} from ${from} to ${to} (same ${int(a.orgs)} orgs)`,
      numbers: [...(g != null ? [{ value: signed(g), label: `${from} to ${to}` }] : []), ...(z ? [{ value: money(z.usd), label: `${fd.short}, ${z.year}` }] : []), { value: int(a?.orgs ?? 0), label: "orgs filing every year" }],
      bullets: [g != null ? `${b(signed(g))} in ${fd.short} from ${from} to ${to}` : "Too few filings to compare years", `${b(int(a?.orgs ?? 0))} organizations filed a return for every year`],
      chart: { title: `${fd.short} to ${causeName(c, pl)}, same organizations each year`, sub: u.title, spec: vbar(rows.map((r) => ({ year: String(r.year), amount: +(r.usd / u.div).toFixed(3) })), "year", "amount", "Tax year", u.title, u.fmt) },
      rows: rows.map((r) => ({ tax_year: r.year, usd: r.usd, orgs: r.orgs })), causeNote: note, caveats,
      coverage: [{ label: "Orgs in every year", value: int(a?.orgs ?? 0) }],
      method: `Each organization's ${fd.name} for tax years ${from}–${to}, newest return per year, summed over organizations that filed for every year.`,
      sources: [SRC.f990], searchQuery: searchFor(s, pl),
      ...(g != null ? { change: { subject: `${fd.short} to ${c ? causeName(c, pl) : "nonprofits"}`, g, from: String(from), to: String(to) } } : {}),
    };
  }

  const [all, universe, ...ms] = await Promise.all([
    flagMoney(ctx, null, pl, fy.year, s.source, `All organizations' ${fd.short}, ${fy.year} (denominator)`),
    causes[0] ? orgUniverse(ctx, causes[0], pl) : Promise.resolve(0),
    ...causes.map((c) => c ? flagMoney(ctx, c, pl, fy.year, s.source, `${fd.short} to ${c.name}, ${fy.year}`) : null),
  ]);
  const notes = await Promise.all(causes.map((c, i) => causeNote(c, ms[i]?.cs ?? causeSql(null, new P(), "", ""), caveats)));
  const where = pl.label;
  if (!causes[0]) {
    return {
      headline: `Nonprofits in ${where} reported ${money(all.usd)} in ${fd.short} for ${fy.year}`,
      numbers: [{ value: money(all.usd), label: `${fd.short}, ${fy.year}` }, { value: int(all.reporting), label: "orgs reporting any" }, { value: pct(all.usd / Math.max(1, all.revenue)), label: "of their total revenue" }],
      bullets: [`${b(money(all.usd))} in ${fd.short} across ${b(int(all.orgs))} e-filed returns`, `${b(pct(all.usd / Math.max(1, all.revenue)))} of these organizations' total revenue`],
      chart: null, rows: [{ tax_year: fy.year, usd: all.usd, orgs: all.orgs, reporting: all.reporting, revenue: all.revenue }], causeNote: notes[0],
      coverage: [{ label: "E-filed returns", value: int(all.orgs) }, { label: "Full Form 990", value: int(all.full990) }, { label: "Report any", value: int(all.reporting) }],
      caveats, method: `Sum of ${fd.name}, tax year ${fy.year}, one return per organization (newest filing), private foundations excluded. ${s.source === "government_grants" ? "Blank line 1e counts as $0." : ""}`,
      sources: [SRC.f990], searchQuery: null,
    };
  }
  const m0 = ms[0]!, c0 = causes[0]!;
  const isLabel = c0.label != null;
  const floor0 = isLabel ? m0.primary_usd : m0.usd;
  const share = floor0 / Math.max(1, all.usd);
  const ofRev = m0.usd / Math.max(1, m0.revenue);
  // Chart: the cause's 10 largest recipients of this line.
  const top = await topFlagRecipients(ctx, c0, pl, fy.year, s.source, 8);
  const u = unit(Math.max(...top.map((t) => t.usd), 1));
  caveats.push(`${int(m0.orgs)} of ${int(universe)} organizations in the set have an e-filed ${fy.year} return; the rest (mostly small, 990-N or paper filers) are missing.`);
  // Primary tier only (causeSql primaryOnly). Say what the partial tier would add, and who drives it.
  if (isLabel) {
    const pp = new P();
    const w = [`f.tax_year = ${pp.add(fy.year)}`, "coalesce(f.foundation, '') NOT IN ('02', '03', '04')", ...placeWhere(pl, pp, "f.state", "f.county_fips"), ...filtEin(pl.f, pp, "f.ein")];
    const [pt] = await ctx.q<{ usd: number; orgs: number; top: string | null; top_usd: number | null }>(`${fd.short}: orgs where ${c0.name} is one program among others (partial tier, left out)`, `WITH x AS (SELECT o.name, coalesce(${fd.col}, 0)::float8 AS v FROM flag_year f JOIN org_labels l ON l.ein = f.ein AND l.label = ${pp.add(c0.label)} AND l.tier = 'partial' JOIN orgs o ON o.ein = f.ein
  WHERE ${and(w)})
SELECT coalesce(sum(v), 0)::float8 AS usd, count(*)::int AS orgs, (SELECT name FROM x ORDER BY v DESC LIMIT 1) AS top, (SELECT max(v) FROM x)::float8 AS top_usd FROM x`, pp);
    if (pt?.usd > 0) caveats.push(`Counted only for orgs whose main purpose is ${c0.name}. ${int(pt.orgs)} orgs where it's one program among others reported ${money(pt.usd)} more, led by ${pt.top ? titleCase(pt.top) : "one org"} (${money(pt.top_usd ?? 0)}), but most of that money funds their other work.`);
  }
  const upper: string | undefined = undefined;
  const compareBullet = causes[1] && ms[1] ? [`${b(money(causes[1].label ? ms[1].primary_usd : ms[1].usd))} to ${causes[1].name}, ${b(pct((causes[1].label ? ms[1].primary_usd : ms[1].usd) / Math.max(1, all.usd)))} of the total`] : [];
  return {
    headline: s.metric === "compare" && causes[1] && ms[1]
      ? `${c0.name}: ${money(floor0)} vs ${causes[1].name}: ${money(causes[1].label ? ms[1].primary_usd : ms[1].usd)} in ${fd.short}, ${fy.year}`
      : `${cap(orgsOf(c0.name))}${where !== "the US" ? ` in ${where}` : ""} reported ${money(floor0)} in ${fd.short} for ${fy.year}`,
    numbers: [{ value: money(floor0), label: `${fd.short}, ${fy.year}${isLabel ? " (primary)" : ""}`, note: upper },
      { value: pct(share), label: `of all nonprofits' ${fd.short}` },
      ...(s.source !== "revenue" ? [{ value: pct(ofRev), label: "of these orgs' revenue" }] : []),
      { value: int(m0.reporting), label: `orgs reporting ${fd.short}` }],
    bullets: [`${b(money(floor0))} in ${fd.short}${isLabel ? " to orgs where it's the main purpose" : ""}`,
      ...(compareBullet.length ? compareBullet : [`${b(pct(share))} of all nonprofits' ${fd.short}${where !== "the US" ? ` in ${where}` : ""}`]),
      `${b(int(m0.reporting))} of ${b(int(m0.orgs))} filers reported any ${fd.short}`],
    chart: top.length ? { title: `Largest ${fd.short} to ${c0.name}, ${fy.year}`, sub: u.title, spec: hbar(top.map((t) => ({ name: t.name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()).slice(0, 44) + (t.tier === "partial" ? " (partial)" : ""), amount: +(t.usd / u.div).toFixed(3) })), "name", "amount", u.title, u.fmt) } : null,
    rows: top.map((t) => ({ ein: t.ein, name: t.name, state: t.state, tier: t.tier, tax_year: fy.year, usd: t.usd, revenue: t.revenue })),
    causeNote: notes.join(" "), caveats,
    coverage: [{ label: "Orgs in the set", value: int(universe) }, { label: `With a ${fy.year} e-filed return`, value: int(m0.orgs) }, { label: "Full Form 990", value: int(m0.full990) }, { label: `Report ${fd.short}`, value: int(m0.reporting) }],
    method: `Sum of ${fd.name}, tax year ${fy.year}, one return per organization (newest filing), for organizations in the cause set${where !== "the US" ? ` based in ${where}` : ""}. Share = over the same line for all nonprofits there (private foundations excluded).${s.source === "government_grants" ? " Blank line 1e counts as $0." : ""}`,
    sources: [SRC.f990, SRC.bmf, ...(isLabel ? [SRC.labels] : [])], searchQuery: searchFor(s, pl), orgCount: universe,
    ...(s.metric === "compare" && causes[1] && ms[1] ? { versus: { first: c0.name, second: causes[1].name, a: floor0, z: causes[1].label ? ms[1].primary_usd : ms[1].usd } } : {}),
  };
}

async function topFlagRecipients(ctx: Ctx, c: Cause | null, pl: Place, year: number, source: string, n = 10) {
  const fd = FIELD[source];
  const p = new P();
  const cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
  const where = [`f.tax_year = ${p.add(year)}`, `coalesce(${fd.col}, 0) > 0`, "coalesce(f.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "f.state", "f.county_fips"), ...filtEin(pl.f, p, "f.ein")];
  return ctx.q<{ ein: string; name: string; state: string; usd: number; revenue: number; tier: string | null }>(`Largest ${fd.short}, ${year}`, `SELECT f.ein, o.name, o.state, ${fd.col}::float8 AS usd, f.revenue::float8 AS revenue${cs.tier ? `, ${cs.tier} AS tier` : ", NULL AS tier"}
FROM flag_year f JOIN orgs o ON o.ein = f.ein ${cs.join}
WHERE ${and(where)}
ORDER BY ${fd.col} DESC LIMIT ${p.add(n)}`, p);
}

// ---- which causes grew fastest (NTEE major groups + graded labels)
async function fastestCauses(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const y = grantYears(s);
  const a = y.full[0], z = y.full.at(-1)!;
  if (a === z) throw new Unanswerable(`Growth needs two full tax years. ${cap(pl.g.grants)} here cover 2022–2024 in full.`);
  const p = new P();
  let rows: { grp: string; y0: number; y1: number }[];
  if (cubeOk(ctx, null, pl)) {
    const cw = cubeWhere(null, p, pl, { from: a, to: z }, false);
    const pa = p.add(a), pz = p.add(z);
    const w = and([...cw.where, `x.tax_year IN (${pa}, ${pz})`]);
    rows = await ctx.q("Grant dollars by NTEE major group and graded label, first and last full year (research cube)", `SELECT left(x.ntee3, 1) AS grp, coalesce(sum(x.usd) FILTER (WHERE x.tax_year = ${pa}), 0)::float8 AS y0,
       coalesce(sum(x.usd) FILTER (WHERE x.tax_year = ${pz}), 0)::float8 AS y1
FROM ${pl.g.cube} x WHERE x.ntee3 ~ '^[A-Z]' AND ${w}
GROUP BY 1
UNION ALL
SELECT 'label:' || split_part(l.t, ':', 1), coalesce(sum(x.usd) FILTER (WHERE x.tax_year = ${pa}), 0)::float8, coalesce(sum(x.usd) FILTER (WHERE x.tax_year = ${pz}), 0)::float8
FROM ${pl.g.cube} x CROSS JOIN LATERAL unnest(x.labels) AS l(t)
WHERE l.t LIKE '%:primary' AND ${w}
GROUP BY 1`, p);
  } else {
  const pw = [...placeWhere(pl, p, "g.recipient_state", "g.county_fips"), ...filtGc(pl.f, p), ...gExtra(pl, p, "g")];
  const pa = p.add(a), pz = p.add(z);
  rows = await ctx.q<{ grp: string; y0: number; y1: number }>("Grant dollars by NTEE major group and graded label, first and last full year", `SELECT left(g.recipient_ntee, 1) AS grp, coalesce(sum(g.amount) FILTER (WHERE g.tax_year = ${pa}), 0)::float8 AS y0,
       coalesce(sum(g.amount) FILTER (WHERE g.tax_year = ${pz}), 0)::float8 AS y1
FROM ${pl.g.clean} g WHERE g.recipient_ntee ~ '^[A-Z]' AND g.tax_year IN (${pa}, ${pz}) ${pw.length ? `AND ${and(pw)}` : ""}
GROUP BY 1
UNION ALL
SELECT 'label:' || l.label, coalesce(sum(g.amount) FILTER (WHERE g.tax_year = ${pa}), 0)::float8, coalesce(sum(g.amount) FILTER (WHERE g.tax_year = ${pz}), 0)::float8
FROM ${pl.g.clean} g JOIN org_labels l ON l.ein = g.recipient_ein AND l.tier = 'primary'
WHERE g.tax_year IN (${pa}, ${pz}) ${pw.length ? `AND ${and(pw)}` : ""}
GROUP BY 1`, p);
  }
  const gr = await grades();
  const minBase = (pl.states.length || pl.county || pl.area ? 5e6 : 1e8) / (pl.g.kind === "charity" && pl.g.cls ? 10 : 1);
  const list = rows.filter((r) => r.y0 >= minBase && r.grp !== "Z").map((r) => ({
    cause: r.grp.startsWith("label:") ? `${gr[r.grp.slice(6)]?.name ?? r.grp.slice(6)} (label)` : `${nteeLabel(r.grp) ?? r.grp} (${r.grp})`,
    y0: r.y0, y1: r.y1, growth: r.y1 / r.y0 - 1,
  })).sort((p1, p2) => (s.order === "least" ? p1.growth - p2.growth : p2.growth - p1.growth));
  if (!list.length) throw new Unanswerable("Too few grants in this place to compare causes.");
  const top = list[0], bottom = list.at(-1)!;
  const caveats = [`Causes are NTEE major groups (the recipient's main code) plus the graded labels' primary tier, which overlap NTEE groups. Groups under ${money(minBase)} in ${a} are left out.`, ...(await grantCaveats(pl))];
  return {
    headline: `${top.cause.replace(/ \(.+\)$/, "")} ${s.order === "least" ? "fell" : "grew"} ${s.order === "least" && top.growth < 0 ? "the most" : "fastest"}: ${signed(top.growth)} in ${pl.g.grants}, ${a} to ${z}`,
    numbers: [{ value: signed(top.growth), label: top.cause }, { value: signed(bottom.growth), label: bottom.cause }, { value: String(list.length), label: "causes compared" }],
    bullets: [`${top.cause}: ${b(money(top.y0))} to ${b(money(top.y1))}, ${b(signed(top.growth))}`,
      `${bottom.cause}: ${b(signed(bottom.growth))}, the ${s.order === "least" ? "best" : "weakest"} change`,
      `Compares full tax years ${a} and ${z} only`],
    chart: { title: `Change in ${pl.g.grants} by cause, ${a} to ${z}`, sub: "Percent change", spec: hbar(list.slice(0, 14).map((r) => ({ cause: r.cause, growth: +r.growth.toFixed(4) })), "cause", "growth", "Change", "+.0%") },
    rows: list.map((r) => ({ cause: r.cause, [`usd_${a}`]: r.y0, [`usd_${z}`]: r.y1, growth: r.growth })),
    causeNote: "NTEE major groups and graded labels.", caveats, coverage: [{ label: "Place", value: pl.label }],
    method: `${pl.g.kind === "pf" ? "990-PF grant" : "Schedule I grant"} dollars to identified recipients in ${pl.label}, grouped by the recipient's NTEE major group (first letter), tax year ${a} vs ${z}. Graded labels count primary-tier recipients only.`,
    sources: [pl.g.src, SRC.ntee, SRC.labels], searchQuery: null,
  };
}

// ---- states ranked (total or per resident)
async function byState(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  // Per person in poverty (Census ACS 5-year) works like per resident with another denominator.
  const perX = s.perResident || s.perPoverty, perWord = s.perPoverty ? "per person in poverty" : "per resident";
  const foundation = isGrantSrc(s); // a grant source (990-PF or Schedule I), not a Form 990 line
  const y = grantYears(s);
  const fy = flagYear(s);
  const p = new P();
  const caveats: string[] = [];
  let sql: string, cs: CauseSql;
  const states = pl.states.length ? pl.states : null;
  if (foundation && ctx.cube && cubeCause(c) && (c || hasFilt(pl.f)) && !(pl.g.kind === "charity" && pl.f.rb) && pl.f.ftype !== "company") {
    // Research cube: same sums as grant_clean for a cause or filters, by recipient state.
    cs = causeSql(c, new P(), "", "");
    const cw = cubeWhere(c, p, { ...pl, county: null, area: null }, y, !!c);
    sql = `SELECT x.recipient_state AS state, coalesce(sum(x.usd), 0)::float8 AS usd, ${cubeSum(cw)} AS primary_usd FROM ${pl.g.cube} x
WHERE ${and(cw.where)} GROUP BY 1`;
  } else if (foundation && pl.g.kind === "charity" && ctx.cube && cubeCause(c) && !pl.f.rb) {
    // Schedule I, all causes: charity_grant_cube (all recipients, identified or not).
    cs = causeSql(c, new P(), "", "");
    const cw = cubeWhere(c, p, { ...pl, county: null, area: null }, y, !!c);
    sql = `SELECT x.recipient_state AS state, coalesce(sum(x.usd), 0)::float8 AS usd, ${cubeSum(cw)} AS primary_usd FROM ${pl.g.cube} x
WHERE ${and(cw.where)} GROUP BY 1`;
  } else if (foundation && pl.g.kind === "pf" && !c && !hasFilt(pl.f)) {
    cs = causeSql(null, p, "", "");
    sql = `SELECT t.state, sum(t.usd)::float8 AS usd, sum(t.usd)::float8 AS primary_usd FROM grant_totals t
WHERE t.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}${states ? ` AND t.state = ANY(${p.add(states)}::text[])` : ""} GROUP BY 1`;
  } else if (foundation) {
    const gw = grantWhere(c, p, { ...pl, county: null, area: null }, y, pl.g.kind === "charity" ? !!c : true); // Schedule I with no cause: all recipients, as on the cube
    cs = gw.cs;
    sql = `SELECT g.recipient_state AS state, sum(g.amount)::float8 AS usd, ${primarySum(cs, "g.amount")} AS primary_usd FROM ${pl.g.clean} g ${cs.join}
WHERE ${and(gw.where)} GROUP BY 1`;
  } else {
    const fd = FIELD[s.source];
    cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
    const w = [`f.tax_year = ${p.add(fy.year)}`, "coalesce(f.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...(states ? [`f.state = ANY(${p.add(states)}::text[])`] : []), ...filtEin(pl.f, p, "f.ein")];
    sql = `SELECT f.state, coalesce(sum(coalesce(${fd.col}, 0)), 0)::float8 AS usd, ${primarySum(cs, `coalesce(${fd.col}, 0)`)} AS primary_usd FROM flag_year f ${cs.join}
WHERE ${and(w)} GROUP BY 1`;
  }
  const full = `WITH v AS (${sql}),
pop AS (${s.perPoverty ? "SELECT state, sum(people_in_poverty)::float8 AS pop FROM county_acs WHERE level = 'county' GROUP BY 1" : "SELECT state, sum(population)::float8 AS pop FROM county_need WHERE county_fips <> '00000' GROUP BY 1"})
SELECT v.state, v.usd, v.primary_usd, pop.pop FROM v JOIN pop USING (state) WHERE pop.pop > 0`;
  const rows = await ctx.q<{ state: string; usd: number; primary_usd: number; pop: number }>(`By state${perX ? `, ${perWord}` : ""}`, full, p);
  const note = await causeNote(c, cs, caveats);
  const nYears = foundation ? y.to - y.from + 1 : 1;
  const isLabel = !!c?.label;
  const val = (r: (typeof rows)[number]) => {
    const usd = isLabel ? r.primary_usd : r.usd;
    return perX ? usd / r.pop / nYears : usd;
  };
  const ranked = rows.map((r) => ({ state: r.state, name: stateName(r.state), usd: isLabel ? r.primary_usd : r.usd, pop: r.pop, v: val(r) }))
    .sort((a, z) => (s.order === "least" ? a.v - z.v : z.v - a.v) || a.state.localeCompare(z.state)); // ties: by state code
  if (!ranked.length) throw new Unanswerable("No state totals for this question.");
  const fmtV = (x: number) => (perX ? perRes(x) : money(x));
  const what = foundation ? pl.g.grants : FIELD[s.source].short;
  const lo = ranked[0], hi = ranked.at(-1)!;
  const ex = ranked.filter((r) => r.state !== "DC");
  const median = [...ex].sort((a, z) => a.v - z.v)[Math.floor(ex.length / 2)]?.v ?? 0;
  const show = ranked.slice(0, 12);
  const unitTitle = perX ? `${what}, $ ${perWord}${foundation ? " per year" : ""}` : `${what}, $`;
  if (foundation) { if (y.partial) caveats.push(`${G_LAST} is incomplete.`); caveats.push(...(await grantCaveats(pl))); }
  else { if (s.source === "government_grants") caveats.push(GOV_CAVEAT); if (fy.note) caveats.push(fy.note); }
  caveats.push(HQ_CAVEAT);
  // DC: flag it when it's in the ranking and stands out (top 3, or over 3x the median state). Not hidden.
  const dcAt = ranked.findIndex((r) => r.state === "DC");
  const dcOutlier = dcAt >= 0 && (dcAt < 3 || ranked[dcAt].v > 3 * median) && ranked.length > 3;
  const nextNonDc = ranked.find((r) => r.state !== "DC");
  if (dcOutlier || (dcAt >= 0 && ranked.length <= 3)) caveats.unshift(DC_NOTE);
  const period = foundation ? yrs(y.from, y.to) : String(fy.year);
  const subject = `${what}${c ? ` to ${c.name}` : ""}`;
  const dcTag = (r: { state: string }) => (dcOutlier && r.state === "DC" ? DC_NOTE_SHORT : undefined);
  const one = ranked.length === 1; // one named state: no ranking to speak of
  // One organization behind the leading state's total (a big recipient in the cause set): say so.
  const dom = foundation && c && s.order !== "least" && lo.usd > 0 ? await topOrgShare(ctx, c, pl, y, lo.state, lo.usd) : null;
  const domText = dom ? `One organization, ${dom.name}, accounts for ${b(pct(dom.share))} of ${lo.name}'s total` : null;
  if (dom) caveats.unshift(`${dom.name} received ${money(dom.usd)}, ${pct(dom.share)} of ${lo.name}'s ${subject}, so the ranking reflects one organization more than the state.`);
  return {
    headline: one
      ? `${lo.name} gets ${fmtV(lo.v)}${perX ? ` ${perWord}` : ""}${perX && foundation ? " a year" : ""} in ${subject}, ${period}`
      : `${lo.name} gets the ${s.order === "least" ? "least" : "most"} ${subject}${perX ? ` ${perWord}` : ""}: ${fmtV(lo.v)}${perX && foundation ? " a year" : ""}${dcOutlier && lo.state === "DC" && nextNonDc ? `, then ${nextNonDc.name} at ${fmtV(nextNonDc.v)}` : ""}`,
    numbers: one
      ? [{ value: fmtV(lo.v), label: `${lo.name}${perX ? `, ${perWord}` : ""}`, note: lo.state === "DC" ? DC_NOTE_SHORT : undefined }, ...(perX ? [{ value: money(lo.usd), label: `${what}, ${period}` }] : [])]
      : [{ value: fmtV(lo.v), label: lo.name, note: dcTag(lo) ?? (dom ? `${pct(dom.share)} from one organization` : undefined) }, { value: fmtV(median), label: "median state" }, { value: fmtV(hi.v), label: hi.name, note: dcTag(hi) }],
    bullets: one ? [`${b(money(lo.usd))} in ${subject} to ${lo.name}, ${period}`, ...(domText ? [domText] : []), ...(lo.state === "DC" ? ["Many national groups are headquartered in DC, so this runs far above any state"] : [])] : [...(domText ? [domText] : []), `${ranked.slice(0, 3).map((r) => `${r.name} ${b(fmtV(r.v))}`).join(", ")}`,
      ...(dcOutlier && lo.state === "DC" && nextNonDc ? [`Without DC, ${nextNonDc.name} leads with ${b(fmtV(nextNonDc.v))}`] : []),
      `The median state gets ${b(fmtV(median))}${perX ? ` ${perWord}` : ""}`,
      `${hi.name} is at the other end with ${b(fmtV(hi.v))}`],
    chart: { title: `${s.order === "least" ? "Lowest" : "Highest"} states: ${subject}${perX ? ` ${perWord}` : ""}, ${period}`, sub: unitTitle,
      spec: hbar(show.map((r) => ({ state: r.name, value: perX ? +r.v.toFixed(2) : +(r.v / unit(show[0].v || 1).div).toFixed(3) })), "state", "value",
        perX ? unitTitle : `${what}, ${unit(Math.max(...show.map((r) => r.v), 1)).title}`, perX ? "$,.0f" : unit(Math.max(...show.map((r) => r.v), 1)).fmt) },
    rows: ranked.map((r) => ({ state: r.state, name: r.name, usd: r.usd, population: r.pop, value: r.v })),
    causeNote: note, caveats, coverage: [{ label: "States ranked", value: String(ranked.length) }],
    method: `${foundation ? `${pl.g.form}, tax years ${period}, summed by the state of the recipient's address (where it's headquartered)${c ? " for identified recipients in the cause set" : " (all recipients, identified or not)"}` : `${FIELD[s.source].name}, tax year ${fy.year}, summed by the organization's state`}${perX ? `, divided by ${s.perPoverty ? "people in poverty (Census ACS 2020-24)" : "2024 Census population"}${foundation ? ` and ${nYears} years` : ""}` : ""}. Ranked ${s.order === "least" ? "lowest" : "highest"} first.`,
    sources: [foundation ? pl.g.src : SRC.f990, s.perPoverty ? SRC.acs : SRC.pop, ...(isLabel ? [SRC.labels] : [])], searchQuery: null,
  };
}

// The largest recipient in one state for the cause, when it holds at least half of that state's total (DOMINANT).
// Same cause set, filters and years as the ranking; grant_clean, so a label counts its primary tier like the ranking.
const DOMINANT = 0.5;
async function topOrgShare(ctx: Ctx, c: C, pl: Place, y: Years, state: string, stateUsd: number) {
  const p = new P();
  const gw = grantWhere(c, p, { ...pl, states: [state], county: null, area: null }, y, true);
  const [r] = await ctx.q<{ name: string; usd: number }>(`Largest recipient in ${stateName(state)} (single-organization check)`, `SELECT o.name, ${primarySum(gw.cs, "g.amount")} AS usd
FROM ${pl.g.clean} g ${gw.cs.join} JOIN orgs o ON o.ein = g.recipient_ein
WHERE ${and(gw.where)}
GROUP BY o.ein, o.name ORDER BY 2 DESC LIMIT 1`, p);
  if (!r || r.usd / stateUsd < DOMINANT) return null;
  const t = r.name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
  const name = t.length <= 64 ? t : t.slice(0, 64).replace(/\s+\S*$/, ""); // whole words
  return { name, usd: r.usd, share: Math.min(1, r.usd / stateUsd) };
}

// ---- counties grouped by Census ACS 5-year bands (poverty, income, race and ethnicity, age), per resident
// and per person in poverty. Money is placed in the county of the recipient's (or org's) address.
const ACS_BANDS: Record<string, { title: string; expr: string; names: string[]; caveat: string }> = {
  county_poverty: { title: "county poverty rate", expr: "CASE WHEN a.poverty_rate < 10 THEN 1 WHEN a.poverty_rate < 15 THEN 2 WHEN a.poverty_rate < 20 THEN 3 ELSE 4 END",
    names: ["under 10% in poverty", "10% to 15% in poverty", "15% to 20% in poverty", "20% or more in poverty"], caveat: "Poverty rate = people below the poverty line, Census ACS 2020-24." },
  county_income: { title: "county median household income", expr: "CASE WHEN a.median_income < 55000 THEN 1 WHEN a.median_income < 70000 THEN 2 WHEN a.median_income < 90000 THEN 3 ELSE 4 END",
    names: ["median income under $55K", "median income $55K to $70K", "median income $70K to $90K", "median income $90K and up"], caveat: "Median household income, Census ACS 2020-24, in 2024 dollars." },
  county_race: { title: "county share of people of color", expr: "CASE WHEN a.poc_share < 25 THEN 1 WHEN a.poc_share < 50 THEN 2 ELSE 3 END",
    names: ["under 25% people of color", "25% to 50% people of color", "a majority people of color"], caveat: "People of color = everyone except non-Hispanic white residents, Census ACS 2020-24." },
  rurality: { title: "county size", expr: "CASE WHEN a.population < 50000 THEN 1 ELSE 2 END",
    names: ["under 50,000 people (rural)", "50,000 people or more"], caveat: "Rural here = a county under 50,000 people (a proxy, not the USDA rural-urban code). Population from Census ACS 2020-24." },
  county_age: { title: "county share aged 65 and over", expr: "CASE WHEN a.age65_plus::float8 / nullif(a.population, 0) < 0.18 THEN 1 WHEN a.age65_plus::float8 / nullif(a.population, 0) < 0.22 THEN 2 ELSE 3 END",
    names: ["under 18% aged 65+", "18% to 22% aged 65+", "22% or more aged 65+"], caveat: "Share of residents aged 65 and over, Census ACS 2020-24." },
};
async function byCountyGroup(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const band = ACS_BANDS[s.by!];
  const c = s.causes[0] ?? null;
  if (pl.county) throw new Unanswerable("Pick a state or the whole US to compare groups of counties.");
  const fed = s.source === "federal_awards";
  const grant = isGrantSrc(s);
  const y = fed ? fedYears(s) : grantYears(s), fy = flagYear(s);
  const p = new P();
  let money: string, cs: CauseSql;
  if (fed) {
    const fw = fedWhere(c, p, { ...pl, area: null }, y);
    cs = fw.cs;
    money = `SELECT fa.pop_county_fips AS k, ${fedSum(cs)} AS usd FROM ${fw.from} WHERE ${and([...fw.where, "fa.pop_county_fips IS NOT NULL"])} GROUP BY 1`;
  } else if (grant && pl.g.kind === "pf" && ctx.cube && !hasFilt(pl.f) && (!c || (!c.label && c.ntee.length > 0 && c.ntee.every((n) => n.length === 1)))) {
    cs = causeSql(c, new P(), "", "");
    const w = [`cy.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`, "cy.county_fips IS NOT NULL", ...(c ? ["cy.linked", `cy.ntee_major = ANY(${p.add(c.ntee)}::text[])`] : []), ...placeWhere({ ...pl, area: null }, p, "cy.recipient_state", "cy.county_fips")];
    money = `SELECT cy.county_fips AS k, sum(cy.usd)::float8 AS usd FROM grant_county_year cy WHERE ${and(w)} GROUP BY 1`;
  } else if (grant) {
    const gw = grantWhere(c, p, { ...pl, area: null }, y, !!c);
    cs = gw.cs;
    money = `SELECT g.county_fips AS k, ${primarySum(cs, "g.amount")} AS usd FROM ${pl.g.clean} g ${cs.join} WHERE ${and([...gw.where, "g.county_fips IS NOT NULL"])} GROUP BY 1`;
  } else {
    const fd = FIELD[s.source];
    cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
    const w = [`f.tax_year = ${p.add(fy.year)}`, "coalesce(f.foundation, '') NOT IN ('02', '03', '04')", "f.county_fips IS NOT NULL", ...cs.where, ...placeWhere({ ...pl, area: null }, p, "f.state", "f.county_fips"), ...filtEin(pl.f, p, "f.ein")];
    money = `SELECT f.county_fips AS k, ${primarySum(cs, `coalesce(${fd.col}, 0)`)} AS usd FROM flag_year f ${cs.join} WHERE ${and(w)} GROUP BY 1`;
  }
  const st = pl.states.length ? `AND a.state = ANY(${p.add(pl.states)}::text[])` : "";
  const rows = await ctx.q<{ band: number; usd: number; pop: number; poor: number; counties: number }>(`Money by ${band.title} (Census ACS 2020-24)`, `WITH v AS (${money}),
g AS (SELECT a.county_fips, ${band.expr} AS band, a.population, a.people_in_poverty FROM county_acs a WHERE a.level = 'county' ${st})
SELECT g.band, coalesce(sum(v.usd), 0)::float8 AS usd, sum(g.population)::float8 AS pop, sum(g.people_in_poverty)::float8 AS poor, count(*)::int AS counties
FROM g LEFT JOIN v ON v.k = g.county_fips GROUP BY 1 ORDER BY 1`, p);
  const caveats: string[] = [];
  const note = await causeNote(c, cs, caveats);
  if (!rows.length) throw new Unanswerable(`No counties found in ${pl.label}.`);
  const nYears = grant || fed ? y.to - y.from + 1 : 1;
  const perPoor = s.perPoverty;
  const per = (r: { usd: number; pop: number; poor: number }) => r.usd / Math.max(1, perPoor ? r.poor : r.pop) / nYears;
  const what = fed ? "federal awards to nonprofits" : grant ? pl.g.money : FIELD[s.source].short;
  const perWord = perPoor ? "per person in poverty" : "per resident";
  const yearly = grant || fed ? " a year" : "";
  const lo = rows[0], hi = rows.at(-1)!;
  const name = (r: { band: number }) => band.names[r.band - 1];
  const label = (r: { band: number }) => cap(name(r));
  const ratio = per(lo) / Math.max(1e-9, per(hi));
  caveats.push(band.caveat, fed ? "Federal awards are placed by place of performance. Statewide and multi-state awards have no county and are left out." : "Money is placed in the county of the recipient's address, often a headquarters, so counties with big-city head offices run high. Groups mix urban and rural counties.");
  if (fed) caveats.push(...FED_CAVEATS, await fedLinkNote()); else if (grant) caveats.push(...(await grantCaveats(pl))); else if (s.source === "government_grants") caveats.push(GOV_CAVEAT);
  const period = fed ? `FY${yrs(y.from, y.to)}` : grant ? yrs(y.from, y.to) : String(fy.year);
  const forX = c ? ` for ${c.name}` : "";
  return {
    headline: `Counties with ${name(hi)} get ${perRes(per(hi))} ${perWord}${yearly} in ${what}${forX}, vs ${perRes(per(lo))} in counties with ${name(lo)}, ${period}`,
    numbers: [{ value: perRes(per(hi)), label: label(hi) }, { value: perRes(per(lo)), label: label(lo) }, { value: ratio >= 1 ? `${ratio.toFixed(1)}x` : `${(1 / ratio).toFixed(1)}x`, label: `gap, ${ratio >= 1 ? label(lo) : label(hi)} ahead` }],
    bullets: rows.map((r) => `${label(r)}: ${b(perRes(per(r)))} ${perWord}, ${b(int(r.counties))} counties`).slice(0, 2),
    chart: { title: `${cap(what)}${forX} ${perWord}${yearly}, by ${band.title}, ${pl.label}`, sub: `$ ${perWord}`, spec: hbar(rows.map((r) => ({ group: label(r), value: +per(r).toFixed(2) })), "group", "value", `$ ${perWord}`, "$,.2f") },
    rows: rows.map((r) => ({ band: label(r), counties: r.counties, usd: r.usd, population: r.pop, people_in_poverty: r.poor, per_resident_year: r.usd / Math.max(1, r.pop) / nYears, per_person_in_poverty_year: r.usd / Math.max(1, r.poor) / nYears })),
    causeNote: note, caveats, coverage: [{ label: "Counties", value: int(rows.reduce((a2, r) => a2 + r.counties, 0)) }],
    method: `${fed ? `Net federal obligations to nonprofits, fiscal years ${yrs(y.from, y.to)}, placed by place of performance` : grant ? `${pl.g.form}, tax years ${period}, placed by recipient ZIP` : `${FIELD[s.source].name}, ${fy.year}, placed by the org's ZIP`} → county, counties grouped by ${band.title} (Census ACS 2020-24), each group's money divided by its ${perPoor ? "people in poverty" : "population"}${grant || fed ? ` and ${nYears} years` : ""}.`,
    sources: [fed ? SRC.fed : grant ? pl.g.src : SRC.f990, SRC.acs], searchQuery: null,
  };
}

// ---- rural vs urban counties, per resident
async function byRurality(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  const y = grantYears(s);
  const p = new P();
  const plNoArea = { ...pl, area: null };
  let cs: CauseSql, sql: string;
  const foundation = isGrantSrc(s);
  const fy = flagYear(s);
  if (foundation && cubeOk(ctx, c, plNoArea)) {
    // Research cube: rural is precomputed from the recipient ZIP's county population (same rule).
    cs = causeSql(c, new P(), "", "");
    const cw = cubeWhere(c, p, plNoArea, y, !!c);
    sql = `SELECT CASE WHEN x.rural THEN 'rural' WHEN x.rural IS FALSE THEN 'urban' ELSE 'unmapped' END AS area, coalesce(sum(x.usd), 0)::float8 AS usd
FROM ${pl.g.cube} x WHERE ${and(cw.where)} GROUP BY 1`;
  } else if (foundation) {
    const gw = grantWhere(c, p, plNoArea, y, !!c);
    cs = gw.cs;
    sql = `SELECT CASE WHEN cn.population < ${RURAL_POP} THEN 'rural' WHEN cn.population IS NOT NULL THEN 'urban' ELSE 'unmapped' END AS area,
       sum(g.amount)::float8 AS usd FROM ${pl.g.clean} g ${cs.join} LEFT JOIN county_need cn ON cn.county_fips = g.county_fips
WHERE ${and(gw.where)} GROUP BY 1`;
  } else {
    const fd = FIELD[s.source];
    cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
    const w = [`f.tax_year = ${p.add(fy.year)}`, "coalesce(f.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(plNoArea, p, "f.state", "f.county_fips"), ...filtEin(pl.f, p, "f.ein")];
    sql = `SELECT CASE WHEN cn.population < ${RURAL_POP} THEN 'rural' WHEN cn.population IS NOT NULL THEN 'urban' ELSE 'unmapped' END AS area,
       coalesce(sum(coalesce(${fd.col}, 0)), 0)::float8 AS usd FROM flag_year f ${cs.join} LEFT JOIN county_need cn ON cn.county_fips = f.county_fips
WHERE ${and(w)} GROUP BY 1`;
  }
  const pp = new P();
  const popW = placeWhere(plNoArea, pp, "state", "county_fips");
  const [rows, pops] = await Promise.all([
    ctx.q<{ area: string; usd: number }>("Money by county type (rural = county under 50,000 people)", sql, p),
    ctx.q<{ area: string; pop: number }>("Population by county type", `SELECT CASE WHEN population < ${RURAL_POP} THEN 'rural' ELSE 'urban' END AS area, sum(population)::float8 AS pop
FROM county_need WHERE county_fips <> '00000' AND ${and(popW)} GROUP BY 1`, pp),
  ]);
  const caveats: string[] = [];
  const note = await causeNote(c, cs, caveats);
  const nYears = foundation ? y.to - y.from + 1 : 1;
  const get = (a: string) => rows.find((r) => r.area === a)?.usd ?? 0;
  const pop = (a: string) => pops.find((r) => r.area === a)?.pop ?? 0;
  const ru = get("rural") / Math.max(1, pop("rural")) / nYears, ur = get("urban") / Math.max(1, pop("urban")) / nYears;
  const unm = get("unmapped") / Math.max(1, get("rural") + get("urban") + get("unmapped"));
  caveats.push(`Rural here = a county under ${int(RURAL_POP)} people (a proxy, not the USDA rural-urban code). Money is placed by the recipient's address, often a city headquarters.`, `${pct(unm)} of dollars have a ZIP that doesn't map to a county and are left out.`);
  if (foundation) caveats.push(...(await grantCaveats(pl))); else if (s.source === "government_grants") caveats.push(GOV_CAVEAT);
  const what = `${foundation ? pl.g.grants : FIELD[s.source].short}${c ? ` to ${c.name}` : ""}`;
  const ratio = ur / Math.max(0.0001, ru);
  const vals = [{ area: `Rural counties (under ${int(RURAL_POP / 1000)}K people)`, value: +ru.toFixed(2) }, { area: "Larger counties", value: +ur.toFixed(2) }];
  return {
    headline: `Rural counties get ${perRes(ru)} per resident${foundation ? " a year" : ""} in ${what}, ${ratio >= 1 ? `${ratio.toFixed(1)}x less than` : `${(1 / ratio).toFixed(1)}x more than`} larger counties`,
    numbers: [{ value: perRes(ru), label: "rural, per resident" }, { value: perRes(ur), label: "larger counties, per resident" }, { value: `${ratio.toFixed(1)}x`, label: "gap" }],
    bullets: [`${b(perRes(ru))} per resident${foundation ? " a year" : ""} in rural counties`, `${b(perRes(ur))} per resident in larger counties`, `${b(money(pop("rural")).replace("$", ""))} people live in rural counties of ${pl.label}`],
    chart: { title: `${what} per resident${foundation ? " per year" : ""}, ${pl.label}`, sub: "$ per resident", spec: hbar(vals, "area", "value", "$ per resident", "$,.2f") },
    rows: ["rural", "urban", "unmapped"].map((a) => ({ area: a, usd: get(a), population: a === "unmapped" ? null : pop(a) })),
    causeNote: note, caveats, coverage: [{ label: "Unmapped $", value: pct(unm) }],
    method: `${foundation ? `${pl.g.form}, tax years ${yrs(y.from, y.to)}, placed by recipient ZIP` : `${FIELD[s.source].name}, ${fy.year}, placed by the org's ZIP`} → county (Census ZCTA crosswalk), split by county population (under ${int(RURAL_POP)} = rural), divided by each group's 2024 population${foundation ? ` and ${nYears} years` : ""}.`,
    sources: [foundation ? pl.g.src : SRC.f990, SRC.pop], searchQuery: null,
  };
}

// ---- top funders
async function topFunders(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  const y = grantYears(s);
  const p = new P();
  const gw = grantWhere(c, p, pl, y, false);
  const rows = await ctx.q<{ ein: string; name: string; state: string; usd: number; primary_usd: number; orgs: number }>(`Top ${pl.g.givers} by grant dollars`, `SELECT f.ein, f.name, f.state, sum(g.amount)::float8 AS usd, ${primarySum(gw.cs, "g.amount")} AS primary_usd, count(DISTINCT g.recipient_ein)::int AS orgs
FROM ${pl.g.clean} g ${gw.cs.join} JOIN ${pl.g.funders} f ON f.ein = g.funder_ein
WHERE ${and(gw.where)}
GROUP BY f.ein, f.name, f.state ORDER BY ${gw.cs.tier ? "primary_usd" : "usd"} DESC LIMIT 10`, p);
  const p2 = new P();
  const gw2 = grantWhere(c, p2, pl, y, false);
  const [tot] = await ctx.q<{ usd: number; primary_usd: number; funders: number }>("All funders of the set", `SELECT sum(g.amount)::float8 AS usd, ${primarySum(gw2.cs, "g.amount")} AS primary_usd, count(DISTINCT g.funder_ein)::int AS funders
FROM ${pl.g.clean} g ${gw2.cs.join} WHERE ${and(gw2.where)}`, p2);
  const caveats: string[] = [];
  const note = await causeNote(c, gw.cs, caveats);
  caveats.push(...(await grantCaveats(pl)));
  const isLabel = !!gw.cs.tier;
  const v = (r: { usd: number; primary_usd: number }) => (isLabel ? r.primary_usd : r.usd);
  if (!rows.length) throw new Unanswerable(`No ${pl.g.grants} found for ${causeName(c, pl)} in ${pl.label}.`);
  const top10 = rows.reduce((a, r) => a + v(r), 0) / Math.max(1, v(tot));
  const u = unit(v(rows[0]));
  const nm = (x: string) => x.replace(/\bFOUNDATION\b/gi, "Fdn").replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()).slice(0, 44);
  return {
    headline: `${nm(rows[0].name)} is the largest ${pl.g.adj} funder of ${causeName(c, pl)}${pl.label !== "the US" ? ` in ${pl.label}` : ""}: ${money(v(rows[0]))}, ${yrs(y.from, y.to)}`,
    numbers: [{ value: money(v(rows[0])), label: nm(rows[0].name) }, { value: pct(top10), label: "from the top 10 funders" }, { value: int(tot.funders), label: `${pl.g.givers} in all` }],
    bullets: rows.slice(0, 3).map((r) => `${nm(r.name)} (${r.state}): ${b(money(v(r)))} to ${b(int(r.orgs))} orgs`).slice(0, 2).concat([`The top 10 gave ${b(pct(top10))} of ${b(money(v(tot)))}`]),
    chart: { title: `Top ${pl.g.adj} funders of ${causeName(c, pl)}${isLabel ? " (primary)" : ""}, ${yrs(y.from, y.to)}`, sub: u.title, spec: hbar(rows.map((r) => ({ funder: nm(r.name), amount: +(v(r) / u.div).toFixed(3) })), "funder", "amount", u.title, u.fmt) },
    rows: rows.map((r) => ({ funder_ein: r.ein, funder: r.name, state: r.state, usd: r.usd, primary_usd: isLabel ? r.primary_usd : null, recipients: r.orgs })),
    causeNote: note, caveats, coverage: [{ label: "Funders", value: int(tot.funders) }],
    method: `${pl.g.form}, tax years ${yrs(y.from, y.to)}, to ${c ? "identified recipients in the cause set" : "all recipients"} in ${pl.label}, summed by ${pl.g.adj}.`,
    sources: [pl.g.src, ...(isLabel ? [SRC.labels] : [])], searchQuery: searchFor(s, pl),
  };
}

// ---- top recipients
async function topRecipients(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  if (!isGrantSrc(s)) {
    const fy = flagYear(s);
    const fd = FIELD[s.source];
    const rows = await topFlagRecipients(ctx, c, pl, fy.year, s.source, 10);
    const caveats: string[] = [];
    const cs = causeSql(c, new P(), "f.ein", "f.ntee_cd", "", true);
    const note = await causeNote(c, cs, caveats);
    if (s.source === "government_grants") caveats.push(GOV_CAVEAT);
    if (!rows.length) throw new Unanswerable(`No ${fd.short} reported for ${causeName(c, pl)} in ${pl.label}.`);
    const u = unit(rows[0].usd);
    const nm = (x: string) => x.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()).slice(0, 44);
    return {
      headline: `${nm(rows[0].name)} reported the most ${fd.short}${c ? ` among ${orgsOf(c.name)}` : ""}: ${money(rows[0].usd)} in ${fy.year}`,
      numbers: rows.slice(0, 3).map((r) => ({ value: money(r.usd), label: nm(r.name) + (r.tier === "partial" ? " (partial)" : "") })),
      bullets: rows.slice(0, 2).map((r) => `${nm(r.name)} (${r.state}${r.tier === "partial" ? ", partial" : ""}): ${b(money(r.usd))}, ${b(pct(r.usd / Math.max(1, r.revenue)))} of its revenue`),
      chart: { title: `Largest ${fd.short}${c ? `, ${c.name}` : ""}, ${fy.year}`, sub: u.title, spec: hbar(rows.map((r) => ({ name: nm(r.name) + (r.tier === "partial" ? " (partial)" : ""), amount: +(r.usd / u.div).toFixed(3) })), "name", "amount", u.title, u.fmt) },
      rows: rows.map((r) => ({ ein: r.ein, name: r.name, state: r.state, usd: r.usd, revenue: r.revenue })),
      causeNote: note, caveats, coverage: [],
      method: `${fd.name}, tax year ${fy.year}, newest return per organization, largest first.`,
      sources: [SRC.f990], searchQuery: searchFor(s, pl),
    };
  }
  const y = grantYears(s);
  const p = new P();
  const gw = grantWhere(c, p, pl, y, true);
  const rows = await ctx.q<{ ein: string; name: string; state: string; usd: number; tier: string | null; funders: number }>(`Top recipients by ${pl.g.adj} grant dollars`, `SELECT o.ein, o.name, o.state, sum(g.amount)::float8 AS usd, ${gw.cs.tier ? `min(${gw.cs.tier})` : "NULL"} AS tier, count(DISTINCT g.funder_ein)::int AS funders
FROM ${pl.g.clean} g ${gw.cs.join} JOIN orgs o ON o.ein = g.recipient_ein
WHERE ${and(gw.where)}
GROUP BY o.ein, o.name, o.state ORDER BY usd DESC LIMIT 10`, p);
  const caveats: string[] = [];
  const note = await causeNote(c, gw.cs, caveats);
  caveats.push(...(await grantCaveats(pl)));
  if (!rows.length) throw new Unanswerable(`No identified recipients for ${causeName(c, pl)} in ${pl.label}.`);
  const u = unit(rows[0].usd);
  const nm = (x: string) => x.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()).slice(0, 44);
  return {
    headline: `${nm(rows[0].name)} received the most ${pl.g.money} for ${causeName(c, pl)}: ${money(rows[0].usd)}, ${yrs(y.from, y.to)}`,
    numbers: rows.slice(0, 3).map((r) => ({ value: money(r.usd), label: nm(r.name) + (r.tier === "partial" ? " (partial)" : "") })),
    bullets: rows.slice(0, 2).map((r) => `${nm(r.name)} (${r.state}): ${b(money(r.usd))} from ${b(int(r.funders))} ${pl.g.givers}`).concat([`Top 10 recipients shown, identified recipients only`]),
    chart: { title: `Top recipients of ${pl.g.grants}, ${causeName(c, pl)}, ${yrs(y.from, y.to)}`, sub: u.title, spec: hbar(rows.map((r) => ({ name: nm(r.name) + (r.tier === "partial" ? " (partial)" : ""), amount: +(r.usd / u.div).toFixed(3) })), "name", "amount", u.title, u.fmt) },
    rows: rows.map((r) => ({ ein: r.ein, name: r.name, state: r.state, usd: r.usd, tier: r.tier, funders: r.funders })),
    causeNote: note, caveats, coverage: [],
    method: `${pl.g.form}, tax years ${yrs(y.from, y.to)}, to identified recipients in the cause set in ${pl.label}, summed by recipient.`,
    sources: [pl.g.src, ...(c?.label ? [SRC.labels] : [])], searchQuery: searchFor(s, pl),
  };
}

// ---- out-of-state funders
async function outOfState(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  const y = grantYears(s);
  const p = new P();
  const gw = grantWhere(c, p, pl, y, false);
  const [r] = await ctx.q<{ usd: number; out_usd: number; in_usd: number; unknown_usd: number }>("In-state vs out-of-state funders", `SELECT sum(g.amount)::float8 AS usd,
       coalesce(sum(g.amount) FILTER (WHERE g.funder_state <> g.recipient_state), 0)::float8 AS out_usd,
       coalesce(sum(g.amount) FILTER (WHERE g.funder_state = g.recipient_state), 0)::float8 AS in_usd,
       coalesce(sum(g.amount) FILTER (WHERE g.funder_state IS NULL), 0)::float8 AS unknown_usd
FROM ${pl.g.clean} g ${gw.cs.join} WHERE ${and(gw.where)}`, p);
  const p2 = new P();
  const gw2 = grantWhere(c, p2, pl, y, false);
  const top = await ctx.q<{ state: string; usd: number }>("Out-of-state money by funder state", `SELECT g.funder_state AS state, sum(g.amount)::float8 AS usd FROM ${pl.g.clean} g ${gw2.cs.join}
WHERE ${and(gw2.where)} AND g.funder_state <> g.recipient_state GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, p2);
  const caveats: string[] = [];
  const note = await causeNote(c, gw.cs, caveats);
  caveats.push(pl.g.kind === "pf" ? "A funder's state is the address on its newest 990-PF; a recipient's is the grant's address, often a headquarters." : "A funder's state is the address on its newest Form 990. A recipient's is the grant's address, often a headquarters.", ...(await grantCaveats(pl)));
  if (!r?.usd) throw new Unanswerable(`No ${pl.g.grants} found for ${causeName(c, pl)} in ${pl.label}.`);
  const known = r.out_usd + r.in_usd;
  const share = r.out_usd / Math.max(1, known);
  const u = unit(top[0]?.usd ?? 1);
  return {
    headline: `${pct(share)} of ${pl.g.money} for ${causeName(c, pl)} in ${pl.label} came from out-of-state ${pl.g.givers}, ${yrs(y.from, y.to)}`,
    numbers: [{ value: pct(share), label: `from other states' ${pl.g.givers}` }, { value: money(r.out_usd), label: "out-of-state $" }, { value: money(r.in_usd), label: "in-state $" }],
    bullets: [`${b(money(r.out_usd))} from ${pl.g.givers} based in other states`, `${b(money(r.in_usd))} from ${pl.g.givers} in the same state`, ...(top[0] ? [`Largest source: ${stateName(top[0].state)} ${pl.g.givers}, ${b(money(top[0].usd))}`] : [])],
    chart: top.length ? { title: `Out-of-state ${pl.g.money} by funder state, ${yrs(y.from, y.to)}`, sub: u.title, spec: hbar(top.map((t) => ({ state: stateName(t.state), amount: +(t.usd / u.div).toFixed(3) })), "state", "amount", u.title, u.fmt) } : null,
    rows: top.map((t) => ({ funder_state: t.state, usd: t.usd })),
    causeNote: note, caveats, coverage: [{ label: "Funder state unknown", value: money(r.unknown_usd) }],
    method: `${pl.g.form}, tax years ${yrs(y.from, y.to)}, to ${c ? "identified recipients in the cause set" : "all recipients"} in ${pl.label}; out-of-state = the ${pl.g.adj}'s state differs from the recipient's.`,
    sources: [pl.g.src], searchQuery: searchFor(s, pl),
  };
}

// ---- grant-size histograms (generosity-data 046): percentiles without sorting every grant
// Rows: amount bucket (3 significant digits), exact (every amount equals the bucket), count, min, max.
// Ordered by bucket then exact first, that's the sorted order of the amounts. A percentile is read like
// percentile_cont: exact when its ranks land in exact rows (or a row's first or last rank, its min or max),
// otherwise interpolated between the row's min and max, which bound the true value (under 1% apart).
type HistRow = { b: number; exact: boolean; n: number; lo: number; hi: number };
type Pctl = { v: number; lo: number; hi: number };
const exactP = (v: number): Pctl => ({ v, lo: v, hi: v });
const histSql = (table: string, where: string[]) => `SELECT h.bucket::float8 AS b, h.exact, sum(h.n)::int AS n, min(h.lo)::float8 AS lo, max(h.hi)::float8 AS hi
FROM ${table} h WHERE ${and(where)} GROUP BY 1, 2 ORDER BY 1, 2 DESC`;
function histPctl(rows: HistRow[], q: number): Pctl {
  const total = rows.reduce((t, r) => t + r.n, 0);
  if (!total) return exactP(0);
  const at = (i: number): Pctl => {
    let start = 0;
    for (const r of rows) {
      if (i < start + r.n) {
        if (r.exact || r.lo === r.hi || i === start) return exactP(r.lo);
        if (i === start + r.n - 1) return exactP(r.hi);
        return { v: r.lo + ((r.hi - r.lo) * (i - start)) / (r.n - 1), lo: r.lo, hi: r.hi };
      }
      start += r.n;
    }
    return exactP(rows[rows.length - 1].hi);
  };
  const h = q * (total - 1), k = Math.floor(h), f = h - k;
  const x = at(k), y = f > 0 ? at(k + 1) : x;
  const mix = (u: number, w: number) => u + f * (w - u);
  return { v: mix(x.v, y.v), lo: mix(x.lo, y.lo), hi: mix(x.hi, y.hi) };
}
function histStats(rows: HistRow[]) {
  const median = histPctl(rows, 0.5), p90 = histPctl(rows, 0.9);
  const loose = (x: Pctl) => money(x.lo) !== money(x.hi);
  return { median, p90, approx: loose(median) || loose(p90) };
}
// Display: the value when every value inside the bounds shows the same, else "about" the estimate.
const histMoney = (p: Pctl) => (money(p.lo) === money(p.hi) ? money(p.v) : `about ${money(p.v)}`);

// ---- grant size
async function grantSize(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  const y = grantYears(s);
  // Research layer: percentiles from grant_size_hist / charity_grant_size_hist, count and average from the cube.
  // Keyword causes, long NTEE codes and counties use the exact grant_clean query.
  const hist = cubeOk(ctx, c, pl);
  const stat = async (cc: Cause | null, title: string) => {
    const p = new P();
    const gw = grantWhere(cc, p, pl, y, false);
    if (hist) {
      const ph = new P(), pc = new P();
      const hw = cubeWhere(cc, ph, pl, y, false, "h"), cw = cubeWhere(cc, pc, pl, y, false);
      const [hr, [cr]] = await Promise.all([
        ctx.q<HistRow>(`${title} (grant-size histogram)`, histSql(pl.g.kind === "pf" ? "grant_size_hist" : "charity_grant_size_hist", hw.where), ph),
        ctx.q<{ n: number; avg: number }>(`${title}, count and average (research cube)`, `SELECT coalesce(sum(x.n), 0)::int AS n, (sum(x.usd)::float8 / nullif(sum(x.n), 0)) AS avg FROM ${pl.g.cube} x WHERE ${and(cw.where)}`, pc),
      ]);
      const h = histStats(hr);
      return { n: cr.n, avg: cr.avg ?? 0, median: h.median, p90: h.p90, approx: h.approx, cs: gw.cs };
    }
    const [r] = await ctx.q<{ n: number; avg: number; median: number; p90: number }>(title, `SELECT count(*)::int AS n, avg(g.amount)::float8 AS avg,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY g.amount)::float8 AS median, percentile_cont(0.9) WITHIN GROUP (ORDER BY g.amount)::float8 AS p90
FROM ${pl.g.clean} g ${gw.cs.join} WHERE ${and(gw.where)}`, p);
    return { ...r, median: exactP(r.median), p90: exactP(r.p90), approx: false, cs: gw.cs };
  };
  const [a0, all0] = await Promise.all([stat(c, `Grant sizes, ${causeName(c, pl)}`), c ? stat(null, "Grant sizes, all grants in the place") : null]);
  // Shown values: exact at the precision shown, or "about" where the histogram can't pin them.
  const shown = (r: typeof a0) => ({ ...r, median: r.median.v, p90: r.p90.v, med$: histMoney(r.median), p90$: histMoney(r.p90) });
  const a = shown(a0), all = all0 ? shown(all0) : null;
  if (!a.n) throw new Unanswerable(`No ${pl.g.grants} found for ${causeName(c, pl)} in ${pl.label}.`);
  const caveats: string[] = [];
  const note = await causeNote(c, a.cs, caveats);
  caveats.push(pl.g.kind === "pf" ? "One row per grant line on a 990-PF; a foundation paying one grantee in installments shows several lines." : "One row per grant line on a Schedule I. Many filers list each recipient once a year, others list each payment.", ...(await grantCaveats(pl)));
  const vals = [{ group: causeName(c, pl), stat: "Median", usd: a.median }, { group: causeName(c, pl), stat: "Average", usd: a.avg }, ...(all ? [{ group: "All grants", stat: "Median", usd: all.median }, { group: "All grants", stat: "Average", usd: all.avg }] : [])];
  return {
    headline: `The median ${pl.g.adj} grant${pl.f.from ? ` from ${pl.f.from}` : ""} to ${c ? c.name : pl.f.to || "all causes"} is ${a.med$}, the average ${money(a.avg)}, ${yrs(y.from, y.to)}`,
    numbers: [{ value: a.med$, label: "median grant" }, { value: money(a.avg), label: "average grant" }, ...(all ? [{ value: all.med$, label: "median, all grants" }] : [{ value: int(a.n), label: "grants" }])],
    bullets: [`Median ${b(a.med$)}, average ${b(money(a.avg))} across ${b(int(a.n))} grants`, `One in ten grants is ${b(a.p90$)} or more`, ...(all ? [`All grants in ${pl.label}: median ${b(all.med$)}`] : [])],
    chart: { title: `Grant size, ${causeName(c, pl)}${all ? " vs all grants" : ""}`, sub: "$ per grant", spec: vbar(vals.map((v) => ({ ...v, usd: Math.round(v.usd) })), "stat", "usd", "", "$ per grant", "$,.0f", all ? "group" : undefined) },
    rows: [{ group: causeName(c, pl), grants: a.n, median: a.median, average: a.avg, p90: a.p90 }, ...(all ? [{ group: "all grants", grants: all.n, median: all.median, average: all.avg, p90: all.p90 }] : [])],
    causeNote: note, caveats, coverage: [{ label: "Grants", value: int(a.n) }],
    method: `Median, average and 90th percentile of ${pl.g.kind === "pf" ? "990-PF" : "Schedule I"} grant amounts, tax years ${yrs(y.from, y.to)}, to ${c ? "identified recipients in the cause set" : "all recipients"} in ${pl.label}.${hist ? ` Median and 90th percentile from grant-size histograms in the research layer (${pl.g.kind === "pf" ? "grant_size_hist" : "charity_grant_size_hist"}, amounts cut to 3 significant digits)${a0.approx || all0?.approx ? ". A value marked about is interpolated inside one bucket, within 1% of the exact figure" : ", exact here"}.` : ""}`,
    sources: [pl.g.src], searchQuery: searchFor(s, pl),
  };
}

// ---- general operating support
async function generalSupport(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  const y = grantYears(s);
  const p = new P();
  const gw = grantWhere(c, p, pl, y, false);
  const pc = new P();
  const cw = cubeOk(ctx, c, pl) ? cubeWhere(c, pc, pl, y, false) : null;
  const [r] = cw
    ? await ctx.q<{ usd: number; gos_usd: number; n: number; gos_n: number }>(`General support share, ${causeName(c, pl)} (research cube)`, `SELECT sum(x.usd)::float8 AS usd, coalesce(sum(x.gos_usd), 0)::float8 AS gos_usd,
       coalesce(sum(x.n), 0)::int AS n, coalesce(sum(x.gos_n), 0)::int AS gos_n
FROM ${pl.g.cube} x WHERE ${and(cw.where)}`, pc)
    : await ctx.q<{ usd: number; gos_usd: number; n: number; gos_n: number }>(`General support share, ${causeName(c, pl)}`, `SELECT sum(g.amount)::float8 AS usd, coalesce(sum(g.amount) FILTER (WHERE g.gos), 0)::float8 AS gos_usd,
       count(*)::int AS n, count(*) FILTER (WHERE g.gos)::int AS gos_n
FROM ${pl.g.clean} g ${gw.cs.join} WHERE ${and(gw.where)}`, p);
  const den = c ? await fDenom(ctx, pl, y) : null;
  if (!r?.n) throw new Unanswerable(`No ${pl.g.grants} found for ${causeName(c, pl)} in ${pl.label}.`);
  const caveats: string[] = [];
  const note = await causeNote(c, gw.cs, caveats);
  caveats.push("General support is read from the grant's purpose text (\"general\", \"unrestricted\", \"operating\"), not a coded field. Vague purposes like \"charitable\" don't count, so it's a floor.", ...(await grantCaveats(pl)));
  const share = r.gos_usd / r.usd, allShare = den ? den.total.gos_usd / den.total.usd : null;
  const vals = [{ group: causeName(c, pl), share: +share.toFixed(4) }, ...(allShare != null ? [{ group: `All grants, ${pl.label}`, share: +allShare.toFixed(4) }] : [])];
  return {
    headline: `${pct(share)} of ${pl.g.adj} dollars to ${causeName(c, pl)} were general operating support, ${yrs(y.from, y.to)}`,
    numbers: [{ value: pct(share), label: "of dollars, general support" }, { value: pct(r.gos_n / r.n), label: "of grants" }, ...(allShare != null ? [{ value: pct(allShare), label: "all grants, same place" }] : [])],
    bullets: [`${b(money(r.gos_usd))} of ${b(money(r.usd))} was general or unrestricted support`, `${b(pct(r.gos_n / r.n))} of ${b(int(r.n))} grants by count`, ...(allShare != null ? [`All ${pl.g.grants} in ${pl.label}: ${b(pct(allShare))}`] : [])],
    chart: { title: "Share of grant dollars marked general or unrestricted", sub: "Share of dollars", spec: hbar(vals, "group", "share", "Share of dollars", ".0%") },
    rows: [{ group: causeName(c, pl), usd: r.usd, gos_usd: r.gos_usd, grants: r.n, gos_grants: r.gos_n }, ...(den ? [{ group: "all", usd: den.total.usd, gos_usd: den.total.gos_usd, grants: den.total.n, gos_grants: den.total.gos_n }] : [])],
    causeNote: note, caveats, coverage: [{ label: "Grants", value: int(r.n) }],
    method: `${pl.g.form}, tax years ${yrs(y.from, y.to)}, to ${c ? "identified recipients in the cause set" : "all recipients"} in ${pl.label}; general support = purpose text matching general / unrestricted / operating.`,
    sources: [pl.g.src], searchQuery: searchFor(s, pl),
  };
}

// ---- concentration
async function concentration(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  const y = grantYears(s);
  const p = new P();
  const gw = grantWhere(c, p, pl, y, true);
  const pr = new P();
  const rw = ryOk(ctx, pl) ? ryWhere(c, pr, pl, y) : null;
  // grant_recipient_year holds each recipient's yearly sums already (research layer).
  const perRecipient = rw ? `SELECT r.recipient_ein, sum(r.usd) AS usd FROM grant_recipient_year r ${rw.join} WHERE ${and(rw.where)} GROUP BY 1` : `SELECT g.recipient_ein, sum(g.amount) AS usd FROM ${pl.g.clean} g ${gw.cs.join} WHERE ${and(gw.where)} GROUP BY 1`;
  const [r] = await ctx.q<{ n: number; total: number; top1: number; top10: number; top10pct: number }>(`Share of dollars to the largest recipients${rw ? " (research layer)" : ""}`, `WITH r AS (${perRecipient}),
k AS (SELECT usd, row_number() OVER (ORDER BY usd DESC) AS rn, count(*) OVER () AS n FROM r)
SELECT max(n)::int AS n, sum(usd)::float8 AS total,
       coalesce(sum(usd) FILTER (WHERE rn <= greatest(1, ceil(n * 0.01))), 0)::float8 AS top1,
       coalesce(sum(usd) FILTER (WHERE rn <= 10), 0)::float8 AS top10,
       coalesce(sum(usd) FILTER (WHERE rn <= greatest(1, ceil(n * 0.10))), 0)::float8 AS top10pct
FROM k`, rw ? pr : p);
  if (!r?.n) throw new Unanswerable(`No identified recipients for ${causeName(c, pl)} in ${pl.label}.`);
  const caveats: string[] = [];
  const note = await causeNote(c, gw.cs, caveats);
  caveats.push("Concentration among identified recipients only; unidentified grants are mostly small, so it may overstate concentration a little.", ...(await grantCaveats(pl)));
  const s1 = r.top1 / r.total, s10 = r.top10pct / r.total;
  const vals = [{ group: `Top 1% (${int(Math.max(1, Math.ceil(r.n * 0.01)))} orgs)`, share: +s1.toFixed(4) }, { group: "Next 9%", share: +(s10 - s1).toFixed(4) }, { group: "Other 90%", share: +(1 - s10).toFixed(4) }];
  return {
    headline: `The top 1% of recipients got ${pct(s1)} of ${pl.g.money} for ${causeName(c, pl)}, ${yrs(y.from, y.to)}`,
    numbers: [{ value: pct(s1), label: "to the top 1% of recipients" }, { value: pct(r.top10 / r.total), label: "to the top 10 orgs" }, { value: int(r.n), label: "recipient orgs" }],
    bullets: [`Top 1%: ${b(pct(s1))} of ${b(money(r.total))}`, `Top 10%: ${b(pct(s10))}, the other 90% share ${b(pct(1 - s10))}`, `The 10 largest recipients alone got ${b(pct(r.top10 / r.total))}`],
    chart: { title: `How concentrated: ${causeName(c, pl)}, ${pl.label}`, sub: "Share of grant dollars", spec: hbar(vals, "group", "share", "Share of grant dollars", ".0%") },
    rows: [{ recipients: r.n, total: r.total, top1pct_usd: r.top1, top10pct_usd: r.top10pct, top10_orgs_usd: r.top10 }],
    causeNote: note, caveats, coverage: [{ label: "Recipients", value: int(r.n) }],
    method: `${pl.g.form}, tax years ${yrs(y.from, y.to)}, summed per identified recipient, ranked; share of the total held by the top 1%, top 10% and top 10 recipients.`,
    sources: [pl.g.src], searchQuery: searchFor(s, pl),
  };
}

// ---- the largest 1% of nonprofits by a Form 990 line (revenue, contributions, government grants)
// Ranked by the line itself, one return per org for the tax year. The top 1% is counted two ways: of all
// orgs on the IRS list in the set (990-N and non-filers are small, so they sit below the cut) and of e-filers.
async function flagConcentration(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  const fd = FIELD[s.source];
  const fy = flagYear(s);
  const universe = await orgUniverse(ctx, c, pl);
  const p = new P();
  const cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
  const where = [`f.tax_year = ${p.add(fy.year)}`, "coalesce(f.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "f.state", "f.county_fips"), ...filtEin(pl.f, p, "f.ein")];
  const k1 = Math.max(1, Math.ceil(universe * 0.01)), k10 = Math.max(1, Math.ceil(universe * 0.1));
  const [r] = await ctx.q<{ n: number; total: number; top1: number; top1f: number; top10: number; cut1: number; top10orgs: number }>(`Share of ${fd.short} held by the largest organizations, ${fy.year}`, `WITH v AS MATERIALIZED (SELECT greatest(coalesce(${fd.col}, 0), 0)::float8 AS v FROM flag_year f ${cs.join} WHERE ${and(where)}),
n AS (SELECT count(*)::int AS n, coalesce(sum(v), 0)::float8 AS total FROM v),
r AS (SELECT v, row_number() OVER (ORDER BY v DESC) AS rn FROM (SELECT v FROM v ORDER BY v DESC LIMIT ${p.add(Math.max(k10, 10))}) t)
SELECT n.n, n.total,
  (SELECT coalesce(sum(v), 0) FROM r WHERE rn <= ${p.add(k1)})::float8 AS top1,
  (SELECT coalesce(sum(v), 0) FROM r WHERE rn <= greatest(1, ceil(n.n * 0.01)))::float8 AS top1f,
  (SELECT coalesce(sum(v), 0) FROM r WHERE rn <= ${p.add(k10)})::float8 AS top10,
  (SELECT min(v) FROM r WHERE rn <= ${p.add(k1)})::float8 AS cut1,
  (SELECT coalesce(sum(v), 0) FROM r WHERE rn <= 10)::float8 AS top10orgs
FROM n`, p);
  if (!r?.n || !r.total) throw new Unanswerable(`No ${fd.short} reported for ${causeName(c, pl)} in ${pl.label}.`);
  const caveats: string[] = [];
  const note = await causeNote(c, cs, caveats);
  if (fy.note) caveats.push(fy.note);
  if (s.source === "government_grants") caveats.push(GOV_CAVEAT);
  caveats.push(`The top 1% = the ${int(k1)} largest of the ${int(universe)} organizations on the IRS list${c ? " in the set" : ""}. Only ${int(r.n)} e-filed a ${fy.year} Form 990 or 990-EZ. The rest are mostly small 990-N filers, so they fall below the cut.`,
    ...(s.source === "revenue" ? ["Revenue counts every source an org reports: gifts, grants, program fees and investment income. Hospitals and universities earn most of theirs from fees, so they dominate the top."] : []));
  const s1 = r.top1 / r.total, s10 = r.top10 / r.total, s1f = r.top1f / r.total;
  const subject = c ? orgsOf(c.name) : "nonprofits";
  const inX = pl.label !== "the US" ? ` in ${pl.label}` : "";
  const vals = [{ group: `Top 1% (${int(k1)} orgs)`, share: +s1.toFixed(4) }, { group: "Next 9%", share: +(s10 - s1).toFixed(4) }, { group: "Other 90%", share: +(1 - s10).toFixed(4) }];
  return {
    headline: `The largest 1% of ${subject}${inX} took in ${pct(s1)} of all ${fd.short} reported for ${fy.year}`,
    numbers: [{ value: pct(s1), label: `to the largest 1% (${int(k1)} orgs)` }, { value: money(r.cut1), label: `or more puts an org in the top 1%` }, { value: pct(s10), label: "to the largest 10%" }],
    bullets: [`The largest 1% held ${b(money(r.top1))} of ${b(money(r.total))}`, `Counting only e-filers, the top 1% held ${b(pct(s1f))}`, `The 10 largest alone held ${b(pct(r.top10orgs / r.total))}`],
    chart: { title: `How concentrated: ${fd.short} of ${subject}${inX}, ${fy.year}`, sub: `Share of ${fd.short}`, spec: hbar(vals, "group", "share", `Share of ${fd.short}`, ".0%") },
    rows: [{ tax_year: fy.year, orgs_on_irs_list: universe, efilers: r.n, total_usd: r.total, top1pct_orgs: k1, top1pct_usd: r.top1, top1pct_cutoff_usd: r.cut1, top10pct_usd: r.top10, top10_orgs_usd: r.top10orgs }],
    causeNote: note, caveats, coverage: [{ label: "Orgs on the IRS list", value: int(universe) }, { label: `E-filed ${fy.year} returns`, value: int(r.n) }],
    method: `${cap(fd.name)}, tax year ${fy.year}, one return per organization (newest filing), private foundations excluded${c ? ", in the cause set" : ""}${inX}. Organizations ranked by that amount. Top 1% = the largest 1% of all organizations on the IRS master file in the set, top 10% likewise.`,
    sources: [SRC.f990, SRC.bmf], searchQuery: searchFor(s, pl), orgCount: universe,
  };
}

// ---- grant money to the largest 1% (and 10%) of nonprofits by revenue
// Organizations with a known revenue (recipient_profile: newest e-filed 990, else the IRS master file),
// ranked by revenue. Grant dollars by the recipient's EIN, over all identified-recipient dollars.
async function sizeConcentration(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  const y = grantYears(s);
  const p = new P();
  const cs = causeSql(c, p, "o.ein", "o.ntee_cd");
  const uw = ["coalesce(o.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...(pl.states.length ? [`o.state = ANY(${p.add(pl.states)}::text[])`] : [])];
  const rw = ryOk(ctx, pl) ? ryWhere(c, p, pl, y) : null;
  const gw = rw ? null : grantWhere(c, p, pl, y, true);
  const perRecipient = rw ? `SELECT r.recipient_ein AS ein, sum(r.usd)::float8 AS usd FROM grant_recipient_year r ${rw.join} WHERE ${and(rw.where)} GROUP BY 1`
    : `SELECT g.recipient_ein AS ein, sum(g.amount)::float8 AS usd FROM ${pl.g.clean} g ${gw!.cs.join} WHERE ${and(gw!.where)} GROUP BY 1`;
  const [r] = await ctx.q<{ n: number; rev: number; cut1: number; cut10: number; rev1: number; rev10: number; g1: number; g10: number; gall: number; gknown: number }>(`${cap(pl.g.grants)} to the largest organizations by revenue${rw ? " (research layer)" : ""}`, `WITH u AS MATERIALIZED (SELECT rp.ein, greatest(rp.revenue, 0)::float8 AS revenue FROM recipient_profile rp JOIN orgs o ON o.ein = rp.ein ${cs.join} WHERE ${and(uw)}),
n AS (SELECT count(*)::int AS n, coalesce(sum(revenue), 0)::float8 AS rev FROM u),
c1 AS (SELECT revenue FROM u ORDER BY revenue DESC OFFSET (SELECT greatest(ceil(n * 0.01)::int - 1, 0) FROM n) LIMIT 1),
c10 AS (SELECT revenue FROM u ORDER BY revenue DESC OFFSET (SELECT greatest(ceil(n * 0.10)::int - 1, 0) FROM n) LIMIT 1),
g AS MATERIALIZED (${perRecipient}),
gu AS (SELECT g.usd, u.revenue FROM g JOIN u USING (ein))
SELECT n.n, n.rev, (SELECT revenue FROM c1)::float8 AS cut1, (SELECT revenue FROM c10)::float8 AS cut10,
  (SELECT coalesce(sum(revenue), 0) FROM u WHERE revenue >= (SELECT revenue FROM c1))::float8 AS rev1,
  (SELECT coalesce(sum(revenue), 0) FROM u WHERE revenue >= (SELECT revenue FROM c10))::float8 AS rev10,
  (SELECT coalesce(sum(usd), 0) FROM gu WHERE revenue >= (SELECT revenue FROM c1))::float8 AS g1,
  (SELECT coalesce(sum(usd), 0) FROM gu WHERE revenue >= (SELECT revenue FROM c10))::float8 AS g10,
  (SELECT coalesce(sum(usd), 0) FROM g)::float8 AS gall, (SELECT coalesce(sum(usd), 0) FROM gu)::float8 AS gknown
FROM n`, p);
  if (!r?.n || !r.gall) throw new Unanswerable(`No ${pl.g.grants} found for ${causeName(c, pl)} in ${pl.label}.`);
  const caveats: string[] = [];
  const note = await causeNote(c, cs, caveats);
  if (y.partial) caveats.push(`${G_LAST} returns are still arriving, so ${G_LAST} is incomplete.`);
  caveats.push(`Revenue = newest e-filed 990 or 990-EZ, else the IRS master file, not the grant year. ${pct(1 - r.gknown / r.gall)} of identified-recipient grant dollars went to orgs with no known revenue and count in the total only.`,
    ...(pl.states.length ? ["Organizations are ranked within the states asked by their registered address. Grants are placed by the grant's address, usually the same."] : []),
    ...(await grantCaveats(pl)));
  const k1 = Math.ceil(r.n * 0.01);
  const g1 = r.g1 / r.gall, g10 = r.g10 / r.gall, rv1 = r.rev1 / Math.max(1, r.rev);
  const subject = c ? orgsOf(c.name) : "nonprofits";
  const inX = pl.label !== "the US" ? ` in ${pl.label}` : "";
  const yr = yrs(y.from, y.to);
  const vals = [{ group: "Largest 1% by revenue", share: +g1.toFixed(4) }, { group: "Next 9%", share: +(g10 - g1).toFixed(4) }, { group: "Other 90% and unknown", share: +(1 - g10).toFixed(4) }];
  return {
    headline: `The largest 1% of ${subject}${inX} by revenue got ${pct(g1)} of ${pl.g.money}, ${yr}`,
    numbers: [{ value: pct(g1), label: `of ${pl.g.adj} grant $ to the largest 1%` }, { value: money(r.cut1), label: "revenue or more = top 1%" }, { value: pct(rv1), label: "of all revenue held by that 1%" }],
    bullets: [`The largest 1%, ${b(int(k1))} orgs, got ${b(money(r.g1))} of ${b(money(r.gall))}`, `The largest 10% got ${b(pct(g10))} of the grant dollars`, `The top 1% hold ${b(pct(rv1))} of these orgs' revenue, so grants are less concentrated`],
    chart: { title: `${cap(pl.g.grants)} by recipient revenue rank${inX}, ${yr}`, sub: "Share of grant dollars", spec: hbar(vals, "group", "share", "Share of grant dollars", ".0%") },
    rows: [{ orgs_with_revenue: r.n, revenue_usd: r.rev, top1pct_cutoff_usd: r.cut1, top10pct_cutoff_usd: r.cut10, top1pct_revenue_usd: r.rev1, top1pct_grants_usd: r.g1, top10pct_grants_usd: r.g10, all_identified_grants_usd: r.gall }],
    causeNote: note, caveats, coverage: [{ label: "Orgs with known revenue", value: int(r.n) }, { label: "Top 1% revenue cutoff", value: money(r.cut1) }],
    method: `Organizations with a known revenue (private foundations excluded)${c ? " in the cause set" : ""}${inX}, ranked by revenue. Top 1% = revenue at or above the 1st-percentile cutoff. Their ${pl.g.form}, tax years ${yr}, over all ${pl.g.grants} to identified recipients there.`,
    sources: [pl.g.src, SRC.f990, SRC.bmf], searchQuery: null,
  };
}

// ---- foundations that fund both X and Y
async function overlap(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const [a, z] = s.causes;
  if (!a || !z) throw new Unanswerable("Name two causes to find foundations that fund both, e.g. climate and women and girls.");
  const y = grantYears(s);
  const p = new P();
  const ga = grantWhere(a, p, pl, y, true, "a");
  const gz = grantWhere(z, p, pl, y, true, "z");
  const rows = await ctx.q<{ ein: string; name: string; state: string; a_usd: number; z_usd: number; na: number; nz: number; nboth: number }>(`${pl.g.who} funding both causes`, `WITH a AS (SELECT g.funder_ein, sum(g.amount)::float8 AS usd FROM ${pl.g.clean} g ${ga.cs.join} WHERE ${and(ga.where)} GROUP BY 1),
z AS (SELECT g.funder_ein, sum(g.amount)::float8 AS usd FROM ${pl.g.clean} g ${gz.cs.join} WHERE ${and(gz.where)} GROUP BY 1),
ab AS (SELECT a.funder_ein, a.usd AS a_usd, z.usd AS z_usd FROM a JOIN z USING (funder_ein))
SELECT f.ein, f.name, f.state, ab.a_usd, ab.z_usd, (SELECT count(*) FROM a)::int AS na, (SELECT count(*) FROM z)::int AS nz, (SELECT count(*) FROM ab)::int AS nboth
FROM ab JOIN ${pl.g.funders} f ON f.ein = ab.funder_ein ORDER BY least(ab.a_usd, ab.z_usd) DESC LIMIT 10`, p);
  const caveats: string[] = [];
  const notes = [await causeNote(a, ga.cs, caveats), await causeNote(z, gz.cs, caveats)];
  caveats.push(...(await grantCaveats(pl)));
  if (!rows.length) throw new Unanswerable(`No ${pl.g.adj} funded both ${a.name} and ${z.name} in ${pl.label}, ${yrs(y.from, y.to)}.`);
  const { na, nz, nboth } = rows[0];
  const nm = (x: string) => x.replace(/\bFOUNDATION\b/gi, "Fdn").replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()).slice(0, 40);
  const u = unit(Math.max(...rows.map((r) => Math.max(r.a_usd, r.z_usd))));
  return {
    headline: `${int(nboth)} ${pl.g.givers} funded both ${a.name} and ${z.name}, ${yrs(y.from, y.to)}`,
    numbers: [{ value: int(nboth), label: "fund both" }, { value: pct(nboth / Math.max(1, Math.min(na, nz))), label: `of the smaller group's funders` }, { value: `${int(na)} / ${int(nz)}`, label: `fund ${a.name} / ${z.name}` }],
    bullets: [`${b(int(nboth))} of ${b(int(na))} ${a.name} funders also fund ${z.name}`, `Largest in both: ${nm(rows[0].name)}, ${b(money(rows[0].a_usd))} and ${b(money(rows[0].z_usd))}`],
    chart: { title: `${pl.g.who} funding both, ${yrs(y.from, y.to)}`, sub: u.title, spec: vbar(rows.flatMap((r) => [{ funder: nm(r.name), cause: a.name, amount: +(r.a_usd / u.div).toFixed(3) }, { funder: nm(r.name), cause: z.name, amount: +(r.z_usd / u.div).toFixed(3) }]).slice(0, 16), "funder", "amount", "", u.title, u.fmt, "cause") },
    rows: rows.map((r) => ({ funder_ein: r.ein, funder: r.name, state: r.state, [`${a.name}_usd`]: r.a_usd, [`${z.name}_usd`]: r.z_usd })),
    causeNote: notes.join(" "), caveats, coverage: [{ label: `${a.name} funders`, value: int(na) }, { label: `${z.name} funders`, value: int(nz) }],
    method: `${pl.g.who} with at least one ${pl.g.kind === "pf" ? "990-PF" : "Schedule I"} grant, tax years ${yrs(y.from, y.to)}, to an identified recipient in each cause set (labels count both tiers), ranked by the smaller of the two amounts.`,
    sources: [pl.g.src, SRC.labels], searchQuery: null,
  };
}

// ---- federal awards to nonprofits (USAspending.gov; generosity-data 044 federal_awards)
// Grants and cooperative agreements to nonprofits and private colleges, by federal fiscal year and place of
// performance. Causes use the linked recipient's NTEE code or label (identified recipients only).
const FA_FIRST = 2022, FA_LAST = 2025;
const FED_CAVEATS = [
  "Federal grants and cooperative agreements to nonprofits and private colleges (USAspending.gov), net obligations by federal fiscal year (October to September). Contracts, loans and direct payments are left out, and so is federal money passed through states and cities to nonprofits.",
  "Placed where the work happens (place of performance), not where the recipient is headquartered. Statewide and multi-state awards have no county, and multi-state awards have no state.",
];
function fedYears(s: Spec) {
  const from = Math.min(Math.max(s.yearFrom ?? FA_FIRST, FA_FIRST), FA_LAST);
  const to = Math.min(Math.max(s.yearTo ?? FA_LAST, from), FA_LAST);
  const asked = (s.yearFrom != null && (s.yearFrom < FA_FIRST || s.yearFrom > FA_LAST)) || (s.yearTo != null && (s.yearTo < FA_FIRST || s.yearTo > FA_LAST));
  return { from, to, note: asked ? `Federal awards here cover fiscal years ${FA_FIRST}–${FA_LAST}.` : null };
}
// WHERE terms on federal_awards (alias fa, with orgs o joined) for a cause, place and years.
function fedWhere(c: C | null, p: P, pl: Place, y: { from: number; to: number }, sfx = "") {
  const cs = causeSql(c, p, "fa.recipient_ein", "o.ntee_cd", sfx, true);
  const w = [`fa.fiscal_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`, ...(c && !c.all ? ["fa.recipient_ein IS NOT NULL"] : []), ...cs.where];
  if (pl.county) w.push(`fa.pop_county_fips = ${p.add(pl.county.fips)}`);
  else if (pl.states.length) w.push(`fa.pop_state = ANY(${p.add(pl.states)}::text[])`);
  if (pl.area) w.push(`fa.pop_county_fips IN (SELECT county_fips FROM county_need WHERE county_fips <> '00000' AND population ${pl.area === "rural" ? "<" : ">="} ${RURAL_POP})`);
  if (pl.f.rb) w.push(`fa.recipient_ein IN (SELECT ein FROM recipient_profile WHERE band BETWEEN ${p.add(pl.f.rb[0])} AND ${p.add(pl.f.rb[1])})`);
  return { cs, from: `federal_awards fa LEFT JOIN orgs o ON o.ein = fa.recipient_ein ${cs.join}`, where: w };
}
const fedSum = (cs: CauseSql) => primarySum(cs, "fa.amount");
const titleCase = (x: string) => x.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()).replace(/\b(Of|And|For|The|In|On|To)\b/g, (m) => m.toLowerCase()).slice(0, 48);

async function federal(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c: C | null = s.causes[0] ?? null;
  const y = fedYears(s);
  const yr = yrs(y.from, y.to);
  const caveats: string[] = [];
  if (y.note) caveats.push(y.note);
  const forX = c ? ` for ${c.name}` : "";
  const inX = pl.label !== "the US" ? ` in ${pl.label}` : "";
  const nm = (x: string) => titleCase(x);
  const base = { searchQuery: searchFor(s, pl), sources: [SRC.fed, ...(c?.label ? [SRC.labels] : []), ...(c?.ntee.length ? [SRC.ntee] : [])] };
  const finish = async (o: Omit<Out, "caveats" | "causeNote" | "searchQuery" | "sources">, cs: CauseSql, extra: string[] = []): Promise<Out> => {
    const note = await causeNote(c, cs, caveats);
    if (c) caveats.push("Causes count only recipients linked to an IRS-registered organization (by name and place), so cause totals run low.");
    return { ...o, ...base, causeNote: note, caveats: [...extra, ...caveats, ...FED_CAVEATS, await fedLinkNote()] };
  };
  const metric = s.metric === "breakdown" && s.by === "state" && !s.measure ? "by_state" : s.metric === "grant_size" && s.by ? "breakdown" : s.metric;
  switch (metric) {
    case "total": case "share": case "compare": case "trend": {
      const cs0 = c ? null : causeSql(null, new P(), "", "");
      const causes: (C | null)[] = s.causes.length ? s.causes.slice(0, metric === "compare" ? 2 : 1) : [null];
      const byYear = async (cc: C | null, title: string) => {
        const p = new P();
        const fw = fedWhere(cc, p, pl, y);
        const rows = await ctx.q<{ year: number | null; usd: number; primary_usd: number; awards: number; orgs: number }>(title, `SELECT fa.fiscal_year::int AS year, coalesce(sum(fa.amount), 0)::float8 AS usd, ${fedSum(fw.cs)} AS primary_usd,
       count(*)::int AS awards, count(DISTINCT coalesce(fa.recipient_ein, fa.recipient_uei, fa.recipient_name))::int AS orgs
FROM ${fw.from} WHERE ${and(fw.where)}
GROUP BY GROUPING SETS ((fa.fiscal_year), ()) ORDER BY 1 NULLS LAST`, p);
        return { cs: fw.cs, years: rows.filter((r) => r.year != null), total: rows.find((r) => r.year == null) ?? { year: null, usd: 0, primary_usd: 0, awards: 0, orgs: 0 } };
      };
      const [all, ...ms] = await Promise.all([byYear(null, `All federal awards to nonprofits${inX}, by fiscal year`), ...causes.map((cc) => (cc ? byYear(cc, `Federal awards to ${cc.name}${inX}, by fiscal year`) : null))]);
      const m0 = ms[0] ?? all;
      const val = (m: typeof all, cc: C | null) => (cc?.label ? m.total.primary_usd : m.total.usd);
      const yv = (m: typeof all, yy: number, cc: C | null) => { const r = m.years.find((x) => x.year === yy); return r ? (cc?.label ? r.primary_usd : r.usd) : 0; };
      const v0 = val(m0, c);
      const nYears = y.to - y.from + 1;
      const growth = y.from < y.to && yv(m0, y.from, c) ? yv(m0, y.to, c) / yv(m0, y.from, c) - 1 : null;
      const u = unit(Math.max(...m0.years.map((r) => (c?.label ? r.primary_usd : r.usd)), 1));
      // 990 comparison: the same linked recipients' government grants on their Form 990 (all levels of government).
      const pc = new P();
      const fw = fedWhere(c, pc, pl, { from: 2024, to: 2024 });
      const [cmp] = await ctx.q<{ orgs: number; fed: number; gov990: number }>("Linked recipients: federal awards FY2024 vs government grants on their 2024 Form 990", `WITH x AS (SELECT fa.recipient_ein, sum(fa.amount)::float8 AS fed FROM ${fw.from} WHERE ${and([...fw.where, "fa.recipient_ein IS NOT NULL"])} GROUP BY 1)
SELECT count(*)::int AS orgs, coalesce(sum(x.fed), 0)::float8 AS fed, coalesce(sum(coalesce(f.government_grants, 0)), 0)::float8 AS gov990
FROM x JOIN flag_year f ON f.ein = x.recipient_ein AND f.tax_year = 2024 AND f.form = '990'`, pc);
      const cmpNote = cmp?.orgs ? `For the ${int(cmp.orgs)} linked recipients with a 2024 Form 990, federal awards in FY2024 were ${money(cmp.fed)}, against ${money(cmp.gov990)} they reported as government grants (line 1e). The 990 line also counts state and local grants and federal money passed through states, and fiscal years differ.` : "";
      const rows: Row[] = causes.flatMap((cc, i) => (ms[i] ?? all).years.map((r) => ({ cause: cc?.name ?? "all", fiscal_year: r.year, usd: r.usd, primary_usd: cc?.label ? r.primary_usd : null, awards: r.awards, recipients: r.orgs })));
      const chartRows = causes.flatMap((cc, i) => (ms[i] ?? all).years.map((r) => ({ year: `FY${r.year}`, series: cc?.name ?? "All causes", amount: +((cc?.label ? r.primary_usd : r.usd) / u.div).toFixed(3) })));
      const chart = { title: `Federal awards to nonprofits${forX}${inX}, by fiscal year`, sub: u.title, spec: vbar(chartRows, "year", "amount", "Fiscal year", u.title, u.fmt, causes.length > 1 ? "series" : undefined) };
      const method = `Sum of net federal obligations (grants and cooperative agreements, USAspending.gov) to nonprofit and private-college recipients, fiscal years ${yr}, placed by place of performance${c ? ", for recipients linked to an org in the cause set" : ""}.`;
      const cs = ms[0]?.cs ?? cs0!;
      if (metric === "compare" && causes.length === 2 && ms[1]) {
        const v1 = val(ms[1], causes[1]);
        return finish({ headline: `${cap(causes[0]!.name)}: ${money(v0)} vs ${causes[1]!.name}: ${money(v1)} in federal awards to nonprofits${inX}, FY${yr}`,
          numbers: [{ value: money(v0), label: causes[0]!.name }, { value: money(v1), label: causes[1]!.name }, { value: money(all.total.usd), label: "all federal awards to nonprofits" }],
          bullets: [`${b(pct(v0 / Math.max(1, all.total.usd)))} and ${b(pct(v1 / Math.max(1, all.total.usd)))} of all federal awards to nonprofits${inX}`],
          chart, rows, coverage: [{ label: "Award-years", value: int(all.total.awards) }], method, versus: { first: causes[0]!.name, second: causes[1]!.name, a: v0, z: v1 } }, cs, cmpNote ? [cmpNote] : []);
      }
      if (metric === "trend") {
        return finish({ headline: growth == null ? `Federal awards to nonprofits${forX}${inX}: ${money(v0)}, FY${yr}` : `Federal awards to nonprofits${forX}${inX} ${growth >= 0 ? "grew" : "fell"} ${pct(Math.abs(growth))} from FY${y.from} to FY${y.to}`,
          numbers: [...(growth != null ? [{ value: signed(growth), label: `FY${y.from} to FY${y.to}` }] : []), { value: money(v0 / nYears), label: "a year" }, { value: int(m0.total.orgs), label: "recipients" }],
          bullets: [`${b(money(yv(m0, y.to, c)))} in FY${y.to}, ${b(money(yv(m0, y.from, c)))} in FY${y.from}`],
          chart, rows, coverage: [{ label: "Award-years", value: int(m0.total.awards) }], method, ...(growth != null ? { change: { subject: `federal awards to nonprofits${forX}${inX}`, g: growth, from: `FY${y.from}`, to: `FY${y.to}` } } : {}) }, cs);
      }
      const share = v0 / Math.max(1, all.total.usd);
      return finish({
        headline: c ? `Federal agencies awarded ${money(v0)} to nonprofits${forX}${inX}, FY${yr}: ${pct(share)} of federal awards to nonprofits there` : `Federal agencies awarded ${money(v0)} to nonprofits${inX}, FY${yr}`,
        numbers: [{ value: money(v0), label: `federal awards, FY${yr}` }, ...(c ? [{ value: pct(share), label: "of federal awards to nonprofits" }] : []), { value: money(v0 / nYears), label: "a year" }, { value: int(m0.total.orgs), label: "recipients" }],
        bullets: [`${b(int(m0.total.awards))} award-years to ${b(int(m0.total.orgs))} recipients`, ...(growth != null ? [`Changed ${b(signed(growth))} from FY${y.from} to FY${y.to}`] : [])],
        chart, rows, coverage: [{ label: "Award-years", value: int(m0.total.awards) }, { label: "Recipients", value: int(m0.total.orgs) }], method, orgCount: c ? m0.total.orgs : undefined,
        ...(growth != null ? { change: { subject: `federal awards to nonprofits${forX}${inX}`, g: growth, from: `FY${y.from}`, to: `FY${y.to}` } } : {}),
      }, cs, cmpNote ? [cmpNote] : []);
    }
    case "by_state": case "breakdown": case "top_funders": case "top_recipients": {
      const by = metric === "by_state" ? "state" : metric === "top_funders" ? "agency" : metric === "top_recipients" ? "recipient" : (s.by ?? "agency");
      if (!["state", "county", "year", "agency", "program", "cause", "cause_detail", "recipient"].includes(by)) throw new Unanswerable("Federal awards split by state, county, year, agency, program, cause or recipient.");
      if (by === "county" && pl.county) throw new Unanswerable("Pick a state or the whole US to rank counties.");
      const p = new P();
      const fw = fedWhere(c, p, pl, y);
      const dim: Record<string, [string, string]> = {
        state: ["fa.pop_state", "fa.pop_state IS NOT NULL"], county: ["fa.pop_county_fips", "fa.pop_county_fips IS NOT NULL"], year: ["fa.fiscal_year::text", "true"],
        agency: ["fa.agency_name", "true"], program: ["fa.cfda_number || ' ' || coalesce(fa.cfda_title, '')", "fa.cfda_number IS NOT NULL"],
        cause: ["coalesce(left(o.ntee_cd, 1), '?')", "fa.recipient_ein IS NOT NULL"], cause_detail: ["coalesce(left(o.ntee_cd, 3), '?')", "fa.recipient_ein IS NOT NULL"],
        recipient: ["coalesce(fa.recipient_ein, fa.recipient_uei, fa.recipient_name)", "true"],
      };
      const raw = await ctx.q<{ k: string; name: string | null; usd: number; n: number; orgs: number }>(`Federal awards by ${by}`, `SELECT ${dim[by][0]} AS k, min(fa.recipient_name) AS name, ${fedSum(fw.cs)} AS usd, count(*)::int AS n,
       count(DISTINCT coalesce(fa.recipient_ein, fa.recipient_uei, fa.recipient_name))::int AS orgs
FROM ${fw.from} WHERE ${and([...fw.where, dim[by][1]])} GROUP BY 1`, p);
      const perX = (s.perResident || s.perPoverty) && (by === "state" || by === "county");
      const perWord = s.perPoverty ? "per person in poverty" : "per resident";
      let place = new Map<string, { name: string; pop: number }>();
      if (by === "state" || by === "county") {
        const col = s.perPoverty ? "a.people_in_poverty" : "n.population";
        const r = await ctx.q<{ k: string; name: string; pop: number }>(s.perPoverty ? "People in poverty (Census ACS 2020-24)" : "Population (Census 2024)", by === "state"
          ? `SELECT n.state AS k, n.state AS name, sum(${col})::float8 AS pop FROM county_need n LEFT JOIN county_acs a USING (county_fips) WHERE n.county_fips <> '00000' GROUP BY 1`
          : `SELECT n.county_fips AS k, n.name || ', ' || n.state AS name, ${col}::float8 AS pop FROM county_need n LEFT JOIN county_acs a USING (county_fips) WHERE n.county_fips <> '00000'`, new P());
        place = new Map(r.map((x) => [x.k, { name: by === "state" ? stateName(x.k) : x.name, pop: x.pop }]));
      }
      const names = by === "cause_detail" ? (await taxonomy()).names : null;
      const nameOf = (r: { k: string; name: string | null }) => by === "state" || by === "county" ? place.get(r.k)?.name ?? r.k
        : by === "cause" ? (r.k === "?" ? "No NTEE code" : `${nteeLabel(r.k) ?? r.k} (${r.k})`) : by === "cause_detail" ? (r.k === "?" ? "No NTEE code" : `${names?.get(r.k) ?? r.k} (${r.k})`)
          : by === "year" ? `FY${r.k}` : by === "recipient" ? nm(r.name ?? r.k) : by === "agency" ? r.k : r.k.replace(/^(\S+) (.*)$/, (_, n2, t) => `${titleCase(t)} (${n2})`);
      const nYears = y.to - y.from + 1;
      const groups = raw.map((r) => {
        const pop = place.get(r.k)?.pop ?? 0;
        return { k: r.k, name: nameOf(r), usd: r.usd, n: r.n, orgs: r.orgs, pop, v: s.measure === "average_grant" ? r.usd / Math.max(1, r.n) : s.measure === "grants" ? r.n : perX ? (pop ? r.usd / pop / nYears : 0) : r.usd };
      }).filter((g) => !perX || g.pop > 0);
      if (!groups.length) throw new Unanswerable(`No federal awards to nonprofits found${forX}${inX}.`);
      const total = groups.reduce((a2, g) => a2 + g.usd, 0);
      const ranked = [...groups].sort((a2, z) => (s.order === "least" ? a2.v - z.v : z.v - a2.v) || String(a2.k).localeCompare(String(z.k)));
      const shown = by === "year" ? [...groups].sort((a2, z) => Number(a2.k) - Number(z.k)) : ranked.slice(0, 12);
      const top = ranked[0];
      const fmtV = (x: number) => (s.measure === "grants" ? int(x) : perX ? perRes(x) : money(x));
      const u = unit(Math.max(...shown.map((g) => g.v), 1));
      const dollars = !perX && s.measure !== "grants" && s.measure !== "average_grant";
      const whatBy: Record<string, string> = { state: "state (place of performance)", county: "county (place of performance)", year: "fiscal year", agency: "awarding agency", program: "assistance listing (program)", cause: "recipient cause area (NTEE)", cause_detail: "recipient NTEE code", recipient: "recipient" };
      const lead = by === "agency" ? `${top.name} awarded the most` : by === "recipient" ? `${top.name} received the most` : `${top.name} got the ${s.order === "least" ? "least" : "most"}`;
      return finish({
        headline: `${lead} in federal awards to nonprofits${forX}${inX}${perX ? ` ${perWord}` : ""}: ${fmtV(top.v)}${perX ? " a year" : dollars ? `, ${pct(top.usd / Math.max(1, total))} of the total` : ""}, FY${yr}`,
        numbers: ranked.slice(0, 3).map((g) => ({ value: fmtV(g.v), label: g.name })),
        bullets: [`${b(money(total))} across ${b(int(groups.length))} ${by === "recipient" ? "recipients" : "groups"}, FY${yr}`, ...(by !== "recipient" ? [`${top.name}: ${b(int(top.orgs))} recipients`] : [])],
        chart: { title: `Federal awards to nonprofits${forX}${perX ? ` ${perWord}` : ""} by ${whatBy[by]}${inX}, FY${yr}`, sub: dollars ? u.title : perX ? `$ ${perWord}` : "", spec: hbar(shown.map((g) => ({ group: g.name, value: dollars ? +(g.v / u.div).toFixed(3) : +g.v.toFixed(2) })), "group", "value", dollars ? u.title : perX ? `$ ${perWord} a year` : "", dollars ? u.fmt : perX ? "$,.2f" : ",.0f") },
        rows: ranked.map((g) => ({ key: g.k, name: g.name, usd: g.usd, award_years: g.n, recipients: g.orgs, ...(by === "state" || by === "county" ? { [s.perPoverty ? "people_in_poverty" : "population"]: g.pop, value: g.v } : {}) })),
        coverage: [{ label: "Groups", value: int(groups.length) }],
        method: `Net federal obligations to nonprofit and private-college recipients (grants and cooperative agreements), fiscal years ${yr}, summed by ${whatBy[by]}${perX ? `, divided by ${s.perPoverty ? "people in poverty (Census ACS 2020-24)" : "2024 Census population"} and ${nYears} years` : ""}.`,
      }, fw.cs);
    }
    case "grant_size": {
      const p = new P();
      const fw = fedWhere(c, p, pl, y);
      // fed_award_size_hist (generosity-data 046) unless the cause is keywords or a long NTEE code, or a county.
      const hist = ctx.cube && !pl.county && cubeCause(c);
      let r: { n: number; avg: number; median: number; p90: number }, med$: string, p90$: string, approx = false;
      if (hist) {
        const ph = new P();
        const w = [`h.fiscal_year BETWEEN ${ph.add(y.from)} AND ${ph.add(y.to)}`];
        if (c && !c.all) {
          w.push("h.linked");
          if (c.label) w.push("h.labels <> '{}'", `h.labels && ${ph.add([`${c.label}:primary`])}::text[]`);
          else w.push(`h.ntee3 LIKE ANY(${ph.add(c.ntee.map((n) => `${n}%`))}::text[])`);
        }
        if (pl.states.length) w.push(`h.pop_state = ANY(${ph.add(pl.states)}::text[])`);
        if (pl.area) w.push(`h.rural IS ${pl.area === "rural" ? "TRUE" : "FALSE"}`);
        if (pl.f.rb) w.push(`h.recipient_band BETWEEN ${ph.add(pl.f.rb[0])} AND ${ph.add(pl.f.rb[1])}`);
        const [hr, [t]] = await Promise.all([
          ctx.q<HistRow>("Federal award sizes (award-years above $0, award-size histogram)", histSql("fed_award_size_hist", w), ph),
          ctx.q<{ n: number; usd: number }>("Federal award-years and dollars (award-size histogram)", `SELECT coalesce(sum(h.n), 0)::int AS n, coalesce(sum(h.usd), 0)::float8 AS usd FROM fed_award_size_hist h WHERE ${and(w)}`, ph),
        ]);
        const h = histStats(hr);
        r = { n: t.n, avg: t.usd / Math.max(1, t.n), median: h.median.v, p90: h.p90.v };
        med$ = histMoney(h.median); p90$ = histMoney(h.p90); approx = h.approx;
      } else {
        [r] = await ctx.q<{ n: number; avg: number; median: number; p90: number }>("Federal award sizes (award-years above $0)", `SELECT count(*)::int AS n, avg(fa.amount)::float8 AS avg, percentile_cont(0.5) WITHIN GROUP (ORDER BY fa.amount)::float8 AS median,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY fa.amount)::float8 AS p90 FROM ${fw.from} WHERE ${and([...fw.where, "fa.amount > 0"])}`, p);
        med$ = money(r?.median ?? 0); p90$ = money(r?.p90 ?? 0);
      }
      if (!r?.n) throw new Unanswerable(`No federal awards to nonprofits found${forX}${inX}.`);
      return finish({ headline: `The median federal award to a nonprofit${forX}${inX} is ${med$} a year, the average ${money(r.avg)}, FY${yr}`,
        numbers: [{ value: med$, label: "median award-year" }, { value: money(r.avg), label: "average" }, { value: int(r.n), label: "award-years" }],
        bullets: [`One in ten is ${b(p90$)} or more`], chart: null, rows: [{ award_years: r.n, median: r.median, average: r.avg, p90: r.p90 }],
        coverage: [{ label: "Award-years", value: int(r.n) }], method: `Net obligations per award and fiscal year above $0, fiscal years ${yr}.${hist ? ` Median and 90th percentile from an award-size histogram in the research layer (fed_award_size_hist, amounts cut to 3 significant digits)${approx ? ". A value marked about is interpolated inside one bucket, within 1% of the exact figure" : ", exact here"}.` : ""}` }, fw.cs);
    }
    default:
      throw new Unanswerable("Federal awards answer totals, trends, states, counties, agencies, programs, recipients and award sizes. They have no funder-overlap, general-support or out-of-state detail.");
  }
}
const fedLinkMemo = memo<string>("answer-fed-link", 2, 3600_000);
const fedLinkNote = () => fedLinkMemo("all", async () => {
  const r = await db.query(`SELECT count(recipient_ein)::float8 / count(*) AS n, (sum(amount) FILTER (WHERE recipient_ein IS NOT NULL))::float8 / sum(amount) AS d FROM federal_awards`);
  return `Recipients are linked to an IRS-registered org by name and place for ${pct(r.rows[0].n)} of award-years (${pct(r.rows[0].d)} of dollars). USAspending carries no EIN.`;
});

// ---- how many orgs (and how many run deficits, have thin cash, rely on government grants)
async function countOrgs(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  const p = new P();
  const cs = causeSql(c, p, "o.ein", "o.ntee_cd", "", true);
  const zip = pl.county || pl.area ? "LEFT JOIN zip_regions z ON z.zip5 = left(o.zip, 5)::char(5)" : "";
  const where = ["coalesce(o.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "o.state", "z.county_fips"), ...filtEin(pl.f, p, "o.ein")];
  const [r] = await ctx.q<{ orgs: number; filed: number; full990: number; deficit: number; surplus: number; low_cash: number; cash_known: number; gov_reliant: number; year_min: number; year_max: number }>("Organizations and their newest e-filed return", `WITH s AS (SELECT o.ein FROM orgs o ${cs.join} ${zip} WHERE ${and(where)}),
n AS (SELECT DISTINCT ON (f.ein) f.* FROM flag_year f JOIN s USING (ein) ORDER BY f.ein, f.tax_year DESC)
SELECT (SELECT count(*) FROM s)::int AS orgs, count(*)::int AS filed, count(*) FILTER (WHERE n.form = '990')::int AS full990,
       count(*) FILTER (WHERE n.expenses > n.revenue)::int AS deficit,
       count(*) FILTER (WHERE n.revenue >= n.expenses)::int AS surplus,
       count(*) FILTER (WHERE n.expenses > 0 AND n.cash IS NOT NULL AND n.cash * 12.0 / n.expenses < 3)::int AS low_cash,
       count(*) FILTER (WHERE n.expenses > 0 AND n.cash IS NOT NULL)::int AS cash_known,
       count(*) FILTER (WHERE n.form = '990' AND n.revenue > 0 AND coalesce(n.government_grants, 0) >= 0.5 * n.revenue)::int AS gov_reliant,
       min(n.tax_year)::int AS year_min, max(n.tax_year)::int AS year_max
FROM n`, p);
  const caveats: string[] = [];
  const note = await causeNote(c, cs, caveats);
  if (!r.orgs) throw new Unanswerable(`No organizations match ${causeName(c, pl)} in ${pl.label}.`);
  caveats.push(`Finances come from each org's newest e-filed 990 or 990-EZ (tax years ${r.year_min}–${r.year_max}). ${int(r.orgs - r.filed)} of ${int(r.orgs)} orgs (mostly small 990-N filers) have none, so the shares are of filers.`,
    "One deficit year isn't a red flag by itself: an org may be spending down savings on purpose.");
  if (s.condition === "gov_reliant") caveats.push(GOV_CAVEAT);
  const cond = s.condition;
  const cv = cond === "deficit" ? { n: r.deficit, of: r.filed, what: "ran a deficit" }
    : cond === "surplus" ? { n: r.surplus, of: r.filed, what: "broke even or ran a surplus" }
      : cond === "low_cash" ? { n: r.low_cash, of: r.cash_known, what: "had under 3 months of cash" }
        : cond === "gov_reliant" ? { n: r.gov_reliant, of: r.full990, what: "got half or more of revenue from government grants" } : null;
  const vals = [
    { group: "Ran a deficit", share: r.deficit / Math.max(1, r.filed), n: r.deficit },
    { group: "Under 3 months of cash", share: r.low_cash / Math.max(1, r.cash_known), n: r.low_cash },
    { group: "Half+ revenue from government", share: r.gov_reliant / Math.max(1, r.full990), n: r.gov_reliant },
  ];
  const what = `${c ? orgsOf(c.name) : "nonprofits"}${pl.f.rb ? ` (${pl.f.to.replace(/^organizations /, "")})` : ""} in ${pl.label}`;
  return {
    headline: cv ? `${int(cv.n)} of ${int(cv.of)} ${what} with recent filings ${cv.what} (${pct(cv.n / Math.max(1, cv.of))})` : `${int(r.orgs)} ${what} are on the IRS list, and ${int(r.filed)} e-file a 990`,
    numbers: cv ? [{ value: int(cv.n), label: cv.what }, { value: pct(cv.n / Math.max(1, cv.of)), label: "of filers" }, { value: int(r.orgs), label: "orgs on the IRS list" }]
      : [{ value: int(r.orgs), label: "orgs on the IRS list" }, { value: int(r.filed), label: "e-file a 990 or 990-EZ" }, { value: pct(r.deficit / Math.max(1, r.filed)), label: "of filers ran a deficit" }],
    bullets: [`${b(int(r.orgs))} ${what} on the IRS master file`, `${b(int(r.filed))} have an e-filed 990 or 990-EZ with finances`,
      cv ? `${b(int(cv.n))} ${cv.what}, ${b(pct(cv.n / Math.max(1, cv.of)))} of those reporting` : `${b(pct(r.deficit / Math.max(1, r.filed)))} ran a deficit in their newest year`],
    chart: { title: `Financial signals, ${what}`, sub: "Share of filers", spec: hbar(vals.map((v) => ({ signal: v.group, share: +v.share.toFixed(4) })), "signal", "share", "Share of filers", ".0%", cv ? vals[["deficit", "low_cash", "gov_reliant"].indexOf(cond!)]?.group : undefined) },
    rows: [{ orgs: r.orgs, filed: r.filed, full_990: r.full990, deficit: r.deficit, surplus: r.surplus, low_cash: r.low_cash, cash_known: r.cash_known, gov_reliant: r.gov_reliant }],
    causeNote: note, caveats,
    coverage: [{ label: "Orgs (IRS list)", value: int(r.orgs) }, { label: "With e-filed finances", value: int(r.filed) }, { label: "Full Form 990", value: int(r.full990) }],
    method: `Organizations on the IRS master file (private foundations excluded) in the cause set${pl.label !== "the US" ? `, based in ${pl.label}` : ""}. Deficit = expenses above revenue on the newest e-filed return; thin cash = cash under 3 months of expenses; government-reliant = Form 990 line 1e at least half of revenue.`,
    sources: [SRC.bmf, SRC.f990], searchQuery: searchFor(s, pl), orgCount: r.orgs,
  };
}

// ------------------------------------------------------------------ compact form for tools (Research Buddy, MCP, API)
// Everything a model or partner needs to quote the answer honestly, without the chart spec or SQL text.
export function answerBrief(a: Answer, rows = 15) {
  const plain = (x: string) => x.replace(/\*\*(.+?)\*\*/g, "$1");
  return {
    status: a.status, headline: a.headline, numbers: a.numbers, bullets: a.bullets.map(plain),
    what_counts: a.causeNote, method: a.method, caveats: a.caveats, coverage: a.coverage, missing: a.missing,
    data: a.rows.slice(0, rows), sources: a.sources, spec: a.spec,
  };
}
