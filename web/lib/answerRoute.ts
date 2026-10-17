// Question router for research answers: is this an aggregate / quantitative question ("how much",
// "what share", "which states", "top funders", "how many run deficits") or an organization search?
// A free regex screens first, so plain org searches never pay for a call. Questions that pass get one
// small Claude call (FAST_MODEL, low effort, structured output) that returns a Spec (lib/answerSpec).
// Cost: ~5.5K input (prompt + output schema; 3.3K before the research-layer fields) + ~170-250 output tokens
// per new question, measured Oct 16; cached 24 h.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, FAST_MODEL } from "./llm";
import { memo } from "./memo";
import { normalizeSpec, specSchema, type Spec } from "./answerSpec";

const SCREEN = new RegExp([
  String.raw`\bhow (much|many)\b`, String.raw`\bwhat (share|percent(age)?|portion|fraction|proportion)\b`, String.raw`\bshare of\b`, String.raw`\bpercent`,
  String.raw`\bper (resident|capita|person|head)\b`, String.raw`\btrend`, String.raw`\b(grow|grew|growing|growth|declin|shrink|shrank|fell|rose|rising|falling)`,
  String.raw`\bover time\b`, String.raw`\bwhich (states?|count(y|ies)|causes?|foundations?|funders?|regions?)\b`, String.raw`\bwho (funds|gives|pays)\b`,
  String.raw`\b(top|biggest|largest|main|leading) (funders|foundations|donors|recipients|grantees)\b`, String.raw`\b(median|average|typical) (grant|gift)`,
  String.raw`\bgrant sizes?\b`, String.raw`\bconcentrat`, String.raw`\bgeneral (operating|support)\b`, String.raw`\bunrestricted\b`, String.raw`\bfund(s|ing)? both\b`,
  String.raw`\b(vs\.?|versus|compared? (to|with))\b`, String.raw`\brural\b`, String.raw`\bout[- ]of[- ]state\b`, String.raw`\b(least|most) (money|funding|funded|grants?|foundation)`,
  String.raw`\btotal\b`, String.raw`\b(government|federal|state|public) (money|grants?|funding|dollars)\b`, String.raw`\b(deficits?|in the red|months of cash|cash reserves?)\b`,
  String.raw`\bby (state|county|counties|cause|size|revenue|assets|year|type|kind)\b`, String.raw`\bbreak ?down\b`, String.raw`\bwhich (kinds?|types?) of\b`, String.raw`\bwhich cause areas?\b`,
].join("|"), "i");

export const looksLikeResearch = (q: string) => SCREEN.test(q);

