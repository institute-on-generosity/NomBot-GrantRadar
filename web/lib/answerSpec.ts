// The structured question behind a research answer (lib/answer.ts). Filled by the router (lib/answerRoute.ts,
// one cheap Claude call), by Research Buddy's research_answer tool, or directly by MCP / API callers.
import { z } from "zod";
import { hasSubtypes, labelName, labelPhrase, readsAsLabel, subtypeFromText } from "./labels";

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
  "underfunded",      // orgs in a cause with real programs and budgets that get little foundation money for their size
  "financial_health", // financial indicators: one org (ein) over its full filing years, or a cause's orgs (deficit streaks, reserves, peer medians by size)
  "breakdown",        // foundation grants split by one dimension (by): cause, county, recipient size, funder size ...
  "none",             // nothing in our data answers it (see missing)
] as const;
export const SOURCES = ["foundation_grants", "charity_grants", "federal_awards", "government_grants", "contributions", "revenue", "household_giving", "foundation_finances"] as const;
// Places beyond states and counties: county sets (Appalachia = ARC counties, zip_regions.appalachia).
export const REGIONS = ["appalachia"] as const;
// Grantmaking charities on Form 990 Schedule I (generosity-data 041-042, charity_funder_profile.funder_class).
export const CHARITY_FUNDERS = ["daf_sponsor", "community_foundation", "united_way", "other"] as const;
export const CONDITIONS = ["deficit", "low_cash", "gov_reliant", "surplus"] as const;
export const MISSING = ["individual_giving", "corporate_giving", "federal_awards", "daf_grants", "foreign_giving", "forecast", "volunteering", "other"] as const;
export const LABELS = ["climate", "women_girls", "substance_use", "housing_homelessness", "ai_tech_learning_work", "racial_equity", "immigrants_refugees", "mental_health", "education", "health_equity", "animal_welfare"] as const;
// Breakdown dimensions (metric breakdown, foundation grants; research layer of generosity-data 038-040).
// county_poverty / county_income / county_race / county_age: counties grouped by Census ACS 5-year bands (county_acs).
// agency / program: federal_awards only (awarding agency, assistance listing). income: household_giving only (IRS SOI AGI classes).
export const BY = ["state", "county", "cause", "cause_detail", "recipient_size", "funder_size", "funder_type", "recipient_kind", "rurality", "year", "charity_funder", "county_poverty", "county_income", "county_race", "county_age", "agency", "program", "income"] as const;
export const MEASURES = ["dollars", "grants", "average_grant"] as const;
export const FUNDER_TYPES = ["family", "operating", "trust", "company"] as const;
// Directional premises a question presupposes (checked against the computed answer, lib/answer.ts).
export const PREMISES = ["rise", "fall", "more", "less"] as const;
// NTEE basis for NTEE-coded causes: the IRS code, or corrected codes (generosity-data 072: 4,049 miscoded orgs by major
// group, 42,973 orgs with no IRS code by detailed code where graded, else major group).
export const NTEE_BASES = ["irs", "corrected"] as const;
export const RECIPIENT_KINDS = ["nonprofit", "school_district", "public_college", "private_college", "public_entity"] as const;
const range = (what: string) => z.object({
  min: z.number().nullable().describe(`Lower bound in dollars of ${what}, e.g. 1000000 for "over $1M"; null = none`),
  max: z.number().nullable().describe(`Upper bound in dollars of ${what}, e.g. 1000000 for "under $1M"; null = none`),
});

export const causeSchema = z.object({
  name: z.string().describe("The cause in plain words, e.g. 'climate', 'animal shelters', 'homelessness'"),
  label: z.enum(LABELS).nullable().describe("Graded cause label when the cause is climate/clean energy, women and girls, substance use/addiction/opioids, housing/homelessness, tech and AI skills (computer science, coding, digital and AI literacy, tech careers), racial equity/racial justice/racism, immigrants/refugees/asylum, mental health (mental illness, crisis care, suicide prevention), education (schools, colleges, early childhood education, tutoring, literacy, scholarships, libraries, adult education), or health equity (health disparities or inequities by race, income or place, minority health, community health workers; plain health or health care is not this label, use NTEE E), or animal welfare (animal welfare, protection or rights, rescue, spay/neuter, sanctuaries, wildlife rehabilitation, anti-cruelty; plain animal shelters stay NTEE D20, wildlife conservation and zoos NTEE D); else null"),
  ntee: z.array(z.string()).describe("NTEE code prefixes when the cause maps cleanly to codes (e.g. ['D20'] animal shelters/humane societies, ['K31'] food banks, ['B'] education, ['E'] health, ['A'] arts). Empty when no clean code"),
  keywords: z.array(z.string()).describe("2-6 lowercase words or short phrases that name the cause in mission text, used only when there is no label and no clean NTEE code"),
});

