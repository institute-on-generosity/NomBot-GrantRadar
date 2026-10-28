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
import { plainCauseText } from "./sdg";
import { db } from "./db";
import { memo } from "./memo";
import { cityScope, placeEins } from "./place";
import { nteeLabel } from "./ntee";
import { LOADED_STATES } from "./filters";
import { money } from "../components/money";
import { orgName } from "../components/text";
import { normalizeSpec, type Cause, type Spec } from "./answerSpec";
import { LABELS, LABEL_SCOPE, LABEL_SUBTYPES, labelPhrase, narrowerThanLabel, type LabelSlug, type LabelSub } from "./labels";
import { fedProgram, type FedProgram } from "./fedPrograms";
import { buildSteps, type CauseInfo, type Evidence, type Movers, type Step, type StepInput } from "./answerSteps";
import { whoSplit, whoTaggedSql, type Who } from "./recipientTypes";
import { orgFinancialHealth, healthJson, monthsText, R_BANDS as FH_BANDS, HEALTH_CAVEATS, HEALTH_METHOD, HEALTH_NOTE, type OrgHealth, type QueryLog } from "./financialHealth";

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
  steps?: Step[];                  // "Show the steps": the evidence chain (lib/answerSteps), deterministic
  followUps?: string[];            // chips the numbers suggest (real follow-up questions)
  // In-place settings the answer offers (Oct 27: settings, not chat turns): corrected categories (NTEE-coded causes
  // whose count changes with org_ntee_suggested), and a start year after a start-year spike ("Since 2021")
  options?: { corrected?: boolean; since?: number };
  recency?: Recency | null;        // the filing years the answer covers, and which are still arriving (recencyOf)
  orgs?: OrgPick[];                // metric underfunded: the orgs listed, linked to their pages
  who?: Who | null;                // "Who received it": foundation grant $ by recipient type (lib/recipientTypes)
  health?: OrgHealth | null;       // metric financial_health with an ein: one org's indicators by year (lib/financialHealth)
  healthOrgs?: HealthPick[];       // metric financial_health for a cause: the orgs listed with their indicators and flags
  ms: number;
};
// form: the filings read. partial: tax years with returns still arriving (share = filings in / the fullest year's).
export type Recency = { form: string; from: number; to: number; newest_per_org: boolean; latest_full: number; partial: { year: number; share: number }[]; partial_in_range: number[]; trend_end_partial: boolean; note: string };

// ------------------------------------------------------------------ constants
const G_FIRST = 2012, G_LAST = 2025, G_FULL = 2024; // grants: 2012-2021 from the GivingTuesday e-file mirror (generosity-data 057); 2025 returns are still arriving
const G_DEFAULT = 2022; // no years asked: 2022-24, when e-filing covers almost every filer
const G_TREND = 2020;   // a trend with no years asked: from the first tax year 990-PF and 990 e-filing was required
const EFILE_REQUIRED = 2020; // before it, many smaller filers filed on paper, so earlier years under-cover them (earlyCoverage)
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
  individual_giving: { what: "Individual giving by cause or donor", why: "Nonprofit filings don't itemize individual donors. IRS SOI tax data (household giving answers) shows only the charitable deductions itemizers claim, by place, income and year, with no cause, recipient, bequests or non-itemizers' gifts.", source: "Giving USA, Philanthropy Panel Study, IRS SOI individual returns", url: "https://www.irs.gov/statistics/soi-tax-stats-individual-income-tax-statistics-zip-code-data-soi" },
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
// An SDG cause keeps its goal last: "life below water organizations (SDG 14)".
const orgsOf = (name: string): string => { const m = /^(.+?)(\s\(SDG \d+\))$/.exec(name); return m ? `${orgsOf1(m[1])}${m[2]}` : orgsOf1(name); };
const orgsOf1 = (name: string) => (/(shelters|banks|pantries|kitchens|schools|colleges|universities|hospitals|museums|clinics|organizations|orgs|groups|charities|nonprofits|centers|libraries|theaters|churches|programs|clubs|trusts|funds)$/i.test(name) ? name : `${name} organizations`);
const yrs = (a: number, z: number) => (a === z ? `${a}` : `${a}–${String(z).slice(2)}`);

// ------------------------------------------------------------------ SQL plumbing
class P {
  vals: unknown[] = [];
  causes = new Set<string>(); // causes this query's SQL restricts to (honorGuard: every spec cause must reach a query)
  add(v: unknown) { this.vals.push(v); return `$${this.vals.length}`; }
  cause(c: C | null) { if (c && !c.all) this.causes.add(c.name); }
}
// For display only: the query with its parameters written in.
function inline(sql: string, vals: unknown[]): string {
  const lit = (v: unknown): string => Array.isArray(v) ? `ARRAY[${v.map(lit).join(", ")}]` : typeof v === "number" ? String(v) : v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
  return sql.replace(/\$(\d+)/g, (_, i) => lit(vals[Number(i) - 1])).replace(/\n\s*\n/g, "\n").trim();
}
class Ctx {
  queries: { title: string; sql: string }[] = [];
  places: Place[] = [];          // every Place resolved for this answer (honorGuard reads what they applied)
  honored = new Set<string>();   // spec fields a block applied beyond place: topN, streak, condition
  causes = new Set<string>();    // causes some query actually ran with (P.cause)
  span: Span | null = null;      // the filing years a block read, when it isn't grantYears / flagYear (recencyOf)
  constructor(public cube = true) {} // false: the original grant_clean queries only (eval/answer-cube.mts compares both)
  async q<T = Row>(title: string, sql: string, p: P): Promise<T[]> {
    this.queries.push({ title, sql: inline(sql, p.vals) });
    p.causes.forEach((c) => this.causes.add(c));
    const r = await db.query(sql, p.vals);
    return r.rows as T[];
  }
}

// A cause as SQL: a join and/or WHERE terms on the alias's EIN and NTEE columns. tier: the label's tier column.
// all: a subject with no cause restriction (e.g. "organizations under $1M", where only the filters apply).
// corr: an NTEE cause counted by corrected groups (spec.ntee "corrected", see nteeMatch).
type C = Cause & { all?: boolean; via?: string; corr?: boolean }; // via: the cause_terms / NTEE name a plain-English cause matched
// kind program: a named federal program (federal_awards only, lib/fedPrograms), matched on the assistance listing.
type CauseSql = { join: string; where: string[]; tier: string | null; kind: "label" | "ntee" | "keyword" | "all" | "program"; primaryOnly?: boolean; program?: FedProgram };
function tsq(keywords: string[]): string {
  return keywords.map((k) => k.split(/[^a-z0-9]+/).filter(Boolean).join(" <-> ")).filter(Boolean).map((k) => `(${k})`).join(" | ");
}
// primaryOnly: a graded label counts only orgs where the cause is the main stated purpose. Used for whole-org
// money (Form 990 lines, federal awards): a partial-tier org's entire budget isn't money for the cause (a
// credit-union network with one green-lending program would count all its government grants as climate).
// The sub-type a label cause counts (immigrants_refugees: services or policy), null for the whole label. The research
// layer's labels arrays carry label:tier only, so a sub-type answers from grant_clean joined to org_labels.
// Labels whose partial tier is mostly main-focus orgs (animal_welfare: no-990-text orgs and support trusts were moved
// to partial, generosity-data docs/labels/animal_welfare.md): grant answers headline primary + partial, so the label
// carries no tier column (causeSql, cubeWhere) and the tier wording drops (tiered). Whole-org money (primaryOnly) still
// counts primary only.
const ALL_TIERS: ReadonlySet<string> = new Set<LabelSlug>(["animal_welfare"]);
const bothTiers = (c: C | null | undefined) => !!c && !c.all && !!c.label && ALL_TIERS.has(c.label);
const isTiered = (c: C | null | undefined) => !!c && !c.all && !!c.label && !ALL_TIERS.has(c.label);
const labelSub = (c: C | null | undefined): LabelSub | null => (c && !c.all && c.label && c.subtype && c.subtype !== "all" ? c.subtype : null);
function causeSql(c: C | null, p: P, ein: string, ntee: string, sfx = "", primaryOnly = false): CauseSql {
  if (!c || c.all) return { join: "", where: [], tier: null, kind: "all" };
  p.cause(c);
  const sub = labelSub(c);
  if (c.label) return { join: `JOIN org_labels l${sfx} ON l${sfx}.ein = ${ein} AND l${sfx}.label = ${p.add(c.label)}${primaryOnly ? ` AND l${sfx}.tier = 'primary'` : ""}${sub ? ` AND ${p.add(sub)}::text = ANY(l${sfx}.subtypes)` : ""}`, where: [], tier: bothTiers(c) && !primaryOnly ? null : `l${sfx}.tier`, kind: "label", primaryOnly };
  if (c.ntee.length) return { join: "", where: [nteeMatch(c, p, ein, ntee)], tier: null, kind: "ntee" };
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
// Corrected NTEE groups (spec.ntee "corrected", generosity-data 072): an org in org_ntee_suggested counts under its
// suggested detailed code where it has one (orgs with no IRS code, generosity-data 096, graded 98.7% on 150), else its
// suggested major group (orgs whose IRS code didn't fit), every other org under its IRS code. Org-level
// tables test the EIN. The cube has no EIN, so its corrected source (CUBE_CORR) adds each listed org's grants back
// under the suggested group and takes them out of the IRS one. Graded labels are never affected.
// The suggested code of an org_ntee_suggested row: the detailed code (e.g. B20) if any, else the major group (B).
const SUG = (a = "ns") => `coalesce(${a}.suggested_code, ${a}.suggested_major::text)`;
function nteeMatch(c: C, p: P, ein: string, ntee: string): string {
  const pats = p.add(c.ntee.map((n) => `${n}%`));
  if (!c.corr || !ein) return `${ntee} LIKE ANY(${pats}::text[])`;
  return `((${ntee} LIKE ANY(${pats}::text[]) AND ${ein} NOT IN (SELECT ein FROM org_ntee_suggested)) OR ${ein} IN (SELECT ns.ein FROM org_ntee_suggested ns WHERE ${SUG()} LIKE ANY(${pats}::text[])))`;
}
// The corrected NTEE code of a grant row (breakdowns by cause on grant_clean): the suggested code, else the IRS code.
const corrNtee = (ein: string, ntee: string) => `coalesce((SELECT ${SUG()} FROM org_ntee_suggested ns WHERE ns.ein = ${ein}), ${ntee})`;
// grant_cube / charity_grant_cube with corrected groups: the cube plus, for each listed org's grants, one row at minus
// the amount under its IRS ntee3 and one at plus the amount under the suggested code (SUG). Same columns, so every
// cube query reads it unchanged. recipients and funders are 0 on the added rows (not additive anyway). ~0.1-0.3 s.
const CUBE_CORR: Record<"pf" | "charity", string> = {
  pf: `(SELECT tax_year, recipient_state, rural, ntee3, recipient_kind, linked, recipient_band, funder_band, funder_type, labels, usd, n, gos_usd, gos_n, recipients, funders FROM grant_cube
UNION ALL
SELECT g.tax_year::smallint, g.recipient_state, CASE WHEN cn.population < 50000 THEN true WHEN cn.population IS NOT NULL THEN false END, m.ntee3,
  coalesce(pe.kind, 'nonprofit'), true, rp.band, fp.asset_band, coalesce(fp.funder_type, 'other'),
  coalesce((SELECT array_agg(l.label || ':' || l.tier ORDER BY l.label) FROM org_labels l WHERE l.ein = g.recipient_ein), '{}'),
  (m.sg * g.amount)::bigint, m.sg, (m.sg * CASE WHEN g.gos THEN g.amount ELSE 0 END)::bigint, CASE WHEN g.gos THEN m.sg ELSE 0 END, 0, 0
FROM org_ntee_suggested ns
CROSS JOIN LATERAL (SELECT * FROM grant_clean g0 WHERE g0.recipient_ein = ns.ein OFFSET 0) g
CROSS JOIN LATERAL (VALUES (left(g.recipient_ntee, 3), -1), (${SUG()}, 1)) m(ntee3, sg)
JOIN grants gr ON gr.id = g.id LEFT JOIN public_entities pe ON pe.id = gr.recipient_entity
LEFT JOIN county_need cn ON cn.county_fips = g.county_fips
LEFT JOIN recipient_profile rp ON rp.ein = g.recipient_ein LEFT JOIN funder_profile fp ON fp.ein = g.funder_ein)`,
  charity: `(SELECT tax_year, recipient_state, rural, ntee3, linked, funder_class, to_grantmaker, labels, usd, n, gos_usd, gos_n FROM charity_grant_cube
UNION ALL
SELECT g.tax_year, g.recipient_state, CASE WHEN cn.population < 50000 THEN true WHEN cn.population IS NOT NULL THEN false END, m.ntee3,
  true, g.funder_class, g.to_grantmaker,
  coalesce((SELECT array_agg(l.label || ':' || l.tier ORDER BY l.label) FROM org_labels l WHERE l.ein = g.recipient_ein), '{}'),
  (m.sg * g.amount)::bigint, m.sg, (m.sg * CASE WHEN g.gos THEN g.amount ELSE 0 END)::bigint, CASE WHEN g.gos THEN m.sg ELSE 0 END
FROM org_ntee_suggested ns
CROSS JOIN LATERAL (SELECT * FROM charity_grant_clean g0 WHERE g0.recipient_ein = ns.ein OFFSET 0) g
CROSS JOIN LATERAL (VALUES (left(g.recipient_ntee, 3), -1), (${SUG()}, 1)) m(ntee3, sg)
LEFT JOIN county_need cn ON cn.county_fips = g.county_fips)`,
};
// Does spec.ntee "corrected" change this answer: an NTEE-coded cause, a split by NTEE group, or fastest-growing causes.
const corrApplies = (s: Spec) => s.ntee === "corrected" && (s.causes.some((c) => !c.label && c.ntee.length > 0) || s.by === "cause" || s.by === "cause_detail" || s.metric === "fastest_causes");
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
const cubeCause = (c: C | null) => !c || c.all || (!!c.label && !labelSub(c)) || (!c.label && c.ntee.length > 0 && c.ntee.every((n) => n.length <= 3));
const cubeOk = (ctx: Ctx, c: C | null, pl: Place) => ctx.cube && !pl.county && !pl.city && !pl.region && cubeCause(c) && !(pl.g.kind === "charity" && pl.f.rb) && pl.f.ftype !== "company"; // no company column in the cube
type CubeSql = { where: string[]; primary: (() => string) | null }; // primary: adds its parameter only when used
function cubeWhere(c: C | null, p: P, pl: Place, y: { from: number; to: number }, linkedOnly: boolean, x = "x"): CubeSql {
  const w = [`${x}.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`];
  let primary: CubeSql["primary"] = null;
  if (linkedOnly || (c && !c.all)) w.push(`${x}.linked`);
  if (c && !c.all) {
    p.cause(c);
    if (c.label) { const l = c.label; w.push(`${x}.labels <> '{}'`, `${x}.labels && ${p.add([`${l}:primary`, `${l}:partial`])}::text[]`); if (!bothTiers(c)) primary = () => `${p.add(`${l}:primary`)}::text = ANY(${x}.labels)`; }
    else w.push(`${x}.ntee3 LIKE ANY(${p.add(c.ntee.map((n) => `${n}%`))}::text[])`);
  }
  if (pl.states.length) w.push(`${x}.recipient_state = ANY(${p.add(pl.states)}::text[])`);
  if (pl.area) { w.push(`${x}.rural IS ${pl.area === "rural" ? "TRUE" : "FALSE"}`); pl.used.add("area"); }
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
const ryOk = (ctx: Ctx, pl: Place) => ctx.cube && !pl.city && pl.g.kind === "pf" && !pl.f.fb && !pl.f.ftype && !pl.f.kinds;
function ryWhere(c: C | null, p: P, pl: Place, y: { from: number; to: number }, r = "r"): { join: string; where: string[] } {
  const w = [`${r}.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`];
  let join = "";
  if (c && !c.all) {
    p.cause(c);
    if (c.label && !labelSub(c)) w.push(`${r}.labels <> '{}'`, `${r}.labels && ${p.add([`${c.label}:primary`, `${c.label}:partial`])}::text[]`);
    else if (!c.label && c.ntee.length) w.push(nteeMatch(c, p, `${r}.recipient_ein`, `${r}.recipient_ntee`));
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

// region: a county set (Appalachia). used: which place parts a query applied (placeWhere, cubeWhere, fedWhere),
// shared by every copy of the Place, so compute() can say when an answer couldn't honor one (honorGuard).
type Region = { key: string; name: string; fips: string[] };
// corr: NTEE groups counted corrected (corrApplies): g.cube is the corrected cube, clean breakdowns use corrNtee.
// city: a city's ZIPs (zip_places: the most common org mailing city) and the orgs with an HQ there; its county
// rides in county, so every county-level query still narrows to it and the guard can say "covers Los Angeles County".
type City = { name: string; label: string; zips: string[]; eins: string[] };
type Place = { states: string[]; county: { fips: string; name: string; state: string } | null; city: City | null; region: Region | null; area: "rural" | "urban" | null; label: string; f: Filt; g: GSrc; used: Set<string>; corr?: boolean };

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
  if (pl.county) { w.push(`${countyCol} = ${p.add(pl.county.fips)}`); pl.used.add("county"); }
  else if (pl.states.length) w.push(`${stateCol} = ANY(${p.add(pl.states)}::text[])`);
  if (pl.region) { w.push(`${countyCol} = ANY(${p.add(pl.region.fips)}::char(5)[])`); pl.used.add("region"); }
  if (pl.area) { w.push(`${countyCol} IN (SELECT county_fips FROM county_need WHERE county_fips <> '00000' AND population ${pl.area === "rural" ? "<" : ">="} ${RURAL_POP})`); pl.used.add("area"); }
  // City: grant rows (alias g) by the recipient address ZIP (generosity-data 085 index); org and filing rows (o, f) by
  // HQ. Other tables (cubes, population, federal places) stay at the city's county, and the guard says so.
  if (pl.city) {
    const [a, col] = stateCol.split(".");
    if (a === "g" && col === "recipient_state") {
      w.push(`${a}.id IN (SELECT id FROM ${pl.g.kind === "charity" ? "charity_grants" : "grants"} WHERE left(recipient_zip, 5) = ANY(${p.add(pl.city.zips)}::text[]))`);
      pl.used.add("city");
    } else if ((a === "o" || a === "f") && col === "state") {
      w.push(`${a}.ein = ANY(${p.add(pl.city.eins)}::char(9)[])`);
      pl.used.add("city");
    }
  }
  return w;
}
const and = (w: string[]) => (w.length ? w.join("\n  AND ") : "true");

// Regions as county sets. Appalachia = the Appalachian Regional Commission's counties (zip_regions.appalachia,
// generosity-data load_regions.py), the same set org search filters on.
const REGION_NAME: Record<string, string> = { appalachia: "Appalachia" };
const regionMemo = memo<string[]>("answer-region:v1", 4, 3600_000);
const regionFips = (key: string) => regionMemo(key, async () => {
  if (key !== "appalachia") return [];
  const r = await db.query(`SELECT DISTINCT county_fips FROM zip_regions WHERE appalachia ORDER BY 1`);
  return r.rows.map((x) => x.county_fips as string);
});
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
  let city: City | null = null;
  if (s.city && s.states.length === 1) {
    const sc = await cityScope(s.city, s.states[0]);
    if (!sc) throw new Unanswerable(`We couldn't find a city named "${s.city}" in ${stateName(s.states[0])}.`);
    city = { name: sc.label.split(",")[0], label: sc.label, zips: sc.zips, eins: await placeEins(sc.state, sc.city, sc.zips) };
    if (!county && sc.county) county = { fips: sc.county.fips, name: sc.county.name, state: sc.state };
  }
  const fips = s.region ? await regionFips(s.region) : [];
  const region: Region | null = s.region && fips.length ? { key: s.region, name: REGION_NAME[s.region] ?? s.region, fips } : null;
  const stateWords = s.states.length ? (s.states.length <= 3 ? s.states.map(stateName).join(", ") : `${s.states.length} states`) : "";
  const where = city ? city.label : county ? `${county.name}, ${county.state}` : region ? (stateWords ? `the Appalachian counties of ${stateWords}` : region.name) : stateWords || "the US";
  const area = s.area ? `${s.area} counties of ` : "";
  const g0 = gsrcOf(s), corr = corrApplies(s);
  const g = corr ? { ...g0, cube: CUBE_CORR[g0.kind] } : g0;
  const f = filtersOf(s);
  // Foundation size, foundation type and recipient kind exist only for 990-PF grants.
  return { states: s.states, county, city, region, area: s.area, label: `${area}${where}`, f: g.kind === "charity" ? { ...f, fb: null, ftype: null, kinds: null, from: "" } : f, g, used: new Set<string>(), corr };
}

// ------------------------------------------------------------------ label grades (for caveats)
type Grade = { name: string; primary?: number; partial?: number; recall?: number; nPrimary?: number; nPartial?: number; subRight?: number; nSub?: number; subPolicy?: number };
const gradeMemo = memo<Record<string, Grade>>("answer-grades", 2, 3600_000);
// animal_welfare's stored recall comes from a grade of the NTEE stratum only (g2), not the whole label: not shown.
const NO_RECALL = new Set(["animal_welfare"]);
const grades = () => gradeMemo("all", async () => {
  const r = await db.query(`SELECT label, name, grading FROM cause_labels`);
  return Object.fromEntries(r.rows.map((x) => [x.label, {
    name: x.name, primary: x.grading?.primary?.exact?.p, partial: x.grading?.partial?.in_label?.p ?? x.grading?.partial?.in_label_weighted,
    recall: NO_RECALL.has(x.label) ? undefined : x.grading?.recall_est, nPrimary: x.grading?.primary?.exact?.n, nPartial: x.grading?.partial?.in_label?.n,
    subRight: x.grading?.subtypes?.right_weighted, nSub: x.grading?.subtypes?.right?.n, subPolicy: x.grading?.subtypes?.policy_precision,
  }]));
});
// Orgs per sub-type of a label with sub-types (an org in both counts in each), for the steps and caveats.
const subMemo = memo<Record<string, number>>("answer-subtype-counts", 8, 3600_000);
const subCounts = (label: string) => subMemo(label, async () => {
  const r = await db.query(`SELECT s AS sub, count(*)::int AS n FROM org_labels, unnest(subtypes) s WHERE label = $1 GROUP BY 1`, [label]);
  return Object.fromEntries(r.rows.map((x) => [x.sub, x.n]));
});

const linkMemo = memo<{ grants: number; dollars: number }>("answer-link:v4", 4, 3600_000); // v4: placeholder lines out (generosity-data 050)
const linkRate = (g: GSrc = PF) => linkMemo(g.kind, async () => {
  const r = await db.query(g.kind === "pf"
    ? `SELECT sum(linked_n)::float8 / sum(n) AS g, sum(linked_usd)::float8 / sum(usd) AS d FROM grant_totals WHERE tax_year BETWEEN 2022 AND 2024`
    : `SELECT (sum(n) FILTER (WHERE linked))::float8 / sum(n) AS g, (sum(usd) FILTER (WHERE linked))::float8 / sum(usd) AS d FROM charity_grant_cube WHERE tax_year BETWEEN 2022 AND 2024 AND NOT to_grantmaker`);
  return { grants: r.rows[0].g, dollars: r.rows[0].d };
});
// Schedule I money reported but not itemized (generosity-data 050, charity_not_itemized): Part IX line 1 minus
// the lines that name a recipient, per tax year and funder group. "SEE ATTACHED" / "VARIOUS" lines sit inside it.
// No recipient, place or cause, so answers never add it to a total: national totals show it next to theirs.
type NotItemized = { usd: number; line1: number; returns: number };
async function notItemized(ctx: Ctx | null, cls: string | null, y: { from: number; to: number }): Promise<NotItemized> {
  const p = new P();
  const sql = `SELECT coalesce(sum(not_itemized_usd), 0)::float8 AS usd, coalesce(sum(line1_usd), 0)::float8 AS line1, coalesce(sum(returns_not_itemized), 0)::int AS returns
  FROM charity_not_itemized WHERE tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}${cls ? ` AND funder_class = ${p.add(cls)}` : ""}`;
  if (ctx) return (await ctx.q<NotItemized>("Schedule I dollars reported but not itemized (Part IX line 1 minus named lines)", sql, p))[0];
  return (await db.query(sql, p.vals)).rows[0];
}
const niMemo = memo<NotItemized>("answer-not-itemized:v1", 8, 3600_000);
// Schedule I lines that move assets between related organizations (restructurings, mergers, transfers of assets: the
// UL to ULSE stock transfer, $7.6B in 2021) and a few clear reporting errors (generosity-data 067, grant_transfers).
// Left out of charity_grant_clean; national totals say how much, counting only lines the total would otherwise hold.
type Transfers = { usd: number; n: number };
async function transfersOut(ctx: Ctx, cls: string | null, y: { from: number; to: number }): Promise<Transfers> {
  const p = new P();
  const sql = `SELECT coalesce(sum(amount), 0)::float8 AS usd, count(*)::int AS n FROM grant_transfers
  WHERE source = 'si' AND in_scope AND NOT to_grantmaker AND tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}${cls ? ` AND funder_class = ${p.add(cls)}` : ""}`;
  return (await ctx.q<Transfers>("Schedule I transfers between related organizations left out of the total", sql, p))[0];
}

// Years before e-filing was required: measured filers and dollars per tax year (org_given_year), and our
// 990-PF totals against IRS SOI's estimate where the benchmarks table has it (generosity-data 053).
const earlyMemo = memo<string>("answer-early-coverage:v1", 4, 3600_000);
const earlyCoverage = (kind: "pf" | "charity", from: number) => earlyMemo(`${kind}:${from}`, async () => {
  const src = kind === "pf" ? "pf" : "si";
  const r = await db.query(`SELECT y.year, y.filers, y.usd, b.soi FROM (
  SELECT year, count(*)::int AS filers, sum(total)::float8 AS usd FROM org_given_year WHERE source = $1 AND year BETWEEN $2 AND ${G_DEFAULT} GROUP BY 1) y
LEFT JOIN (SELECT year, sum(value)::float8 AS soi FROM benchmarks WHERE source IN ('irs_soi_pf', 'irs_soi_trust') AND measure = 'grants_paid' GROUP BY 1 HAVING count(*) = 2) b
  ON b.year = y.year AND $1 = 'pf' ORDER BY 1`, [src, from]);
  const rows: { year: number; filers: number; usd: number; soi: number | null }[] = r.rows;
  const at = (y: number) => rows.find((x) => x.year === y);
  const a = at(from), z = at(G_DEFAULT);
  if (!a || !z) return "";
  const who = kind === "pf" ? "foundations" : "charities";
  const soi = rows.filter((x) => x.soi).map((x) => `${x.year} ${pct(x.usd / x.soi!)}`);
  return `E-filing was optional for many filers before tax year ${EFILE_REQUIRED}, so earlier years miss many smaller ${who}, and growth from those years runs high. Measured here: ${int(a.filers)} ${who} and ${money(a.usd)} in ${from}, against ${int(z.filers)} and ${money(z.usd)} in ${G_DEFAULT}.${soi.length ? ` Our 990-PF grant totals as a share of the IRS SOI estimate for all foundations: ${soi.join(", ")}.` : ""}`;
});

// Label-specific limits beyond the grade line: a low recall makes every count a floor; a partial tier graded right at
// the 90% bar is the least certain part; mental health is graded from 990 text, not NTEE F; immigrants and refugees
// splits into services (the default) and immigration policy groups of every stance (sub-types, generosity-data 069).
const LABEL_CAVEAT: Partial<Record<LabelSlug, (g: Grade | undefined, primaryOnly: boolean, sub: LabelSub | null) => string>> = {
  racial_equity: (g) => `Racial equity counts are a floor: the label finds about ${pct(g?.recall ?? 0.63)} of the orgs doing this work (many civil rights, community and health groups that work on race don't say so in their 990 text), so the true total is higher.`,
  immigrants_refugees: (g, _p, sub) => `${sub === "services"
    ? "This counts orgs that serve immigrants and refugees: resettlement, immigration legal aid, ESL and integration, refugee relief abroad and immigrant rights groups. Immigration policy research and advocacy groups, on every side, are a separate sub-type and are left out unless they also serve immigrants. Ask about immigration policy to count them."
    : sub === "policy"
    ? `This counts immigration policy and advocacy groups of every viewpoint, from groups that argue for less immigration (FAIR, NumbersUSA, the Center for Immigration Studies) to groups that argue for more (FWD.us, the National Immigration Forum), so their funders count here whatever side they take. Groups that serve immigrants are left out unless they also run named policy work.${g?.subPolicy != null ? ` Lower confidence: ${pct(g.subPolicy)} of sampled policy orgs were judged policy groups, below the 90% bar. Most misses are immigrant community groups.` : ""}`
    : "This counts the whole immigrants and refugees label: orgs that serve immigrants and refugees and immigration policy groups on every side, including groups that argue for less immigration (FAIR, NumbersUSA, the Center for Immigration Studies)."}${g?.subRight != null ? ` The split into the two sub-types graded ${pct(g.subRight)} right on ${g.nSub ?? "a"} sampled orgs.` : ""}`,
  education: () => "Education is graded within one org of the bar (95% main focus, 90% part of their work), and counts are a floor: the label finds about 73% of education orgs. It counts all learning, from schools and universities to tutoring, literacy, scholarships and libraries.",
  animal_welfare: (_g, primaryOnly) => primaryOnly
    ? "Only orgs whose main focus is animal welfare are counted here, so this is a floor. Many animal welfare groups are counted as part of their work because they filed no 990 text to confirm their focus, and their money is left out."
    : "Animal welfare counts main focus and part-of-their-work orgs together. Most part-of-their-work orgs are animal welfare groups at heart that filed no 990 text to confirm it, or trusts that support one animal charity. Main focus orgs alone would leave out much of the real animal welfare money.",
  health_equity: (g) => `Health equity counts are a floor: the label finds about ${pct(g?.recall ?? 0.54)} of orgs doing this work.`,
  // generosity-data docs/labels/youth_development.md (c9f28ce): orgs with no 990 text count as main focus only when the
  // name says youth, 4-H, scouting or mentoring. Sports leagues, boosters, schools and tutoring alone are out.
  youth_development: (g) => `Youth development counts are a floor: the label finds about ${pct(g?.recall ?? 0.54)} of the orgs doing this work, so the true total is higher. Small orgs that filed no 990 text count as main focus only when their name says youth, 4-H, scouting or mentoring. Youth sports leagues and booster clubs that only run games, schools, and tutoring alone are not counted.`,
  mental_health: (g, primaryOnly) => `Mental health is graded from each org's 990 text, not its NTEE code: F (Mental Health) also holds addiction treatment, and many counseling and crisis groups are coded elsewhere.${primaryOnly ? "" : ` The part-of-their-work tier graded ${pct(g?.partial ?? 0.9)}, right at the 90% bar, so main focus plus part of their work is the less certain figure.`}`,
};

async function causeNote(c: C | null, cs: CauseSql, caveats: string[]): Promise<string> {
  if (!c || cs.kind === "all") return c?.all ? `All causes, ${c.name}.` : "All causes.";
  if (cs.kind === "program") return `Federal program: ${cs.program!.name}, assistance listing${cs.program!.cfda.length > 1 ? "s" : ""} ${cs.program!.cfda.map((n) => n.replace("%", "*")).join(", ")} (matched to "${c.name}"). Every award under the program counts, whoever the recipient, not recipients' NTEE codes or labels.`;
  const via = c.via ? ` Matched to codes through our cause taxonomy (term "${c.via}").` : "";
  if (cs.kind === "label") {
    const g = (await grades())[c.label!];
    caveats.push(`${g?.name ?? c.label} is a graded label: Claude read each candidate's 990 mission and programs. On a fresh sample, ${g?.primary != null ? `main focus was ${pct(g.primary)} right (${g.nPrimary} graded)` : "main focus is graded"}${g?.partial != null ? `, part of their work ${pct(g.partial)} (${g.nPartial} graded)` : ""}${g?.recall != null ? `, estimated recall ${pct(g.recall)}` : ""}. ${cs.primaryOnly ? "Only main-focus orgs are counted here." : bothTiers(c) ? "Main focus and part of their work are both counted here." : "Main focus is a floor, main focus plus part of their work an upper bound."}`);
    const extra = LABEL_CAVEAT[c.label as LabelSlug];
    const sub = labelSub(c);
    if (extra) caveats.push(extra(g, Boolean(cs.primaryOnly), sub));
    const subNote = sub ? `, ${LABEL_SUBTYPES[c.label as LabelSlug]!.names[sub].toLowerCase()} sub-type only` : "";
    return cs.primaryOnly
      ? `${g?.name ?? c.label} label${subNote}, main focus only: orgs whose main stated purpose it is. Orgs where it's one program among others are left out, because their whole budget would count.${via}`
      : bothTiers(c)
      ? `${g?.name ?? c.label} label${subNote}, main focus and part of their work counted together: main focus = the main stated purpose, part of their work = mostly main focus orgs with no 990 text to confirm it, plus support trusts and orgs with one animal program.${via}`
      : `${g?.name ?? c.label} label${subNote}: main focus = the main stated purpose, part of their work = one program among others.${via}`;
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
      ...(highlight ? { color: { condition: { test: `datum['${y}'] === ${JSON.stringify(highlight)}`, value: "#248a3d" }, value: "#b4b4b0" } } : {}), // the focus bar in brand green, the rest neutral (one palette)
      tooltip: [{ field: y, type: "nominal" }, { field: x, type: "quantitative", format: fmt }],
    },
  };
}

// Bars for the cause, a muted line for the comparison, both as percent change.
function trendSpec(values: Row[], cause: string, all = "All foundation grants") {
  const color = { field: "series", type: "nominal", title: null, scale: { domain: [cause, all], range: ["#248a3d", "#a3a39e"] }, legend: { orient: "top", direction: "horizontal" } };
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
  // A trend in one named year ("why did X fall in 2024") is that year against the year before.
  const one = s.metric === "trend" && s.yearFrom != null && s.yearFrom === s.yearTo;
  const reqFrom = one ? s.yearFrom! - 1 : s.yearFrom ?? null, reqTo = s.yearTo ?? null;
  // No start year: 2022 (or the end year asked, if earlier). A trend with no years at all runs from G_TREND.
  const dflt = s.metric === "trend" && reqTo == null ? G_TREND : reqTo != null && reqTo < G_DEFAULT ? reqTo : G_DEFAULT;
  let from = Math.min(Math.max(reqFrom ?? dflt, G_FIRST), G_LAST);
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
// "(partial)" chart labels follow the same filings rule as the recency note (partialYears), loaded at the start of
// every answer (loadFullYears). The constants are only the fallback when that query fails.
const FULL: Record<"pf" | "charity" | "f990", number> = { pf: G_FULL, charity: G_FULL, f990: F_FULL };
const PARTIAL_SHARE_OF: Record<"pf" | "charity" | "f990", Map<number, number>> = { pf: new Map(), charity: new Map(), f990: new Map() };
async function loadFullYears() {
  await Promise.all((["pf", "charity", "f990"] as const).map(async (k) => {
    const r = await partialYears(k);
    FULL[k] = r.latestFull;
    PARTIAL_SHARE_OF[k] = new Map(r.partial.map((x) => [x.year, x.share]));
  }));
}
const yearLabel = (y: number, kind: "pf" | "charity" | "f990" = "pf") => (y > FULL[kind] ? `${y} (partial)` : String(y));
// A trend whose last year is partial headlines the change to the newest full year and names the partial year
// on its own line (Oct 21: "fell 42% from 2023 to 2025" compared against a year a third filed).
function partialEnd(kind: "pf" | "charity" | "f990", to: number): { year: number; share: number } | null {
  return to > FULL[kind] ? { year: to, share: PARTIAL_SHARE_OF[kind].get(to) ?? 0 } : null;
}
const partialLine = (pe: { year: number; share: number }, full: number) => `${pe.year} is partial${pe.share ? ` (${pct(pe.share)} of returns in)` : ""}, so the comparison ends at ${full}`;

// ------------------------------------------------------------------ data recency (Joshua Elder, Oct 19)
// Every answer on 990 or grant data says which filing years it covers, and that the newest are incomplete:
// returns reach the IRS 6 to 18 months after a tax year ends and its public e-file batches later still, so
// the newest 990 for most organizations is a year or two old. Years come from the blocks (ctx.span) or
// grantYears / flagYear, never constants. Partial is read from the filings loaded per tax year:
//   pf       990-PF returns (foundation_finance_year, one per foundation and year)
//   charity  Form 990 filers with grant lines (charity_filers, Schedule I)
//   f990     Form 990 / 990-EZ returns (flag_year, one per org and year)
// Rule: the tax year with the most filings is the newest full year. A later tax year with under 90% of
// that year's filings is partial (returns still arriving). Earlier thin years are an e-filing coverage
// question, not lag (earlyCoverage).
export type Span = { kind: "pf" | "charity" | "f990"; from: number; to: number; newest?: boolean; byYear?: boolean };
const PARTIAL_SHARE = 0.9;
const FILINGS_SQL: Record<Span["kind"], string> = {
  pf: "SELECT tax_year::int AS year, count(*)::int AS n FROM foundation_finance_year GROUP BY 1",
  charity: "SELECT tax_year::int AS year, count(*)::int AS n FROM charity_filers GROUP BY 1",
  f990: "SELECT tax_year::int AS year, count(*)::int AS n FROM flag_year GROUP BY 1",
};
const filingsMemo = memo<{ year: number; n: number }[]>("answer-filings-per-year:v1", 4, 6 * 3600_000);
export const filingsPerYear = (kind: Span["kind"]) => filingsMemo(kind, async () => (await db.query(FILINGS_SQL[kind])).rows.map((r) => ({ year: Number(r.year), n: Number(r.n) })).sort((a, z) => a.year - z.year));
export async function partialYears(kind: Span["kind"]): Promise<{ latestFull: number; partial: { year: number; share: number }[] }> {
  const ys = await filingsPerYear(kind);
  const peak = ys.reduce((m, y) => (y.n > m.n ? y : m), ys[0]);
  const partial = ys.filter((y) => y.year > peak.year && y.n < PARTIAL_SHARE * peak.n).map((y) => ({ year: y.year, share: y.n / peak.n }));
  const latestFull = Math.max(peak.year, ...ys.filter((y) => y.year > peak.year && y.n >= PARTIAL_SHARE * peak.n).map((y) => y.year));
  return { latestFull, partial };
}
const FORM_WORDS: Record<Span["kind"], string> = { pf: "990-PF", charity: "Form 990 Schedule I", f990: "Form 990" };
const listYears = (ys: number[]) => (ys.length < 3 ? ys.join(" and ") : `${ys.slice(0, -1).join(", ")} and ${ys.at(-1)}`);
async function recencyOf(ctx: Ctx, s: Spec): Promise<Recency | null> {
  const kind0 = ctx.places[0]?.g.kind ?? (s.source === "charity_grants" ? "charity" : "pf");
  const sp: Span | null = ctx.span
    ?? (isGrantSrc(s) ? { kind: kind0, from: grantYears(s).from, to: grantYears(s).to }
      : ["government_grants", "contributions", "revenue"].includes(s.source) ? { kind: "f990", from: flagYear(s).year, to: flagYear(s).year } : null);
  if (!sp) return null;
  const { latestFull, partial } = await partialYears(sp.kind);
  const inRange = partial.filter((p) => p.year >= sp.from && p.year <= sp.to);
  const byYear = sp.byYear ?? (s.metric === "trend" || s.by === "year");
  const trendEnd = byYear && sp.to > sp.from && inRange.some((p) => p.year === sp.to);
  const form = FORM_WORDS[sp.kind];
  const years = sp.from === sp.to ? `tax year ${sp.to}` : `tax years ${sp.from} to ${sp.to}`;
  const what = sp.kind === "f990" ? `${form} returns` : sp.kind === "pf" && s.source === "foundation_finances" ? "990-PF returns" : `${form} grants`;
  const lead = sp.newest ? `Uses each organization's newest ${form}, from ${years}.` : `Covers ${what} for ${years}.`;
  const lag = "Returns arrive 1 to 2 years late";
  const after = partial.filter((p) => p.year > sp.to);
  const tail = inRange.length
    ? `${lag}, so ${listYears(inRange.map((p) => p.year))} ${inRange.length > 1 ? "are" : "is"} partial, with ${inRange.map((p) => pct(p.share)).join(" and ")} of a full year's returns in.${trendEnd ? ` A dip in ${sp.to} is likely late filings, not a real drop.` : ""}`
    : after.length ? `${lag}, so ${listYears(after.map((p) => p.year))} ${after.length > 1 ? "are" : "is"} still incomplete.`
      : `${lag}, so ${latestFull} is the newest full year.`;
  return { form, from: sp.from, to: sp.to, newest_per_org: !!sp.newest, latest_full: latestFull, partial, partial_in_range: inRange.map((p) => p.year), trend_end_partial: trendEnd, note: `${lead} ${tail}` };
}

// ------------------------------------------------------------------ inflation (generosity-data 052: cpi_u_year)
// BLS CPI-U, all items, US city average. Tax years (990, 990-PF) use the calendar-year annual average of the
// year the tax year starts in. Federal fiscal years use the October-September average. Real dollars are in
// the latest year with a full annual average ("2025 dollars"). Growth after inflation doesn't depend on the base.
type Infl = { base: number; baseCpi: number; fiscal: boolean; idx: Map<number, number> };
async function inflation(ctx: Ctx, years: number[], fiscal = false): Promise<Infl | null> {
  const p = new P();
  const rows = await ctx.q<{ year: number; cpi: number; fy: number | null; base: boolean }>(`Consumer prices: BLS CPI-U, calendar-year${fiscal ? " and federal fiscal-year (October to September)" : ""} averages`,
    `SELECT year, cpi::float8 AS cpi, fy_cpi::float8 AS fy, year = (SELECT max(year) FROM cpi_u_year) AS base FROM cpi_u_year
WHERE year = ANY(${p.add(years)}::int[]) OR year = (SELECT max(year) FROM cpi_u_year)`, p).catch(() => []);
  const base = rows.find((r) => r.base);
  const idx = new Map(rows.flatMap((r) => { const v = fiscal ? r.fy : r.cpi; return v != null ? [[r.year, v] as [number, number]] : []; }));
  if (!base || years.some((y) => !idx.has(y))) return null;
  return { base: base.year, baseCpi: base.cpi, fiscal, idx }; // fiscal-year dollars land in the base calendar year's prices too
}
const realOf = (inf: Infl, usd: number, year: number) => usd * inf.baseCpi / inf.idx.get(year)!;
const realGrowth = (inf: Infl | null, g: number | null, from: number, to: number) => (inf && g != null ? (1 + g) * inf.idx.get(from)! / inf.idx.get(to)! - 1 : null);
// "grew 13% (7% after inflation)", "grew 2% (down 1% after inflation)"
function grewText(g: number, r: number | null, rose = "grew") {
  const head = `${g >= 0 ? rose : "fell"} ${pct(Math.abs(g))}`;
  if (r == null) return head;
  return `${head} (${(r >= 0) === (g >= 0) ? "" : r >= 0 ? "up " : "down "}${pct(Math.abs(r))} after inflation)`;
}
const inflMethod = (inf: Infl) => ` After inflation = adjusted with the BLS CPI-U (all items, US city average), in ${inf.base} dollars, using ${inf.fiscal ? "each federal fiscal year's average, October to September" : "the annual average of the calendar year each tax year starts in"}.`;
const SRC_CPI = { label: "BLS Consumer Price Index for All Urban Consumers (CPI-U, series CUUR0000SA0)", url: "https://www.bls.gov/cpi/data.htm" };
// A radio under the chart switches its dollar field between current and inflation-adjusted values: each row
// carries `${field}_nom` and `${field}_real`, and a calculate step picks one. Slides draw the default.
function inflToggle(spec: Record<string, unknown>, field: string, inf: Infl) {
  const real = `${inf.base} dollars (after inflation)`;
  return {
    ...spec,
    params: [...((spec.params as unknown[]) ?? []), { name: "dollars", value: "Current dollars", bind: { input: "radio", options: ["Current dollars", real], name: " " } }],
    transform: [{ calculate: `dollars === ${JSON.stringify(real)} ? datum.${field}_real : datum.${field}_nom`, as: field }, ...((spec.transform as unknown[]) ?? [])],
  };
}

// ------------------------------------------------------------------ external benchmarks (generosity-data 053)
// National 990-PF totals against IRS SOI (grants paid by private foundations and 4947 trusts) and Giving USA
// (giving by foundations), for the years we have in full. Shown in national all-causes foundation answers.
type Bench = { source: string; year: number; label: string; benchmark_usd: number; url: string; ours_all_lines_usd: number; ours_us_orgs_usd: number };
async function benchmarks(ctx: Ctx, y: Years): Promise<{ coverage: { label: string; value: string }[]; method: string; sources: { label: string; url: string }[] }> {
  const p = new P();
  const rows = await ctx.q<Bench>("Published national totals vs ours (benchmark_coverage: IRS SOI, Giving USA)", `SELECT source, year, label, benchmark_usd::float8 AS benchmark_usd, url,
       ours_all_lines_usd::float8 AS ours_all_lines_usd, ours_us_orgs_usd::float8 AS ours_us_orgs_usd
FROM benchmark_coverage WHERE ours_full_year AND complete AND year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)} ORDER BY year DESC`, p).catch(() => []);
  const soi = rows.find((r) => r.source === "irs_soi"), gu = rows.find((r) => r.source === "giving_usa");
  if (!soi && !gu) return { coverage: [], method: "", sources: [] };
  const coverage: { label: string; value: string }[] = [], m: string[] = [], sources: { label: string; url: string }[] = [];
  if (soi) {
    coverage.push({ label: `Vs IRS SOI ${soi.year}`, value: `${pct(soi.ours_us_orgs_usd / soi.benchmark_usd)} of ${money(soi.benchmark_usd)} grants paid (all our 990-PF lines: ${pct(soi.ours_all_lines_usd / soi.benchmark_usd)})` });
    m.push(`IRS Statistics of Income counts ${money(soi.benchmark_usd)} in grants paid by private foundations and charitable trusts filing a 990-PF for tax year ${soi.year}. Grants counted here are ${pct(soi.ours_us_orgs_usd / soi.benchmark_usd)} of it, and every itemized 990-PF grant line we load is ${pct(soi.ours_all_lines_usd / soi.benchmark_usd)}. SOI is a sample estimate on a cash basis, and the grants counted here leave out individuals, foreign recipients and other private foundations.`);
    sources.push({ label: `IRS SOI domestic private foundation and charitable trust statistics, tax year ${soi.year}`, url: "https://www.irs.gov/statistics/soi-tax-stats-domestic-private-foundation-and-charitable-trust-statistics" });
  }
  if (gu) {
    coverage.push({ label: `Vs Giving USA ${gu.year}`, value: `${pct(gu.ours_us_orgs_usd / gu.benchmark_usd)} of ${money(gu.benchmark_usd)} given by foundations` });
    m.push(`Giving USA estimates foundations gave ${money(gu.benchmark_usd)} in ${gu.year}. Grants counted here are ${pct(gu.ours_us_orgs_usd / gu.benchmark_usd)} of that. It's an estimate built from Candid data with its own definitions, so treat the share as a rough check.`);
    sources.push({ label: gu.label.replace(/^Giving USA giving by foundations \((.*)\)$/, "$1: giving by foundations"), url: gu.url });
  }
  return { coverage, method: ` Benchmarks: ${m.join(" ")}`, sources };
}
// Form 990 lines nationally: IRS SOI's newest 501(c)(3) Form 990 figure, as context only (other year, other filers).
const EO_MEASURE: Record<string, string> = { government_grants: "gov_grants", contributions: "contributions", revenue: "revenue" };
async function eoBenchmark(ctx: Ctx, source: string): Promise<{ label: string; value: string } | null> {
  const p = new P();
  const [r] = await ctx.q<{ year: number; value: number }>("IRS SOI: Form 990 returns of 501(c)(3) organizations, newest tax year (benchmarks)", `SELECT year, value::float8 AS value FROM benchmarks WHERE source = 'irs_soi_eo' AND measure = ${p.add(EO_MEASURE[source])} ORDER BY year DESC LIMIT 1`, p).catch(() => []);
  return r ? { label: `IRS SOI ${r.year}, 501(c)(3) Form 990 filers`, value: `${money(r.value)} (another year and filer set, so not a share)` } : null;
}

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
  if (!pl.county && !pl.region && !pl.area && pl.g.kind === "pf") {
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
  const zip = pl.county || pl.region || pl.area ? "LEFT JOIN zip_regions z ON z.zip5 = left(o.zip, 5)::char(5)" : "";
  const where = ["coalesce(o.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "o.state", "z.county_fips"), ...filtEin(pl.f, p, "o.ein")];
  const [r] = await ctx.q<{ n: number }>("Organizations in the set (IRS master file)", `SELECT count(*)::int AS n FROM orgs o ${cs.join} ${zip}
WHERE ${and(where)}`, p);
  return r.n;
}

// ------------------------------------------------------------------ the engine
// change / versus: what a premise is checked against (checkPremise), dropped before the answer is returned.
type Change = { subject: string; g: number; from: string; to: string };
type Versus = { first: string; second: string; a: number; z: number };
// dual: a two-cause ranking (dualTop), which keeps one bullet per cause plus the overlap.
type Out = Omit<Answer, "question" | "spec" | "ms" | "queries" | "missing" | "status"> & { status?: Answer["status"]; change?: Change; versus?: Versus; dual?: boolean; ev?: Evidence };

// v11: research layer (grant_cube, filters, breakdowns, cause taxonomy, DC note). v12: Schedule I charity grants,
// federal awards (USAspending), Census ACS (per person in poverty, county groups). v13: IRS 05B batches loaded
// (2025-26 returns the index files under 05A), so 2023-25 totals rose; Fidelity 2023 caveat dropped.
// v15: largest 1% by revenue (concentration), public_entity without private colleges, Form 990 lines and federal
// awards count a graded label's primary tier only, follow-up chips for breakdowns and federal answers.
// v16: grant-size medians and 90th percentiles from the size histograms (generosity-data 046).
// v18: premise check (spec.premise), keyword causes ignore passing mentions, single-organization note in state rankings.
// v21: Schedule I placeholder lines ("SEE ATTACHED", "VARIOUS") out of charity_grant_clean (generosity-data 050),
// national charity_grants totals show what's reported but not itemized.
// v22: growth after inflation (BLS CPI-U, generosity-data 052) in trend answers, with a chart toggle, and IRS SOI /
// Giving USA benchmarks (generosity-data 053) in national totals' coverage.
// v23: never mislead. Regions (Appalachia), top-N funder shares, multi-year conditions, and a guard that turns any
// spec part the engine couldn't apply (years outside the data, place, set size, condition) into a visible
// "not included" note and status partial. household_giving (IRS SOI individual returns, generosity-data 054).
// v24: foundation finances (990-PF payout vs the 5% rule, assets; generosity-data 055) and the nonprofit finance
// panel (deficits, cash, government reliance by year or revenue size; 056); median months of cash in org counts.
// v26: two-cause top funders / recipients (both ranked lists and their overlap), readable foundation names
// (orgName), and a guard that names any spec cause no query restricted to.
// v27: housing_homelessness label (generosity-data org_labels, graded g1).
// v28: causes that name a federal program (Head Start, AmeriCorps ...) match its assistance listings on federal
// awards (lib/fedPrograms); a cause that matched nothing is unanswerable, never "$0".
// v29: ai_tech_learning_work label (tech and AI skills, graded g2).
// v30: a cause narrower than its label ("AI literacy", "opioids") is counted and named as the label (closestLabel).
// v31: Schedule I transfers between related organizations out of charity_grant_clean (generosity-data 067), national
// charity_grants totals say how much was left out.
// v32: "Show the steps" evidence chain (lib/answerSteps), start-year spike check on trends ("Since 2021?").
// v34: racial_equity, immigrants_refugees, mental_health labels (graded g2, g1, g1), with label caveats (LABEL_CAVEAT).
// v36: immigrants_refugees sub-types (generosity-data 069): services by default, policy for immigration policy questions.
// v37: education label (graded g3), with its caveat (LABEL_CAVEAT).
// v38: spec.ntee "corrected" (generosity-data 072 suggested NTEE groups), the "With corrected categories?" chip.
// v39: health_equity label (graded g2), with its caveat (LABEL_CAVEAT).
// v40: corrected NTEE footnote splits orgs added with no IRS code (uncoded_vote_llm) from orgs moved.
// v41: animal_welfare label (graded g2), headlined on primary + partial (ALL_TIERS), with its caveat (LABEL_CAVEAT).
// v42: data recency note (recencyOf): the filing years covered, partial years read from filings per tax year.
// v43: trend headlines end at the newest full year (partialEnd), "(partial)" labels from filings per tax year (loadFullYears).
// v44: underfunded metric (orgs in a cause getting little foundation money for their size), Answer.orgs.
// v45: "Who received it" (Answer.who) on foundation grant totals and recipient-kind splits: governments, public
// universities, international bodies, companies (generosity-data 079), with a one-line share caveat.
// v46: corrected NTEE counts orgs with no IRS code under their suggested detailed code where graded (suggested_code).
// v47: financial_health metric (one org's indicators over its full filing years, or a cause's orgs: deficit streaks,
// months of cash, program ratio, peer medians by size band), Answer.health and Answer.healthOrgs, spec.ein.
// v49: youth_development label (graded g2, recall about 54%), with its caveat (LABEL_CAVEAT).
// v50: SDG causes (lib/sdg.ts): "(SDG n)" names stay last in org phrases and drop from the org search link.
export const ANSWER_VERSION = "answer:v55"; // v55: label tiers read "main focus" and "part of their work" (no "partial", "primary"); v54: one chart palette (focus green, neutral rest); v53: chart values carry ein; v52: corrected categories and "since" as answer options, not chips // v51: plain cause names in every output text (no "(SDG n)", plainCauseText)
const answerMemo = memo<Answer>(ANSWER_VERSION, 1200, 6 * 3600_000); // room for every known question (prewarmed) plus asked ones; // v50: SDG causes; v49: youth_development; v48: city (recipient ZIPs, HQ)
// opts.cube false: the original grant_clean queries, uncached (eval/answer-cube.mts compares both paths).
// opts.memo false: the same queries as a cached answer, not kept here (Browse by cause keeps its own figures, lib/browse.ts).
export function answer(question: string, spec: Spec, opts: { cube?: boolean; memo?: boolean } = {}): Promise<Answer> {
  const s = normalizeSpec(spec);
  if (opts.cube === false) return compute(question, s, false).then(plainAnswer);
  if (opts.memo === false) return compute(question, s, true).then(plainAnswer);
  return answerMemo(JSON.stringify(s), () => compute(question, s, true).then(plainAnswer)).then((a) => ({ ...a, question }));
}

// Output side (Oct 27, Hunter): every text an answer shows reads in plain cause names, never "(SDG n)" or "Goal n"
// (headline, numbers, chart titles, bullets, follow-up chips, notes, rows). The asker's own question is left as typed.
function plainAnswer(a: Answer): Answer {
  const walk = (v: unknown, key = ""): unknown => {
    if (typeof v === "string") return key === "question" || key === "spec" ? v : plainCauseText(v);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "spec" ? x : walk(x, k)]));
    return v;
  };
  return walk(a) as Answer;
}