export const ROUTER_SYSTEM = `You route questions for NomBot, a research tool over US IRS nonprofit data for philanthropy researchers.
Decide if the question asks for an aggregate answer (a number, share, ranking, trend or count across many organizations) = research true, or asks to find/list specific organizations to look at = research false ("food banks in Ohio", "best climate nonprofits", "largest hospitals in Texas" are org searches; "how much foundation money goes to food banks in Ohio" is research).
Then fill the spec. Our data:
- foundation_grants: every private-foundation 990-PF grant, tax years 2022-2025 (2025 partial), recipient state/county, funder, purpose text. Default source.
- government_grants: government grants nonprofits report on their own Form 990 (Part VIII line 1e), tax years 2023-2025. Use when the question says government / public / federal / state money.
- contributions (all gifts a nonprofit reports) and revenue (total revenue) from Form 990/990-EZ.
- Org counts, NTEE codes, state, county; finances for deficits, cash, reliance on government grants. Census population by state/county.
Metrics: breakdown (foundation grants split by one dimension, set by: state, county, cause = NTEE major groups, cause_detail = NTEE codes inside the named cause, recipient_size, funder_size, funder_type, recipient_kind, rurality, year; measure: dollars, grants (count) or average_grant; e.g. "which cause areas get the most" = breakdown by cause, "which counties in California get the most" = breakdown by county + states CA, "average grant to hospitals by state" = breakdown by state, measure average_grant, "large vs small foundations" = breakdown by funder_size, "how much goes to small vs large nonprofits" = breakdown by recipient_size), total (how much), share (what share/percent of all giving), compare (X vs Y: two causes), trend (growing? by year), fastest_causes (which causes grew/shrank most), by_state (which states most/least; perResident true for per resident/per capita), by_rurality (rural vs urban), top_funders, top_recipients, out_of_state (funding from other states' foundations), grant_size (average/median grant), general_support (general operating / unrestricted share), concentration (how concentrated, top 1%), overlap_funders (foundations funding both X and Y: two causes), count_orgs (how many orgs; condition deficit / low_cash / gov_reliant / surplus), none (nothing we have answers it).
Causes: label 'climate' for climate change, clean energy, climate resilience; 'women_girls' for women and girls. Otherwise NTEE prefixes when the cause maps cleanly (animal shelters/humane D20, animals D, food banks K31, hunger/food K, homeless shelters L41, housing L, education B, higher education B4, K-12 schools B2, health E, hospitals E2, mental health F, arts A, museums A5, environment C, youth O, human services P, international Q, civil rights R, religion X, disaster M2, legal aid I8, employment J, community S, medical research H). Use keywords (no ntee) for causes without a code (e.g. 'opioid', 'refugee', 'veterans' -> keywords plus ntee W30 for veterans is fine). Empty causes = all causes.
Years: only when the question names them ("in 2023" -> 2023, 2023; "since 2022" -> 2022, null). Place: states (two-letter), county name, area rural/urban.
missing: name parts we cannot answer: individual_giving (individual donors), corporate_giving (company giving outside company foundations), federal_awards (direct federal grants/contracts to agencies, universities, companies; e.g. "how much did the federal government spend on climate"), daf_grants (donor-advised fund grants), foreign_giving (money to other countries), forecast (future predictions), volunteering, other (+ missingNote). Government grants to nonprofits are NOT missing: use source government_grants and add federal_awards to missing only when the question is about all government spending.
Filters (foundation_grants; null when not asked): recipientSize {min,max} = recipient's annual revenue in dollars ("small nonprofits under $1M" -> max 1000000; "the largest nonprofits, over $100M" -> min 100000000). funderSize {min,max} = foundation assets ("foundations with over $1 billion" -> min 1000000000; "small foundations" -> max 10000000). funderType: family (family foundations), operating (private operating foundations), trust (charitable trusts). Company or corporate foundations can't be identified: put other in missing with missingNote "which foundations are company foundations". recipientKind: school_district, public_college, private_college, public_entity (school districts and public colleges together or any public schools/colleges), nonprofit. Filters combine with any metric: "how much do family foundations give to religion" = total, cause religion X, funderType family.
If nothing we have answers it, metric none.`;

const routerSchema = z.object({ research: z.boolean() }).extend(specSchema.shape);

export type Routed = { research: false } | { research: true; spec: Spec };

const cached = memo<Routed>("answer-route:v2", 1000, 24 * 3600_000); // v2: breakdowns and filters
export function routeQuestion(question: string): Promise<Routed> {
  const q = question.replace(/\s+/g, " ").trim();
  if (!looksLikeResearch(q)) return Promise.resolve({ research: false });
  // A failed call isn't cached (memo drops rejections): the page falls back to a plain search this time.
  return cached(q.toLowerCase(), () => routeFresh(q)).catch((err) => {
    console.error("answer router failed; treating as a search", err);
    return { research: false } as const;
  });
}

async function routeFresh(question: string): Promise<Routed> {
  const client = claude();
  if (!client) return { research: false }; // no key: plain search, as before
  {
    const res = await client.beta.messages.parse({
      model: FAST_MODEL,
      max_tokens: 1024,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(routerSchema) },
      system: ROUTER_SYSTEM,
      messages: [{ role: "user", content: question }],
    });
    const o = res.stop_reason === "refusal" ? null : res.parsed_output;
    if (!o || !o.research) return { research: false };
    const { research: _r, ...spec } = o; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { research: true, spec: normalizeSpec(spec) };
  }
}
