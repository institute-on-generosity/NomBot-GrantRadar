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
  "none",             // nothing in our data answers it (see missing)
] as const;
export const SOURCES = ["foundation_grants", "government_grants", "contributions", "revenue"] as const;
export const CONDITIONS = ["deficit", "low_cash", "gov_reliant", "surplus"] as const;
export const MISSING = ["individual_giving", "corporate_giving", "federal_awards", "daf_grants", "foreign_giving", "forecast", "volunteering", "other"] as const;
export const LABELS = ["climate", "women_girls"] as const;

export const causeSchema = z.object({
  name: z.string().describe("The cause in plain words, e.g. 'climate', 'animal shelters', 'homelessness'"),
  label: z.enum(LABELS).nullable().describe("Graded cause label when the cause is climate/clean energy or women and girls; else null"),
  ntee: z.array(z.string()).describe("NTEE code prefixes when the cause maps cleanly to codes (e.g. ['D20'] animal shelters/humane societies, ['K31'] food banks, ['B'] education, ['E'] health, ['L41'] homeless shelters, ['A'] arts). Empty when no clean code"),
  keywords: z.array(z.string()).describe("2-6 lowercase words or short phrases that name the cause in mission text, used only when there is no label and no clean NTEE code"),
});

export const specSchema = z.object({
  metric: z.enum(METRICS),
  causes: z.array(causeSchema).describe("0 causes = all causes; 2 for compare / overlap_funders"),
  source: z.enum(SOURCES).describe("foundation_grants (990-PF grants, default), government_grants (reported on recipients' Form 990), contributions (all gifts reported on 990), revenue (total revenue)"),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  states: z.array(z.string()).describe("Two-letter codes of the place asked about; empty = whole US"),
  county: z.string().nullable().describe("County name if the question names one, e.g. 'Cook County'"),
  area: z.enum(["rural", "urban"]).nullable(),
  condition: z.enum(CONDITIONS).nullable().describe("For count_orgs: deficit, low_cash (under 3 months of cash), gov_reliant (half or more of revenue from government grants), surplus"),
  perResident: z.boolean(),
  order: z.enum(["most", "least"]),
  missing: z.array(z.enum(MISSING)).describe("Parts of the question our IRS data can't answer"),
  missingNote: z.string().nullable().describe("For 'other': what is missing, in a few words"),
});

export type Cause = z.infer<typeof causeSchema>;
export type Spec = z.infer<typeof specSchema>;
export type Metric = Spec["metric"];
export type Source = Spec["source"];

export const DEFAULT_SPEC: Spec = {
  metric: "total", causes: [], source: "foundation_grants", yearFrom: null, yearTo: null, states: [], county: null,
  area: null, condition: null, perResident: false, order: "most", missing: [], missingNote: null,
};

// Canonical form: upper-case states, trimmed words, so equal questions share one cache entry.
export function normalizeSpec(s: Spec): Spec {
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