// A cause narrower than the label it routed to ("AI literacy" -> ai_tech_learning_work): the answer counts the
// whole label, so it runs under the label's own name ("tech and AI skills orgs") and says which cause was asked.
type Narrowed = { asked: string; name: string; label: LabelSlug };
function closestLabel(s: Spec): { spec: Spec; narrowed: Narrowed[] } {
  const narrowed: Narrowed[] = [];
  const causes = s.causes.map((c) => {
    if (!c.label || !narrowerThanLabel(c.name, c.label)) return c;
    const n = { asked: c.name, name: `${labelPhrase(c.label)} orgs`, label: c.label };
    narrowed.push(n);
    return { ...c, name: n.name };
  });
  return { spec: narrowed.length ? { ...s, causes } : s, narrowed };
}
function nameClosest(out: Out, narrowed: Narrowed[]) {
  for (const n of narrowed.slice().reverse()) {
    const note = `the closest graded label to ${n.asked}`;
    const i = out.headline.toLowerCase().indexOf(n.name.toLowerCase());
    out.headline = i >= 0 ? `${out.headline.slice(0, i + n.name.length)} (${note})${out.headline.slice(i + n.name.length)}` : `${out.headline.replace(/[.\s]+$/, "")}. Counts ${n.name}, ${note}`;
    out.caveats.unshift(`You asked about ${n.asked}. No graded label covers it alone, so this counts the broader ${LABELS[n.label]} label: ${n.label === "women_girls" ? LABEL_SCOPE[n.label] : `orgs working on ${LABEL_SCOPE[n.label]}`}. It covers more than ${n.asked} alone.`);
    if (out.method) out.method = `${out.method.replace(/\s+$/, "")} "${cap(n.asked)}" is narrower than the ${LABELS[n.label]} label, so the whole label is counted.`;
  }
  if (out.causeNote) out.causeNote = `Closest graded label${narrowed.length > 1 ? "s" : ""}, broader than the question: ${narrowed.map((n) => `"${n.asked}" counted as ${LABELS[n.label]}`).join(", ")}. ${out.causeNote}`;
}

async function compute(question: string, asked: Spec, cube: boolean): Promise<Answer> {
  const t0 = Date.now();
  const { spec: s, narrowed } = closestLabel(asked);
  const ctx = new Ctx(cube);
  await loadFullYears().catch((e) => console.error("answer full years failed", e));
  const missing = [...new Set(s.missing)].map((m) => m === "other" ? { what: s.missingNote || "Part of the question", why: "It isn't in IRS nonprofit filings.", source: "Not in our data", url: "" } : MISSING_TEXT[m]).filter(Boolean);
  let out: Out;
  try {
    out = await run(ctx, s);
  } catch (e) {
    if (!(e instanceof Unanswerable)) throw e;
    out = { status: "unanswerable", headline: e.message, numbers: [], bullets: [], chart: null, rows: [], causeNote: "", method: "", caveats: [], coverage: [], sources: [], searchQuery: null };
    if (e.missing) missing.push(e.missing);
  }
  // Never "$0" as fact for a cause: a cause filter that matched no rows in this source means the cause couldn't be
  // matched there, not that the money is zero (Oct 19, "Head Start providers" as NTEE P23 on federal awards).
  if (out.status !== "unanswerable" && s.causes.some((c) => !(c as C).all) && out.numbers[0]?.value === "$0") {
    const names = s.causes.map((c) => c.name).join(" or ");
    out = { status: "unanswerable", headline: `Nothing in ${SOURCE_WORDS[s.source]} matched ${names}. That means the cause couldn't be matched in this source, not that the money is $0.`, numbers: [], bullets: [], chart: null, rows: [], causeNote: out.causeNote, method: "", caveats: [], coverage: [], sources: [], searchQuery: null };
  }
  const premise = out.status === "unanswerable" ? null : checkPremise(s, out);
  const { change, versus, ev } = out;
  delete out.change; delete out.versus; delete out.ev;
  if (out.status !== "unanswerable") honorGuard(ctx, s, out, missing);
  slim(out, out.dual ? 3 : 2);
  delete out.dual;
  const status: Answer["status"] = out.status === "unanswerable" ? "unanswerable" : missing.length ? "partial" : out.status ?? "ok";
  // Nothing answerable: lead with exactly what's missing, not a generic refusal.
  if (status === "unanswerable" && missing.length && s.metric === "none") out.headline = missingHeadline(missing.map((m) => m.what));
  if (status === "unanswerable" && !missing.length) missing.push({ what: "This question", why: out.headline, source: "Not in our data", url: "" });
  // Causes without a graded label are counted by IRS codes or keywords: say so on the answer itself, not only in
  // "How we got this". Keywords is the rougher of the two, so it wins when both appear.
  const basis = /Approximate keyword set/.test(out.causeNote) ? "keywords" : /NTEE codes /.test(out.causeNote) ? "codes" : null;
  if (narrowed.length && status !== "unanswerable") nameClosest(out, narrowed);
  const recency = status === "unanswerable" ? null : await recencyOf(ctx, s).catch((e) => { console.error("answer recency failed", e); return null; });
  const a: Answer = { ...out, question, spec: asked, status, missing, premise, basis, recency, queries: ctx.queries, ms: 0 };
  a.steps = await stepsFor(ctx, s, a, change, versus, ev).catch((e) => { console.error("answer steps failed", e); return []; });
  return { ...a, ms: Date.now() - t0 };
}

// ---- "Show the steps" (lib/answerSteps): what the question was read as, the cause set, the data, then the
// engine's own numbers. Only facts already computed or cheap lookups (grades, years), never a model call.
const GRANT_EXCLUDED: Record<"pf" | "charity", string[]> = {
  pf: ["grants to individuals", "foreign recipients", "placeholder lines (\"SEE ATTACHED\", \"VARIOUS\")", "grants to other private foundations (counted when they grant it on)"],
  charity: ["foreign recipients", "placeholder lines (\"SEE ATTACHED\", \"VARIOUS\") and money not itemized by recipient", "transfers between related organizations (restructurings, mergers)", "grants to other DAF sponsors, community foundations and United Ways (counted when they grant it on)", "grants to private foundations"],
};
async function stepsFor(ctx: Ctx, s0: Spec, a: Answer, change?: Change, versus?: Versus, ev?: Evidence): Promise<Step[]> {
  if (a.status === "unanswerable") return [];
  const s = await resolveCauses(s0);
  // Organization counts and finances read Form 990 returns whatever the source says (dispatch: countOrgs, orgFinanceBy).
  const orgCounts = s.metric === "financial_health" || (s.source !== "federal_awards" && s.source !== "household_giving" && s.source !== "foundation_finances" && (s.metric === "count_orgs" || (s.metric === "trend" && !!s.condition)));
  const grantSrc = isGrantSrc(s) && !orgCounts;
  // Years used and why those years.
  let years: StepInput["years"] = null;
  if (grantSrc) {
    const y = grantYears(s);
    const none = s.yearFrom == null && s.yearTo == null;
    const why = none && s.metric === "trend" ? `no years asked, so ${y.from} (the first tax year e-filing was required for 990-PF and 990 returns) to ${y.to} (the newest full year)`
      : none ? `no years asked, so ${y.from} to ${y.to}, when e-filing covers almost every filer and ${G_FULL} is the newest full year`
      : `the years asked${y.note ? `. ${y.note}` : ""}${y.from < EFILE_REQUIRED ? `. Before ${EFILE_REQUIRED} many smaller filers filed on paper, so early years run low` : ""}`;
    years = { from: y.from, to: y.to, unit: "tax year", why: `${why}${y.partial ? `. ${G_LAST} returns are still arriving` : ""}` };
  } else if (s.source === "federal_awards") {
    const y = fedYears(s);
    years = { from: y.from, to: y.to, unit: "fiscal year", why: s.yearFrom == null && s.yearTo == null ? `no years asked, so every federal fiscal year loaded (${FA_FIRST} to ${FA_LAST}, October to September)` : `the years asked${y.note ? `. ${y.note}` : ""}` };
  } else {
    const ys = a.rows.flatMap((r) => (typeof r.tax_year === "number" ? [r.tax_year] : []));
    if (ys.length) years = { from: Math.min(...ys), to: Math.max(...ys), unit: "tax year", why: s.yearFrom == null && s.yearTo == null ? "no years asked, so the newest years this source covers" : "the years asked, within the years this source covers" };
    else if (["government_grants", "contributions", "revenue"].includes(s.source)) { const fy = flagYear(s); years = { from: fy.year, to: fy.year, unit: "tax year", why: fy.note ?? `the newest full year of Form 990 returns (${F_FULL})` }; }
  }
  // The cause set: graded label (tiers and grade), NTEE codes or keywords.
  const gr: Record<string, Grade> = s.causes.some((c) => c.label) ? await grades().catch(() => ({})) : {};
  const primaryOnly = /primary tier only/.test(a.causeNote);
  // Labels with sub-types: which one was counted and how the label splits (orgs per sub-type).
  const subs = new Map<C, string>();
  for (const c of s.causes as C[]) {
    const t = c.label ? LABEL_SUBTYPES[c.label as LabelSlug] : undefined;
    if (!t) continue;
    const n: Record<string, number> = await subCounts(c.label!).catch(() => ({}));
    const sub = labelSub(c), both = (Object.keys(t.names) as LabelSub[]);
    const part = (k: LabelSub) => `${t.names[k].toLowerCase()} (${int(n[k] ?? 0)} orgs)`;
    subs.set(c, sub ? `${part(sub)} only, ${both.filter((k) => k !== sub).map(part).join(", ")} left out` : `both sub-types: ${both.map(part).join(" and ")}`);
    if (sub && gr[c.label!]?.subRight != null) subs.set(c, `${subs.get(c)}, sub-types graded ${pct(gr[c.label!].subRight!)} right`);
  }
  const causes: CauseInfo[] = s.causes.map((c) => {
    if (s.source === "federal_awards" && fedProgram(c)) return { name: c.name, kind: "program" };
    if (c.label) {
      const g = gr[c.label];
      const grade = g?.primary != null ? `main focus graded ${pct(g.primary)} right on ${g.nPrimary ?? "a"} sampled orgs${g.recall != null ? `, recall about ${pct(g.recall)}` : ""}` : undefined;
      return { name: c.name, kind: "label", labelName: g?.name ?? LABELS[c.label as LabelSlug] ?? c.label, grade, subtype: subs.get(c),
        tiers: primaryOnly ? "main focus only (main stated purpose)" : bothTiers(c as C) ? "main focus and part of their work, both in the headline" : grantSrc ? "main focus as the headline, main focus plus part of their work as the upper bound" : "main focus and part of their work" };
    }
    if (c.ntee.length) return { name: `${c.name} (NTEE ${c.ntee.join(", ")})`, kind: "ntee" };
    return { name: c.name, kind: "keyword" };
  });
  const pl = ctx.places[0];
  const linked = s.causes.length > 0;
  const source = s.metric === "financial_health" ? "Form 990 and 990-EZ returns, one per organization per tax year, full years only"
    : orgCounts ? "Form 990 and 990-EZ returns, the newest per organization, against the IRS master file"
    : grantSrc
    ? `${pl?.g.form ?? "990-PF grants"} to ${linked ? "identified recipients" : "US organizations"}${pl && pl.g.kind === "charity" ? ` by ${pl.g.givers}` : ""}, placed by the recipient's address`
    : s.source === "federal_awards" ? "federal grants and cooperative agreements to nonprofits (USAspending), placed where the work happens"
    : s.source === "household_giving" ? "IRS SOI individual income tax returns, itemized charitable deductions by place"
    : s.source === "foundation_finances" ? "990-PF returns: assets, distributable amount and qualifying distributions"
    : `${SOURCE_WORDS[s.source]}, one return per organization per year`;
  const excluded = orgCounts ? ["private foundations", "990-N filers (no financial lines)"] : grantSrc ? GRANT_EXCLUDED[pl?.g.kind ?? "pf"]
    : s.source === "federal_awards" ? ["contracts, loans and direct payments", "federal money passed through states and cities"]
    : s.source === "household_giving" ? ["gifts by people who don't itemize", "where the gifts went (returns don't say)"]
    : s.source === "foundation_finances" ? [] : ["private foundations", "990-N filers (no revenue lines)"];
  return buildSteps({ spec: s, a, years, causes, source, excluded, change, versus, ev, moneyTo: !orgCounts, ...(orgCounts ? { sourceWords: "Form 990 returns" } : {}) });
}

