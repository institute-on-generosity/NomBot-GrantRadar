// The structured question behind a research answer (lib/answer.ts). Filled by the router (lib/answerRoute.ts,
// one cheap Claude call), by Research Buddy's research_answer tool, or directly by MCP / API callers.
import { z } from "zod";

export const METRICS = [
  "total",            // how much money goes to X (with its share and each year)
  "share",            // what share of all money goes to X
  "compare",          // X vs Y (two causes)
  "trend",            // is money for X growing (by year)
  "fastest_causes",   // which causes grew or shrank most
  "by_state",         // which states get the most / least (optionally per resident)
  "by_rurality",      // rural vs urban counties, per resident
  "top_funders",      // foundations giving most to X
  "top_recipients",   // organizations receiving most
  "out_of_state",     // share of grants from funders in other states
  "grant_size",       // average / median grant
  "general_support",  // share that is general operating / unrestricted support
  "concentration",    // share going to the top 1% / top 10 recipients
  "overlap_funders",  // foundations that fund both X and Y
  "count_orgs",       // how many orgs (optionally: run deficits, thin cash, rely on government grants)
  "breakdown",        // foundation grants split by one dimension (by): cause, county, recipient size, funder size ...
  "none",             // nothing in our data answers it (see missing)
] as const;
export const SOURCES = ["foundation_grants", "charity_grants", "federal_awards", "government_grants", "contributions", "revenue"] as const;
// Grantmaking charities on Form 990 Schedule I (generosity-data 041-042, charity_funder_profile.funder_class).
export const CHARITY_FUNDERS = ["daf_sponsor", "community_foundation", "united_way", "other"] as const;
export const CONDITIONS = ["deficit", "low_cash", "gov_reliant", "surplus"] as const;
export const MISSING = ["individual_giving", "corporate_giving", "federal_awards", "daf_grants", "foreign_giving", "forecast", "volunteering", "other"] as const;
export const LABELS = ["climate", "women_girls"] as const;
// Breakdown dimensions (metric breakdown, foundation grants; research layer of generosity-data 038-040).
// county_poverty / county_income / county_race / county_age: counties grouped by Census ACS 5-year bands (county_acs).
// agency / program: federal_awards only (awarding agency, assistance listing).
export const BY = ["state", "county", "cause", "cause_detail", "recipient_size", "funder_size", "funder_type", "recipient_kind", "rurality", "year", "charity_funder", "county_poverty", "county_income", "county_race", "county_age", "agency", "program"] as const;
export const MEASURES = ["dollars", "grants", "average_grant"] as const;
export const FUNDER_TYPES = ["family", "operating", "trust"] as const;
export const RECIPIENT_KINDS = ["nonprofit", "school_district", "public_college", "private_college", "public_entity"] as const;
const range = (what: string) => z.object({
  min: z.number().nullable().describe(`Lower bound in dollars of ${what}, e.g. 1000000 for "over $1M"; null = none`),
  max: z.number().nullable().describe(`Upper bound in dollars of ${what}, e.g. 1000000 for "under $1M"; null = none`),
});

export const causeSchema = z.object({
  name: z.string().describe("The cause in plain words, e.g. 'climate', 'animal shelters', 'homelessness'"),
  label: z.enum(LABELS).nullable().describe("Graded cause label when the cause is climate/clean energy or women and girls; else null"),
  ntee: z.array(z.string()).describe("NTEE code prefixes when the cause maps cleanly to codes (e.g. ['D20'] animal shelters/humane societies, ['K31'] food banks, ['B'] education, ['E'] health, ['L41'] homeless shelters, ['A'] arts). Empty when no clean code"),
  keywords: z.array(z.string()).describe("2-6 lowercase words or short phrases that name the cause in mission text, used only when there is no label and no clean NTEE code"),
});