// Sub-type inside a label that has them (immigrants_refugees): services (default), policy, all. Not in the router's
// schema (grammar limit): normalizeSpec reads it from the cause name ("immigration policy" = policy).
export const SUBTYPES = ["services", "policy", "all"] as const;
const specCauseSchema = causeSchema.extend({
  subtype: z.enum(SUBTYPES).nullable().optional().describe("immigrants_refugees only: services = orgs serving immigrants and refugees (default), policy = immigration policy research and advocacy of any stance, all = both"),
});

export const specSchema = z.object({
  metric: z.enum(METRICS),
  causes: z.array(specCauseSchema).describe("0 causes = all causes; 2 for compare / overlap_funders"),
  source: z.enum(SOURCES).describe("foundation_grants (990-PF grants, default), charity_grants (Form 990 Schedule I grants by public charities: donor-advised fund sponsors, community foundations, United Ways, others), federal_awards (USAspending federal grants and cooperative agreements to nonprofits, by place of performance, agency and program, fiscal years 2022-2025), government_grants (reported on recipients' Form 990), contributions (all gifts reported on 990), revenue (total revenue), household_giving (IRS SOI individual returns: charitable deductions itemizers claim, by state, county, ZIP and income, tax years 2013-2023; no cause or recipient), foundation_finances (990-PF finances per foundation and year, tax years 2022-2025: payout rate = qualifying distributions / net investment assets against the 5% rule, assets, grants paid; no cause)"),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  states: z.array(z.string()).describe("Two-letter codes of the place asked about; empty = whole US"),
  county: z.string().nullable().describe("County name if the question names one, e.g. 'Cook County'"),
  city: z.string().nullable().optional().describe("City or town the question names, e.g. 'Inglewood' (its state in states). Grants are placed by the recipient's address ZIPs (generosity-data zip_places)"),
  region: z.enum(REGIONS).nullable().describe("A region that is a set of counties: appalachia (Appalachian Regional Commission counties)"),
  area: z.enum(["rural", "urban"]).nullable(),
  condition: z.enum(CONDITIONS).nullable().describe("For count_orgs: deficit, low_cash (under 3 months of cash), gov_reliant (half or more of revenue from government grants), surplus"),
  // Plain integers, 0 = not asked: structured outputs cap the number of nullable (union) parameters.
  streak: z.number().int().describe("For count_orgs with a condition: the condition held this many years in a row (\"deficits two years in a row\" = 2); 0 = newest year only"),
  topN: z.number().int().describe("For top_funders: a set of the N largest funders whose share is asked (\"the 100 largest foundations\" = 100); 0 = top 10"),
  perResident: z.boolean(),
  perPoverty: z.boolean().describe("Per person in poverty (Census ACS) instead of per resident: \"per poor person\", \"relative to poverty\""),
  order: z.enum(["most", "least"]),
  missing: z.array(z.enum(MISSING)).describe("Parts of the question our IRS data can't answer"),
  missingNote: z.string().nullable().describe("For 'other': what is missing, in a few words"),
  by: z.enum(BY).nullable().describe("For breakdown (and grant_size by a dimension): what to split foundation grants by. cause = NTEE major groups, cause_detail = NTEE codes inside the named cause"),
  measure: z.enum(MEASURES).nullable().describe("For breakdown: dollars (default), grants (count) or average_grant"),
  recipientSize: range("the recipient's annual revenue").nullable().describe("Only recipients with annual revenue in this range (\"small nonprofits under $1M\")"),
  funderSize: range("the foundation's assets").nullable().describe("Only foundations with assets in this range (\"foundations over $1B\")"),
  funderType: z.enum(FUNDER_TYPES).nullable().describe("family (foundations with Family in the name, a floor), operating (private operating foundations), trust (charitable trusts), company (company or corporate foundations, e.g. the Walmart Foundation)"),
  recipientKind: z.enum(RECIPIENT_KINDS).nullable().describe("Only this kind of recipient: nonprofit (identified IRS-registered org), school_district, public_college, private_college, public_entity (school districts and public colleges only, never private colleges)"),
  charityFunder: z.enum(CHARITY_FUNDERS).nullable().describe("charity_grants only: daf_sponsor (donor-advised fund sponsors), community_foundation, united_way, other (other grantmaking charities); null = all"),
  ntee: z.enum(NTEE_BASES).describe("How NTEE-coded causes count orgs: irs (default, the IRS code) or corrected (orgs whose IRS code doesn't fit their own 990 text count under a suggested NTEE major group, and orgs with no IRS code count under a suggested detailed code or major group, generosity-data org_ntee_suggested). corrected only when the question asks for corrected, fixed or better categories or codes. Graded labels are never affected"),
  ein: z.string().nullable().optional().describe("financial_health only: one organization's 9-digit EIN for its own indicators (years of revenue, expenses, deficits, months of cash, program ratio, revenue mix, liabilities, flags, peer medians). Null = the cause's orgs"),
  premise: z.enum(PREMISES).nullable().describe("A direction the question takes as given, not asks: rise / fall (\"why did X fall\", \"given the drop in X\"), more / less (the first thing named gets more or less than the second, \"why do X get less than Y\"). Null for open or yes/no questions (\"did X fall?\", \"how has X changed\"). The answer leads with a correction when the data disagrees"),
});