// Evidence for the steps: the biggest recipients and funders of a cause in the key years (a year each, or one span),
// graded labels by primary-tier dollars so they add up to the headline's total.
async function movers(ctx: Ctx, c: C, pl: Place, y: { from: number; to: number }, each: number[] | null, primaryOnly: boolean): Promise<Movers[]> {
  const p = new P();
  const gw = grantWhere(c, p, pl, y, true);
  const where = [...gw.where, ...(each ? [`g.tax_year = ANY(${p.add(each)}::int[])`] : []), ...(primaryOnly && gw.cs.tier ? [`${gw.cs.tier} = 'primary'`] : [])];
  const rows = await ctx.q<{ k: string; yr: number; ein: string; name: string | null; usd: number; total: number }>(`Biggest recipients and funders${each ? " in the key years" : ""} (evidence for the steps)`,
    `WITH s AS MATERIALIZED (SELECT ${each ? "g.tax_year" : "0"} AS yr, g.recipient_ein, g.funder_ein, g.amount FROM ${pl.g.clean} g ${gw.cs.join} WHERE ${and(where)}),
t AS (SELECT yr, sum(amount)::float8 AS total FROM s GROUP BY 1),
r AS (SELECT yr, recipient_ein AS ein, sum(amount)::float8 AS usd, row_number() OVER (PARTITION BY yr ORDER BY sum(amount) DESC, recipient_ein) AS rk FROM s GROUP BY 1, 2),
f AS (SELECT yr, funder_ein AS ein, sum(amount)::float8 AS usd, row_number() OVER (PARTITION BY yr ORDER BY sum(amount) DESC, funder_ein) AS rk FROM s GROUP BY 1, 2)
SELECT 'r' AS k, r.yr, r.ein, o.name, r.usd, t.total FROM r JOIN t USING (yr) LEFT JOIN orgs o ON o.ein = r.ein WHERE r.rk <= 3
UNION ALL SELECT 'f', f.yr, f.ein, fu.name, f.usd, t.total FROM f JOIN t USING (yr) LEFT JOIN ${pl.g.funders} fu ON fu.ein = f.ein WHERE f.rk <= 3
ORDER BY 2, 1 DESC, 5 DESC`, p);
  const keys = each ?? [0];
  return keys.map((k) => {
    const rs = rows.filter((r) => r.yr === k);
    const ev = (role: "recipient" | "funder") => rs.filter((r) => r.k === (role === "recipient" ? "r" : "f")).map((r) => ({ role, name: orgName(r.name ?? r.ein), ein: r.ein, usd: r.usd }));
    return { year: each ? String(k) : yrs(y.from, y.to), total: rs[0]?.total ?? 0, recipients: ev("recipient"), funders: ev("funder") };
  }).filter((m) => m.total > 0);
}
// A cause's dollars in one tax year (the year before a trend starts, for the start-year spike check).
async function yearSum(ctx: Ctx, c: C, pl: Place, year: number): Promise<{ usd: number; primary_usd: number }> {
  const p = new P(), y = { from: year, to: year };
  if (cubeOk(ctx, c, pl)) {
    const cw = cubeWhere(c, p, pl, y, true);
    return (await ctx.q<{ usd: number; primary_usd: number }>(`The year before the start, ${year} (start-year check, research cube)`, `SELECT coalesce(sum(x.usd), 0)::float8 AS usd, ${cubeSum(cw)} AS primary_usd FROM ${pl.g.cube} x WHERE ${and(cw.where)}`, p))[0];
  }
  const gw = grantWhere(c, p, pl, y, true);
  return (await ctx.q<{ usd: number; primary_usd: number }>(`The year before the start, ${year} (start-year check)`, `SELECT coalesce(sum(g.amount), 0)::float8 AS usd, ${primarySum(gw.cs, "g.amount")} AS primary_usd FROM ${pl.g.clean} g ${gw.cs.join} WHERE ${and(gw.where)}`, p))[0];
}
const SPIKE = 0.3; // a start year more than 30% above the year before is flagged (2020 COVID-era giving)

const SOURCE_WORDS: Record<Spec["source"], string> = { foundation_grants: "foundation grants", charity_grants: "charity grants (Schedule I)", federal_awards: "federal awards", government_grants: "government grants on Form 990", contributions: "contributions on Form 990", revenue: "revenue on Form 990", household_giving: "household giving", foundation_finances: "foundation finances" };

// "Individual giving isn't in our IRS data"; "Payout rates and Board members aren't ...". A note the router wrote
// as a full sentence ("Our grant data covers 2022-2025 only, so ...") is its own headline, never suffixed.
const PREP = /\s(by|to|of|outside|beyond|before|after|from|for|in|on|with|through|at|per|that|who|across)\s.*$/i;
function missingHeadline(whats: string[]): string {
  const clean = whats.map((w) => w.trim().replace(/[.\s]+$/, "")).filter(Boolean);
  const sentence = (w: string) => w.split(/\s+/).length > 9 || /[.;:,]/.test(w.replace(/\([^)]*\)/g, ""));
  const nouns = clean.filter((w) => !sentence(w)), sentences = clean.filter(sentence);
  const head = nouns.length ? nouns[0].replace(PREP, "").trim().split(/\s+/).at(-1) ?? "" : "";
  const plural = nouns.length > 1 || (/s$/i.test(head) && !/(ss|us|is)$/i.test(head));
  const lead = nouns.length ? `${nouns.map((w, i) => (i ? w.charAt(0).toLowerCase() + w.slice(1) : w)).join(" and ")} ${plural ? "aren't" : "isn't"} in our IRS data` : "";
  return [lead, ...sentences].filter(Boolean).join(". ");
}

// Years each source covers (requested years outside them are named, never silently dropped).
const SOI_FIRST = 2013, SOI_LAST = 2023; // household_giving: IRS SOI county data (ZIP data through 2022)
function coverage(src: Spec["source"]): { first: number; last: number; what: string } {
  if (src === "federal_awards") return { first: FA_FIRST, last: FA_LAST, what: "Federal awards here cover fiscal years" };
  if (src === "government_grants" || src === "contributions" || src === "revenue") return { first: F_FIRST, last: F_LAST, what: "Form 990 lines here cover tax years" };
  if (src === "household_giving") return { first: SOI_FIRST, last: SOI_LAST, what: "IRS SOI individual returns here cover tax years" };
  if (src === "foundation_finances") return { first: FF_FIRST, last: FF_LAST, what: "Foundation finances (990-PF) here cover tax years" };
  return { first: G_FIRST, last: G_LAST, what: "Grants here cover tax years" };
}
const yspan = (a: number, z: number) => (a >= z ? `${a}` : `${a}–${z}`);