export const specSchema = z.object({
  metric: z.enum(METRICS),
  causes: z.array(causeSchema).describe("0 causes = all causes; 2 for compare / overlap_funders"),
  source: z.enum(SOURCES).describe("foundation_grants (990-PF grants, default), charity_grants (Form 990 Schedule I grants by public charities: donor-advised fund sponsors, community foundations, United Ways, others), federal_awards (USAspending federal grants and cooperative agreements to nonprofits, by place of performance, agency and program, fiscal years 2022-2025), government_grants (reported on recipients' Form 990), contributions (all gifts reported on 990), revenue (total revenue)"),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  states: z.array(z.string()).describe("Two-letter codes of the place asked about; empty = whole US"),
  county: z.string().nullable().describe("County name if the question names one, e.g. 'Cook County'"),
  area: z.enum(["rural", "urban"]).nullable(),
  condition: z.enum(CONDITIONS).nullable().describe("For count_orgs: deficit, low_cash (under 3 months of cash), gov_reliant (half or more of revenue from government grants), surplus"),
  perResident: z.boolean(),
  perPoverty: z.boolean().describe("Per person in poverty (Census ACS) instead of per resident: \"per poor person\", \"relative to poverty\""),
  order: z.enum(["most", "least"]),
  missing: z.array(z.enum(MISSING)).describe("Parts of the question our IRS data can't answer"),
  missingNote: z.string().nullable().describe("For 'other': what is missing, in a few words"),
  by: z.enum(BY).nullable().describe("For breakdown (and grant_size by a dimension): what to split foundation grants by. cause = NTEE major groups, cause_detail = NTEE codes inside the named cause"),
  measure: z.enum(MEASURES).nullable().describe("For breakdown: dollars (default), grants (count) or average_grant"),
  recipientSize: range("the recipient's annual revenue").nullable().describe("Only recipients with annual revenue in this range (\"small nonprofits under $1M\")"),
  funderSize: range("the foundation's assets").nullable().describe("Only foundations with assets in this range (\"foundations over $1B\")"),
  funderType: z.enum(FUNDER_TYPES).nullable().describe("family (foundations with Family in the name, a floor), operating (private operating foundations), trust (charitable trusts)"),
  recipientKind: z.enum(RECIPIENT_KINDS).nullable().describe("Only this kind of recipient: nonprofit (identified IRS-registered org), school_district, public_college, private_college, public_entity (any of the three)"),
  charityFunder: z.enum(CHARITY_FUNDERS).nullable().describe("charity_grants only: daf_sponsor (donor-advised fund sponsors), community_foundation, united_way, other (other grantmaking charities); null = all"),
});

export type Cause = z.infer<typeof causeSchema>;
export type Spec = z.infer<typeof specSchema>;
export type Metric = Spec["metric"];
export type Source = Spec["source"];

export const DEFAULT_SPEC: Spec = {
  metric: "total", causes: [], source: "foundation_grants", yearFrom: null, yearTo: null, states: [], county: null,
  area: null, condition: null, perResident: false, perPoverty: false, order: "most", missing: [], missingNote: null,
  by: null, measure: null, recipientSize: null, funderSize: null, funderType: null, recipientKind: null, charityFunder: null,
};

// Canonical form: upper-case states, trimmed words, so equal questions share one cache entry. Specs from
// older callers (no research-layer fields) get null for each.
export function normalizeSpec(s: Spec): Spec {
  const rng = (r: Spec["recipientSize"] | undefined) => {
    const ok = (x: number | null | undefined) => (typeof x === "number" && isFinite(x) && x > 0 ? x : null);
    const lo = ok(r?.min), hi = ok(r?.max);
    return lo == null && hi == null ? null : { min: lo, max: hi };
  };
  const words = (a: string[]) => [...new Set(a.map((w) => w.toLowerCase().replace(/[^a-z0-9 '-]/g, " ").trim()).filter(Boolean))].slice(0, 8);
  return {
    ...s,
    causes: s.causes.slice(0, 2).map((c) => ({
      name: c.name.trim().slice(0, 60) || "this cause",
      label: c.label,
      ntee: [...new Set(c.ntee.map((n) => n.toUpperCase().trim()).filter((n) => /^[A-Z][0-9A-Z]{0,4}$/.test(n)))].slice(0, 8),
      keywords: words(c.keywords),
    })),
    states: [...new Set(s.states.map((x) => x.toUpperCase().trim()).filter((x) => /^[A-Z]{2}$/.test(x)))],
    county: s.county?.trim() || null,
    by: s.by ?? null,
    perPoverty: !!s.perPoverty,
    measure: s.measure && s.measure !== "dollars" ? s.measure : null,
    recipientSize: rng(s.recipientSize),
    funderSize: rng(s.funderSize),
    funderType: s.funderType ?? null,
    recipientKind: s.recipientKind ?? null,
    charityFunder: s.source === "charity_grants" ? s.charityFunder ?? null : null,
  };
}

// What a research question's page shows. "research": the answer card only (no org search runs).
// "mixed": the card, then the organizations it counts, when the question names a specific org set and
// asks about it ("how many animal shelters in Ohio run deficits"): the list is the evidence.
// "search": the normal results page; also the safe default when the answer couldn't be computed.
export type ContentPlan = "research" | "mixed" | "search";
export function contentPlan(s: Spec, status: "ok" | "partial" | "unanswerable"): ContentPlan {
  if (status === "unanswerable") return "research"; // the card says why and where to look
  if (s.metric === "count_orgs" && s.causes.length > 0) return "mixed";
  return "research";
}