// The spec as Claude fills it in structured outputs (router, follow-ups): Appalachia rides on area ("appalachia"),
// because a separate nullable region field makes the compiled grammar too large (Oct 17). fromLlmSpec maps it back.
// ein is never model-filled: the router finds a named org itself (lib/answerRoute orgHealthQuestion).
// city is a plain string there ("" = none): another nullable field would grow the compiled grammar past its limit.
export const llmSpecSchema = specSchema.omit({ region: true, ein: true, city: true }).extend({ causes: z.array(causeSchema), area: z.enum(["rural", "urban", "appalachia"]).nullable(),
  city: z.string().describe("City or town the question names, e.g. 'Inglewood' for Inglewood, CA (its state in states); empty when none") });
export function fromLlmSpec(o: z.infer<typeof llmSpecSchema>): Spec {
  const { area, city, ...rest } = o;
  return { ...rest, area: area === "appalachia" ? null : area, region: area === "appalachia" ? "appalachia" : null, ein: null, city: city.trim() || null };
}

export type Cause = z.infer<typeof specCauseSchema>;
export type Spec = z.infer<typeof specSchema>;
export type Metric = Spec["metric"];
export type Source = Spec["source"];

export const DEFAULT_SPEC: Spec = {
  metric: "total", causes: [], source: "foundation_grants", yearFrom: null, yearTo: null, states: [], county: null, region: null,
  city: null, area: null, condition: null, streak: 0, topN: 0, perResident: false, perPoverty: false, order: "most", missing: [], missingNote: null,
  by: null, measure: null, recipientSize: null, funderSize: null, funderType: null, recipientKind: null, charityFunder: null, premise: null, ntee: "irs", ein: null,
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
      // A graded label's name mid-sentence: "Climate" -> "climate" (the router capitalizes sometimes). Other
      // names keep their case ("Black-led organizations", "Head Start"). A bare slug ("ai_tech_learning_work") or the
      // label's own name reads as its name mid-sentence ("tech and AI skills"), and so does "women" (women and girls).
      name: (c.label && (/_/.test(c.name) || c.name.trim().toLowerCase() === labelName(c.label).toLowerCase() || readsAsLabel(c.name, c.label)) ? labelPhrase(c.label) : c.label ? c.name.trim().replace(/^[A-Z](?=[^A-Z]*$)/, (m) => m.toLowerCase()) : c.name.trim()).slice(0, 60) || "this cause",
      label: c.label,
      // Labels with sub-types always carry one (part of the cache key): asked, else read from the cause's words.
      ...(hasSubtypes(c.label) ? { subtype: c.subtype && (SUBTYPES as readonly string[]).includes(c.subtype) ? c.subtype : subtypeFromText([c.name, ...c.keywords].join(" "), c.label) } : {}),
      ntee: [...new Set(c.ntee.map((n) => n.toUpperCase().trim()).filter((n) => /^[A-Z][0-9A-Z]{0,4}$/.test(n)))].slice(0, 8),
      keywords: words(c.keywords),
    })),
    states: [...new Set(s.states.map((x) => x.toUpperCase().trim()).filter((x) => /^[A-Z]{2}$/.test(x)))],
    county: s.county?.trim() || null,
    // A city needs one state; a city's own missing-data note ("city-level data") is wrong once the city is applied.
    city: s.city?.trim() && s.states.length === 1 ? s.city.trim().replace(/,.*$/, "").slice(0, 60) : null,
    ...(s.city?.trim() && s.states.length === 1 && s.missing.includes("other") && /\b(city|cities|town|municipal|local)\b/i.test(s.missingNote ?? "")
      ? { missing: s.missing.filter((m) => m !== "other"), missingNote: null } : {}),
    region: s.region ?? null,
    streak: typeof s.streak === "number" && s.streak >= 2 ? Math.min(Math.round(s.streak), 10) : 0,
    topN: typeof s.topN === "number" && s.topN > 10 ? Math.min(Math.round(s.topN), 5000) : 0, // top 10 is every top_funders answer already
    by: s.by ?? null,
    perPoverty: !!s.perPoverty,
    measure: s.measure && s.measure !== "dollars" ? s.measure : null,
    recipientSize: rng(s.recipientSize),
    funderSize: rng(s.funderSize),
    funderType: s.funderType ?? null,
    recipientKind: s.recipientKind ?? null,
    charityFunder: s.source === "charity_grants" ? s.charityFunder ?? null : null,
    premise: s.premise ?? null,
    ntee: s.ntee === "corrected" ? "corrected" : "irs",
    // One organization (financial_health only): 9 digits, else none.
    ein: s.metric === "financial_health" && typeof s.ein === "string" && /^\d{9}$/.test(s.ein.replace(/\D/g, "")) ? s.ein.replace(/\D/g, "") : null,
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