// The general guard: every part of the spec the engine couldn't apply becomes a visible "not included" note
// (missing, so status partial) and, when it changes what the number covers, a lead line on the headline.
// Place parts are checked against what the queries actually applied (Place.used), other parts against
// ctx.honored, per-resident against the answer's own words.
function honorGuard(ctx: Ctx, s: Spec, out: Out, missing: Answer["missing"]) {
  const add = (what: string, why: string, lead?: string) => {
    if (missing.some((m) => m.what === what)) return;
    missing.push({ what, why, source: "Not in this answer", url: "" });
    if (lead) out.headline = `${out.headline.replace(/[.\s]+$/, "")}. ${lead}`;
  };
  // Years outside the data: say which years the answer covers.
  const cv = coverage(s.source);
  const yf = s.yearFrom, yt = s.yearTo;
  if ((yf != null && yf < cv.first) || (yt != null && yt < cv.first)) {
    const gap = yspan(yf ?? yt!, Math.min(cv.first - 1, yt ?? cv.first - 1));
    add(`Years before ${cv.first}`, `${cv.what} ${cv.first}–${cv.last}, so ${gap} isn't included.`, `Our data starts in ${cv.first}, so ${gap} isn't included`);
  }
  if ((yt != null && yt > cv.last) || (yf != null && yf > cv.last)) {
    const gap = yspan(Math.max(cv.last + 1, yf ?? cv.last + 1), yt ?? yf!);
    add(`Years after ${cv.last}`, `${cv.what} ${cv.first}–${cv.last}, so ${gap} isn't included.`, `Our data ends in ${cv.last}, so ${gap} isn't included`);
  }
  // Place parts the queries didn't apply.
  const used = new Set(ctx.places.flatMap((pl) => [...pl.used]));
  const pl = ctx.places[0];
  if (s.region && !pl?.region) add(`Region: ${s.region}`, "We couldn't map this region to counties, so the answer isn't limited to it.", `Not limited to ${s.region}`);
  else if (pl?.region && !used.has("region")) add(`Limited to ${pl.region.name}`, `This kind of answer can't be limited to ${pl.region.name}'s counties, so it covers ${s.states.length ? "the states asked" : "the whole US"}.`, `Not limited to ${pl.region.name}`);
  if (pl?.city && !used.has("city")) add(`Limited to ${pl.city.label}`, `This kind of answer can't be limited to one city, so it covers ${used.has("county") && pl.county ? `${pl.county.name}, ${pl.county.state}` : "the state"}.`, `Covers ${used.has("county") && pl.county ? `${pl.county.name}, ${pl.county.state}` : "the state"}, not only ${pl.city.name}`);
  else if (pl?.county && !used.has("county")) add(`Limited to ${pl.county.name}`, `This kind of answer can't be limited to one county, so it covers ${s.states.length ? "the state" : "the whole US"}.`, `Not limited to ${pl.county.name}`);
  if (s.area && !used.has("area")) add(`Limited to ${s.area} counties`, `This kind of answer can't be split by ${s.area} and urban counties, so it covers all counties.`, `Not limited to ${s.area} counties`);
  // Set size, multi-year conditions, org conditions.
  if (s.topN && !ctx.honored.has("topN")) add(`The ${s.topN} largest funders as a group`, "This answer can't total a top-N funder set for this source, so it shows the top 10.", `Not the top ${s.topN} as a group`);
  if (s.streak && !ctx.honored.has("streak")) add(`${s.streak} years in a row`, "This answer counts one year only, so it can't say which organizations met the condition year after year.", `Counts one year, not ${s.streak} in a row`);
  if (s.condition && !ctx.honored.has("condition")) add(`Organizations that ${s.condition === "deficit" ? "run deficits" : s.condition === "low_cash" ? "have thin cash" : s.condition === "gov_reliant" ? "rely on government grants" : "run surpluses"}`, "Only organization counts can filter on finances, so this answer covers all organizations.");
  if (s.source === "foundation_finances" && s.causes.length) add("Payout by cause", "A 990-PF reports one set of finances per foundation, with no split by cause, so this covers all foundations.", `Not limited to ${s.causes[0].name}: foundation finances have no cause split`);
  if (s.source === "household_giving" && s.causes.length) add(MISSING_TEXT.individual_giving.what, MISSING_TEXT.individual_giving.why, `Not limited to ${s.causes[0].name}: tax returns don't say where gifts went`);
  // Causes no query restricted to (a second cause on an answer that covers one): never silent.
  else if (s.source !== "foundation_finances") {
    const left = s.causes.filter((c) => !ctx.causes.has(c.name));
    const covered = s.causes.filter((c) => ctx.causes.has(c.name));
    for (const c of left) add(cap(c.name), `This kind of answer covers ${covered.length ? `one cause, ${covered[0].name}` : "one cause at a time"}, so ${c.name} isn't counted. Ask about ${c.name} on its own.`, covered.length ? `${cap(c.name)} isn't included, only ${covered.map((x) => x.name).join(" and ")}` : `${cap(c.name)} isn't included`);
  }
  // Per-resident and per-person-in-poverty figures the answer didn't produce.
  const words = [out.headline, ...out.numbers.map((n) => n.label), ...out.bullets, out.chart?.title ?? ""].join(" ");
  if (s.perPoverty && !/in poverty|per poor/i.test(words)) add("Per person in poverty", "This kind of answer has no per-person-in-poverty figure, so totals are shown.");
  else if (s.perResident && !s.perPoverty && !/per (resident|capita|person|(tax )?return)/i.test(words)) add("Per-resident figures", "This kind of answer has no per-resident figure, so totals are shown.");
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

// One hero: at most 3 tiles, and at most 2 bullets (3 for a two-cause ranking: one per cause and the overlap)
// that add something the headline and tiles don't say.
function slim(o: Out, maxBullets = 2) {
  o.numbers = o.numbers.slice(0, 3);
  const tiles = new Set(o.numbers.map((n) => n.value));
  o.bullets = o.bullets.filter((bl) => {
    const nums = [...bl.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
    return !nums.some((n) => tiles.has(n)) && !(nums.length && nums.every((n) => o.headline.includes(n)));
  }).slice(0, maxBullets);
}

class Unanswerable extends Error {
  constructor(msg: string, public missing?: Answer["missing"][number]) { super(msg); }
}

const GOV_CAVEAT = "Government grants as reported on recipients' Form 990 (Part VIII line 1e). Excludes direct federal awards to agencies, universities and companies, government contracts (fees for service are program revenue), and 990-EZ and 990-N filers.";
const PF_CAVEATS = (lr: { grants: number; dollars: number }) => [
  `Only private-foundation grants (990-PF). Community foundations and donor-advised funds are a separate source (Schedule I grants by charities). Corporate giving programs outside company foundations aren't public.`,
  `Recipients are identified for ${pct(lr.grants)} of 2022–24 grants to US organizations (${pct(lr.dollars)} of those dollars; grants to individuals, foreign recipients and placeholder lines are left out first). Cause totals count only identified recipients, so they run low.`,
];

const SI_CAVEATS = (lr: { grants: number; dollars: number }, cls: string | null, ni: NotItemized) => [
  "Schedule I grants: what public charities filing Form 990 report giving to US organizations and governments, usually grants over $5,000. Private foundations are a separate source.",
  `Some filers don't name their recipients ("SEE ATTACHED", "VARIOUS") or list only part of them. In 2022–24, ${money(ni.usd)} of the ${money(ni.line1)} these filers reported giving (${pct(ni.usd / Math.max(1, ni.line1))}) isn't itemized by recipient. With no recipient, place or cause, it's left out of every number here, and national totals show it alongside as reported but not itemized.`,
  ...(cls === "daf_sponsor" ? ["DAF sponsor = a charity that holds donor-advised funds and whose DAF grants (Schedule D) are at least half of its Schedule I grants. Community foundations and United Ways are counted separately."] : []),
  ...(cls === "community_foundation" ? ["Community foundation = \"Community Foundation\", \"Community Fund\" or \"Community Trust\" in the name, or NTEE code T31 when DAF grants aren't most of its giving."] : []),
  ...(cls == null || cls === "daf_sponsor" || cls === "community_foundation" ? ["Schedule I doesn't say which grants a donor advised. DAF sponsors' grants are mostly DAF grants, and community foundations' mix DAF and their own grants."] : []),
  "Grants to another DAF sponsor, community foundation or United Way are left out, so the money isn't counted twice.",
  "Lines that move assets between related organizations (a restructuring, merger or transfer to a subsidiary, parent or supporting organization, mostly non-cash) are left out: they aren't grantmaking. The largest was Underwriters Laboratories' $7.6B stock transfer to ULSE in 2021.",
  ...(cls == null || cls === "other" ? ["Amounts include goods given in kind (food banks, donated supplies) at the value the filer reports."] : []),
  `Recipients are identified for ${pct(lr.grants)} of 2022–24 Schedule I grants (${pct(lr.dollars)} of those dollars). Cause totals count only identified recipients.`,
];
async function grantCaveats(pl: Place): Promise<string[]> {
  const lr = await linkRate(pl.g);
  if (pl.g.kind === "pf") return PF_CAVEATS(lr);
  const ni = await niMemo(pl.g.cls ?? "all", () => notItemized(null, pl.g.cls, { from: 2022, to: 2024 }));
  return SI_CAVEATS(lr, pl.g.cls, ni);
}

async function run(ctx: Ctx, s0: Spec): Promise<Out> {
  if (s0.metric === "none") throw new Unanswerable("Our IRS data can't answer this question.");
  const s1 = await resolveCauses(s0);
  // Corrected NTEE groups: NTEE-coded causes count listed orgs under their suggested major group (nteeMatch).
  const s = s1.ntee === "corrected" ? { ...s1, causes: s1.causes.map((c) => (!c.label && c.ntee.length ? { ...c, corr: true } : c)) } : s1;
  const pl = await resolvePlace(s);
  ctx.places.push(pl);
  if (s.county && !pl.county) throw new Unanswerable(`We couldn't find a county named "${s.county}"${s.states.length ? ` in ${s.states.join(", ")}` : ""}.`);
  const out = await dispatch(ctx, s, pl);
  if (pl.corr) { await corrNote(ctx, s, pl, out).catch((e) => console.error("corrected NTEE note failed", e)); out.options = { ...out.options, corrected: true }; }
  else if (s.ntee !== "corrected" && s.source !== "household_giving" && s.source !== "foundation_finances" && await corrMoves(s)) out.options = { ...out.options, corrected: true };
  // Years before e-filing was required: say so, and on a trend lead with it (much of the rise is filers moving to e-file).
  if (isGrantSrc(s) && grantYears(s).from < EFILE_REQUIRED) {
    const { from, to } = grantYears(s), note = await earlyCoverage(pl.g.kind, from).catch(() => "");
    if (note) out.caveats.unshift(note);
    if (s.metric === "trend" && to > from) out.headline = `${out.headline.replace(/[.\s]+$/, "")}. Tax years before ${EFILE_REQUIRED} miss many smaller filers, so growth from ${from} runs high`;
  }
  // Filters: say what they mean. Funder and recipient-kind filters exist only for foundation grants.
  if (s.source === "foundation_finances") { /* its own size and type notes */ }
  else if (s.source !== "foundation_grants" && (s.funderSize || s.funderType || s.recipientKind)) out.caveats = ["Foundation size, foundation type and recipient kind apply only to foundation grants, so they're not applied here.", ...out.caveats];
  else if (hasFilt(pl.f)) out.caveats = [...pl.f.notes, ...out.caveats];
  return out;
}

// ---- corrected NTEE groups (spec.ntee "corrected", generosity-data 072)
export const CORR_CHIP = "Use our corrected categories?"; // plain words (was "With corrected categories?", still understood)
const CORR_GRADE = "Each moved org's IRS code didn't fit its own 990 text, so it counts under a suggested NTEE major group (graded 94% right on a sample of 150). Each added org had no IRS code and counts under a group suggested from similar orgs and its own filings (graded 98% right on a sample of 150). About half of them also have a detailed code (graded 98.7% on 150). The IRS codes are unchanged and stay the default.";
// Offer the chip only when an NTEE-coded cause has orgs that move in or out of it.
const corrMoves = async (s: Spec): Promise<boolean> => {
  const pats = [...new Set(s.causes.filter((c) => !c.label && c.ntee.length).flatMap((c) => c.ntee.map((n) => `${n}%`)))];
  if (!pats.length) return false;
  const r = await db.query(`SELECT EXISTS (SELECT 1 FROM org_ntee_suggested ns WHERE ${SUG()} LIKE ANY($1::text[]) OR irs_ntee LIKE ANY($1::text[])) AS x`, [pats]).catch(() => null);
  return !!r?.rows[0]?.x;
};
// The footnote: how many orgs and dollars (grant sources) moved into and out of each corrected cause, in the
// answer's years and place. Orgs with no IRS code (irs_ntee '', method uncoded_vote_llm) are "added", not moved.
// A split by NTEE group (or fastest causes) says how many orgs moved and were added in all.
async function corrNote(ctx: Ctx, s: Spec, pl: Place, out: Out) {
  const grant = isGrantSrc(s) && s.metric !== "count_orgs";
  const y = grant ? grantYears(s) : null;
  const causes = (s.causes as C[]).filter((c) => c.corr);
  const notes: string[] = [];
  const run1 = async (c: C | null) => {
    const p = new P();
    const pats = c ? p.add(c.ntee.map((n) => `${n}%`)) : null;
    const sm = pats ? `${SUG()} LIKE ANY(${pats}::text[])` : "true", im = pats ? `coalesce(x.ntee, '') LIKE ANY(${pats}::text[])` : "false";
    const un = "coalesce(ns.irs_ntee, '') = ''";
    let sql: string;
    if (grant && y) {
      const w = [...placeWhere(pl, p, "g.recipient_state", "g.county_fips"), ...gExtra(pl, p, "g")];
      sql = `SELECT count(DISTINCT x.ein) FILTER (WHERE x.sm AND NOT x.im AND NOT x.un)::int AS n_in, coalesce(sum(x.amount) FILTER (WHERE x.sm AND NOT x.im AND NOT x.un), 0)::float8 AS usd_in,
       count(DISTINCT x.ein) FILTER (WHERE x.sm AND NOT x.im AND x.un)::int AS n_add, coalesce(sum(x.amount) FILTER (WHERE x.sm AND NOT x.im AND x.un), 0)::float8 AS usd_add,
       count(DISTINCT x.ein) FILTER (WHERE x.im AND NOT x.sm)::int AS n_out, coalesce(sum(x.amount) FILTER (WHERE x.im AND NOT x.sm), 0)::float8 AS usd_out
FROM (SELECT ns.ein, g.amount, ${sm} AS sm, ${un} AS un, ${im.replace("x.ntee", "g.recipient_ntee")} AS im
      FROM org_ntee_suggested ns
      CROSS JOIN LATERAL (SELECT * FROM ${pl.g.clean} g0 WHERE g0.recipient_ein = ns.ein AND g0.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)} OFFSET 0) g
      ${w.length ? `WHERE ${and(w)}` : ""}) x`;
    } else {
      const w = pl.states.length ? [`o.state = ANY(${p.add(pl.states)}::text[])`] : [];
      sql = `SELECT count(*) FILTER (WHERE x.sm AND NOT x.im AND NOT x.un)::int AS n_in, 0::float8 AS usd_in, count(*) FILTER (WHERE x.sm AND NOT x.im AND x.un)::int AS n_add, 0::float8 AS usd_add,
       count(*) FILTER (WHERE x.im AND NOT x.sm)::int AS n_out, 0::float8 AS usd_out
FROM (SELECT ns.ein, ${sm} AS sm, ${un} AS un, ${im.replace("x.ntee", "o.ntee_cd")} AS im FROM org_ntee_suggested ns JOIN orgs o ON o.ein = ns.ein ${w.length ? `WHERE ${and(w)}` : ""}) x`;
    }
    const [r] = await ctx.q<{ n_in: number; usd_in: number; n_add: number; usd_add: number; n_out: number; usd_out: number }>(`Orgs${grant ? " and dollars" : ""} moved or added by corrected NTEE groups${c ? `: ${c.name}` : ""}`, sql, p);
    return r;
  };
  const when = y ? `, ${yrs(y.from, y.to)}` : "";
  const orgs = (n: number) => `${int(n)} ${n === 1 ? "org" : "orgs"}`;
  const amt = (n: number, usd: number) => (grant ? `${orgs(n)} (${money(usd)})` : orgs(n));
  if (causes.length) {
    for (const c of causes) {
      const r = await run1(c);
      const add = r.n_add ? `, ${amt(r.n_add, r.usd_add)} added that had no IRS code,` : "";
      notes.push(`${cap(c.name)}: ${amt(r.n_in, r.usd_in)} moved in${add} and ${amt(r.n_out, r.usd_out)} moved out${when}.`);
    }
  } else {
    const r = await run1(null);
    notes.push(`${amt(r.n_in, r.usd_in)} counted under a different NTEE major group than their IRS code${r.n_add ? `, and ${amt(r.n_add, r.usd_add)} with no IRS code added under a suggested group` : ""}${when}.`);
  }
  out.caveats.unshift(`Corrected categories. ${notes.join(" ")} ${CORR_GRADE}`);
  out.causeNote = `${out.causeNote ? `${out.causeNote.replace(/\s+$/, "")} ` : ""}By corrected category: orgs in org_ntee_suggested count under their suggested NTEE code (detailed for about half the orgs with no IRS code, else the major group).`;
  out.coverage = [...out.coverage, { label: "NTEE basis", value: "Corrected categories" }];
}

async function dispatch(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  // Financial health reads each org's own Form 990s whatever the source says.
  if (s.metric === "financial_health") return s.ein ? orgHealthAnswer(ctx, s) : causeHealth(ctx, s, pl);
  if (s.source === "foundation_finances") return foundationPayout(ctx, s, pl);
  // Nonprofit finances over time or by size (org_finance_year): "share of food banks running deficits by year".
  if (s.source !== "household_giving" && s.source !== "federal_awards" && ((s.metric === "count_orgs" && (s.by === "year" || s.by === "recipient_size")) || (s.metric === "trend" && s.condition))) return orgFinanceBy(ctx, s, pl);
  if (s.source === "household_giving") return householdGiving(ctx, s, pl);
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
      return s.by === "recipient_kind" && !s.causes.length && (s.measure ?? "dollars") === "dollars" ? withWho(ctx, s, pl, () => breakdown(ctx, s, pl)) : breakdown(ctx, s, pl);
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
    case "underfunded": return underfunded(ctx, s, pl);
    default: throw new Unanswerable("Our IRS data can't answer this question.");
  }
}

// The cause as named, plus the recipient-side filter when there is one ("arts (organizations with under $1M in revenue)").
const causeName = (c: Cause | null, pl?: Place) => {
  const base = c ? c.name : pl?.f.to || "all causes";
  return c && pl?.f.to ? `${base} (${pl.f.to})` : base;
};
const searchFor = (s: Spec, pl: Place) => (s.causes[0] ? `${s.causes[0].name.replace(/\s\(SDG \d+\)$/, "")}${pl.city ? ` in ${pl.city.label}` : pl.county ? ` in ${pl.county.name}, ${pl.county.state}` : s.states.length === 1 ? ` in ${stateName(s.states[0])}` : ""}` : null);

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

// ---- who received it (lib/recipientTypes, generosity-data 079)
// Foundation grant dollars split by who got them: linked nonprofits, governments, public universities, international
// bodies, companies, unidentified. Only where it fits: 990-PF money with no cause (a cause counts linked nonprofits
// only), on the cube (no county, region or company-foundation filter) and no recipient-side filter.
async function whoReceived(ctx: Ctx, pl: Place, y: { from: number; to: number }): Promise<Who | null> {
  if (!ctx.cube || pl.g.kind !== "pf" || pl.corr || !cubeOk(ctx, null, pl) || pl.f.rb || pl.f.kinds) return null;
  const p = new P();
  const cw = cubeWhere(null, p, pl, y, false);
  const tp = new P();
  const [kinds, tagged] = await Promise.all([
    ctx.q<{ k: string; usd: number; linked_usd: number }>("Foundation grant dollars by recipient kind (who received it; research cube)", `SELECT x.recipient_kind AS k, coalesce(sum(x.usd), 0)::float8 AS usd, coalesce(sum(x.usd) FILTER (WHERE x.linked), 0)::float8 AS linked_usd
FROM grant_cube x WHERE ${and(cw.where)} GROUP BY 1`, p),
    ctx.q<{ k: string; usd: number }>("Unlinked grant dollars by recipient type, plus EIN links to IPEDS public colleges (generosity-data 079, index 080)",
      whoTaggedSql({ from: y.from, to: y.to, states: pl.states, area: pl.area, fb: pl.f.fb, ftype: pl.f.ftype }, (v) => tp.add(v)), tp),
  ]);
  return whoSplit(kinds, Object.fromEntries(tagged.map((r) => [r.k, Number(r.usd)])));
}
// "About 9% of these grant dollars went to governments and public universities." Only when it's at least 1%.
const whoLine = (w: Who) => (w.public_share + w.other_share < 0.01 ? null
  : `About ${pct(w.public_share)} of these grant dollars went to governments and public universities${w.other_share >= 0.005 ? `, and ${pct(w.other_share)} to international bodies and companies` : ""}. They stay in the total.`);
async function withWho(ctx: Ctx, s: Spec, pl: Place, make: () => Promise<Out>): Promise<Out> {
  const whoP = whoReceived(ctx, pl, grantYears(s)).catch((e) => { console.error("who received failed", e); return null; });
  const [out, who] = await Promise.all([make(), whoP]);
  if (who) {
    out.who = who;
    const line = whoLine(who);
    if (line) out.caveats.unshift(line);
  }
  return out;
}

// ---- total / share / compare / trend, foundation grants
async function foundationTotal(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  return !s.causes.length && s.metric !== "compare" ? withWho(ctx, s, pl, () => foundationTotal0(ctx, s, pl)) : foundationTotal0(ctx, s, pl);
}
async function foundationTotal0(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const y = grantYears(s);
  const causes: (C | null)[] = s.causes.length ? s.causes.slice(0, s.metric === "compare" ? 2 : 1) : [hasFilt(pl.f) ? subjectOf(pl) : null];
  // Evidence for the steps, run beside the main queries: the biggest recipients and funders (first and last full
  // year on a trend, the whole span otherwise) and, on a trend, the year before the start (spike check).
  const ce = causes[0] && !causes[0].all ? causes[0] : null;
  const keyYears = s.metric === "trend" && y.full.length > 1 ? [y.full[0], y.full.at(-1)!] : null;
  const evMovers = ce && s.metric !== "compare" ? movers(ctx, ce, pl, y, keyYears, isTiered(ce)).catch(() => []) : Promise.resolve([]);
  const evPrev = ce && s.metric === "trend" && y.from - 1 >= G_FIRST && y.full.length >= 3 && y.full[0] === y.from ? yearSum(ctx, ce, pl, y.from - 1).catch(() => null) : Promise.resolve(null);
  const [den, gcav, ...ms] = await Promise.all([fDenom(ctx, pl, y), grantCaveats(pl), ...causes.map((c) => c ? fMoney(ctx, c, pl, y, `${cap(pl.g.grants)} to ${c.name}, by tax year`) : null)]);
  // Schedule I money with no named recipient: beside a national all-causes total, never inside any total.
  const ni = pl.g.kind === "charity" ? await notItemized(ctx, pl.g.cls, y) : null;
  const national = !pl.states.length && !pl.county && !pl.region && !pl.area;
  // Transfers between related organizations: named beside a national all-causes total when any fall in the years.
  const xf = pl.g.kind === "charity" && national && !causes[0] && !hasFilt(pl.f) ? await transfersOut(ctx, pl.g.cls, y) : null;
  const xfShown = !!xf && xf.usd > 0;
  const xfMethod = xfShown ? ` It excludes ${money(xf!.usd)} of non-cash transfers between related organizations (${int(xf!.n)} Schedule I line${xf!.n === 1 ? "" : "s"}: restructurings, mergers, transfers of assets to a subsidiary, parent or supporting organization, and clear reporting errors), which aren't grantmaking.` : "";
  const niShown = !!ni && ni.usd > 0 && national && !causes[0];
  const niMethod = !ni || ni.usd <= 0 ? ""
    : niShown ? ` Another ${money(ni.usd)} was reported on these returns (Part IX line 1) without naming recipients ("SEE ATTACHED", "VARIOUS" or left off the list). It's shown beside the total as reported but not itemized, not added to it.`
    : ` Another ${money(ni.usd)} (all states, all causes) was reported in these years without naming recipients, so it can't be counted by ${causes[0] ? "cause or place" : "place"} and is left out.`;
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
  // Inflation: growth after inflation next to nominal growth, and real dollars in the chart and CSV.
  const inf = await inflation(ctx, Array.from({ length: y.to - y.from + 1 }, (_, i) => y.from + i));
  const fl = (g: number | null) => realGrowth(inf, g, y.full[0], y.full.at(-1)!);
  const chg = (a: number, z: number, g: number | null, primary: boolean): Evidence["change"] => (g == null ? undefined
    : { from: y.full[0], to: y.full.at(-1)!, a, z, g, real: fl(g), cpiFrom: inf?.idx.get(y.full[0]), cpiTo: inf?.idx.get(y.full.at(-1)!), base: inf?.base, primary });

  if (!causes[0]) {
    // All foundation money in a place.
    const vals = den.years.map((r) => ({ year: yearLabel(r.year!, pl.g.kind), usd: r.usd, real: inf ? realOf(inf, r.usd, r.year!) : null }));
    const u = unit(Math.max(...vals.map((v) => Math.max(v.usd, v.real ?? 0)), 1));
    const fullSum = den.years.filter((r) => r.year! <= G_FULL).reduce((a, r) => a + r.usd, 0);
    const first = den.years.find((r) => r.year === y.full[0]), last = den.years.find((r) => r.year === y.full.at(-1));
    const growth = first && last && first !== last ? last.usd / first.usd - 1 : null;
    const realG = fl(growth);
    const trend = s.metric === "trend" && growth != null;
    const pop0 = s.perResident || pl.states.includes("DC") ? await placePop(ctx, pl) : 0;
    if (pl.states.includes("DC")) caveats.push(DC_NOTE);
    // National 990-PF totals, all causes, no filters: our coverage of IRS SOI and Giving USA.
    const bench = national && pl.g.kind === "pf" && !hasFilt(pl.f) ? await benchmarks(ctx, y) : null;
    const growthTile = growth != null ? [{ value: signed(growth), label: `${y.full[0]} to ${y.full.at(-1)}`, note: realG != null && !trend ? `${signed(realG)} after inflation` : undefined }] : [];
    const realTile = trend && realG != null ? [{ value: signed(realG), label: `after inflation, ${y.full[0]} to ${y.full.at(-1)}` }] : [];
    const barSpec = vbar(vals.map((v) => ({ year: v.year, amount: +(v.usd / u.div).toFixed(3), amount_nom: +(v.usd / u.div).toFixed(3), amount_real: v.real != null ? +(v.real / u.div).toFixed(3) : null })), "year", "amount", "Tax year", u.title, u.fmt);
    return {
      headline: trend
        ? `${cap(pl.g.money)} to organizations in ${where} ${grewText(growth!, realG)} from ${y.full[0]} to ${y.full.at(-1)}`
        : `${pl.g.who} gave ${money(den.total.usd)} to organizations in ${where}, ${yr}${pop0 > 0 ? `: ${perRes(fullSum / fullYears / pop0)} per resident a year` : ""}`,
      numbers: trend
        ? [...growthTile, ...realTile, { value: money(fullSum / fullYears), label: "a year (full years)" }]
        : [{ value: money(den.total.usd), label: `${pl.g.grants}, ${yr}`, note: niShown ? `plus ${money(ni!.usd)} reported but not itemized` : undefined }, ...(pop0 > 0 ? [{ value: perRes(fullSum / fullYears / pop0), label: "per resident a year", note: pl.states.includes("DC") ? DC_NOTE_SHORT : undefined }] : []), { value: money(fullSum / fullYears), label: "a year (full years)" },
          ...growthTile],
      bullets: [`${b(money(fullSum / fullYears))} a year in ${pl.g.kind === "pf" ? "private-foundation grants" : pl.g.grants} to ${where}`,
        ...(niShown ? [`Plus ${b(money(ni!.usd))} reported but not itemized by recipient`] : []),
        ...(xfShown ? [`Excludes ${b(money(xf!.usd))} of non-cash transfers between related organizations`] : []),
        `${b(int(den.total.n))} grants counted, all recipients, by recipient address`,
        ...(growth != null && !trend ? [`Grant dollars changed ${b(signed(growth))} from ${y.full[0]} to ${y.full.at(-1)}${realG != null ? `, ${b(signed(realG))} after inflation` : ""}`] : [])],
      chart: { title: `${cap(pl.g.grants)} to ${where}, by tax year`, sub: u.title, spec: inf ? inflToggle(barSpec, "amount", inf) : barSpec },
      rows: den.years.map((r) => ({ tax_year: r.year, grants_usd: r.usd, ...(inf ? { [`grants_usd_in_${inf.base}_dollars`]: Math.round(realOf(inf, r.usd, r.year!)) } : {}), grants: r.n, linked_usd: r.linked_usd })),
      causeNote: notes[0], coverage: [...coverage, ...(bench?.coverage ?? [])], caveats,
      method: `Sum of ${pl.g.form} paid in tax years ${yr} to US organizations in ${where} (by the recipient's address), excluding grants to individuals, unitemized lines, foreign recipients and transfers to other private foundations${pl.g.kind === "charity" ? " and to other DAF sponsors, community foundations and United Ways" : ""}.${xfMethod}${niMethod}${inf ? inflMethod(inf) : ""}${bench?.method ?? ""}`,
      sources: [pl.g.src, ...(inf ? [SRC_CPI] : []), ...(bench?.sources ?? [])], searchQuery: null,
      ...(growth != null ? { change: { subject: `${pl.g.money} to organizations in ${where}`, g: growth, from: String(y.full[0]), to: String(y.full.at(-1)) } } : {}),
      ev: { perYear: [{ label: "", primary: false, years: den.years.map((r) => ({ year: r.year!, usd: r.usd, grants: r.n })) }], change: chg(first?.usd ?? 0, last?.usd ?? 0, growth, false), perYearAvg: { sum: fullSum, years: fullYears } },
    };
  }

  // One or two causes.
  const label = causes.map((c) => isTiered(c));
  const rowsOut: Row[] = [];
  const series: Row[] = [];
  causes.forEach((c, i) => {
    const m = ms[i]!;
    for (const r of m.years) {
      const d = den.years.find((x) => x.year === r.year);
      rowsOut.push({ cause: c!.name, tax_year: r.year, usd: r.usd, primary_usd: label[i] ? r.primary_usd : null, ...(inf && s.metric === "trend" ? { [`${label[i] ? "primary_usd" : "usd"}_in_${inf.base}_dollars`]: Math.round(realOf(inf, label[i] ? r.primary_usd : r.usd, r.year!)) } : {}), recipients: r.orgs, funders: r.funders, share_of_linked: d ? r.usd / d.linked_usd : null });
      if (causes.length === 1 && label[i]) {
        series.push({ year: yearLabel(r.year!, pl.g.kind), tier: "Main focus", usd: r.primary_usd });
        series.push({ year: yearLabel(r.year!, pl.g.kind), tier: "Part of their work", usd: r.usd - r.primary_usd });
      } else series.push({ year: yearLabel(r.year!, pl.g.kind), tier: c!.name, usd: label[i] ? r.primary_usd : r.usd });
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
  const upper = label[0] ? ` (up to ${money(m0.total.usd)} counting orgs where it's part of their work)` : "";
  const method = `Sum of ${pl.g.form} paid in tax years ${yr} to identified recipients in ${where} (by the recipient's address) whose organization is in the cause set. Share = over all identified-recipient grant dollars in the same place and years${pl.g.kind === "charity" ? ` from the same ${pl.g.givers}` : ""}. Grants to individuals, unitemized lines, foreign recipients and other private foundations are excluded${pl.g.kind === "charity" ? ", and so are grants to other DAF sponsors, community foundations and United Ways" : ""}.${niMethod}`;
  const chart = { title: `${cap(pl.g.grants)} to ${causes.map((c) => c!.name).join(" vs ")}${where !== "the US" ? ` in ${where}` : ""}, by tax year`, sub: u.title, spec: vbar(chartVals, "year", "amount", "Tax year", u.title, u.fmt, causes.length > 1 || label[0] ? "tier" : undefined) };
  const perYear = (i: number): NonNullable<Evidence["perYear"]>[number] => ({ label: causes.length > 1 ? causes[i]!.name : label[i] ? "main-focus orgs" : "", primary: label[i],
    years: ms[i]!.years.map((r) => ({ year: r.year!, usd: label[i] ? r.primary_usd : r.usd, grants: r.grants, funders: r.funders, orgs: r.orgs })) });
  const evMoved = await evMovers;
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
      numbers: [{ value: money(a), label: `${causes[0]!.name}${label[0] ? " (main focus)" : ""}` }, { value: money(z), label: `${causes[1]!.name}${label[1] ? " (main focus)" : ""}` },
        { value: `${pct(a / baseUsd)} vs ${pct(z / baseUsd)}`, label: `share of ${ofWhat.replace(/^identified \S+( sponsor| foundation| Way)?/, "identified")} $` }],
      bullets: [`${b(money(a))} to ${causes[0]!.name}, ${b(pct(a / baseUsd))} of ${ofWhat.replace(/^identified \S+( sponsor| foundation| Way)?/, "identified")} dollars`,
        `${b(money(z))} to ${causes[1]!.name}, ${b(pct(z / baseUsd))}`,
        `${b(int(m0.total.funders))} and ${b(int(m1.total.funders))} ${pl.g.givers} funded each`],
      versus: { first: causes[0]!.name, second: causes[1]!.name, a, z },
      ev: { perYear: [perYear(0), perYear(1)], ratio: { a, z, first: causes[0]!.name, second: causes[1]!.name }, share: { part: a, base: baseUsd, of: `${ofWhat.replace(/^identified \S+( sponsor| foundation| Way)?/, "identified")} dollars` } },
    };
  }

  if (s.metric === "trend") {
    const g = firstLast(m0, label[0]);
    // Both lines as change since the first full year, so the cause reads against all foundation grants.
    const y0 = m0.years.find((r) => r.year === y.full[0]), d0 = den.years.find((r) => r.year === y.full[0]);
    const idx: Row[] = y0 && d0 ? y.full.flatMap((yy) => {
      const r = m0.years.find((x) => x.year === yy), d = den.years.find((x) => x.year === yy);
      if (!r || !d) return [];
      const v = label[0] ? r.primary_usd / y0.primary_usd : r.usd / y0.usd, dv = d.linked_usd / d0.linked_usd;
      // After inflation: the same ratio deflated by prices between the first year and this one.
      const k = inf ? inf.idx.get(y.full[0])! / inf.idx.get(yy)! : null;
      return [{ year: String(yy), series: cap(c0.name), change_nom: +(v - 1).toFixed(4), change_real: k != null ? +(v * k - 1).toFixed(4) : null },
        { year: String(yy), series: `All ${pl.g.grants}`, change_nom: +(dv - 1).toFixed(4), change_real: k != null ? +(dv * k - 1).toFixed(4) : null }];
    }).map((r) => ({ ...r, change: r.change_nom })) : [];
    const realG = fl(g);
    const tSpec = trendSpec(idx, cap(c0.name), `All ${pl.g.grants}`);
    // Start-year check: a first year far above the year before (2020 COVID-era giving) makes the change look worse
    // (or better) than the years after it. Say so, give the change from the next year, offer it as a follow-up.
    const v = (r: { usd: number; primary_usd: number }) => (label[0] ? r.primary_usd : r.usd);
    const prev = await evPrev, yz = m0.years.find((r) => r.year === y.full.at(-1)), y1 = m0.years.find((r) => r.year === y.full[1]);
    const jump = prev && y0 && v(prev) > 0 ? v(y0) / v(prev) - 1 : null;
    const spike = jump != null && jump > SPIKE && y1 && yz && v(y1) > 0
      ? { year: y.full[0], prev: y.full[0] - 1, paper: y.full[0] - 1 < EFILE_REQUIRED, prevUsd: v(prev!), usd: v(y0!), jump, since: y.full[1], sinceG: v(yz) / v(y1) - 1, sinceReal: realGrowth(inf, v(yz) / v(y1) - 1, y.full[1], y.full.at(-1)!) } : null;
    const d0z = den.years.find((r) => r.year === y.full.at(-1));
    const ev: Evidence = { perYear: [perYear(0)], movers: evMoved, change: chg(y0 ? v(y0) : 0, yz ? v(yz) : 0, g, label[0]), perYearAvg: { sum: fullYearSum(m0, label[0]), years: fullYears },
      ...(denGrowth != null && d0 && d0z ? { baseline: { label: `All ${pl.g.grants} to identified recipients`, a: d0.linked_usd, z: d0z.linked_usd, g: denGrowth, real: fl(denGrowth) } } : {}), ...(spike ? { spike } : {}) };
    return {
      ...base,
      ev, ...(spike ? { options: { since: spike.since } } : {}),
      chart: idx.length ? { title: `Change since ${y.full[0]}: ${c0.name} vs all ${pl.g.grants}`, sub: "Percent change", spec: inf ? inflToggle(tSpec, "change", inf) : tSpec } : base.chart,
      headline: g == null ? `${cap(pl.g.grants)} to ${c0.name}: ${money(floor0)} in ${yr}` : `${cap(pl.g.money)} for ${c0.name} ${grewText(g, realG)} from ${y.full[0]} to ${y.full.at(-1)}`,
      numbers: [...(g != null ? [{ value: signed(g), label: `${y.full[0]} to ${y.full.at(-1)}${label[0] ? ", main focus" : ""}` }] : []),
        ...(realG != null ? [{ value: signed(realG), label: `after inflation (${inf!.base} dollars)` }] : []),
        { value: money(perYear0), label: `a year${label[0] ? ", main focus" : ""}` },
        { value: int(m0.total.orgs), label: "recipient orgs" }],
      bullets: [spike ? `${spike.year} was a spike for ${c0.name} (${b(signed(spike.jump))} vs ${spike.prev}). Since ${spike.since}: ${b(signed(spike.sinceG))}` : "",
        denGrowth != null && g != null ? `All ${pl.g.grants} ${grewText(denGrowth, fl(denGrowth)).replace(/^(grew|fell) (\S+)/, (_, w, n) => `${w} ${b(n)}`)} over the same years` : "",
        `${b(int(m0.total.funders))} ${pl.g.givers} funded ${b(int(m0.total.orgs))} organizations`,
        upper ? `${b(money(fullYearSum(m0, false) / fullYears))} a year counting orgs where it's part of their work` : ""].filter(Boolean),
      method: `${base.method}${inf && realG != null ? inflMethod(inf) : ""}`,
      sources: [...base.sources, ...(inf && realG != null ? [SRC_CPI] : [])],
      ...(g != null ? { change: { subject: `${pl.g.money} for ${c0.name}`, g, from: String(y.full[0]), to: String(y.full.at(-1)) } } : {}),
    };
  }

  return {
    ...base,
    headline: `${who} gave ${money(floor0)} to ${c0.name}${where !== "the US" ? ` in ${where}` : ""}, ${yr}: ${pct(share0)} of ${wide ? "all" : group ? "their identified" : "identified"} grant dollars`,
    numbers: [{ value: money(floor0), label: `${label[0] ? "main focus, " : ""}${yr}`, note: upper ? upper.trim().replace(/^\(|\)$/g, "") : undefined },
      ...perResTile,
      { value: pct(share0), label: `of ${ofWhat} $` },
      { value: money(perYear0), label: "a year" },
      ...(entities ? [] : [{ value: int(m0.total.orgs), label: "recipient orgs" }])],
    bullets: [`${b(money(perYear0))} a year to ${c0.name}${label[0] ? ` as a main purpose, ${b(money(fullYearSum(m0, false) / fullYears))} counting part of their work` : ""}`,
      `${b(pct(share0))} of ${ofWhat} dollars${where !== "the US" ? ` in ${where}` : ""}`,
      // School districts and public colleges are matched by name, mostly without an EIN: count funders only.
      entities ? `${b(int(m0.total.funders))} ${pl.g.givers} gave to them` : `${b(int(m0.total.funders))} ${pl.g.givers} funded ${b(int(m0.total.orgs))} organizations`],
    ...((g0 => g0 != null ? { change: { subject: `${pl.g.money} for ${c0.name}`, g: g0, from: String(y.full[0]), to: String(y.full.at(-1)) } } : {})(firstLast(m0, label[0]))),
    ev: { perYear: [perYear(0)], movers: evMoved, share: { part: floor0, base: baseUsd, of: `${ofWhat} dollars` }, perYearAvg: { sum: fullYearSum(m0, label[0]), years: fullYears } },
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
  if (by === "county" && ctx.cube && !pl.corr && pl.g.kind === "pf" && !hasFilt(pl.f) && (!c || (!c.label && c.ntee.length > 0 && c.ntee.every((n) => n.length === 1)))) {
    cs = causeSql(c, new P(), "", "");
    const w = [`cy.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`, "cy.county_fips IS NOT NULL", ...(linked ? ["cy.linked"] : []), ...(c ? (p.cause(c), [`cy.ntee_major = ANY(${p.add(c.ntee)}::text[])`]) : []), ...placeWhere({ ...pl, county: null }, p, "cy.recipient_state", "cy.county_fips")];
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
    const gNtee = pl.corr ? corrNtee("g.recipient_ein", "g.recipient_ntee") : "g.recipient_ntee";
    const dim: Record<string, string> = { state: "g.recipient_state", county: "g.county_fips", cause: `coalesce(left(${gNtee}, 1), '?')`, cause_detail: `coalesce(left(${gNtee}, 3), '?')`, recipient_size: "rp.band::text", funder_size: "fp.asset_band::text", funder_type: "fp.funder_type", recipient_kind: "CASE WHEN pe.kind IS NOT NULL THEN pe.kind WHEN g.recipient_ein IS NOT NULL THEN 'nonprofit' ELSE 'unidentified' END", year: "g.tax_year::text", charity_funder: "g.funder_class" };
    const joins = by === "recipient_size" ? "LEFT JOIN recipient_profile rp ON rp.ein = g.recipient_ein" : by === "funder_size" || by === "funder_type" ? "LEFT JOIN funder_profile fp ON fp.ein = g.funder_ein" : by === "recipient_kind" ? "JOIN grants gr ON gr.id = g.id LEFT JOIN public_entities pe ON pe.id = gr.recipient_entity" : "";
    const tierN = cs.tier ? `(count(*) FILTER (WHERE ${cs.tier} = 'primary'))::int` : "count(*)::int";
    sql = `SELECT ${dim[by]} AS k, sum(g.amount)::float8 AS usd, ${primarySum(cs, "g.amount")} AS primary_usd, count(*)::int AS n, ${tierN} AS primary_n
FROM ${pl.g.clean} g ${cs.join} ${joins}
WHERE ${and([...gw.where, ...(by === "county" ? ["g.county_fips IS NOT NULL"] : [])])} GROUP BY 1`;
  }
  const raw0 = await ctx.q<{ k: string | null; usd: number; primary_usd: number; n: number; primary_n: number }>(`${cap(pl.g.grants)} by ${BY_TITLE[by]}${ctx.cube && !/grant_clean/.test(sql) ? " (research layer)" : ""}`, sql, p);
  // Malformed NTEE codes ("0", "c") fold into "No NTEE code" instead of showing as a cause named "0 (0)".
  const byCause = by === "cause" || by === "cause_detail";
  const raw = byCause ? [...raw0.reduce((m, r) => {
    const k = r.k != null && r.k !== "?" && !/^[A-Z]/.test(r.k) ? "?" : r.k;
    const o = m.get(k) ?? { k, usd: 0, primary_usd: 0, n: 0, primary_n: 0 };
    m.set(k, { k, usd: o.usd + r.usd, primary_usd: o.primary_usd + r.primary_usd, n: o.n + r.n, primary_n: o.primary_n + r.primary_n });
    return m;
  }, new Map<string | null, (typeof raw0)[number]>()).values()] : raw0;
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
      case "year": return yearLabel(Number(k), pl.g.kind);
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
  const sortedAll = [...groups].sort((a, z) => (s.order === "least" ? a.v - z.v : z.v - a.v) || String(a.k).localeCompare(String(z.k)));
  // "No NTEE code" isn't a cause: it stays in the rows, never leads the ranking.
  const ranked = byCause && sortedAll.some((g) => g.k != null && g.k !== "?") ? sortedAll.filter((g) => g.k != null && g.k !== "?") : sortedAll;
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
    rows: sortedAll.map((g) => ({ key: g.k, name: g.name, usd: g.usd, grants: g.n, average: g.avg, share: share(g), ...(by === "state" || by === "county" ? (s.perPoverty ? { people_in_poverty: g.pop, per_person_in_poverty_year: g.pop ? g.usd / g.pop / nYears : null } : { population: g.pop, per_resident_year: g.pop ? g.usd / g.pop / nYears : null }) : {}) })),
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
    ctx.span = { kind: "f990", from, to, byYear: true };
    const p = new P();
    const cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
    const where = [`f.tax_year BETWEEN ${p.add(from)} AND ${p.add(to)}`, "coalesce(f.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "f.state", "f.county_fips"), ...filtEin(pl.f, p, "f.ein")];
    // The panel is orgs filing every full year, so a partial last year (returns still arriving) doesn't shrink it to early filers.
    const panelTo = to > FULL.f990 && FULL.f990 > from ? FULL.f990 : to;
    const rows = await ctx.q<{ year: number; usd: number; orgs: number }>(`Same organizations each year: ${fd.short}`, `WITH s AS (
  SELECT f.ein, f.tax_year, coalesce(${fd.col}, 0) AS v FROM flag_year f ${cs.join} WHERE ${and(where)}),
panel AS (SELECT ein FROM s GROUP BY ein HAVING count(*) FILTER (WHERE s.tax_year <= ${p.add(panelTo)}) = ${p.add(panelTo - from + 1)})
SELECT s.tax_year AS year, sum(s.v)::float8 AS usd, count(*)::int AS orgs FROM s JOIN panel USING (ein) GROUP BY 1 ORDER BY 1`, p);
    const note = await causeNote(c, cs, caveats);
    caveats.push(panelTo < to ? `Trend uses only organizations with a filing in every full year (${from} to ${panelTo}), so new and late filers don't distort it. ${to} counts those of them that have filed so far.` : "Trend uses only organizations with a filing in every year shown, so new and late filers don't distort it.");
    const a = rows[0], zLast = rows.at(-1);
    // Headline end: the newest full year (a partial last year is named separately).
    const pe = zLast ? partialEnd("f990", zLast.year) : null;
    const zFull = pe ? [...rows].reverse().find((r) => r.year <= FULL.f990 && r.year > (a?.year ?? 0)) : undefined;
    const z = pe && zFull ? zFull : zLast;
    const end = z?.year ?? to;
    const g = a && z && a !== z && a.usd ? z.usd / a.usd - 1 : null;
    const inf = rows.length ? await inflation(ctx, rows.map((r) => r.year)) : null;
    const realG = a && z ? realGrowth(inf, g, a.year, z.year) : null;
    const peLines = pe && zLast && z !== zLast ? [partialLine(pe, end), `${b(int(zLast.orgs))} of them have filed for ${pe.year} so far: ${b(money(zLast.usd))}`]
      : pe ? [`${pe.year} is partial${pe.share ? ` (${pct(pe.share)} of returns in)` : ""}, so this may move as late returns arrive`] : [];
    const u = unit(Math.max(...rows.map((r) => Math.max(r.usd, inf ? realOf(inf, r.usd, r.year) : 0)), 1));
    const bars = vbar(rows.map((r) => ({ year: yearLabel(r.year, "f990"), amount: +(r.usd / u.div).toFixed(3), amount_nom: +(r.usd / u.div).toFixed(3), amount_real: inf ? +(realOf(inf, r.usd, r.year) / u.div).toFixed(3) : null })), "year", "amount", "Tax year", u.title, u.fmt);
    return {
      headline: g == null ? `Not enough organizations filed in every year to show a trend` : `${fd.short[0].toUpperCase() + fd.short.slice(1)} to ${causeName(c, pl)} ${grewText(g, realG, "rose")} from ${from} to ${end}${end === zLast?.year && pe ? ` (partial)` : ""} (same ${int(a.orgs)} orgs)`,
      numbers: [...(g != null ? [{ value: signed(g), label: `${from} to ${end}` }] : []), ...(realG != null ? [{ value: signed(realG), label: `after inflation (${inf!.base} dollars)` }] : []), ...(z ? [{ value: money(z.usd), label: `${fd.short}, ${z.year}` }] : []), { value: int(a?.orgs ?? 0), label: "orgs filing every year" }],
      bullets: [g != null ? `${b(signed(g))} in ${fd.short} from ${from} to ${end}` : "Too few filings to compare years", ...peLines, `${b(int(a?.orgs ?? 0))} organizations filed a return for every year`],
      chart: { title: `${fd.short} to ${causeName(c, pl)}, same organizations each year`, sub: u.title, spec: inf ? inflToggle(bars, "amount", inf) : bars },
      rows: rows.map((r) => ({ tax_year: r.year, usd: r.usd, ...(inf ? { [`usd_in_${inf.base}_dollars`]: Math.round(realOf(inf, r.usd, r.year)) } : {}), orgs: r.orgs })), causeNote: note, caveats,
      coverage: [{ label: "Orgs in every year", value: int(a?.orgs ?? 0) }],
      method: `Each organization's ${fd.name} for tax years ${from}–${to}, newest return per year, summed over organizations that filed for every year.${inf ? inflMethod(inf) : ""}`,
      sources: [SRC.f990, ...(inf ? [SRC_CPI] : [])], searchQuery: searchFor(s, pl),
      ...(g != null ? { change: { subject: `${fd.short} to ${c ? causeName(c, pl) : "nonprofits"}`, g, from: String(from), to: String(end) } } : {}),
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
    // National: IRS SOI's newest 501(c)(3) figure for the same line, as context.
    const eo = where === "the US" && !hasFilt(pl.f) ? await eoBenchmark(ctx, s.source) : null;
    return {
      headline: `Nonprofits in ${where} reported ${money(all.usd)} in ${fd.short} for ${fy.year}`,
      numbers: [{ value: money(all.usd), label: `${fd.short}, ${fy.year}` }, { value: int(all.reporting), label: "orgs reporting any" }, { value: pct(all.usd / Math.max(1, all.revenue)), label: "of their total revenue" }],
      bullets: [`${b(money(all.usd))} in ${fd.short} across ${b(int(all.orgs))} e-filed returns`, `${b(pct(all.usd / Math.max(1, all.revenue)))} of these organizations' total revenue`],
      chart: null, rows: [{ tax_year: fy.year, usd: all.usd, orgs: all.orgs, reporting: all.reporting, revenue: all.revenue }], causeNote: notes[0],
      coverage: [{ label: "E-filed returns", value: int(all.orgs) }, { label: "Full Form 990", value: int(all.full990) }, { label: "Report any", value: int(all.reporting) }, ...(eo ? [eo] : [])],
      caveats, method: `Sum of ${fd.name}, tax year ${fy.year}, one return per organization (newest filing), private foundations excluded. ${s.source === "government_grants" ? "Blank line 1e counts as $0." : ""}`,
      sources: [SRC.f990, ...(eo ? [{ label: "IRS SOI charities and other tax-exempt organizations statistics (501(c)(3) Form 990 returns)", url: "https://www.irs.gov/statistics/soi-tax-stats-charities-and-other-tax-exempt-organizations-statistics" }] : [])], searchQuery: null,
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
    const [pt] = await ctx.q<{ usd: number; orgs: number; top: string | null; top_usd: number | null }>(`${fd.short}: orgs where ${c0.name} is one program among others (part of their work, left out)`, `WITH x AS (SELECT o.name, coalesce(${fd.col}, 0)::float8 AS v FROM flag_year f JOIN org_labels l ON l.ein = f.ein AND l.label = ${pp.add(c0.label)} AND l.tier = 'partial'${labelSub(c0) ? ` AND ${pp.add(labelSub(c0))}::text = ANY(l.subtypes)` : ""} JOIN orgs o ON o.ein = f.ein
  WHERE ${and(w)})
SELECT coalesce(sum(v), 0)::float8 AS usd, count(*)::int AS orgs, (SELECT name FROM x ORDER BY v DESC LIMIT 1) AS top, (SELECT max(v) FROM x)::float8 AS top_usd FROM x`, pp);
    if (pt?.usd > 0) caveats.push(`Counted only for orgs whose main purpose is ${c0.name}. ${int(pt.orgs)} orgs where it's one program among others reported ${money(pt.usd)} more, led by ${pt.top ? orgName(pt.top) : "one org"} (${money(pt.top_usd ?? 0)}), but most of that money funds their other work.`);
  }
  const upper: string | undefined = undefined;
  const compareBullet = causes[1] && ms[1] ? [`${b(money(causes[1].label ? ms[1].primary_usd : ms[1].usd))} to ${causes[1].name}, ${b(pct((causes[1].label ? ms[1].primary_usd : ms[1].usd) / Math.max(1, all.usd)))} of the total`] : [];
  return {
    headline: s.metric === "compare" && causes[1] && ms[1]
      ? `${c0.name}: ${money(floor0)} vs ${causes[1].name}: ${money(causes[1].label ? ms[1].primary_usd : ms[1].usd)} in ${fd.short}, ${fy.year}`
      : `${cap(orgsOf(c0.name))}${where !== "the US" ? ` in ${where}` : ""} reported ${money(floor0)} in ${fd.short} for ${fy.year}`,
    numbers: [{ value: money(floor0), label: `${fd.short}, ${fy.year}${isLabel ? " (main focus)" : ""}`, note: upper },
      { value: pct(share), label: `of all nonprofits' ${fd.short}` },
      ...(s.source !== "revenue" ? [{ value: pct(ofRev), label: "of these orgs' revenue" }] : []),
      { value: int(m0.reporting), label: `orgs reporting ${fd.short}` }],
    bullets: [`${b(money(floor0))} in ${fd.short}${isLabel ? " to orgs where it's the main purpose" : ""}`,
      ...(compareBullet.length ? compareBullet : [`${b(pct(share))} of all nonprofits' ${fd.short}${where !== "the US" ? ` in ${where}` : ""}`]),
      `${b(int(m0.reporting))} of ${b(int(m0.orgs))} filers reported any ${fd.short}`],
    chart: top.length ? { title: `Largest ${fd.short} to ${c0.name}, ${fy.year}`, sub: u.title, spec: hbar(top.map((t) => ({ name: orgName(t.name) + (t.tier === "partial" ? " (part of its work)" : ""), ein: t.ein, amount: +(t.usd / u.div).toFixed(3) })), "name", "amount", u.title, u.fmt) } : null,
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
  if (a === z) throw new Unanswerable(`Growth needs two full tax years. ${cap(pl.g.grants)} here cover ${G_FIRST}–${G_FULL} in full.`);
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
WHERE (l.t LIKE '%:primary' OR l.t = ANY(${p.add([...ALL_TIERS].map((l) => `${l}:partial`))}::text[])) AND ${w}
GROUP BY 1`, p);
  } else {
  const pw = [...placeWhere(pl, p, "g.recipient_state", "g.county_fips"), ...filtGc(pl.f, p), ...gExtra(pl, p, "g")];
  const pa = p.add(a), pz = p.add(z);
  const gNtee = pl.corr ? corrNtee("g.recipient_ein", "g.recipient_ntee") : "g.recipient_ntee";
  rows = await ctx.q<{ grp: string; y0: number; y1: number }>("Grant dollars by NTEE major group and graded label, first and last full year", `SELECT left(${gNtee}, 1) AS grp, coalesce(sum(g.amount) FILTER (WHERE g.tax_year = ${pa}), 0)::float8 AS y0,
       coalesce(sum(g.amount) FILTER (WHERE g.tax_year = ${pz}), 0)::float8 AS y1
FROM ${pl.g.clean} g WHERE ${gNtee} ~ '^[A-Z]' AND g.tax_year IN (${pa}, ${pz}) ${pw.length ? `AND ${and(pw)}` : ""}
GROUP BY 1
UNION ALL
SELECT 'label:' || l.label, coalesce(sum(g.amount) FILTER (WHERE g.tax_year = ${pa}), 0)::float8, coalesce(sum(g.amount) FILTER (WHERE g.tax_year = ${pz}), 0)::float8
FROM ${pl.g.clean} g JOIN org_labels l ON l.ein = g.recipient_ein AND (l.tier = 'primary' OR l.label = ANY(${p.add([...ALL_TIERS])}::text[]))
WHERE g.tax_year IN (${pa}, ${pz}) ${pw.length ? `AND ${and(pw)}` : ""}
GROUP BY 1`, p);
  }
  const gr = await grades();
  const minBase = (pl.states.length || pl.county || pl.region || pl.area ? 5e6 : 1e8) / (pl.g.kind === "charity" && pl.g.cls ? 10 : 1);
  const list = rows.filter((r) => r.y0 >= minBase && r.grp !== "Z").map((r) => ({
    cause: r.grp.startsWith("label:") ? `${gr[r.grp.slice(6)]?.name ?? r.grp.slice(6)} (label)` : `${nteeLabel(r.grp) ?? r.grp} (${r.grp})`,
    y0: r.y0, y1: r.y1, growth: r.y1 / r.y0 - 1,
  })).sort((p1, p2) => (s.order === "least" ? p1.growth - p2.growth : p2.growth - p1.growth));
  if (!list.length) throw new Unanswerable("Too few grants in this place to compare causes.");
  const top = list[0], bottom = list.at(-1)!;
  const caveats = [`Causes are NTEE major groups (the recipient's main code) plus the graded labels' main-focus orgs (animal welfare counts main focus and part of their work), which overlap NTEE groups. Groups under ${money(minBase)} in ${a} are left out.`, ...(await grantCaveats(pl))];
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
  if (foundation && ctx.cube && !pl.region && cubeCause(c) && (c || hasFilt(pl.f)) && !(pl.g.kind === "charity" && pl.f.rb) && pl.f.ftype !== "company") {
    // Research cube: same sums as grant_clean for a cause or filters, by recipient state.
    cs = causeSql(c, new P(), "", "");
    const cw = cubeWhere(c, p, { ...pl, county: null, city: null, area: null }, y, !!c);
    sql = `SELECT x.recipient_state AS state, coalesce(sum(x.usd), 0)::float8 AS usd, ${cubeSum(cw)} AS primary_usd FROM ${pl.g.cube} x
WHERE ${and(cw.where)} GROUP BY 1`;
  } else if (foundation && pl.g.kind === "charity" && ctx.cube && !pl.region && cubeCause(c) && !pl.f.rb) {
    // Schedule I, all causes: charity_grant_cube (all recipients, identified or not).
    cs = causeSql(c, new P(), "", "");
    const cw = cubeWhere(c, p, { ...pl, county: null, city: null, area: null }, y, !!c);
    sql = `SELECT x.recipient_state AS state, coalesce(sum(x.usd), 0)::float8 AS usd, ${cubeSum(cw)} AS primary_usd FROM ${pl.g.cube} x
WHERE ${and(cw.where)} GROUP BY 1`;
  } else if (foundation && pl.g.kind === "pf" && !c && !hasFilt(pl.f) && !pl.region) {
    cs = causeSql(null, p, "", "");
    sql = `SELECT t.state, sum(t.usd)::float8 AS usd, sum(t.usd)::float8 AS primary_usd FROM grant_totals t
WHERE t.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}${states ? ` AND t.state = ANY(${p.add(states)}::text[])` : ""} GROUP BY 1`;
  } else if (foundation) {
    const gw = grantWhere(c, p, { ...pl, county: null, city: null, area: null }, y, pl.g.kind === "charity" ? !!c : true); // Schedule I with no cause: all recipients, as on the cube
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
  const gw = grantWhere(c, p, { ...pl, states: [state], county: null, city: null, area: null }, y, true);
  const [r] = await ctx.q<{ name: string; usd: number }>(`Largest recipient in ${stateName(state)} (single-organization check)`, `SELECT o.name, ${primarySum(gw.cs, "g.amount")} AS usd
FROM ${pl.g.clean} g ${gw.cs.join} JOIN orgs o ON o.ein = g.recipient_ein
WHERE ${and(gw.where)}
GROUP BY o.ein, o.name ORDER BY 2 DESC LIMIT 1`, p);
  if (!r || r.usd / stateUsd < DOMINANT) return null;
  const name = orgName(r.name, 64);
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
  if (pl.area && s.by === "rurality") pl.used.add("area");
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
  } else if (grant && pl.g.kind === "pf" && ctx.cube && !pl.corr && !hasFilt(pl.f) && (!c || (!c.label && c.ntee.length > 0 && c.ntee.every((n) => n.length === 1)))) {
    cs = causeSql(c, new P(), "", "");
    const w = [`cy.tax_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`, "cy.county_fips IS NOT NULL", ...(c ? (p.cause(c), ["cy.linked", `cy.ntee_major = ANY(${p.add(c.ntee)}::text[])`]) : []), ...placeWhere({ ...pl, area: null }, p, "cy.recipient_state", "cy.county_fips")];
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
  if (pl.area) pl.used.add("area"); // rural vs urban is the split itself
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
  if (s.causes.length === 2 && !s.topN) return dualTop(ctx, s, pl, "funders");
  const c = s.causes[0] ?? null;
  const y = grantYears(s);
  const p = new P();
  const gw = grantWhere(c, p, pl, y, false);
  const rows = await ctx.q<{ ein: string; name: string; state: string; usd: number; primary_usd: number; orgs: number }>(`Top ${pl.g.givers} by grant dollars`, `SELECT f.ein, f.name, f.state, sum(g.amount)::float8 AS usd, ${primarySum(gw.cs, "g.amount")} AS primary_usd, count(DISTINCT g.recipient_ein)::int AS orgs
FROM ${pl.g.clean} g ${gw.cs.join} JOIN ${pl.g.funders} f ON f.ein = g.funder_ein
WHERE ${and(gw.where)}
GROUP BY f.ein, f.name, f.state ORDER BY ${gw.cs.tier ? "primary_usd" : "usd"} DESC LIMIT ${Math.max(10, s.topN ?? 0)}`, p);
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
  const top10 = rows.slice(0, 10).reduce((a, r) => a + v(r), 0) / Math.max(1, v(tot));
  const nm = (x: string) => orgName(x);
  // "The 100 largest foundations": the top N by grant dollars in these years, as one group.
  const topN = s.topN;
  if (topN) {
    ctx.honored.add("topN");
    const n = Math.min(topN, rows.length), share = rows.slice(0, n).reduce((a, r) => a + v(r), 0) / Math.max(1, v(tot));
    caveats.unshift(`Largest = most ${pl.g.adj} grant dollars paid in ${yrs(y.from, y.to)} to ${c ? "this cause" : "US organizations"}, not assets. ${n < topN ? `Only ${int(n)} ${pl.g.givers} gave here, so all are counted.` : ""}`.trim());
    const u10 = unit(v(rows[0]));
    return {
      headline: `The ${int(n)} largest ${pl.g.givers} gave ${pct(share)} of ${pl.g.money} ${c ? `for ${causeName(c, pl)}` : "to US organizations"}${pl.label !== "the US" ? ` in ${pl.label}` : ""}, ${yrs(y.from, y.to)}`,
      numbers: [{ value: pct(share), label: `from the top ${int(n)}` }, { value: money(rows.slice(0, n).reduce((a, r) => a + v(r), 0)), label: `given by the top ${int(n)}` }, { value: int(tot.funders), label: `${pl.g.givers} in all` }],
      bullets: [`The top 10 gave ${b(pct(top10))} of ${b(money(v(tot)))}`, `${nm(rows[0].name)} led with ${b(money(v(rows[0])))}`],
      chart: { title: `Top ${pl.g.adj} funders${c ? ` of ${causeName(c, pl)}` : ""}, ${yrs(y.from, y.to)}`, sub: u10.title, spec: hbar(rows.slice(0, 10).map((r) => ({ funder: nm(r.name), ein: r.ein, amount: +(v(r) / u10.div).toFixed(3) })), "funder", "amount", u10.title, u10.fmt) },
      rows: rows.slice(0, n).map((r, i) => ({ rank: i + 1, funder_ein: r.ein, funder: r.name, state: r.state, usd: r.usd, primary_usd: isLabel ? r.primary_usd : null, recipients: r.orgs })),
      causeNote: note, caveats, coverage: [{ label: "Funders", value: int(tot.funders) }],
      method: `${pl.g.form}, tax years ${yrs(y.from, y.to)}, to ${c ? "identified recipients in the cause set" : "all recipients"} in ${pl.label}, summed by ${pl.g.adj}. The ${int(n)} with the most dollars are summed and divided by all ${pl.g.adj} dollars in the same set.`,
      sources: [pl.g.src, ...(isLabel ? [SRC.labels] : [])], searchQuery: null,
    };
  }
  const u = unit(v(rows[0]));
  return {
    headline: `${nm(rows[0].name)} is the largest ${pl.g.adj} funder of ${causeName(c, pl)}${pl.label !== "the US" ? ` in ${pl.label}` : ""}: ${money(v(rows[0]))}, ${yrs(y.from, y.to)}`,
    numbers: [{ value: money(v(rows[0])), label: nm(rows[0].name) }, { value: pct(top10), label: "from the top 10 funders" }, { value: int(tot.funders), label: `${pl.g.givers} in all` }],
    bullets: rows.slice(0, 3).map((r) => `${nm(r.name)} (${r.state}): ${b(money(v(r)))} to ${b(int(r.orgs))} orgs`).slice(0, 2).concat([`The top 10 gave ${b(pct(top10))} of ${b(money(v(tot)))}`]),
    chart: { title: `Top ${pl.g.adj} funders of ${causeName(c, pl)}${isLabel ? " (main focus)" : ""}, ${yrs(y.from, y.to)}`, sub: u.title, spec: hbar(rows.slice(0, 10).map((r) => ({ funder: nm(r.name), ein: r.ein, amount: +(v(r) / u.div).toFixed(3) })), "funder", "amount", u.title, u.fmt) },
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
    const nm = (x: string) => orgName(x);
    return {
      headline: `${nm(rows[0].name)} reported the most ${fd.short}${c ? ` among ${orgsOf(c.name)}` : ""}: ${money(rows[0].usd)} in ${fy.year}`,
      numbers: rows.slice(0, 3).map((r) => ({ value: money(r.usd), label: nm(r.name) + (r.tier === "partial" ? " (part of its work)" : "") })),
      bullets: rows.slice(0, 2).map((r) => `${nm(r.name)} (${r.state}${r.tier === "partial" ? ", partial" : ""}): ${b(money(r.usd))}, ${b(pct(r.usd / Math.max(1, r.revenue)))} of its revenue`),
      chart: { title: `Largest ${fd.short}${c ? `, ${c.name}` : ""}, ${fy.year}`, sub: u.title, spec: hbar(rows.map((r) => ({ name: nm(r.name) + (r.tier === "partial" ? " (part of its work)" : ""), ein: r.ein, amount: +(r.usd / u.div).toFixed(3) })), "name", "amount", u.title, u.fmt) },
      rows: rows.map((r) => ({ ein: r.ein, name: r.name, state: r.state, usd: r.usd, revenue: r.revenue })),
      causeNote: note, caveats, coverage: [],
      method: `${fd.name}, tax year ${fy.year}, newest return per organization, largest first.`,
      sources: [SRC.f990], searchQuery: searchFor(s, pl),
    };
  }
  if (s.causes.length === 2) return dualTop(ctx, s, pl, "recipients");
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
  const nm = (x: string) => orgName(x);
  return {
    headline: `${nm(rows[0].name)} received the most ${pl.g.money} for ${causeName(c, pl)}: ${money(rows[0].usd)}, ${yrs(y.from, y.to)}`,
    numbers: rows.slice(0, 3).map((r) => ({ value: money(r.usd), label: nm(r.name) + (r.tier === "partial" ? " (part of its work)" : "") })),
    bullets: rows.slice(0, 2).map((r) => `${nm(r.name)} (${r.state}): ${b(money(r.usd))} from ${b(int(r.funders))} ${pl.g.givers}`).concat([`Top 10 recipients shown, identified recipients only`]),
    chart: { title: `Top recipients of ${pl.g.grants}, ${causeName(c, pl)}, ${yrs(y.from, y.to)}`, sub: u.title, spec: hbar(rows.map((r) => ({ name: nm(r.name) + (r.tier === "partial" ? " (part of its work)" : ""), ein: r.ein, amount: +(r.usd / u.div).toFixed(3) })), "name", "amount", u.title, u.fmt) },
    rows: rows.map((r) => ({ ein: r.ein, name: r.name, state: r.state, usd: r.usd, tier: r.tier, funders: r.funders })),
    causeNote: note, caveats, coverage: [],
    method: `${pl.g.form}, tax years ${yrs(y.from, y.to)}, to identified recipients in the cause set in ${pl.label}, summed by recipient.`,
    sources: [pl.g.src, ...(c?.label ? [SRC.labels] : [])], searchQuery: searchFor(s, pl),
  };
}

// ---- two causes ranked side by side ("which foundations fund climate, and which fund women and girls")
// Each cause's own ranking (graded labels by primary-tier dollars, as in topFunders), then the overlap: how many
// of the top OVERLAP_N appear in both lists, and the largest of those by the smaller of the two amounts (the
// overlap_funders ordering). One query, so both lists and the overlap come from the same grants.
const OVERLAP_N = 50, DUAL_SHOW = 8;
type DualRow = { k: string; name: string; state: string; a_usd: number | null; a_v: number | null; a_n: number | null; a_rk: number | null; z_usd: number | null; z_v: number | null; z_n: number | null; z_rk: number | null; b_rk: number | null };
type DualTot = { na: number; nz: number; ta: number; tz: number; a10: number; z10: number };
async function dualTop(ctx: Ctx, s: Spec, pl: Place, side: "funders" | "recipients"): Promise<Out> {
  const [a, z] = s.causes as [C, C];
  const y = grantYears(s);
  const fund = side === "funders";
  const key = fund ? "g.funder_ein" : "g.recipient_ein", other = fund ? "g.recipient_ein" : "g.funder_ein";
  const p = new P();
  const ga = grantWhere(a, p, pl, y, !fund, "a");
  const gz = grantWhere(z, p, pl, y, !fund, "z");
  const n = p.add(OVERLAP_N);
  // v ranks: funders by primary-tier dollars for a graded label (as topFunders), recipients by all dollars (as topRecipients).
  const cte = (gw: typeof ga) => `SELECT ${key} AS k, sum(g.amount)::float8 AS usd, ${fund ? primarySum(gw.cs, "g.amount") : "sum(g.amount)::float8"} AS v, count(DISTINCT ${other})::int AS n
  FROM ${pl.g.clean} g ${gw.cs.join} WHERE ${and(gw.where)} GROUP BY 1`;
  const who = fund ? `JOIN ${pl.g.funders} f ON f.ein = r.k` : "JOIN orgs f ON f.ein = r.k";
  const rows = await ctx.q<DualRow & DualTot>(`Top ${fund ? pl.g.givers : "recipients"} of each cause, and the ones in both top ${OVERLAP_N}`, `WITH a AS (${cte(ga)}),
z AS (${cte(gz)}),
ra AS (SELECT a.*, (row_number() OVER (ORDER BY v DESC, k))::int AS rk FROM a),
rz AS (SELECT z.*, (row_number() OVER (ORDER BY v DESC, k))::int AS rk FROM z),
r AS (SELECT coalesce(ra.k, rz.k) AS k, ra.usd AS a_usd, ra.v AS a_v, ra.n AS a_n, ra.rk AS a_rk, rz.usd AS z_usd, rz.v AS z_v, rz.n AS z_n, rz.rk AS z_rk
  FROM ra FULL JOIN rz ON rz.k = ra.k WHERE ra.rk <= ${n} OR rz.rk <= ${n}),
t AS (SELECT (SELECT count(*) FROM a)::int AS na, (SELECT count(*) FROM z)::int AS nz, (SELECT coalesce(sum(v), 0) FROM a)::float8 AS ta, (SELECT coalesce(sum(v), 0) FROM z)::float8 AS tz,
  (SELECT coalesce(sum(v), 0) FROM ra WHERE rk <= 10)::float8 AS a10, (SELECT coalesce(sum(v), 0) FROM rz WHERE rk <= 10)::float8 AS z10)
SELECT r.*, f.name, f.state, CASE WHEN r.a_rk <= ${n} AND r.z_rk <= ${n} THEN (row_number() OVER (PARTITION BY r.a_rk <= ${n} AND r.z_rk <= ${n} ORDER BY least(r.a_v, r.z_v) DESC, r.k))::int END AS b_rk, t.*
FROM r ${who} CROSS JOIN t ORDER BY coalesce(r.a_rk, 1e9), coalesce(r.z_rk, 1e9)`, p);
  const caveats: string[] = [];
  const notes = [await causeNote(a, ga.cs, caveats), await causeNote(z, gz.cs, caveats)];
  caveats.push(...(await grantCaveats(pl)));
  const listA = rows.filter((r) => r.a_rk != null).sort((x, w) => x.a_rk! - w.a_rk!);
  const listZ = rows.filter((r) => r.z_rk != null).sort((x, w) => x.z_rk! - w.z_rk!);
  if (!listA.length || !listZ.length) throw new Unanswerable(`No ${fund ? pl.g.grants : "identified recipients"} found for ${(!listA.length ? a : z).name} in ${pl.label}, ${yrs(y.from, y.to)}.`);
  const t = rows[0];
  const nA = Math.min(OVERLAP_N, t.na), nZ = Math.min(OVERLAP_N, t.nz), nTop = Math.min(nA, nZ);
  const both = rows.filter((r) => r.b_rk != null).sort((x, w) => x.b_rk! - w.b_rk!);
  const alsoA = listA.filter((r) => r.a_rk! <= OVERLAP_N && r.z_rk != null).length; // of a's top N, any money for z
  const tierA = fund && !!ga.cs.tier, tierZ = fund && !!gz.cs.tier;
  const nm = (x: string) => orgName(x, 48);
  const top1 = (r: DualRow, v: number | null) => `${nm(r.name)} (${money(v ?? 0)})`;
  const inX = pl.label !== "the US" ? ` in ${pl.label}` : "";
  const yr = yrs(y.from, y.to);
  const lead = fund
    ? `${top1(listA[0], listA[0].a_v)} gives the most ${pl.g.money} for ${a.name}${inX}, and ${top1(listZ[0], listZ[0].z_v)} for ${z.name}, ${yr}`
    : `${top1(listA[0], listA[0].a_v)} received the most ${pl.g.money} for ${a.name}${inX}, and ${top1(listZ[0], listZ[0].z_v)} for ${z.name}, ${yr}`;
  const whoTop = fund ? "funders" : "recipients";
  const overlapText = both.length
    ? `${int(both.length)} of the top ${int(nTop)} ${a.name} ${whoTop} ${both.length === 1 ? "is" : "are"} also top ${int(nTop)} for ${z.name}, led by ${nm(both[0].name)}`
    : `None of the top ${int(nTop)} ${a.name} ${whoTop} are among the top ${int(nTop)} for ${z.name}`;
  const u = unit(Math.max(listA[0].a_v ?? 0, listZ[0].z_v ?? 0));
  const show = (list: DualRow[], c: C, ci: 0 | 1) => list.slice(0, DUAL_SHOW).map((r) => {
    const v = ci ? r.z_v : r.a_v, rk = ci ? r.z_rk : r.a_rk;
    return { key: `${ci}|${rk}|${nm(r.name)}`, name: nm(r.name), cause: cap(c.name), amount: +((v ?? 0) / u.div).toFixed(3), in_both: r.b_rk != null ? "yes" : "no" };
  });
  const values = [...show(listA, a, 0), ...show(listZ, z, 1)];
  const spec = {
    ...BASE, height: Math.max(160, 20 * values.length), data: { values }, mark: { type: "bar" },
    encoding: {
      y: { field: "key", type: "nominal", sort: null, title: null, axis: { labelLimit: 240, labelExpr: "split(datum.label, '|')[2]" } },
      x: { field: "amount", type: "quantitative", title: u.title, axis: { format: u.fmt } },
      color: { field: "cause", type: "nominal", title: null, sort: null, legend: { orient: "top", direction: "horizontal" } },
      tooltip: [{ field: "name", type: "nominal", title: fund ? "Funder" : "Recipient" }, { field: "cause", type: "nominal", title: "Cause" }, { field: "amount", type: "quantitative", format: u.fmt, title: u.title }, { field: "in_both", type: "nominal", title: `Top ${nTop} in both` }],
    },
  };
  const per = (c: C, tot: number, top10: number, count: number, tier: boolean) => fund
    ? `${cap(c.name)}: the top 10 gave ${b(pct(top10 / Math.max(1, tot)))} of ${b(money(tot))}${tier ? " (main focus)" : ""} from ${b(int(count))} ${pl.g.givers}`
    : `${cap(c.name)}: the top 10 got ${b(pct(top10 / Math.max(1, tot)))} of ${b(money(tot))}${tier ? " (main focus)" : ""} across ${b(int(count))} recipients`;
  const rowOut = (r: DualRow, c: C, ci: 0 | 1) => ({ cause: c.name, rank: ci ? r.z_rk : r.a_rk, [fund ? "funder_ein" : "ein"]: r.k, [fund ? "funder" : "name"]: r.name, state: r.state,
    usd: ci ? r.z_usd : r.a_usd, primary_usd: (ci ? tierZ : tierA) ? (ci ? r.z_v : r.a_v) : null, [fund ? "recipients" : "funders"]: ci ? r.z_n : r.a_n, [`top_${OVERLAP_N}_in_both`]: r.b_rk != null });
  const tiered = tierA || tierZ;
  return {
    dual: true,
    headline: `${lead}. ${overlapText}`,
    numbers: [
      { value: money(listA[0].a_v ?? 0), label: `${nm(listA[0].name)}, top for ${a.name}` },
      { value: money(listZ[0].z_v ?? 0), label: `${nm(listZ[0].name)}, top for ${z.name}` },
      { value: `${int(both.length)} of ${int(nTop)}`, label: `top ${whoTop} in both lists` },
    ],
    bullets: [per(a, t.ta, t.a10, t.na, tierA), per(z, t.tz, t.z10, t.nz, tierZ),
      both.length > 1 ? `Next in both: ${both.slice(1, 3).map((r) => nm(r.name)).join(" and ")}` : `${b(int(alsoA))} of the top ${int(nA)} ${a.name} ${whoTop} ${fund ? "also gave" : "also got money"} for ${z.name}`],
    chart: { title: `Top ${fund ? `${pl.g.adj} funders` : "recipients"} of ${a.name} and of ${z.name}${tiered ? " (main focus)" : ""}, ${yr}`, sub: u.title, spec },
    rows: [...listA.map((r) => rowOut(r, a, 0)), ...listZ.map((r) => rowOut(r, z, 1))],
    causeNote: notes.join(" "), caveats,
    coverage: [{ label: `${cap(a.name)} ${whoTop}`, value: int(t.na) }, { label: `${cap(z.name)} ${whoTop}`, value: int(t.nz) }, { label: `Top ${nTop} in both`, value: int(both.length) }],
    method: `${pl.g.form}, tax years ${yr}, to identified recipients in each cause set${inX}, summed by ${fund ? pl.g.adj : "recipient"} and ranked within each cause${tiered ? " (a graded label counts organizations where it's the main purpose)" : ""}. In both = among the top ${nTop} of each ranking, ordered by the smaller of the two amounts.`,
    sources: [pl.g.src, ...(a.label || z.label ? [SRC.labels] : [])], searchQuery: searchFor(s, pl),
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
  const hist = cubeOk(ctx, c, pl) && !pl.corr; // histograms have no EIN: corrected groups read grant_clean
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
  const nm = (x: string) => orgName(x, 48);
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
// A cause that names a federal program (Head Start, AmeriCorps ...) matches the program's assistance listings,
// any recipient; other causes match linked recipients' NTEE code or label.
function fedWhere(c: C | null, p: P, pl: Place, y: { from: number; to: number }, sfx = "") {
  const prog = c && !c.all ? fedProgram(c) : null;
  const cs: CauseSql = prog ? (p.cause(c), { join: "", where: [`fa.cfda_number LIKE ANY(${p.add(prog.cfda)}::text[])`], tier: null, kind: "program", program: prog }) : causeSql(c, p, "fa.recipient_ein", "o.ntee_cd", sfx, true);
  const w = [`fa.fiscal_year BETWEEN ${p.add(y.from)} AND ${p.add(y.to)}`, ...(c && !c.all && !prog ? ["fa.recipient_ein IS NOT NULL"] : []), ...cs.where];
  if (pl.county) { w.push(`fa.pop_county_fips = ${p.add(pl.county.fips)}`); pl.used.add("county"); }
  else if (pl.states.length) w.push(`fa.pop_state = ANY(${p.add(pl.states)}::text[])`);
  if (pl.region) { w.push(`fa.pop_county_fips = ANY(${p.add(pl.region.fips)}::char(5)[])`); pl.used.add("region"); }
  if (pl.area) pl.used.add("area");
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
  const nm = (x: string) => orgName(x);
  const prog = c ? fedProgram(c) : null;
  const base = { searchQuery: searchFor(s, pl), sources: [SRC.fed, ...(!prog && c?.label ? [SRC.labels] : []), ...(!prog && c?.ntee.length ? [SRC.ntee] : [])] };
  // A cause no award matched: say so, never "$0" as if the money were zero (Oct 19: "Head Start providers" as
  // NTEE P23 found $0 for a $33B program).
  const noMatch = (cc: C) => new Unanswerable(`No federal awards matched ${cc.name}${inX}, FY${yr}: ${fedProgram(cc) ? `no award under ${fedProgram(cc)!.name}` : "it isn't a federal program we can name, and no linked recipient in that cause has an award"}. That means the cause couldn't be matched in federal awards, not that the money is $0.`);
  const finish = async (o: Omit<Out, "caveats" | "causeNote" | "searchQuery" | "sources">, cs: CauseSql, extra: string[] = [], moreSources: { label: string; url: string }[] = []): Promise<Out> => {
    const note = await causeNote(c, cs, caveats);
    if (c && !prog) caveats.push("Causes count only recipients linked to an IRS-registered organization (by name and place), so cause totals run low.");
    return { ...o, ...base, sources: [...base.sources, ...moreSources], causeNote: note, caveats: [...extra, ...caveats, ...FED_CAVEATS, await fedLinkNote()] };
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
      causes.forEach((cc, i) => { if (cc && !ms[i]?.total.awards) throw noMatch(cc); });
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
      const method = `Sum of net federal obligations (grants and cooperative agreements, USAspending.gov) to nonprofit and private-college recipients, fiscal years ${yr}, placed by place of performance${prog ? `, under ${prog.name} (assistance listings ${prog.cfda.join(", ")})` : c ? ", for recipients linked to an org in the cause set" : ""}.`;
      const cs = ms[0]?.cs ?? cs0!;
      if (metric === "compare" && causes.length === 2 && ms[1]) {
        const v1 = val(ms[1], causes[1]);
        return finish({ headline: `${cap(causes[0]!.name)}: ${money(v0)} vs ${causes[1]!.name}: ${money(v1)} in federal awards to nonprofits${inX}, FY${yr}`,
          numbers: [{ value: money(v0), label: causes[0]!.name }, { value: money(v1), label: causes[1]!.name }, { value: money(all.total.usd), label: "all federal awards to nonprofits" }],
          bullets: [`${b(pct(v0 / Math.max(1, all.total.usd)))} and ${b(pct(v1 / Math.max(1, all.total.usd)))} of all federal awards to nonprofits${inX}`],
          chart, rows, coverage: [{ label: "Award-years", value: int(all.total.awards) }], method, versus: { first: causes[0]!.name, second: causes[1]!.name, a: v0, z: v1 } }, cs, cmpNote ? [cmpNote] : []);
      }
      if (metric === "trend") {
        // Federal fiscal years (October to September) deflate by the fiscal-year average CPI-U, not the calendar year's.
        const inf = await inflation(ctx, m0.years.map((r) => r.year!), true);
        const realG = realGrowth(inf, growth, y.from, y.to);
        const tChart = inf ? { ...chart, spec: inflToggle(vbar(m0.years.map((r) => { const v = c?.label ? r.primary_usd : r.usd; return { year: `FY${r.year}`, amount: +(v / u.div).toFixed(3), amount_nom: +(v / u.div).toFixed(3), amount_real: +(realOf(inf, v, r.year!) / u.div).toFixed(3) }; }), "year", "amount", "Fiscal year", u.title, u.fmt), "amount", inf) } : chart;
        return finish({ headline: growth == null ? `Federal awards to nonprofits${forX}${inX}: ${money(v0)}, FY${yr}` : `Federal awards to nonprofits${forX}${inX} ${grewText(growth, realG)} from FY${y.from} to FY${y.to}`,
          numbers: [...(growth != null ? [{ value: signed(growth), label: `FY${y.from} to FY${y.to}` }] : []), ...(realG != null ? [{ value: signed(realG), label: `after inflation (${inf!.base} dollars)` }] : []), { value: money(v0 / nYears), label: "a year" }, { value: int(m0.total.orgs), label: "recipients" }],
          bullets: [`${b(money(yv(m0, y.to, c)))} in FY${y.to}, ${b(money(yv(m0, y.from, c)))} in FY${y.from}`],
          chart: tChart, rows: inf ? rows.map((r) => ({ ...r, [`usd_in_${inf.base}_dollars`]: Math.round(realOf(inf, Number(c?.label ? r.primary_usd : r.usd), Number(r.fiscal_year))) })) : rows,
          coverage: [{ label: "Award-years", value: int(m0.total.awards) }], method: `${method}${inf ? inflMethod(inf) : ""}`, ...(growth != null ? { change: { subject: `federal awards to nonprofits${forX}${inX}`, g: growth, from: `FY${y.from}`, to: `FY${y.to}` } } : {}) }, cs, [], inf ? [SRC_CPI] : []);
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
      const oNtee = pl.corr ? corrNtee("fa.recipient_ein", "o.ntee_cd") : "o.ntee_cd";
      const dim: Record<string, [string, string]> = {
        state: ["fa.pop_state", "fa.pop_state IS NOT NULL"], county: ["fa.pop_county_fips", "fa.pop_county_fips IS NOT NULL"], year: ["fa.fiscal_year::text", "true"],
        agency: ["fa.agency_name", "true"], program: ["fa.cfda_number || ' ' || coalesce(fa.cfda_title, '')", "fa.cfda_number IS NOT NULL"],
        cause: [`coalesce(left(${oNtee}, 1), '?')`, "fa.recipient_ein IS NOT NULL"], cause_detail: [`coalesce(left(${oNtee}, 3), '?')`, "fa.recipient_ein IS NOT NULL"],
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
      if (!groups.length) throw c ? noMatch(c) : new Unanswerable(`No federal awards to nonprofits found${inX}.`);
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
      const hist = ctx.cube && !pl.county && !pl.region && !prog && cubeCause(c) && !(c as C | null)?.corr;
      let r: { n: number; avg: number; median: number; p90: number }, med$: string, p90$: string, approx = false;
      if (hist) {
        const ph = new P();
        const w = [`h.fiscal_year BETWEEN ${ph.add(y.from)} AND ${ph.add(y.to)}`];
        if (c && !c.all) {
          ph.cause(c);
          w.push("h.linked");
          if (c.label) w.push("h.labels <> '{}'", `h.labels && ${ph.add([`${c.label}:primary`])}::text[]`);
          else w.push(`h.ntee3 LIKE ANY(${ph.add(c.ntee.map((n) => `${n}%`))}::text[])`);
        }
        if (pl.states.length) w.push(`h.pop_state = ANY(${ph.add(pl.states)}::text[])`);
        if (pl.area) { w.push(`h.rural IS ${pl.area === "rural" ? "TRUE" : "FALSE"}`); pl.used.add("area"); }
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
      if (!r?.n) throw c ? noMatch(c) : new Unanswerable(`No federal awards to nonprofits found${inX}.`);
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
// ---- under-funded orgs (metric underfunded; Joshua Elder Oct 19, Kate Oct 15: "orgs doing X that get little
// foundation money"). Within one cause (graded label primary tier, NTEE codes or keywords), established public
// charities with real programs: a full Form 990 in the newest years, a prior-year column, IRS ruling 3+ years
// before it, program expenses 70%+ of expenses, under half of revenue from fees (program service revenue),
// $500K to $50M in revenue (or the recipientSize asked). Not DAF sponsors, community foundations, United Ways,
// supporting orgs or orgs granting a quarter or more of their spending on. Peers = the same cause and revenue band,
// nationwide. Under-funded = 990-PF grants a year per revenue dollar at most a quarter of the peer median, and
// Schedule I grants under 10% of revenue. Ranked by the shortfall in dollars against the peer median. Before
// listing, the top candidates are checked for unlinked grants under their name in their state (pg_trgm), and
// any with them are set aside: about 40% of grant dollars don't name a recipient we can link.
export type OrgPick = { ein: string; name: string; city: string; state: string; tax_year: number; revenue: number; foundation_usd_a_year: number; foundation_grants: number; funders: number; peer_median_usd_a_year: number; government_share: number; contributions_share: number; program_share: number; charity_grants_usd_a_year: number; since: number | null };
const UF_SHARE = 0.25, UF_PROGRAM = 0.7, UF_FEES = 0.5, UF_GIFTS = 0.5, UF_ASSETS = 4, UF_SI = 0.1, UF_CHECK = 40, UF_SHOW = 10;
// Not the overlooked-org kind: government authorities and their affiliates, school booster clubs and PTAs (they raise
// money for one school or team).
const UF_NOT_NAME = String.raw`\m(housing|redevelopment|development|public facilit(y|ies)) (authority|corporation|corp|finance)\M|\mauthority\M|\mbooster|\mpta\M|\mpto\M|parent teacher`;
const UF_CAVEAT = "Under-funded here means few foundation grants for the org's size compared with similar orgs, not that it lacks money: many of these orgs run on government contracts or individual gifts. About a third of foundation grants (40% of grant dollars) name a recipient we can't link to an organization, so some orgs listed may get grants we can't see. We checked each listed org's name against those unlinked grants in its state and set aside any with a match.";
type UfRow = { ein: string | null; name: string; city: string; state: string; tax_year: number; revenue: number; expenses: number; contributions: number; government_grants: number; program_expenses: number; since: number | null; pf_usd: number; pf_n: number; funders: number; si_usd: number; med: number; band: number; gap: number;
  n_here: number; n_under: number; n_bands: number; peers: { band: number; n: number; med: number; any: number }[] | null; y0: number; y1: number };
async function underfunded(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c0 = (s.causes[0] ?? null) as C | null;
  // NTEE causes count by corrected groups here: an org whose IRS code doesn't fit its own 990 text isn't a peer.
  const c = c0 && !c0.label && c0.ntee.length ? { ...c0, corr: true } : c0;
  if (!c) throw new Unanswerable("Name a cause (\"mental health\", \"food banks\") to find orgs in it that get little foundation money for their size.");
  const gy1 = FULL.pf, gy0 = gy1 - 2; // three full years of 990-PF grants
  const fy1 = FULL.f990 + 1, fy0 = FULL.f990 - 1; // newest Form 990 per org, 2023 to 2025 today
  const rb: [number, number] = pl.f.rb ?? [3, 6];
  if (pl.f.rb) ctx.honored.add("recipientSize");
  const p = new P();
  const cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
  const here = placeWhere(pl, p, "lat.state", "lat.county_fips");
  const [g0, g1, f0, f1, b0, b1] = [gy0, gy1, fy0, fy1, rb[0], rb[1]].map((x) => p.add(x));
  const sql = `WITH lat AS (
  SELECT DISTINCT ON (f.ein) f.ein, f.tax_year, f.object_id, f.revenue, f.expenses, f.contributions, f.program_revenue, f.government_grants, f.total_assets, f.revenue_band, f.state, f.county_fips
  FROM org_finance_year f ${cs.join}
  WHERE ${and([`f.tax_year BETWEEN ${f0} AND ${f1}`, "f.source = 'filing'", "f.form = '990'", ...cs.where])}
  ORDER BY f.ein, f.tax_year DESC),
el AS (
  SELECT lat.*, o.name, o.city, ff.program_expenses, CASE WHEN o.ruling ~ '^[0-9]{4}' THEN left(o.ruling, 4)::int END AS since, (${and(here)}) AS here
  FROM lat JOIN filing_flag ff ON ff.object_id = lat.object_id JOIN orgs o ON o.ein = lat.ein
  WHERE lat.revenue_band BETWEEN ${b0} AND ${b1} AND lat.revenue > 0 AND lat.expenses >= 0.5 * lat.revenue AND coalesce(ff.cy_salaries, 0) > 0
    AND o.subsection = '03' AND o.foundation IN ('11', '12', '15', '16')
    AND ff.py_revenue > 0 AND o.ruling ~ '^[0-9]{4}' AND left(o.ruling, 4)::int <= lat.tax_year - 3
    AND ff.program_expenses >= ${UF_PROGRAM} * lat.expenses
    AND coalesce(lat.program_revenue, 0) < ${UF_FEES} * lat.revenue AND coalesce(lat.contributions, 0) >= ${UF_GIFTS} * lat.revenue
    AND coalesce(lat.total_assets, 0) <= ${UF_ASSETS} * lat.revenue
    AND o.name !~* ${p.add(UF_NOT_NAME)}
    AND NOT EXISTS (SELECT 1 FROM charity_funder_profile cf WHERE cf.ein = lat.ein AND cf.funder_class IN ('daf_sponsor', 'community_foundation', 'united_way'))
    AND coalesce((SELECT sum(gy.total) FROM org_given_year gy WHERE gy.ein = lat.ein AND gy.year = lat.tax_year), 0) < 0.25 * lat.expenses),
pf AS (SELECT g.recipient_ein AS ein, sum(g.amount)::float8 AS usd, count(*)::int AS n, count(DISTINCT g.funder_ein)::int AS funders
  FROM grant_clean g WHERE g.recipient_ein IN (SELECT ein FROM el) AND g.tax_year BETWEEN ${g0} AND ${g1} GROUP BY 1),
si AS (SELECT g.recipient_ein AS ein, sum(g.amount)::float8 AS usd
  FROM charity_grant_clean g WHERE g.recipient_ein IN (SELECT ein FROM el) AND g.tax_year BETWEEN ${g0} AND ${g1} GROUP BY 1),
x AS (SELECT el.*, coalesce(pf.usd, 0) AS pf_usd, coalesce(pf.n, 0) AS pf_n, coalesce(pf.funders, 0) AS funders, coalesce(si.usd, 0) AS si_usd,
  coalesce(pf.usd, 0) / (${g1} - ${g0} + 1) / el.revenue AS ratio FROM el LEFT JOIN pf USING (ein) LEFT JOIN si USING (ein)),
pm AS (SELECT revenue_band AS band, count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY ratio)::float8 AS med, avg((pf_usd > 0)::int)::float8 AS any FROM x GROUP BY 1),
u AS (SELECT x.*, pm.med, (pm.med * x.revenue - x.pf_usd / (${g1} - ${g0} + 1))::float8 AS gap FROM x JOIN pm ON pm.band = x.revenue_band
  WHERE x.here AND pm.med > 0 AND x.ratio <= ${UF_SHARE} * pm.med AND x.si_usd / (${g1} - ${g0} + 1) < ${UF_SI} * x.revenue),
t AS (SELECT (SELECT count(*) FROM x WHERE here)::int AS n_here, (SELECT count(*) FROM u)::int AS n_under,
  (SELECT count(*) FROM pm WHERE med > 0)::int AS n_bands, (SELECT json_agg(pm ORDER BY band) FROM pm) AS peers)
SELECT r.ein, r.name, r.city, r.state, r.tax_year, r.revenue::float8, r.expenses::float8, coalesce(r.contributions, 0)::float8 AS contributions, coalesce(r.government_grants, 0)::float8 AS government_grants,
  r.program_expenses::float8, r.since, r.pf_usd, r.pf_n, r.funders, r.si_usd, r.med, r.revenue_band AS band, r.gap, t.*, ${g0}::int AS y0, ${g1}::int AS y1
FROM t LEFT JOIN LATERAL (SELECT * FROM u ORDER BY gap DESC, ein LIMIT ${UF_CHECK}) r ON true ORDER BY r.gap DESC NULLS LAST`;
  const rows = await ctx.q<UfRow>(`Established ${orgsOf(causeName(c, pl))} by foundation grants per revenue dollar against peers of the same size`, sql, p);
  const t = rows[0];
  ctx.span = { kind: "f990", from: fy0, to: Math.min(fy1, Math.max(...rows.map((r) => r.tax_year ?? fy0))), newest: true };
  const caveats: string[] = [];
  const note = await causeNote(c, cs, caveats);
  const what = orgsOf(causeName(c, pl));
  const inW = pl.label === "the US" ? "" : ` in ${pl.label}`;
  if (!t || !t.n_here) throw new Unanswerable(`No established ${what}${inW} with ${R_NAMES[rb[0] - 1].replace(/ to .*/, "")} or more in revenue and a full Form 990 in our data.`);
  if (!t.n_bands) throw new Unanswerable(`Most ${what} this size get no foundation grants at all, so no org stands out as under-funded against its peers.`);
  // Unlinked grants under each candidate's name in its state (2022-24, no recipient EIN): any match sets it aside.
  const cand = rows.filter((r) => r.ein);
  const pk = new P();
  const nameKey = (x: string) => `trim(regexp_replace(regexp_replace(upper(${x}), '[^A-Z0-9 ]', ' ', 'g'), '\\m(THE|INC|INCORPORATED|CORP|CORPORATION|CO|LLC|LTD)\\M|\\s+', ' ', 'g'))`;
  const unl = cand.length ? await ctx.q<{ ein: string; n: number; usd: number; names: string }>("Unlinked grants under the same name in the same state (checked before listing)",
    `WITH c AS (SELECT ein, state, ${nameKey("name")} AS k FROM unnest(${pk.add(cand.map((r) => r.ein))}::text[], ${pk.add(cand.map((r) => r.name))}::text[], ${pk.add(cand.map((r) => r.state))}::text[]) AS c(ein, name, state)),
g AS (SELECT g.recipient_state AS state, g.amount, g.recipient_name, ${nameKey("g.recipient_name")} AS k FROM grants g
  WHERE g.recipient_ein IS NULL AND g.amount > 0 AND g.tax_year BETWEEN ${pk.add(gy0)} AND ${pk.add(gy1)} AND g.recipient_state = ANY(${pk.add([...new Set(cand.map((r) => r.state))])}::text[]))
SELECT c.ein, count(*)::int AS n, sum(g.amount)::float8 AS usd, string_agg(DISTINCT g.recipient_name, ' | ') AS names
FROM c JOIN g ON g.state = c.state AND left(g.k, 4) = left(c.k, 4) AND similarity(g.k, c.k) >= 0.6 GROUP BY 1`, pk) : [];
  const hit = new Map(unl.map((r) => [r.ein, r]));
  const yrsN = t.y1 - t.y0 + 1;
  const list = cand.filter((r) => !hit.has(r.ein!)).slice(0, UF_SHOW);
  const picks: OrgPick[] = list.map((r) => ({
    ein: r.ein!, name: orgName(r.name), city: r.city, state: r.state, tax_year: r.tax_year, revenue: r.revenue,
    foundation_usd_a_year: Math.round(r.pf_usd / yrsN), foundation_grants: r.pf_n, funders: r.funders, peer_median_usd_a_year: Math.round(r.med * r.revenue),
    government_share: +(r.government_grants / r.revenue).toFixed(3), contributions_share: +(r.contributions / r.revenue).toFixed(3), program_share: +(r.program_expenses / Math.max(1, r.expenses)).toFixed(3),
    charity_grants_usd_a_year: Math.round(r.si_usd / yrsN), since: r.since,
  }));
  if (!picks.length) throw new Unanswerable(`No ${what}${inW} stand out: each one with few linked foundation grants has grants under its name we couldn't link, so we can't say it's under-funded.`);
  const govMost = picks.filter((o) => o.government_share >= 0.5).length;
  const nUnder = t.n_under - hit.size; // the top ${UF_CHECK} were checked for unlinked grants, the rest weren't
  const none = picks.filter((o) => o.foundation_grants === 0).length;
  const bandName = (k: number) => R_NAMES[k - 1];
  const peerTxt = (t.peers ?? []).filter((x) => x.n >= 5).map((x) => `${bandName(x.band)}: ${int(x.n)} orgs, median ${money(x.med * 100)} of foundation grants a year per $100 of revenue, ${pct(x.any)} with any`).join(". ");
  const u = unit(Math.max(...picks.map((o) => Math.max(o.peer_median_usd_a_year, o.foundation_usd_a_year)), 1));
  const nm = (x: string) => orgName(x, 40);
  const chartVals = picks.flatMap((o) => [{ name: nm(o.name), series: "Foundation grants a year", amount: +(o.foundation_usd_a_year / u.div).toFixed(3) }, { name: nm(o.name), series: "Peer median for its size", amount: +(o.peer_median_usd_a_year / u.div).toFixed(3) }]);
  caveats.unshift(UF_CAVEAT);
  if (t.n_under > UF_CHECK) caveats.push(`Only the ${UF_CHECK} largest shortfalls were checked for unlinked grants, so the count of ${int(nUnder)} may include a few orgs that do get grants under another name.`);
  if (hit.size) caveats.push(`${int(hit.size)} of the top ${int(cand.length)} candidates were set aside because grants under their name in their state aren't linked to them (for example ${[...hit.values()].slice(0, 2).map((h) => `"${h.names.split(" | ")[0]}"`).join(" and ")}).`);
  caveats.push(`Foundation grants are 990-PF grants paid in tax years ${t.y0} to ${t.y1}. Grants from donor-advised funds and other charities (Schedule I) are shown but not ranked: orgs getting 10% or more of revenue that way are left out.`);
  return {
    headline: `${int(nUnder)} of ${int(t.n_here)} established ${what}${inW} get under a quarter of the foundation money their peers get for their size`,
    numbers: [{ value: int(nUnder), label: "get little foundation money for their size" }, { value: int(t.n_here), label: `established ${what} checked` },
      { value: pct(none / picks.length), label: `of the ${picks.length} listed got no linked foundation grant, ${t.y0} to ${t.y1}` }],
    bullets: [`${nm(picks[0].name)} (${picks[0].state}): ${b(money(picks[0].revenue))} revenue, ${b(money(picks[0].foundation_usd_a_year))} a year from foundations`,
      `Peers its size get about ${b(money(picks[0].peer_median_usd_a_year))} a year`,
      ...(govMost ? [`${b(`${govMost} of ${picks.length}`)} listed get half or more of revenue from government grants`] : []),
      ...(hit.size ? [`${b(int(hit.size))} set aside for unlinked grants under their name`] : [])],
    chart: { title: `Foundation grants a year vs peers of the same size: ${what}${inW}`, sub: u.title, spec: hbar(chartVals, "name", "amount", u.title, u.fmt, undefined) },
    rows: picks.map((o) => ({ ...o })), orgs: picks, orgCount: t.n_here,
    causeNote: note, caveats,
    coverage: [{ label: "Established orgs checked", value: int(t.n_here) }, { label: "Size", value: `${R_NAMES[rb[0] - 1].replace(/ to .*/, "")} to ${R_NAMES[rb[1] - 1].replace(/.* to /, "")} in revenue` }, { label: "Foundation grant years", value: `${t.y0}–${t.y1}` }],
    method: `Each org's newest full Form 990 (tax years ${fy0} to ${fy1}). Established = a prior-year column on that return and an IRS ruling at least 3 years before it. Real programs = paid staff, spending at least half of revenue (no one-time windfalls), program expenses at least ${pct(UF_PROGRAM)} of expenses and under ${pct(UF_FEES)} of revenue from fees, at least ${pct(UF_GIFTS)} from gifts and grants (government grants included) and assets under ${UF_ASSETS} times revenue (not property holders or endowed orgs). Left out: government authorities, school booster clubs and PTAs, DAF sponsors, community foundations, United Ways, supporting orgs and orgs granting a quarter or more of their spending on. Peers = every such org in the cause nationwide in the same revenue band (${peerTxt || "see the SQL"}). Under-funded = 990-PF grants a year per revenue dollar at most ${pct(UF_SHARE)} of the peer median, and Schedule I grants under ${pct(UF_SI)} of revenue. Ranked by the shortfall in dollars (peer median times revenue, minus grants received). The top ${UF_CHECK} were checked for unlinked grants under a similar name in their state.`,
    sources: [SRC.f990, SRC.pf, SRC.si, ...(c.label ? [SRC.labels] : []), ...(c.ntee.length ? [SRC.ntee] : [])], searchQuery: searchFor(s, pl),
  };
}

async function countOrgs(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = s.causes[0] ?? null;
  const p = new P();
  const cs = causeSql(c, p, "o.ein", "o.ntee_cd", "", true);
  const zip = pl.county || pl.region || pl.area ? "LEFT JOIN zip_regions z ON z.zip5 = left(o.zip, 5)::char(5)" : "";
  const where = ["coalesce(o.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "o.state", "z.county_fips"), ...filtEin(pl.f, p, "o.ein")];
  const [r] = await ctx.q<{ orgs: number; filed: number; full990: number; deficit: number; surplus: number; low_cash: number; cash_known: number; med_cash: number | null; gov_reliant: number; year_min: number; year_max: number }>("Organizations and their newest e-filed return", `WITH s AS (SELECT o.ein FROM orgs o ${cs.join} ${zip} WHERE ${and(where)}),
n AS (SELECT DISTINCT ON (f.ein) f.* FROM flag_year f JOIN s USING (ein) ORDER BY f.ein, f.tax_year DESC)
SELECT (SELECT count(*) FROM s)::int AS orgs, count(*)::int AS filed, count(*) FILTER (WHERE n.form = '990')::int AS full990,
       count(*) FILTER (WHERE n.expenses > n.revenue)::int AS deficit,
       count(*) FILTER (WHERE n.revenue >= n.expenses)::int AS surplus,
       count(*) FILTER (WHERE n.expenses > 0 AND n.cash IS NOT NULL AND n.cash * 12.0 / n.expenses < 3)::int AS low_cash,
       count(*) FILTER (WHERE n.expenses > 0 AND n.cash IS NOT NULL)::int AS cash_known,
       (percentile_cont(0.5) WITHIN GROUP (ORDER BY n.cash * 12.0 / n.expenses) FILTER (WHERE n.expenses > 0 AND n.cash IS NOT NULL))::float8 AS med_cash,
       count(*) FILTER (WHERE n.form = '990' AND n.revenue > 0 AND coalesce(n.government_grants, 0) >= 0.5 * n.revenue)::int AS gov_reliant,
       min(n.tax_year)::int AS year_min, max(n.tax_year)::int AS year_max
FROM n`, p);
  const caveats: string[] = [];
  const note = await causeNote(c, cs, caveats);
  if (!r.orgs) throw new Unanswerable(`No organizations match ${causeName(c, pl)} in ${pl.label}.`);
  if (r.year_min && r.year_max) ctx.span = { kind: "f990", from: r.year_min, to: r.year_max, newest: true };
  caveats.push(`Finances come from each org's newest e-filed 990 or 990-EZ (tax years ${r.year_min}–${r.year_max}). ${int(r.orgs - r.filed)} of ${int(r.orgs)} orgs (mostly small 990-N filers) have none, so the shares are of filers.`,
    "One deficit year isn't a red flag by itself: an org may be spending down savings on purpose.");
  if (s.condition === "gov_reliant") caveats.push(GOV_CAVEAT);
  const cond = s.condition;
  if (cond) ctx.honored.add("condition");
  const cv0 = cond === "deficit" ? { n: r.deficit, of: r.filed, what: "ran a deficit" }
    : cond === "surplus" ? { n: r.surplus, of: r.filed, what: "broke even or ran a surplus" }
      : cond === "low_cash" ? { n: r.low_cash, of: r.cash_known, what: "had under 3 months of cash" }
        : cond === "gov_reliant" ? { n: r.gov_reliant, of: r.full990, what: "got half or more of revenue from government grants" } : null;
  // "Deficits two years in a row": each org's newest return and the returns for the years right before it.
  // Counted among orgs with that many straight years of e-filed returns (the panel), not all filers.
  let cv = cv0;
  if (cond && cv0 && s.streak) {
    const N = s.streak, pk = new P();
    const csK = causeSql(c, pk, "o.ein", "o.ntee_cd", "", true);
    const wK = ["coalesce(o.foundation, '') NOT IN ('02', '03', '04')", ...csK.where, ...placeWhere(pl, pk, "o.state", "z.county_fips"), ...filtEin(pl.f, pk, "o.ein")];
    const hit = cond === "deficit" ? "f.expenses > f.revenue" : cond === "surplus" ? "f.revenue >= f.expenses"
      : cond === "low_cash" ? "f.expenses > 0 AND f.cash IS NOT NULL AND f.cash * 12.0 / f.expenses < 3" : "f.form = '990' AND f.revenue > 0 AND coalesce(f.government_grants, 0) >= 0.5 * f.revenue";
    const [k] = await ctx.q<{ panel: number; hits: number }>(`Organizations with ${N} straight years of e-filed returns, and those meeting the condition in each`, `WITH s AS (SELECT o.ein FROM orgs o ${csK.join} ${zip} WHERE ${and(wK)}),
y AS (SELECT f.ein, f.tax_year, coalesce(${hit}, false) AS hit, max(f.tax_year) OVER (PARTITION BY f.ein) AS newest FROM flag_year f JOIN s USING (ein)),
st AS (SELECT ein, count(*) AS yrs, bool_and(hit) AS all_hit FROM y WHERE tax_year > newest - ${pk.add(N)} GROUP BY ein)
SELECT count(*) FILTER (WHERE yrs = ${pk.add(N)})::int AS panel, count(*) FILTER (WHERE yrs = ${pk.add(N)} AND all_hit)::int AS hits FROM st`, pk);
    ctx.honored.add("streak");
    if (!k.panel) throw new Unanswerable(`None of these organizations has ${N} straight years of e-filed returns in our data (tax years ${r.year_min}–${r.year_max}).`);
    cv = { n: k.hits, of: k.panel, what: `${cv0.what.replace(/^ran a deficit$/, "ran deficits").replace(/^had /, "had ")} ${N} years in a row` };
    caveats.unshift(`${N} years in a row = the org's newest e-filed return and the ${N - 1 === 1 ? "year" : `${N - 1} years`} right before it all show it. Only the ${int(k.panel)} of ${int(r.filed)} filers with ${N} straight years of returns in our data (tax years ${r.year_min}–${r.year_max}, 2023 partly loaded) are counted.`);
  }
  const vals = [
    { group: "Ran a deficit", share: r.deficit / Math.max(1, r.filed), n: r.deficit },
    { group: "Under 3 months of cash", share: r.low_cash / Math.max(1, r.cash_known), n: r.low_cash },
    { group: "Half+ revenue from government", share: r.gov_reliant / Math.max(1, r.full990), n: r.gov_reliant },
  ];
  const what = `${c ? orgsOf(c.name) : "nonprofits"}${pl.f.rb ? ` (${pl.f.to.replace(/^organizations /, "")})` : ""} in ${pl.label}`;
  return {
    headline: cv ? `${int(cv.n)} of ${int(cv.of)} ${what} with recent filings ${cv.what} (${pct(cv.n / Math.max(1, cv.of))})` : `${int(r.orgs)} ${what} are on the IRS list, and ${int(r.filed)} e-file a 990`,
    numbers: cv ? [{ value: int(cv.n), label: cv.what }, { value: pct(cv.n / Math.max(1, cv.of)), label: "of filers" }, cond === "low_cash" && r.med_cash != null ? { value: `${r.med_cash.toFixed(1)} months`, label: "median cash on hand" } : { value: int(r.orgs), label: "orgs on the IRS list" }]
      : [{ value: int(r.orgs), label: "orgs on the IRS list" }, { value: int(r.filed), label: "e-file a 990 or 990-EZ" }, { value: pct(r.deficit / Math.max(1, r.filed)), label: "of filers ran a deficit" }],
    bullets: [`${b(int(r.orgs))} ${what} on the IRS master file`, `${b(int(r.filed))} have an e-filed 990 or 990-EZ with finances`,
      cv ? `${b(int(cv.n))} ${cv.what}, ${b(pct(cv.n / Math.max(1, cv.of)))} of those reporting` : `${b(pct(r.deficit / Math.max(1, r.filed)))} ran a deficit in their newest year`],
    chart: { title: `Financial signals, ${what}`, sub: "Share of filers", spec: hbar(vals.map((v) => ({ signal: v.group, share: +v.share.toFixed(4) })), "signal", "share", "Share of filers", ".0%", cv ? vals[["deficit", "low_cash", "gov_reliant"].indexOf(cond!)]?.group : undefined) },
    rows: [{ orgs: r.orgs, filed: r.filed, full_990: r.full990, deficit: r.deficit, surplus: r.surplus, low_cash: r.low_cash, cash_known: r.cash_known, median_months_cash: r.med_cash != null ? +r.med_cash.toFixed(2) : null, gov_reliant: r.gov_reliant }],
    causeNote: note, caveats,
    coverage: [{ label: "Orgs (IRS list)", value: int(r.orgs) }, { label: "With e-filed finances", value: int(r.filed) }, { label: "Full Form 990", value: int(r.full990) }],
    method: `Organizations on the IRS master file (private foundations excluded) in the cause set${pl.label !== "the US" ? `, based in ${pl.label}` : ""}. Deficit = expenses above revenue on the newest e-filed return; thin cash = cash under 3 months of expenses; government-reliant = Form 990 line 1e at least half of revenue.`,
    sources: [SRC.bmf, SRC.f990], searchQuery: searchFor(s, pl), orgCount: r.orgs,
  };
}

// ---- household giving: IRS SOI individual income tax statistics (generosity-data 054)
// soi_individual_county: per tax year, state (level 'state') or county, and AGI class: returns, AGI, itemizers,
// returns claiming the charitable deduction (charity_n) and its amount (charity_usd). Itemizers only, no cause.
const SRC_SOI_IND = { label: "IRS SOI individual income tax statistics, county and ZIP code data", url: "https://www.irs.gov/statistics/soi-tax-stats-individual-income-tax-statistics-zip-code-data-soi" };
const HH_CAVEATS = [
  "Itemizers only: this is the charitable deduction claimed on Schedule A. Most households take the standard deduction, so their gifts aren't here.",
  "Itemizing fell by about 60% in tax year 2018, when the 2017 tax law (TCJA) nearly doubled the standard deduction. Years before and after 2018 aren't comparable as a measure of giving.",
  "A deduction isn't all giving. It leaves out non-itemizers, bequests and gifts above deduction limits (carried to later years), and counts gifts to donor-advised funds when the donor gives, not when charities receive the money.",
  "The IRS suppresses or merges cells with fewer than 20 returns, so small counties and income classes can read low or zero.",
];
const usd0 = (x: number) => `$${int(x)}`;
type HhRow = { k: string | null; name: string | null; returns: number; agi: number; itemizers: number; claim_n: number; claim_usd: number; nonitem_usd: number | null };
async function householdGiving(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const g = ["total", "share", "trend", "by_state", "breakdown", "compare", "by_rurality"];
  if (!g.includes(s.metric)) throw new Unanswerable("IRS tax data on household giving has no recipients, causes, funders or grants: only how much itemizers deduct, by place, income and year.", MISSING_TEXT.individual_giving);
  const sub = !!(pl.county || pl.region || pl.area);
  const yr = Math.min(Math.max(s.yearTo ?? s.yearFrom ?? SOI_LAST, SOI_FIRST), SOI_LAST);
  const by = s.metric === "by_state" ? "state" : s.metric === "by_rurality" ? "rurality" : s.metric === "trend" ? "year" : s.metric === "breakdown" ? (s.by ?? "state") : null;
  if (by && !["state", "county", "income", "year", "rurality"].includes(by)) throw new Unanswerable(`Household giving splits by state, county, income or year, not by ${BY_TITLE[by] ?? by}.`);
  // What to rank or show: dollars, per return (perResident), share of AGI ("share of income"), per claiming return.
  const hm = s.perResident ? "per_return" : s.metric === "share" || (by === "income" && !s.measure) ? "agi_share" : s.measure === "average_grant" ? "per_claim" : s.measure === "grants" ? "claims" : "dollars";
  const level = sub || by === "county" || by === "rurality" ? "county" : "state";
  const sel = `coalesce(sum(h.returns), 0)::float8 AS returns, coalesce(sum(h.agi), 0)::float8 AS agi, coalesce(sum(h.itemizers), 0)::float8 AS itemizers,
       coalesce(sum(h.charity_n), 0)::float8 AS claim_n, coalesce(sum(h.charity_usd), 0)::float8 AS claim_usd, sum(h.nonitem_charity_usd)::float8 AS nonitem_usd`;
  const base = (p: P, y0: number, y1: number, plx: Place = pl) => [`h.tax_year BETWEEN ${p.add(y0)} AND ${p.add(y1)}`, `h.level = ${p.add(level)}`, ...placeWhere(plx, p, "h.state", "h.county_fips")];
  // Every year for the place (trend line, chart, and the focus year's totals).
  const py = new P();
  const years = await ctx.q<HhRow & { year: number }>(`Charitable deductions by tax year, ${pl.label} (IRS SOI)`, `SELECT h.tax_year::int AS year, NULL AS k, NULL AS name, ${sel}
FROM soi_individual_county h WHERE ${and(base(py, SOI_FIRST, SOI_LAST))} GROUP BY 1 ORDER BY 1`, py);
  const cur = years.find((r) => r.year === yr);
  if (!cur || !cur.returns) throw new Unanswerable(`No IRS individual return data for ${pl.label} in ${yr}.`);
  const inf = await inflation(ctx, years.map((r) => r.year));
  const val = (r: HhRow) => hm === "per_return" ? r.claim_usd / Math.max(1, r.returns) : hm === "agi_share" ? r.claim_usd / Math.max(1, r.agi) : hm === "per_claim" ? r.claim_usd / Math.max(1, r.claim_n) : hm === "claims" ? r.claim_n : r.claim_usd;
  const fmt = (x: number) => hm === "agi_share" ? pct(x) : hm === "claims" ? int(x) : hm === "dollars" ? money(x) : usd0(x);
  const what = hm === "per_return" ? "charitable deductions per tax return" : hm === "agi_share" ? "charitable deductions as a share of income (AGI)" : hm === "per_claim" ? "average charitable deduction per claiming return" : hm === "claims" ? "returns claiming a charitable deduction" : "charitable deductions";
  const where = pl.label;
  const inW = where === "the US" ? "in the US" : `in ${where}`;
  const caveats = [...HH_CAVEATS];
  if (years.some((r) => r.nonitem_usd)) caveats.push("In 2020 and 2021 non-itemizers could also deduct up to $300 ($600 for joint returns in 2021). Those amounts are reported separately and not counted here.");
  if (level === "county") caveats.push("County totals come from the county file. Returns are placed by the filer's address.");
  const vals = years.map((r) => ({ year: String(r.year), usd: r.claim_usd, real: inf ? realOf(inf, r.claim_usd, r.year) : null }));
  const u = unit(Math.max(...vals.map((v) => Math.max(v.usd, v.real ?? 0)), 1));
  const yearBars = vbar(vals.map((v) => ({ year: v.year, amount: +(v.usd / u.div).toFixed(3), amount_nom: +(v.usd / u.div).toFixed(3), amount_real: v.real != null ? +(v.real / u.div).toFixed(3) : null })), "year", "amount", "Tax year", u.title, u.fmt);
  const yearChart = inf ? inflToggle(yearBars, "amount", inf) : yearBars;
  const yearRows = years.map((r) => ({ tax_year: r.year, returns: r.returns, itemizers: r.itemizers, returns_claiming_charity: r.claim_n, charitable_deductions_usd: r.claim_usd, ...(inf ? { [`charitable_deductions_in_${inf.base}_dollars`]: Math.round(realOf(inf, r.claim_usd, r.year)) } : {}), agi_usd: r.agi, nonitemizer_charity_usd: r.nonitem_usd }));
  const method0 = `IRS Statistics of Income individual income tax statistics (county file), tax years ${SOI_FIRST}–${SOI_LAST}: the charitable contributions deduction on Schedule A (A19700) and the returns claiming it (N19700), with all returns (N1), itemizers (N04470) and adjusted gross income (A00100), ${level === "state" ? "from the state rows" : "summed over counties"}${pl.region ? ` (${pl.region.name} = the ${pl.region.fips.length} Appalachian Regional Commission counties)` : ""}. IRS amounts are in thousands of dollars, shown here in dollars.`;
  const sources = [SRC_SOI_IND, ...(inf ? [SRC_CPI] : []), ...(by === "rurality" ? [SRC.pop] : [])];
  const claimShare = cur.claim_n / Math.max(1, cur.returns);
  const tiles = [{ value: money(cur.claim_usd), label: `deducted, ${yr}` }, { value: pct(claimShare), label: `of returns claimed it (${int(cur.claim_n)})` }, { value: usd0(cur.claim_usd / Math.max(1, cur.claim_n)), label: "per claiming return" }];
  const common = { causeNote: "No cause: IRS returns don't say where gifts went.", caveats, coverage: [{ label: "Tax years", value: `${SOI_FIRST}–${SOI_LAST}` }, { label: "Returns", value: `${int(cur.returns)} in ${yr}` }], sources, searchQuery: null };

  if (by === "year" || (!by && s.metric !== "share" && s.yearFrom != null && s.yearTo == null)) {
    const y0 = Math.min(Math.max(s.yearFrom ?? SOI_FIRST, SOI_FIRST), SOI_LAST), y1 = Math.max(Math.min(s.yearTo ?? SOI_LAST, SOI_LAST), y0);
    const a = years.find((r) => r.year === y0), z = years.find((r) => r.year === y1);
    if (!a || !z || a === z) throw new Unanswerable(`Household giving trends need two tax years between ${SOI_FIRST} and ${SOI_LAST}.`);
    const gr = val(z) / Math.max(1e-9, val(a)) - 1;
    const realG = hm === "dollars" ? realGrowth(inf, gr, y0, y1) : null;
    const tcja = y0 < 2018 && y1 >= 2018;
    return {
      ...common,
      headline: `${cap(what)} ${inW} ${grewText(gr, realG, "rose")} from ${y0} to ${y1}${tcja ? `, as itemizers went from ${(a.itemizers / 1e6).toFixed(1)}M to ${(z.itemizers / 1e6).toFixed(1)}M after the 2017 tax law` : ""}`,
      numbers: [{ value: signed(gr), label: `${y0} to ${y1}` }, ...(realG != null ? [{ value: signed(realG), label: `after inflation (${inf!.base} dollars)` }] : []), { value: fmt(val(z)), label: `${y1}` }],
      bullets: [`${b(int(a.claim_n))} returns claimed it in ${y0}, ${b(int(z.claim_n))} in ${y1}`, `${b(pct(a.claim_usd / Math.max(1, a.agi)))} of AGI in ${y0}, ${b(pct(z.claim_usd / Math.max(1, z.agi)))} in ${y1}`],
      chart: { title: `Itemized charitable deductions ${inW}, by tax year`, sub: u.title, spec: yearChart }, rows: yearRows,
      method: `${method0}${inf ? inflMethod(inf) : ""}`,
      change: { subject: `${what} ${inW}`, g: gr, from: String(y0), to: String(y1) },
    };
  }

  if (by === "state" || by === "county" || by === "income" || by === "rurality") {
    const p = new P();
    const dim = by === "state" ? "h.state" : by === "county" ? "h.county_fips" : by === "income" ? "h.agi_stub::text" : `CASE WHEN cn.population < ${RURAL_POP} THEN 'rural' WHEN cn.population IS NOT NULL THEN 'urban' ELSE 'unmapped' END`;
    const nameSel = by === "county" ? "min(h.county_name) || ', ' || min(h.state)" : by === "income" ? "min(c.name)" : "NULL";
    const join = by === "income" ? "LEFT JOIN soi_agi_class c ON c.file = 'county' AND c.agi_stub = h.agi_stub" : by === "rurality" ? "LEFT JOIN county_need cn ON cn.county_fips = h.county_fips" : "";
    const plx = by === "rurality" ? { ...pl, area: null } : pl;
    if (by === "rurality" && pl.area) pl.used.add("area");
    const raw = await ctx.q<HhRow>(`Charitable deductions by ${by === "income" ? "AGI class" : by}, ${yr} (IRS SOI)`, `SELECT ${dim} AS k, ${nameSel} AS name, ${sel}
FROM soi_individual_county h ${join} WHERE ${and(base(p, yr, yr, plx))} GROUP BY 1`, p);
    const MIN_RETURNS = 1000; // per-return figures and shares over tiny counties swing on a few returns
    const groups = raw.filter((r) => r.k != null && r.returns > 0 && (by !== "state" || STATE_NAME[r.k]) && (hm === "dollars" || hm === "claims" || by !== "county" || r.returns >= MIN_RETURNS) && r.k !== "unmapped" && !(by === "income" && r.k === "1" && hm === "agi_share")) // no-AGI returns have no share of income
      .map((r) => ({ ...r, label: by === "state" ? stateName(r.k!) : by === "rurality" ? `${cap(r.k!)} counties` : r.name ?? r.k!, v: val(r) }));
    if (!groups.length) throw new Unanswerable(`No IRS individual return data for ${where} by ${by}.`);
    const ordered = by === "income" ? [...groups].sort((a, z) => Number(a.k) - Number(z.k)) : [...groups].sort((a, z) => (s.order === "least" ? a.v - z.v : z.v - a.v));
    const ranked = by === "income" ? [...groups].sort((a, z) => z.v - a.v) : ordered;
    const top = ranked[0], low = ranked.at(-1)!;
    const total = groups.reduce((a, r) => a + r.claim_usd, 0);
    const shown = by === "income" || by === "rurality" ? ordered : ordered.slice(0, 15);
    const isMoney = hm === "dollars";
    const cu = isMoney ? unit(Math.max(...shown.map((g) => g.v), 1)) : null;
    if (by === "county" && hm !== "dollars" && hm !== "claims") caveats.push(`Counties with fewer than ${int(MIN_RETURNS)} returns are left out of per-return rankings.`);
    if (by === "income") caveats.push("Share of income = each class's charitable deductions over all AGI in that class, itemizers or not. Lower-income households rarely itemize, so their share reads far below what surveys find they give.");
    if (by === "state" && s.order !== "least" && !s.perResident && hm === "dollars") caveats.push("Big states lead on dollars. Ask per return or as a share of income to compare states fairly.");
    const most = s.order === "least" ? "lowest" : "highest";
    const headline = by === "income"
      ? `Returns with ${top.label === "No AGI (under $1)" ? "no AGI" : `${top.label} in AGI`} ${hm === "agi_share" ? `gave the largest share of income in charitable deductions: ${fmt(top.v)}` : `had the highest ${what}: ${fmt(top.v)}`}, ${yr}. Lowest: ${low.label}, ${fmt(low.v)}`
      : `${top.label} had the ${most} ${what}${where !== "the US" && by !== "state" ? ` ${inW}` : ""}: ${fmt(top.v)}${isMoney && total ? `, ${pct(top.claim_usd / total)} of the total` : ""}, ${yr}`;
    return {
      ...common,
      headline,
      numbers: (by === "income" ? [top, low] : ranked.slice(0, 3)).map((g) => ({ value: fmt(g.v), label: g.label })).concat(by === "income" ? [{ value: pct(cur.claim_usd / Math.max(1, cur.agi)), label: "all returns" }] : []),
      bullets: [`${b(money(total))} deducted by ${b(int(groups.reduce((a, r) => a + r.claim_n, 0)))} returns, ${yr}`, ...(by === "income" ? [`${b(pct(top.claim_n / Math.max(1, top.returns)))} of ${top.label} returns claimed it, ${b(pct(low.claim_n / Math.max(1, low.returns)))} of ${low.label}`] : [`${b(int(groups.length))} ${by === "state" ? "states and DC" : by === "county" ? "counties" : "groups"} compared`])],
      chart: { title: `${cap(what)} by ${by === "income" ? "income (AGI class)" : by}${where !== "the US" ? ` ${inW}` : ""}, ${yr}`, sub: cu?.title ?? (hm === "agi_share" ? "Share of AGI" : hm === "claims" ? "Returns" : "$"), spec: hbar(shown.map((g) => ({ group: g.label, value: cu ? +(g.v / cu.div).toFixed(3) : hm === "agi_share" ? +g.v.toFixed(5) : +g.v.toFixed(0) })), "group", "value", cu?.title ?? (hm === "agi_share" ? "Share of AGI" : "$"), cu?.fmt ?? (hm === "agi_share" ? ".1%" : hm === "claims" ? ",.0f" : "$,.0f")) },
      rows: ordered.map((g) => ({ key: g.k, name: g.label, returns: g.returns, itemizers: g.itemizers, returns_claiming_charity: g.claim_n, charitable_deductions_usd: g.claim_usd, agi_usd: g.agi, per_return: g.claim_usd / Math.max(1, g.returns), share_of_agi: g.claim_usd / Math.max(1, g.agi) })),
      method: `${method0} Tax year ${yr}, grouped by ${by === "income" ? "AGI class (county file classes)" : by === "rurality" ? `county population (rural = under ${int(RURAL_POP)} residents, Census 2024)` : by}.`,
    };
  }

  // total / share: one tax year, with the trend as context.
  const y17 = years.find((r) => r.year === 2017);
  return {
    ...common,
    headline: hm === "agi_share" || s.metric === "share"
      ? `Itemizers ${inW} deducted ${pct(cur.claim_usd / Math.max(1, cur.agi))} of all income (AGI) for charitable gifts in ${yr}: ${money(cur.claim_usd)}`
      : hm === "per_return" ? `Itemized charitable deductions ${inW} came to ${usd0(cur.claim_usd / Math.max(1, cur.returns))} per tax return in ${yr}: ${money(cur.claim_usd)} in all`
        : `Itemizers ${inW} deducted ${money(cur.claim_usd)} in charitable gifts in ${yr}, on ${pct(claimShare)} of tax returns`,
    numbers: hm === "per_return" ? [{ value: usd0(cur.claim_usd / Math.max(1, cur.returns)), label: `per tax return, ${yr}` }, ...tiles.slice(0, 2)] : hm === "agi_share" ? [{ value: pct(cur.claim_usd / Math.max(1, cur.agi)), label: `of AGI, ${yr}` }, ...tiles.slice(0, 2)] : tiles,
    bullets: [`${b(int(cur.itemizers))} of ${b(int(cur.returns))} returns itemized (${b(pct(cur.itemizers / Math.max(1, cur.returns)))})`,
      ...(y17 && yr >= 2018 ? [`${b(int(y17.claim_n))} returns claimed it in 2017, before the 2017 tax law took effect`] : []),
      `${b(pct(cur.claim_usd / Math.max(1, cur.agi)))} of all AGI, ${b(usd0(cur.claim_usd / Math.max(1, cur.returns)))} per return`],
    chart: { title: `Itemized charitable deductions ${inW}, by tax year`, sub: u.title, spec: yearChart }, rows: yearRows,
    method: `${method0}${inf ? inflMethod(inf) : ""}`,
  };
}

// ---- foundation finances: 990-PF payout and assets (generosity-data 055: foundation_finance_year)
// One row per foundation per tax year (newest return wins). Payout rate = qualifying distributions / net investment
// assets (Part XI line 4 / Part IX line 5), the base the 5% rule uses. Medians, because a foundation with little in
// investments can show a payout rate of 50% or more. Private operating foundations follow a different test, so
// they're left out unless asked for (funderType operating).
const FF_FIRST = 2022, FF_LAST = 2025, FF_FULL = 2024;
const SRC_PF_FIN = { label: "IRS Form 990-PF e-file (Part I, Parts IX to XII: assets, distributable amount, qualifying distributions)", url: "https://www.irs.gov/charities-non-profits/form-990-series-downloads" };
const SRC_SOI_PF = { label: "IRS SOI private foundation statistics, Table 1, tax year 2022", url: "https://www.irs.gov/pub/irs-soi/22pf01ta.xlsx" };
const PAYOUT_RULE = "The 5% rule (Internal Revenue Code section 4942): a private non-operating foundation must pay out its distributable amount, about 5% of the average market value of its investment assets minus excise tax, by the end of the next tax year. Payout above it carries forward five years, so one year under 5% isn't a violation.";
const PAYOUT_DEF = "Payout rate = qualifying distributions (grants, the cost of running charitable activities and program-related investments, Part XI line 4) divided by net investment assets (Part IX line 5, the average market value the 5% rule uses). Grant rate = grants paid (Part I line 25, cash basis) divided by the year-end market value of all assets. It's simpler and runs lower.";
const FF_BY = ["year", "funder_size", "funder_type", "state"];
const FF_TYPE: Record<string, string> = { family_named: "Family-named", operating: "Private operating", trust: "Charitable trusts", company: "Company foundations", other: "Other private foundations" };
type PayRow = { y: number; k: string | null; g?: number; n: number; qd: number; nia: number; gp: number; fmv: number; med: number | null; p25: number | null; p75: number | null; ge5: number; meets: number; da_n: number; med_grant: number | null };
const ffSoiMemo = memo<{ nia: number; qd: number; gp: number } | null>("answer-ff-soi:v1", 2, 3600_000);
async function foundationPayout(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const op = s.funderType === "operating";
  const by = s.metric === "trend" ? "year" : s.metric === "by_state" ? "state" : s.metric === "breakdown" ? (s.by ?? "funder_size") : s.by && FF_BY.includes(s.by) ? s.by : null;
  if (by && !FF_BY.includes(by)) throw new Unanswerable(`Foundation payout splits by year, foundation size, foundation type or state, not by ${BY_TITLE[by] ?? by}.`);
  const want = s.yearTo ?? s.yearFrom ?? FF_FULL;
  const year = Math.min(Math.max(want, FF_FIRST), FF_LAST);
  const y0 = by === "year" ? Math.min(Math.max(s.yearFrom ?? FF_FIRST, FF_FIRST), FF_LAST) : year;
  const y1 = by === "year" ? Math.max(Math.min(s.yearTo ?? FF_FULL, FF_LAST), y0) : year;
  ctx.span = { kind: "pf", from: y0, to: y1, byYear: by === "year" };
  const p = new P();
  const base = (pp: P) => {
    const w = [op ? "f.private_operating" : "NOT coalesce(f.private_operating, false)"];
    if (pl.states.length) w.push(`f.state = ANY(${pp.add(pl.states)}::text[])`);
    if (pl.f.fb) w.push(`f.asset_band BETWEEN ${pp.add(pl.f.fb[0])} AND ${pp.add(pl.f.fb[1])}`);
    if (pl.f.ftype && pl.f.ftype !== "operating") w.push(`f.funder_type = ${pp.add(pl.f.ftype)}`);
    return w;
  };
  const key = by === "funder_size" ? "f.asset_band::text" : by === "funder_type" ? "f.funder_type" : by === "state" ? "f.state" : null;
  const rows = await ctx.q<PayRow>(`Foundation payout, ${y0 === y1 ? y0 : `${y0}–${y1}`}${by && by !== "year" ? `, by ${BY_TITLE[by] ?? by}` : ""}`, `SELECT f.tax_year::int AS y, ${key ?? "NULL::text"} AS k, ${key ? `grouping(${key})` : "1"}::int AS g, count(*)::int AS n,
       sum(coalesce(f.qualifying_distributions, 0))::float8 AS qd, sum(f.net_investment_assets)::float8 AS nia,
       sum(coalesce(f.grants_paid, 0))::float8 AS gp, sum(coalesce(f.fmv_assets, 0))::float8 AS fmv,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY f.payout_rate)::float8 AS med,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY f.payout_rate)::float8 AS p25, percentile_cont(0.75) WITHIN GROUP (ORDER BY f.payout_rate)::float8 AS p75,
       count(*) FILTER (WHERE f.payout_rate >= 0.05)::int AS ge5,
       count(*) FILTER (WHERE f.meets_distributable)::int AS meets, count(*) FILTER (WHERE f.meets_distributable IS NOT NULL)::int AS da_n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY f.grant_rate)::float8 AS med_grant
FROM foundation_finance_year f
WHERE ${and([`f.tax_year BETWEEN ${p.add(y0)} AND ${p.add(y1)}`, "f.net_investment_assets > 0", ...base(p)])}
${key ? `GROUP BY GROUPING SETS ((f.tax_year), (f.tax_year, ${key}))` : "GROUP BY f.tax_year"} ORDER BY 1, 2`, p);
  const tot = new Map<number, PayRow>();
  for (const r of rows) if (r.g === 1) tot.set(r.y, r); // the per-year totals (grouping set without the key)
  const cur = tot.get(y1);
  const who = op ? "private operating foundations" : pl.f.from || "private foundations";
  const whoOne = op ? "private operating foundation" : pl.f.from ? pl.f.from.replace(/s\b/, "") : "private foundation";
  const inW = pl.states.length ? ` in ${pl.label}` : "";
  if (!cur || !cur.n) throw new Unanswerable(`No ${who}${inW} report investment assets on a ${y1} 990-PF in our data.`);
  ctx.honored.add("condition");
  const groups = key ? rows.filter((r) => r.g === 0 && r.y === y1) : [];
  // Benchmark: our 2022 totals against IRS SOI Table 1 (domestic private foundations, trusts excluded).
  const soi = await ffSoiMemo("2022", async () => {
    const r = await db.query(`SELECT (SELECT sum(net_investment_assets) FROM foundation_finances WHERE tax_year = 2022 AND NOT charitable_trust) / (SELECT value FROM benchmarks WHERE source = 'irs_soi_pf' AND measure = 'noncharitable_assets' AND year = 2022 LIMIT 1) AS nia,
      (SELECT sum(qualifying_distributions) FROM foundation_finances WHERE tax_year = 2022 AND NOT charitable_trust) / (SELECT value FROM benchmarks WHERE source = 'irs_soi_pf' AND measure = 'qualifying_distributions' AND year = 2022 LIMIT 1) AS qd,
      (SELECT sum(grants_paid) FROM foundation_finances WHERE tax_year = 2022 AND NOT charitable_trust) / (SELECT value FROM benchmarks WHERE source = 'irs_soi_pf' AND measure = 'grants_paid' AND year = 2022 LIMIT 1) AS gp`);
    const x = r.rows[0];
    return x && x.nia != null ? { nia: Number(x.nia), qd: Number(x.qd), gp: Number(x.gp) } : null;
  });
  const caveats = [PAYOUT_RULE, PAYOUT_DEF,
    op ? "Private operating foundations run their own programs and must spend most of their income on them (a different test), so the 5% line is only a reference here."
      : "Private operating foundations are left out: they follow a different payout test. So are foundations with no investment assets on Part IX.",
    "Medians, not averages: a foundation with little in investments can show a payout rate of 50% or more. The dollar-weighted rate (all qualifying distributions over all net investment assets) leans toward the largest foundations.",
    ...(pl.f.fb ? ["Foundation size = that year's market value of all assets (990-PF item I)."] : []),
    ...(pl.f.ftype && pl.f.ftype !== "operating" ? [pl.f.notes.find((n) => /family|company|trust/i.test(n)) ?? ""] : []).filter(Boolean),
    ...(y1 > FULL.pf ? [`${y1} returns are still arriving, so ${y1} is incomplete.`] : []),
    ...(pl.county || pl.region || pl.area ? ["Foundation finances are placed by state only."] : []),
  ];
  const coverage = [{ label: "Foundations", value: `${int(cur.n)} in ${y1}` }, { label: "Tax years", value: `${FF_FIRST}–${FF_LAST} (${FF_LAST} partial)` },
    ...(soi ? [{ label: "Vs IRS SOI 2022", value: `investment assets ${pct(soi.nia)}, qualifying distributions ${pct(soi.qd)}, grants paid ${pct(soi.gp)} of the SOI totals` }] : [])];
  const method = `Every e-filed 990-PF, one return per foundation per tax year (the newest filed, so amendments win), from IRS e-file XML. ${PAYOUT_DEF} Share at 5% or more = foundations whose payout rate is at least 5%. Met the distributable amount = qualifying distributions at least the Part X line 7 amount for the same year.`;
  const sources = [SRC_PF_FIN, SRC_SOI_PF];
  const yr = (y: number) => yearLabel(y, "pf");
  const medOf = (r: PayRow) => r.med ?? 0;
  const rowOut = (r: PayRow) => ({ tax_year: r.y, ...(r.k != null ? { group: r.k } : {}), foundations: r.n, median_payout_rate: r.med != null ? +r.med.toFixed(4) : null, p25_payout_rate: r.p25 != null ? +r.p25.toFixed(4) : null, p75_payout_rate: r.p75 != null ? +r.p75.toFixed(4) : null,
    share_at_5pct_or_more: +(r.ge5 / Math.max(1, r.n)).toFixed(4), share_met_distributable_amount: +(r.meets / Math.max(1, r.da_n)).toFixed(4), dollar_weighted_payout_rate: +(r.qd / Math.max(1, r.nia)).toFixed(4),
    qualifying_distributions_usd: r.qd, net_investment_assets_usd: r.nia, grants_paid_usd: r.gp, fmv_assets_usd: r.fmv, median_grant_rate: r.med_grant != null ? +r.med_grant.toFixed(4) : null });
  const tiles = (r: PayRow) => [{ value: pct(medOf(r)), label: `median payout rate, ${yr(r.y)}` }, { value: pct(r.ge5 / Math.max(1, r.n)), label: "paid out 5% or more" }, { value: pct(r.qd / Math.max(1, r.nia)), label: "dollar-weighted payout" }];
  const common = { causeNote: "No cause: a 990-PF reports one set of finances per foundation.", caveats, coverage, method, sources, searchQuery: null };

  if (by === "year") {
    const ys = [...tot.values()].sort((a, z) => a.y - z.y);
    const a = ys[0], zLast = ys.at(-1)!;
    if (a === zLast) throw new Unanswerable(`A payout trend needs two tax years between ${FF_FIRST} and ${FF_LAST}.`);
    // Headline end: the newest full year. A partial last year is named on its own line.
    const pe = partialEnd("pf", zLast.y);
    const z = (pe && [...ys].reverse().find((r) => r.y <= FULL.pf && r.y > a.y)) || zLast;
    // Assets of every 990-PF filer (no investment-asset or operating screen), for "how much did assets grow".
    const pa = new P();
    const wa = [`f.tax_year BETWEEN ${pa.add(y0)} AND ${pa.add(y1)}`, ...base(pa).slice(op ? 0 : 1)];
    const assets = await ctx.q<{ y: number; n: number; fmv: number }>("Market value of assets, every 990-PF filer, by tax year", `SELECT f.tax_year::int AS y, count(*)::int AS n, sum(coalesce(f.fmv_assets, 0))::float8 AS fmv
FROM foundation_finance_year f WHERE ${and(wa)} GROUP BY 1 ORDER BY 1`, pa);
    const fa = assets.find((r) => r.y === a.y), fz = assets.find((r) => r.y === z.y);
    const ag = fa && fz && fa.fmv ? fz.fmv / fa.fmv - 1 : null;
    const vals = ys.flatMap((r) => [{ year: yr(r.y), series: "Median foundation", rate: +medOf(r).toFixed(4) }, { year: yr(r.y), series: "Dollar-weighted", rate: +(r.qd / Math.max(1, r.nia)).toFixed(4) }]);
    const sameN = Math.abs(z.n / Math.max(1, a.n) - 1) < 0.1;
    return {
      ...common,
      caveats: [...caveats, `Each year counts the foundations that filed for it (${int(a.n)} in ${a.y}, ${int(zLast.n)} in ${zLast.y}), not a fixed set.${zLast.y > FULL.pf ? ` ${zLast.y} is partial and leans to early filers.` : ""}`, ...(ag != null ? ["Asset totals are year-end market values, so they move with the stock market as much as with new gifts."] : [])],
      headline: `The median ${whoOne}${inW} paid out ${pct(medOf(a))} of its investment assets in ${yr(a.y)} and ${pct(medOf(z))} in ${yr(z.y)}. ${pct(a.ge5 / Math.max(1, a.n))} paid out 5% or more in ${a.y}, ${pct(z.ge5 / Math.max(1, z.n))} in ${z.y}`,
      numbers: [{ value: pct(medOf(z)), label: `median payout rate, ${yr(z.y)}` }, { value: pct(z.ge5 / Math.max(1, z.n)), label: `paid out 5% or more, ${yr(z.y)}` },
        ...(ag != null && sameN ? [{ value: signed(ag), label: `assets ${a.y} to ${z.y} (${money(fz!.fmv)})` }] : [{ value: pct(z.qd / Math.max(1, z.nia)), label: `dollar-weighted payout, ${yr(z.y)}` }])],
      bullets: [`Dollar-weighted payout: ${b(pct(a.qd / Math.max(1, a.nia)))} in ${a.y}, ${b(pct(z.qd / Math.max(1, z.nia)))} in ${z.y}`,
        ...(pe && z !== zLast ? [partialLine(pe, z.y), `Median payout in ${zLast.y} so far: ${b(pct(medOf(zLast)))}`] : []),
        ...(ag != null ? [`Assets of all filers: ${b(money(fa!.fmv))} in ${a.y}, ${b(money(fz!.fmv))} in ${z.y}`] : [])],
      chart: { title: `Foundation payout rate${inW}, by tax year`, sub: "Qualifying distributions as a share of net investment assets", spec: vbar(vals, "year", "rate", "Tax year", "Payout rate", ".1%", "series") },
      rows: ys.map((r) => ({ ...rowOut(r), all_filers_fmv_assets_usd: assets.find((x) => x.y === r.y)?.fmv ?? null })),
    };
  }

  if (by) {
    const name = (k: string | null) => by === "funder_size" ? F_NAMES[Number(k) - 1] ?? "Unknown" : by === "funder_type" ? FF_TYPE[k ?? ""] ?? k ?? "Unknown" : stateName(k ?? "");
    let gs = groups.filter((r) => r.k != null && r.n >= (by === "state" ? 30 : 1));
    if (by === "state") gs = gs.sort((x, y) => (s.order === "least" ? medOf(x) - medOf(y) : medOf(y) - medOf(x)));
    if (!gs.length) throw new Unanswerable(`Too few ${who} to split by ${BY_TITLE[by] ?? by}.`);
    const hi = gs.reduce((m, r) => (medOf(r) > medOf(m) ? r : m)), lo = gs.reduce((m, r) => (medOf(r) < medOf(m) ? r : m));
    const shown = by === "state" ? gs.slice(0, 15) : gs;
    return {
      ...common,
      caveats: by === "state" ? [...caveats, "States with fewer than 30 foundations reporting investment assets are left out. A foundation is placed in the state of its IRS address."] : caveats,
      headline: by === "state"
        ? `${name(gs[0].k)} foundations have the ${s.order === "least" ? "lowest" : "highest"} median payout rate in ${yr(y1)}, ${pct(medOf(gs[0]))}, against ${pct(medOf(cur))} for all ${who}`
        : `In ${yr(y1)} the median payout rate ran from ${pct(medOf(lo))} (${name(lo.k)}) to ${pct(medOf(hi))} (${name(hi.k)}) across ${BY_TITLE[by] ?? by}. ${pct(cur.ge5 / Math.max(1, cur.n))} of all ${who}${inW} paid out 5% or more`,
      numbers: tiles(cur),
      bullets: gs.slice(0, 2).map((r) => `${name(r.k)}: median ${b(pct(medOf(r)))}, ${b(pct(r.ge5 / Math.max(1, r.n)))} at 5% or more (${int(r.n)} foundations)`),
      chart: { title: `Median foundation payout rate${inW}, ${yr(y1)}, by ${BY_TITLE[by] ?? by}`, sub: "Qualifying distributions as a share of net investment assets",
        spec: hbar(shown.map((r) => ({ group: name(r.k), rate: +medOf(r).toFixed(4) })), "group", "rate", "Median payout rate", ".1%") },
      rows: gs.map((r) => ({ ...rowOut(r), group: name(r.k) })),
    };
  }

  // One year: are foundations paying out 5%? With the split by size as the chart.
  const pz = new P();
  const sz = await ctx.q<PayRow>(`Foundation payout by asset size, ${y1}`, `SELECT f.tax_year::int AS y, f.asset_band::text AS k, count(*)::int AS n, 0::float8 AS qd, 0::float8 AS nia, 0::float8 AS gp, 0::float8 AS fmv,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY f.payout_rate)::float8 AS med, NULL::float8 AS p25, NULL::float8 AS p75,
       count(*) FILTER (WHERE f.payout_rate >= 0.05)::int AS ge5, 0 AS meets, 0 AS da_n, NULL::float8 AS med_grant
FROM foundation_finance_year f WHERE ${and([`f.tax_year = ${pz.add(y1)}`, "f.net_investment_assets > 0", ...base(pz)])} GROUP BY 1, 2 ORDER BY 2`, pz);
  return {
    ...common,
    headline: `In ${yr(y1)} the median ${whoOne}${inW} paid out ${pct(medOf(cur))} of its investment assets, and ${pct(cur.ge5 / Math.max(1, cur.n))} paid out 5% or more`,
    numbers: tiles(cur),
    bullets: [`${b(pct(cur.meets / Math.max(1, cur.da_n)))} met that year's distributable amount on time`, `Half paid out between ${b(pct(cur.p25 ?? 0))} and ${b(pct(cur.p75 ?? 0))}`,
      `Median grants paid: ${b(pct(cur.med_grant ?? 0))} of year-end assets`],
    chart: { title: `Median foundation payout rate${inW}, ${yr(y1)}, by asset size`, sub: "Qualifying distributions as a share of net investment assets",
      spec: hbar(sz.filter((r) => r.k != null).map((r) => ({ size: F_NAMES[Number(r.k) - 1] ?? "Unknown", rate: +(r.med ?? 0).toFixed(4) })), "size", "rate", "Median payout rate", ".1%") },
    rows: [rowOut(cur), ...sz.filter((r) => r.k != null).map((r) => ({ tax_year: r.y, group: F_NAMES[Number(r.k) - 1] ?? "Unknown", foundations: r.n, median_payout_rate: r.med != null ? +r.med.toFixed(4) : null, share_at_5pct_or_more: +(r.ge5 / Math.max(1, r.n)).toFixed(4) }))],
  };
}

// ---- nonprofit finance panel: deficits, cash and government reliance by year or by size (generosity-data 056)
// org_finance_year: one row per org per tax year, from its own 990 / 990-EZ or, for a year with no return of its
// own, the next year's Form 990 prior-year column (revenue and expenses only). Year-to-year comparisons use Form
// 990 filers only (990-EZ has no prior-year column), with the same-organizations panel alongside.
type FinRow = { k: number; n: number; of_n: number; hits: number; p_of: number; p_hits: number; med_cash: number | null };
async function orgFinanceBy(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const by = s.by === "recipient_size" ? "recipient_size" : "year";
  const cond = s.condition ?? "deficit";
  const N = cond === "deficit" && s.streak >= 2 ? s.streak : 0;
  const c = s.causes[0] ?? null;
  const p = new P();
  const cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
  const hit = N ? `f.deficit_streak >= ${p.add(N)}` : cond === "deficit" ? "f.deficit" : cond === "surplus" ? "NOT f.deficit" : cond === "low_cash" ? "f.low_cash"
    : "f.revenue > 0 AND coalesce(f.government_grants, 0) >= 0.5 * f.revenue";
  // A streak is counted only where the org has a row for each of the N years ending that year (run_n, below).
  const of = N ? "f.run_n = " + p.add(N) : cond === "low_cash" ? "f.months_cash IS NOT NULL" : cond === "gov_reliant" ? "f.source = 'filing' AND f.form = '990'" : "f.revenue IS NOT NULL AND f.expenses IS NOT NULL";
  const what = cond === "deficit" ? (N ? `ran deficits ${N} years in a row` : "ran a deficit") : cond === "surplus" ? "broke even or ran a surplus" : cond === "low_cash" ? "had under 3 months of cash" : "got half or more of revenue from government grants";
  const subj = `${c ? orgsOf(c.name) : "nonprofits"}${pl.f.rb && by === "year" ? ` (${pl.f.to.replace(/^organizations /, "")})` : ""}`;
  const inW = pl.label === "the US" ? "" : ` in ${pl.label}`;
  const caveats: string[] = [];
  const note = await causeNote(c, cs, caveats);
  ctx.honored.add("condition");
  if (N) ctx.honored.add("streak");
  const common0 = ["coalesce(f.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "f.state", "f.county_fips")];
  let rows: FinRow[];
  let y0: number, y1: number;
  if (by === "year") {
    const firstY = cond === "low_cash" || cond === "gov_reliant" ? 2023 : FF_FIRST + Math.max(N - 1, 0); // cash and government grants come only from each year's own return
    y0 = Math.min(Math.max(s.yearFrom ?? firstY, firstY), F_LAST);
    y1 = Math.max(Math.min(s.yearTo ?? F_FULL, F_LAST), y0);
    if (y0 === y1) y0 = Math.max(firstY, y1 - 1);
    const nY = p.add(y1 - y0 + 1), py0 = p.add(y0);
    rows = await ctx.q<FinRow>(`Form 990 filers by tax year, and the same organizations every year`, `WITH x AS (
  SELECT f.*, count(*) FILTER (WHERE f.tax_year >= ${py0}) OVER (PARTITION BY f.ein) AS yrs,
         count(*) OVER (PARTITION BY f.ein ORDER BY f.tax_year RANGE BETWEEN ${Math.max(N - 1, 0)} PRECEDING AND CURRENT ROW) AS run_n
  FROM org_finance_year f ${cs.join}
  WHERE ${and([`f.tax_year BETWEEN ${p.add(y0 - Math.max(N - 1, 0))} AND ${p.add(y1)}`, "f.form = '990'", ...common0, ...filtEin(pl.f, p, "f.ein")])})
SELECT f.tax_year::int AS k, count(*)::int AS n, count(*) FILTER (WHERE ${of})::int AS of_n, count(*) FILTER (WHERE ${of} AND ${hit})::int AS hits,
       count(*) FILTER (WHERE f.yrs = ${nY} AND ${of})::int AS p_of, count(*) FILTER (WHERE f.yrs = ${nY} AND ${of} AND ${hit})::int AS p_hits,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY f.months_cash)::float8 AS med_cash
FROM x f WHERE f.tax_year >= ${py0} GROUP BY 1 ORDER BY 1`, p);
  } else {
    y0 = y1 = flagYear(s).year;
    rows = await ctx.q<FinRow>(`Filers in ${y1} by revenue size`, `SELECT f.revenue_band::int AS k, count(*)::int AS n, count(*) FILTER (WHERE ${of})::int AS of_n, count(*) FILTER (WHERE ${of} AND ${hit})::int AS hits,
       0 AS p_of, 0 AS p_hits, percentile_cont(0.5) WITHIN GROUP (ORDER BY f.months_cash)::float8 AS med_cash
FROM org_finance_year f ${cs.join}
WHERE ${and([`f.tax_year = ${p.add(y1)}`, "f.source = 'filing'", "f.revenue_band IS NOT NULL", ...common0])}
GROUP BY 1 ORDER BY 1`, p);
  }
  rows = rows.filter((r) => r.of_n > 0);
  ctx.span = { kind: "f990", from: by === "year" && rows.length ? rows[0].k : y0, to: by === "year" && rows.length ? rows.at(-1)!.k : y1, byYear: by === "year" };
  if (!rows.length) throw new Unanswerable(`No ${subj}${inW} have e-filed finances for ${y0 === y1 ? y0 : `${y0}–${y1}`} in our data.`);
  const sh = (r: FinRow) => r.hits / Math.max(1, r.of_n), psh = (r: FinRow) => r.p_hits / Math.max(1, r.p_of);
  const cashTxt = (x: number | null) => (x == null ? "n/a" : `${x.toFixed(1)} months`);
  caveats.push(...(N ? [`${N} years in a row = a deficit in this year and the ${N - 1 === 1 ? "year" : `${N - 1} years`} right before it, counted among orgs with finances for all ${N} years.`] : []),
    ...(cond === "low_cash" ? ["Cash = cash and savings on the balance sheet, not investments. Large organizations such as hospitals and universities keep reserves in investments, so their months of cash read low."] : []),
    "One deficit year isn't a red flag by itself: an org may be spending down savings on purpose, or a big grant may have arrived the year before.",
    ...(cond === "gov_reliant" ? [GOV_CAVEAT] : []));
  const sources = [SRC.f990, SRC.bmf];
  const method0 = `Nonprofit finance panel (one row per organization per tax year, private foundations excluded): each org's own e-filed return for the year, newest filing first. Deficit = expenses above revenue. Months of cash = cash and savings divided by a month of expenses. Thin cash = under 3 months.`;
  if (by === "year") {
    const a = rows[0], zLast = rows.at(-1)!;
    // Headline end: the newest full year. A partial last year is named on its own line.
    const pe = partialEnd("f990", zLast.k);
    const z = (pe && [...rows].reverse().find((r) => r.k <= FULL.f990 && r.k > a.k)) || zLast;
    caveats.unshift(`Year-to-year shares use Form 990 filers only. A year with no return of its own is filled from the next year's Form 990 prior-year column (revenue and expenses, not cash), so the mix of orgs changes by year. The same-organizations line keeps only the ${int(z.p_of)} orgs with a Form 990 every year shown.`,
      ...(y1 > FULL.f990 ? [`${y1} returns are still arriving and lean to early filers.`] : []),
      ...(y0 <= 2022 ? ["2022 counts fewer orgs: it comes mostly from 2023 returns' prior-year column, and 2023 returns are only partly loaded."] : []));
    const vals = rows.flatMap((r) => [{ year: yearLabel(r.k, "f990"), series: "All Form 990 filers", share: +sh(r).toFixed(4) }, ...(r.p_of ? [{ year: yearLabel(r.k, "f990"), series: "Same orgs every year", share: +psh(r).toFixed(4) }] : [])]);
    return {
      headline: `${pct(sh(a))} of ${subj}${inW} filing Form 990 ${what} in ${a.k}, ${pct(sh(z))} in ${z.k}${z.p_of ? `. Among the same ${int(z.p_of)} orgs every year: ${pct(psh(a))} to ${pct(psh(z))}` : ""}`,
      numbers: [{ value: pct(sh(z)), label: `${what}, ${z.k}` }, { value: pct(sh(a)), label: `${a.k}` }, ...(cond === "low_cash" && z.med_cash != null ? [{ value: cashTxt(z.med_cash), label: `median cash, ${z.k}` }] : [{ value: int(z.of_n), label: `Form 990 filers, ${z.k}` }])],
      bullets: rows.slice(1).filter((r) => r !== z).map((r) => `${r.k}${r.k > FULL.f990 ? " (partial)" : ""}: ${b(pct(sh(r)))} of ${b(int(r.of_n))} filers`)
        .concat(pe && z !== zLast ? [`${partialLine(pe, z.k)}`] : []).concat(z.med_cash != null && cond !== "low_cash" ? [`Median cash in ${z.k}: ${b(cashTxt(z.med_cash))} of expenses`] : []),
      chart: { title: `Share of ${subj}${inW} that ${what}, by tax year`, sub: "Form 990 filers", spec: vbar(vals, "year", "share", "Tax year", "Share of filers", ".0%", "series") },
      rows: rows.map((r) => ({ tax_year: r.k, filers: r.of_n, met_condition: r.hits, share: +sh(r).toFixed(4), same_orgs_filers: r.p_of, same_orgs_met: r.p_hits, same_orgs_share: r.p_of ? +psh(r).toFixed(4) : null, median_months_cash: r.med_cash != null ? +r.med_cash.toFixed(2) : null })),
      causeNote: note, caveats, coverage: [{ label: "Tax years", value: `${y0}–${y1}` }, { label: "Form 990 filers", value: `${int(z.of_n)} in ${z.k}` }],
      method: method0, sources, searchQuery: searchFor(s, pl),
    };
  }
  const tot = rows.reduce((t, r) => ({ of: t.of + r.of_n, hits: t.hits + r.hits }), { of: 0, hits: 0 });
  const small = rows[0], big = rows.at(-1)!;
  const name = (k: number) => R_NAMES[k - 1] ?? "Unknown";
  const lc = (k: number) => { const x = name(k); return x.charAt(0).toLowerCase() + x.slice(1); };
  return {
    headline: cond === "low_cash"
      ? `In ${y1}, ${subj}${inW} with ${lc(small.k)} in revenue had a median of ${cashTxt(small.med_cash)} of cash, against ${cashTxt(big.med_cash)} for those with ${lc(big.k)}. ${pct(tot.hits / Math.max(1, tot.of))} of all had under 3 months`
      : `In ${y1}, ${pct(sh(small))} of ${subj}${inW} with ${lc(small.k)} in revenue ${what}, against ${pct(sh(big))} of those with ${lc(big.k)}`,
    numbers: [{ value: pct(tot.hits / Math.max(1, tot.of)), label: `of all filers ${what}` }, { value: pct(sh(small)), label: name(small.k) }, { value: pct(sh(big)), label: name(big.k) }],
    bullets: rows.filter((r) => r !== small && r !== big).slice(0, 2).map((r) => `${name(r.k)}: ${b(pct(sh(r)))}, median cash ${b(cashTxt(r.med_cash))}`),
    chart: { title: `Share of ${subj}${inW} that ${what}, ${y1}, by revenue`, sub: "Filers with e-filed finances", spec: hbar(rows.map((r) => ({ size: name(r.k), share: +sh(r).toFixed(4) })), "size", "share", "Share of filers", ".0%") },
    rows: rows.map((r) => ({ revenue_band: name(r.k), filers: r.of_n, met_condition: r.hits, share: +sh(r).toFixed(4), median_months_cash: r.med_cash != null ? +r.med_cash.toFixed(2) : null })),
    causeNote: note, caveats: [`Revenue size = that year's revenue on the org's own Form 990 or 990-EZ. 990-N filers (under $50K) have no finances here.`, ...caveats],
    coverage: [{ label: "Tax year", value: String(y1) }, { label: "Filers", value: int(tot.of) }],
    method: method0, sources, searchQuery: searchFor(s, pl),
  };
}

// ---- financial health (Joshua Elder, Oct 19: diligence from 990s): indicators, never a rating (lib/financialHealth)
// One org (spec.ein): its full filing years, flags and peers. A cause: its orgs' deficit streaks or cash, the largest
// listed with their indicators, and peer medians (months of cash, program ratio) by revenue band.
export type HealthPick = { ein: string; name: string; city: string; state: string; tax_year: number; revenue: number; years: number; deficit_years: number;
  consecutive_deficits: number; deficit_total: number; months_cash: number | null; program_ratio: number | null; liabilities_to_assets: number | null; government_share: number | null; flags: string[] };
const qlog = (ctx: Ctx): QueryLog => (title, sql, vals) => { ctx.queries.push({ title, sql: inline(sql, vals) }); };
const lcFirst = (x: string) => (/^[A-Z][a-z]/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x);
const pctR = (x: number | null) => (x == null ? "n/a" : `${Math.round(x * 100)}%`);

async function orgHealthAnswer(ctx: Ctx, s: Spec): Promise<Out> {
  const full = FULL.f990;
  const h = await orgFinancialHealth(s.ein!, full, { log: qlog(ctx) });
  if (!h) throw new Unanswerable(`We couldn't find an organization with EIN ${s.ein} in the IRS master file.`);
  const name = orgName(h.name);
  const partialNote = h.partial_return ? `Its ${h.partial_return} return is in, but ${h.partial_return} returns are still arriving for most orgs, so that year isn't counted.` : null;
  if (!h.years.length) throw new Unanswerable(`${name} has no e-filed Form 990 or 990-EZ for tax years ${h.window.from} to ${h.window.to} in our data. 990-N filers (under $50K in receipts) and orgs filing on paper report no finances here.${partialNote ? ` ${partialNote}` : ""}`);
  const ys = h.years, first = ys[0], last = ys.at(-1)!;
  ctx.span = { kind: "f990", from: first.year, to: last.year, byYear: true };
  const own = [...ys].reverse().find((y) => y.source === "filing");
  const cashY = [...ys].reverse().find((y) => y.months_cash != null);
  const progY = [...ys].reverse().find((y) => y.program_ratio != null);
  const n = ys.length, d = h.deficit_years;
  const lead = h.flags.length ? h.flags.slice(0, 2).map(lcFirst).join(", ")
    : `${d ? `a deficit in ${d} of ${n} years` : `no deficit in ${n === 1 ? "its one full year" : `${n} full years`} (${yrs(first.year, last.year)})`}${cashY ? `, ${monthsText(cashY.months_cash)} of cash in ${cashY.year}` : ""}`;
  const pe = h.peers;
  const caveats = [...HEALTH_CAVEATS, ...(partialNote ? [partialNote] : []), ...h.notes.map((x) => `${x}.`),
    ...(ys.some((y) => y.form === "990EZ") ? ["Some years are 990-EZ returns, so cash, unrestricted net assets, cost to raise $1 and government share are blank for them."] : []),
    ...(ys.some((y) => y.source === "prior_year") ? [`${listYears(ys.filter((y) => y.source === "prior_year").map((y) => y.year))} ${ys.filter((y) => y.source === "prior_year").length > 1 ? "come" : "comes"} from the next year's Form 990 prior-year column: revenue, expenses and assets only.`] : [])];
  const u = unit(Math.max(...ys.map((y) => Math.max(y.revenue, y.expenses)), 1));
  const chartVals = ys.flatMap((y) => [{ year: String(y.year), series: "Revenue", amount: +(y.revenue / u.div).toFixed(3) }, { year: String(y.year), series: "Expenses", amount: +(y.expenses / u.div).toFixed(3) }]);
  const bullets = [
    ...(pe && pe.median_months_cash != null ? [`Peers its size (${pe.band_name}, NTEE ${pe.ntee}, ${int(pe.n)} orgs): median ${b(monthsText(pe.median_months_cash))} of cash`] : []),
    ...(pe && pe.median_program_ratio != null ? [`Peers' median program ratio: ${b(pctR(pe.median_program_ratio))} of expenses`] : []),
    ...(own && own.fundraising_per_dollar != null ? [`Fundraising cost ${b(`$${own.fundraising_per_dollar.toFixed(2)}`)} per $1 of gifts and grants, ${own.year}`] : []),
    ...(own && own.liabilities_to_assets != null ? [`Liabilities ${b(pctR(own.liabilities_to_assets))} of assets, ${own.year}`] : []),
  ];
  return {
    headline: `${name}: ${lead}`,
    numbers: [
      { value: `${d} of ${n}`, label: `years with a deficit, ${yrs(first.year, last.year)}` },
      ...(cashY ? [{ value: monthsText(cashY.months_cash), label: `of cash, ${cashY.year}`, ...(pe?.median_months_cash != null ? { note: `Peers' median: ${monthsText(pe.median_months_cash)}` } : {}) }] : []),
      ...(progY ? [{ value: pctR(progY.program_ratio), label: `of expenses on programs, ${progY.year}`, ...(pe?.median_program_ratio != null ? { note: `Peers' median: ${pctR(pe.median_program_ratio)}` } : {}) }] : []),
    ],
    bullets,
    chart: { title: `Revenue and expenses by tax year: ${name}`, sub: u.title, spec: vbar(chartVals, "year", "amount", "Tax year", u.title, u.fmt, "series") },
    rows: healthJson(h).years.map((y) => ({ ...y })),
    health: h, orgCount: 1,
    causeNote: `One organization: ${name} (EIN ${h.ein}).`,
    caveats: [HEALTH_NOTE, ...caveats],
    coverage: [{ label: "Tax years", value: `${yrs(first.year, last.year)} (${n} full ${n === 1 ? "year" : "years"})` }, { label: "Newest full year", value: String(full) }, ...(pe ? [{ label: "Peers", value: `${int(pe.n)} orgs, NTEE ${pe.ntee}, ${pe.band_name}, ${pe.year}` }] : [])],
    method: `${HEALTH_METHOD} Window: the 5 tax years up to ${full}, the newest full year (a later year with under 90% of the fullest year's returns is partial and left out). Deficits in a row count back from the newest year shown, and a missing year breaks the run. Peers = own Form 990s of 501(c)(3) public charities in the same NTEE code (else major group) and revenue band, same tax year, 20 or more orgs.`,
    sources: [SRC.f990, SRC.bmf], searchQuery: h.name,
  };
}

type HealthBand = { band: number | null; n: number; mc: number | null; mp: number | null; dshare: number };
async function causeHealth(ctx: Ctx, s: Spec, pl: Place): Promise<Out> {
  const c = (s.causes[0] ?? null) as C | null;
  const y1 = FULL.f990, y0 = y1 - 4;
  const cond = s.condition === "deficit" || s.condition === "low_cash" ? s.condition : null;
  const N = cond === "deficit" ? Math.max(s.streak || 1, 1) : 1;
  if (cond) ctx.honored.add("condition");
  if (cond === "deficit" && s.streak) ctx.honored.add("streak");
  const base = (p: P) => {
    const cs = causeSql(c, p, "f.ein", "f.ntee_cd", "", true);
    return { cs, where: ["f.subsection = '03'", "coalesce(f.foundation, '') NOT IN ('02', '03', '04')", ...cs.where, ...placeWhere(pl, p, "f.state", "f.county_fips"), ...filtEin(pl.f, p, "f.ein")] };
  };
  // Thin cash, as in the org flags: under 3 months of cash and no larger unrestricted reserves (unrestricted net assets
  // under 3 months too, or not reported). Endowed museums and orchestras hold reserves in investments (Oct 21 grade).
  const hit = cond === "deficit" ? `k.deficit_streak >= ${N}` : cond === "low_cash" ? "k.form = '990' AND k.source = 'filing' AND k.cash IS NOT NULL AND k.expenses > 0 AND k.cash * 12.0 / k.expenses < 3 AND (k.una IS NULL OR k.una * 12.0 / k.expenses < 3)" : "false";
  const panel = cond === "low_cash" ? "k.form = '990' AND k.source = 'filing' AND k.cash IS NOT NULL AND k.expenses > 0" : `k.run_n >= ${N}`;
  const p1 = new P(), b1 = base(p1);
  const [py0, py1] = [p1.add(y0), p1.add(y1)];
  const sel = ctx.q<{ orgs: number; panel: number; hits: number; top: { ein: string; revenue: number }[] | null }>(
    `${cond === "deficit" ? `Orgs whose newest full year ends ${N === 1 ? "in a deficit" : `${N} deficit years in a row`}` : cond === "low_cash" ? "Orgs with under 3 months of cash in their newest full year" : "Orgs with full-year finances"}, largest first`,
    `WITH y AS (
  SELECT f.ein, f.tax_year, f.form, f.source, f.revenue, f.expenses, f.cash, f.unrestricted_net_assets AS una, f.deficit_streak,
         count(*) OVER (PARTITION BY f.ein ORDER BY f.tax_year RANGE BETWEEN ${N - 1} PRECEDING AND CURRENT ROW) AS run_n,
         row_number() OVER (PARTITION BY f.ein ORDER BY f.tax_year DESC) AS rn
  FROM org_finance_year f ${b1.cs.join}
  WHERE ${and([`f.tax_year BETWEEN ${py0} AND ${py1}`, "f.revenue IS NOT NULL", "f.expenses IS NOT NULL", ...b1.where])}),
k AS (SELECT * FROM y WHERE rn = 1 AND tax_year >= ${py1} - 1)
SELECT count(*)::int AS orgs, count(*) FILTER (WHERE ${panel})::int AS panel, count(*) FILTER (WHERE ${panel} AND ${hit})::int AS hits,
  (SELECT json_agg(x) FROM (SELECT k.ein, k.revenue FROM k WHERE ${panel}${cond ? ` AND ${hit}` : ""} AND k.revenue > 0 ORDER BY k.revenue DESC, k.ein LIMIT 25) x) AS top
FROM k`, p1);
  const p2 = new P(), b2 = base(p2);
  const bands = ctx.q<HealthBand>(`Peer medians by revenue band: own Form 990s, tax year ${y1}`, `SELECT f.revenue_band::int AS band, count(*)::int AS n,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY f.cash * 12.0 / f.expenses) FILTER (WHERE f.cash IS NOT NULL))::float8 AS mc,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY ff.program_expenses::float8 / f.expenses) FILTER (WHERE ff.program_expenses IS NOT NULL))::float8 AS mp,
  avg(f.deficit::int)::float8 AS dshare
FROM org_finance_year f JOIN filing_flag ff ON ff.object_id = f.object_id ${b2.cs.join}
WHERE ${and([`f.tax_year = ${p2.add(y1)}`, "f.source = 'filing'", "f.form = '990'", "f.expenses > 0", ...b2.where])}
GROUP BY GROUPING SETS ((f.revenue_band), ()) ORDER BY 1 NULLS LAST`, p2);
  const [[r], bandRows] = await Promise.all([sel, bands]);
  const caveats: string[] = [];
  const note = await causeNote(c, b1.cs, caveats);
  const what = c ? orgsOf(causeName(c, pl)) : `nonprofits${pl.f.rb ? ` (${pl.f.to.replace(/^organizations /, "")})` : ""}`;
  const inW = pl.label === "the US" ? "" : ` in ${pl.label}`;
  if (!r?.orgs) throw new Unanswerable(`No ${what}${inW} have e-filed Form 990 or 990-EZ finances for ${y1 - 1} or ${y1} in our data.`);
  if (cond === "deficit" && !r.panel) throw new Unanswerable(`None of these ${what}${inW} has ${N} straight full years of returns in our data. Form 990 data here starts with tax year ${y0 + 2} for most orgs, so 3 years in a row is the most it can show.`);
  // The listed orgs, recomputed one by one with the org-level rules (the same figures as their org pages).
  const top = (r.top ?? []).map((t) => t.ein);
  const log = qlog(ctx);
  const healths = await Promise.all(top.map((e, i) => orgFinancialHealth(e, y1, { peers: false, log: i === 0 ? (t, q, v) => log(`${t}, for each listed org (first shown)`, q, v) : undefined })));
  const where = await db.query(`SELECT ein, city FROM orgs WHERE ein = ANY($1::text[])`, [top]);
  const city = new Map(where.rows.map((x) => [x.ein as string, (x.city as string | null) ?? ""]));
  const picks: HealthPick[] = healths.filter((h): h is OrgHealth => !!h && h.years.length > 0).filter((h) => {
    if (cond === "deficit") return h.consecutive_deficits >= N;
    if (cond === "low_cash") { const l = [...h.years].reverse().find((y) => y.source === "filing"); return l?.months_cash != null && l.months_cash < 3 && (l.months_unrestricted == null || l.months_unrestricted < 3); }
    return true;
  }).slice(0, UF_SHOW).map((h) => {
    const l = h.years.at(-1)!, lo = [...h.years].reverse().find((y) => y.source === "filing");
    const run = h.years.slice(h.years.length - h.consecutive_deficits);
    return { ein: h.ein, name: orgName(h.name), city: city.get(h.ein) ?? "", state: h.state ?? "", tax_year: l.year, revenue: l.revenue, years: h.years.length, deficit_years: h.deficit_years,
      consecutive_deficits: h.consecutive_deficits, deficit_total: run.reduce((t, y) => t + Math.min(0, y.surplus), 0),
      months_cash: lo?.months_cash != null ? +lo.months_cash.toFixed(2) : null, program_ratio: lo?.program_ratio != null ? +lo.program_ratio.toFixed(3) : null,
      liabilities_to_assets: lo?.liabilities_to_assets != null ? +lo.liabilities_to_assets.toFixed(3) : null, government_share: lo?.government_share != null ? +lo.government_share.toFixed(3) : null, flags: h.flags };
  });
  const all = bandRows.find((x) => x.band == null);
  const byBand = bandRows.filter((x) => x.band != null && x.n >= 5);
  ctx.span = { kind: "f990", from: cond === "deficit" ? y1 - N + 1 : y1 - 1, to: y1, byYear: false };
  caveats.unshift(HEALTH_NOTE, ...HEALTH_CAVEATS.slice(0, 4));
  caveats.push(`Each org's newest full year is ${y1 - 1} or ${y1}. Orgs whose newest return is older are left out.`, "Peer medians use own Form 990s only: 990-EZ reports cash together with investments, so it isn't comparable.");
  if (cond === "deficit" && N >= 2) caveats.push(`${N} years in a row = deficits in the org's newest full year and the ${N - 1 === 1 ? "year" : `${N - 1} years`} right before it. Counted among the ${int(r.panel)} orgs with all ${N} years in our data. Form 990 data here starts with tax year ${y0 + 2} for most orgs.`);
  const share = r.hits / Math.max(1, r.panel);
  const cm = all?.mc ?? null, cp = all?.mp ?? null;
  const headline = cond === "deficit"
    ? `${int(r.hits)} of ${int(r.panel)} ${what}${inW} ${N >= 2 ? `with ${N} straight years of returns ran deficits ${N === 2 ? "both years" : `all ${N} years`}` : "ran a deficit in their newest full year"} (${pct(share)})`
    : cond === "low_cash" ? `${int(r.hits)} of ${int(r.panel)} ${what}${inW} filing Form 990 had under 3 months of cash and no larger unrestricted reserves in their newest full year (${pct(share)})`
      : `${cap(what)}${inW} filing Form 990: median ${monthsText(cm)} of cash and ${pctR(cp)} of expenses on programs in ${y1}`;
  const bandName = (k: number) => FH_BANDS[k - 1];
  const lowest = byBand.filter((x) => x.mc != null).sort((a, z) => a.mc! - z.mc!)[0];
  return {
    headline,
    numbers: [
      ...(cond ? [{ value: int(r.hits), label: cond === "deficit" ? (N >= 2 ? `ran deficits ${N} years in a row` : "ran a deficit") : "under 3 months of cash, no larger reserves" }, { value: pct(share), label: `of ${int(r.panel)} with the years needed` }] : [{ value: int(r.orgs), label: `${what} with full-year finances` }]),
      { value: monthsText(cm), label: `median cash on hand, ${y1}`, note: "Own Form 990s" },
      ...(!cond ? [{ value: pctR(cp), label: `median spent on programs, ${y1}` }] : []),
    ],
    bullets: [
      ...(picks[0] ? [`Largest listed: ${orgName(picks[0].name, 40)}, ${b(money(picks[0].revenue))} revenue in ${picks[0].tax_year}`] : []),
      ...(lowest ? [`Thinnest cash by size: ${lowest.band != null ? bandName(lowest.band) : ""}, median ${b(monthsText(lowest.mc))}`] : []),
      ...(cp != null && cond ? [`Median program ratio ${b(pctR(cp))} of expenses, ${y1}`] : []),
    ],
    chart: byBand.length ? { title: `Median months of cash by revenue size: ${what}${inW}, ${y1}`, sub: "Own Form 990s", spec: hbar(byBand.map((x) => ({ size: bandName(x.band!), months: +(x.mc ?? 0).toFixed(2) })), "size", "months", "Median months of cash", ".1f") } : null,
    rows: [...byBand, ...(all ? [all] : [])].map((x) => ({ revenue_band: x.band != null ? bandName(x.band) : "All sizes", orgs: x.n, median_months_cash: x.mc != null ? +x.mc.toFixed(2) : null, median_program_ratio: x.mp != null ? +x.mp.toFixed(3) : null, share_with_deficit: +x.dshare.toFixed(3) })),
    healthOrgs: picks, orgCount: r.orgs,
    causeNote: note, caveats,
    coverage: [{ label: "Orgs with full-year finances", value: int(r.orgs) }, { label: "Newest full year", value: String(y1) }, { label: "Peer medians", value: `${int(all?.n ?? 0)} own Form 990s, ${y1}` }],
    method: `${HEALTH_METHOD} 501(c)(3) public charities on the IRS master file in the cause set${inW ? `, based in ${pl.label}` : ""} (private foundations left out), with a Form 990 or 990-EZ for ${y1 - 1} or ${y1} (the newest full year, by filings per tax year). ${cond === "deficit" ? `Deficits in a row count back from each org's newest full year, and a missing year breaks the run. ` : cond === "low_cash" ? "Thin cash = under 3 months of cash and unrestricted net assets also under 3 months (or not reported), so orgs with reserves in investments aren't counted. " : ""}Listed: the largest by revenue (above zero)${cond ? " that meet the condition" : ""}, up to ${UF_SHOW}, each recomputed from its own returns as on its org page. Peer medians by revenue band from the same charities' own Form 990s in ${y1}.`,
    sources: [SRC.f990, SRC.bmf, ...(c?.label ? [SRC.labels] : []), ...(c?.ntee.length ? [SRC.ntee] : [])], searchQuery: searchFor(s, pl),
  };
}

// ------------------------------------------------------------------ compact form for tools (Research Buddy, MCP, API)
// Everything a model or partner needs to quote the answer honestly, without the chart spec or SQL text.
// opts.steps: the evidence chain as plain text (partners: /api/v1/answer, MCP), links reduced to names with EINs in evidence.
export function answerBrief(a: Answer, rows = 15, opts: { steps?: boolean } = {}) {
  const plain = (x: string) => x.replace(/\*\*(.+?)\*\*/g, "$1");
  const text = (x: string) => plain(x).replace(/\[([^\]]+)\]\(\/org\/(\d{9})\)/g, "$1 (EIN $2)");
  return {
    status: a.status, headline: a.headline, numbers: a.numbers, bullets: a.bullets.map(plain),
    what_counts: a.causeNote, method: a.method, caveats: a.caveats, coverage: a.coverage, missing: a.missing,
    data: a.rows.slice(0, rows), sources: a.sources, spec: a.spec,
    premise: a.premise ?? null, basis: a.basis ?? null,
    // The filing years behind the answer and which are still arriving (null when it uses no 990 or grant data)
    data_years: a.recency ?? null,
    // metric underfunded: the orgs listed (foundation grants a year vs the peer median for their size), else null
    underfunded_orgs: a.orgs ?? null,
    // Foundation grant totals with no cause: the dollars split by who received them (generosity-data 079), else null
    // metric financial_health: one org's indicators by year with flags and peers (spec.ein), else null
    financial_health: a.health ? { ein: a.health.ein, name: a.health.name, ...healthJson(a.health) } : null,
    // metric financial_health for a cause: the orgs listed with their indicators and flags, else null
    financial_health_orgs: a.healthOrgs ?? null,
    who_received: a.who ? { total_usd: a.who.total, parts: a.who.parts.map((x) => ({ type: x.key, label: x.label, usd: x.usd, share: x.share })), government_and_public_university_share: a.who.public_share, international_and_company_share: a.who.other_share, linked_share_all_usd: a.who.all_link_rate, linked_share_nonprofit_usd: a.who.nonprofit_link_rate, note: a.who.note } : null,
    ...(opts.steps ? {
      steps: (a.steps ?? []).map((st) => ({ n: st.n, key: st.key, title: st.title, line: text(st.line), details: st.details.map(text), ...(st.evidence ? { evidence: st.evidence } : {}) })),
      follow_ups: a.followUps ?? [],
    } : {}),
  };
}
