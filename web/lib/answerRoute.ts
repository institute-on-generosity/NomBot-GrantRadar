// Question router for research answers: is this an aggregate / quantitative question ("how much",
// "what share", "which states", "top funders", "how many run deficits") or an organization search?
// A free regex screens first, so plain org searches never pay for a call. Questions that pass get one
// small Claude call (FAST_MODEL, low effort, structured output) that returns a Spec (lib/answerSpec).
// Cost (eval/route.mts, Oct 17): ~5.4K input tokens (prompt + lean output schema, down from 7.1K), almost all
// read from the prompt cache at 0.1x after the first call in 5 minutes, + ~180 output tokens; p50 ~1.7 s.
// Answers are memoized 24 h.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, fallback, FAST_MODEL } from "./llm";

// Benchmark knob (eval/route.mts); the default keeps FAST_MODEL.
const ROUTE_MODEL = process.env.ROUTE_MODEL || FAST_MODEL;
import { memo } from "./memo";
import { fromLlmSpec, llmSpecSchema, normalizeSpec, type Spec } from "./answerSpec";

const SCREEN = new RegExp([
  String.raw`\bhow (much|many)\b`, String.raw`\bwhat (share|percent(age)?|portion|fraction|proportion)\b`, String.raw`\bshare of\b`, String.raw`\bpercent`,
  String.raw`\bper (resident|capita|person|head|poor)\b`, String.raw`\b(high|low)[- ]poverty\b`, String.raw`\b(poor|poorer|poorest|richer|richest|wealthier|wealthiest) (counties|places|areas)\b`, String.raw`\btrend`, String.raw`\b(grow|grew|growing|growth|declin|shrink|shrank|fell|rise|rose|rising|falling)`,
  String.raw`\bover time\b`, String.raw`\bwhich (states?|count(y|ies)|causes?|foundations?|funders?|regions?)\b`, String.raw`\bwho (funds|gives|pays)\b`,
  String.raw`\b(top|biggest|largest|main|leading) (funders|foundations|donors|recipients|grantees|grantmakers|givers)\b`, String.raw`\b(median|average|typical) (grant|gift)`,
  String.raw`\bgrant sizes?\b`, String.raw`\bconcentrat`, String.raw`\bgeneral (operating|support)\b`, String.raw`\bunrestricted\b`, String.raw`\bfund(s|ing)? both\b`,
  String.raw`\b(vs\.?|versus|compared? (to|with))\b`, String.raw`\brural\b`, String.raw`\bout[- ]of[- ]state\b`, String.raw`\b(least|most|less|more) (money|funding|funded|grants?|foundation|federal|government)`, String.raw`\b(giv(e|es|ing)|gets?|getting|receiv(e|es|ing)) (more|less)\b`,
  String.raw`\btotal\b`, String.raw`\bsum of\b`, String.raw`\b(compan(y|ies)|corporate) foundations?\b`, String.raw`\b(government|federal|state|public) (money|grants?|funding|dollars)\b`, String.raw`\b(deficits?|in the red|months of cash|cash reserves?)\b`,
  String.raw`\bby (state|county|counties|cause|size|revenue|assets|year|type|kind)\b`, String.raw`\bbreak ?down\b`, String.raw`\bwhich (kinds?|types?) of\b`, String.raw`\bwhich cause areas?\b`,
  String.raw`\bwhich (federal )?(agenc(y|ies)|programs?)\b`, String.raw`\bfederal (agenc(y|ies)|awards?)\b`,
  String.raw`\b(donor[- ]advised funds?|dafs?|daf sponsors?|community foundations?|united ways?)\b.*\b(give|gave|giving|grants?|money|fund|funds|funding|favou?r|causes)\b`,
  // Researcher phrasings (eval/research-questions.json): change over time, where money goes, who funds most.
  String.raw`\b(foundation|federal|government|philanthropic|charitable) (money|funding|giving|dollars)\b`, String.raw`\bsince (19|20)\d\d\b`,
  String.raw`\b(changed|changing|shift(s|ed|ing)?|fall|falls|drop(s|ped)?|increas(e|ed|es|ing)|decreas(e|ed|es|ing))\b`, String.raw`\b(bigger|smaller|larger) grants\b`,
  String.raw`\b(top|biggest|largest|main|leading)\b.*\b(funders|donors|grantmakers|recipients|grantees)\b`,
].join("|"), "i");

// Research-answers audit (eval/research.mts, Oct 17): open-ended phrasings the screen missed.
const SCREEN_AUDIT = new RegExp([
  String.raw`\bchang(e|ed|ing)\b.*\bsince\b`, String.raw`\bshift(s|ing|ed)?\b`, String.raw`\bfavou?r\b`, String.raw`\b(biggest|largest|top|main|leading) \w+ (funders|foundations|donors|recipients|grantees)\b`,
  String.raw`\b(bigger|smaller|larger) (grants|gifts)\b`, String.raw`\bwhere does\b.*\b(money|funding|giving)\b.*\bgo\b`, String.raw`\bwhy (did|does|do|is|are)\b.*\b(fall|drop|rise|grow|so much|so little|more|less)\b`,
  String.raw`\b(fall|drop|dropped|decrease[ds]?)\b`, String.raw`\blargest \d+ ?%`, String.raw`\btop \d+ ?%`,
  // Benchmark (eval/benchmark.mts, Oct 17): questions the router must see to answer or say what's missing,
  // instead of an org search: payout, overhead, boards, pay, track record, household giving.
  String.raw`\bpay(s|ing)? out\b`, String.raw`\bpayout`, String.raw`\boverhead`, String.raw`\b(board members?|trustees|interlock)`, String.raw`\bboards?\b.*\b(sit|share|seats?)\b`,
  String.raw`\bhow (long|old)\b`, String.raw`\b(newest|oldest|longest[- ]established)\b`, String.raw`\bevery year\b`, String.raw`\b(in a row|consecutive)\b`, String.raw`\bunsolicited\b`,
  String.raw`\b(ceos?|executives?)\b.*\b(earn|make|paid|pay|salar)`, String.raw`\b(earn|salar(y|ies)|compensation)\b.*\b(ceos?|executives?|directors?)\b`,
  String.raw`\bheadquarter`, String.raw`\bdeliver services\b`, String.raw`\bwhat (is|are) (the )?(average|median|typical)\b`, String.raw`\b(payout|overhead|expense|itemi[sz]ation) rates?\b`,
  String.raw`\bitemi[sz]`, String.raw`\bdeduct`, String.raw`\bhouseholds?\b.*\b(give|giving|gave|donat)`, String.raw`\b(americans|individuals|people|donors|taxpayers) (give|donate|gave|deduct)`, String.raw`\bshare of (their )?(income|agi)\b`,
  String.raw`\b\d+ (largest|biggest) (foundations|funders)\b`,
].join("|"), "i");

export const looksLikeResearch = (q: string) => SCREEN.test(q) || SCREEN_AUDIT.test(q);

export const ROUTER_SYSTEM = `You route questions for NomBot, a research tool over US IRS nonprofit data for philanthropy researchers.
Decide if the question asks for an aggregate answer (a number, share, ranking, trend or count across many organizations) = research true, or asks to find/list specific organizations to look at = research false ("food banks in Ohio", "best climate nonprofits", "largest hospitals in Texas" are org searches; "how much foundation money goes to food banks in Ohio" is research).
Then fill the spec. Our data:
- foundation_grants: every private-foundation 990-PF grant, tax years 2012-2025 (2025 partial; leave years null unless named, the default is 2022-24), recipient state/county, funder, purpose text. Default source.
- charity_grants: Form 990 Schedule I grants by public charities (over $5,000, to US organizations), tax years 2012-2025. Use for donor-advised funds / DAF sponsors (charityFunder daf_sponsor: Fidelity Charitable, Schwab Charitable ...), community foundations (community_foundation), United Ways (united_way), other charities, universities, hospitals (other). "How much do DAFs give to climate" = total, charity_grants, daf_sponsor, climate. "DAFs vs community foundations" = breakdown by charity_funder.
- federal_awards: USAspending federal grants and cooperative agreements to nonprofits and private colleges, fiscal years 2022-2025, by place of performance, awarding agency and program. Use when the question says federal money / grants or names an agency (HHS, USDA, FEMA ...). Takes the grant metrics; top_funders = agencies; breakdown also by agency or program. "Which agencies fund nonprofits in Ohio most" = top_funders, federal_awards, OH.
- government_grants: government grants nonprofits report on their own 990 (federal, state and local together), tax years 2023-2025. Use for government / public / state money not said to be federal.
- contributions (all gifts a nonprofit reports) and revenue (total revenue) from Form 990/990-EZ.
- household_giving: IRS Statistics of Income individual tax returns by state, county, ZIP and income (AGI class), tax years 2013-2023: returns, itemizers, charitable deductions they claim, AGI. Itemizers only, no cause or recipient. Use for itemized charitable deductions, household or individual giving by place, income or year: "how much do itemizers deduct in each state" = by_state, household_giving; "share of income given by high vs low income" = breakdown by income, household_giving; "giving per itemizer in Ohio counties" = breakdown by county, OH, perResident; "how has household giving changed since 2015" = trend, yearFrom 2015. Individual giving to a cause or kind of org ("individuals to churches / food banks"), bequests, crowdfunding, gender: add individual_giving to missing.
- foundation_finances: each private foundation's 990-PF finances per tax year, 2022-2025 (2025 partial): payout rate (qualifying distributions / net investment assets, the 5% rule), share paying 5% or more, assets, grants paid. No cause. "Are foundations paying out more than 5%" / "average payout rate" = share, foundation_finances; "median payout by foundation size" = breakdown by funder_size, foundation_finances (also by funder_type, state); "payout trend" / "how much did foundation assets grow" = trend, foundation_finances. funderSize and funderType apply.
- Org counts by NTEE, state, county; finances (deficits, cash, reliance on government grants). By year or size: "share of food banks running deficits by year" = count_orgs, deficit, by year, K31; "deficits by nonprofit size" = count_orgs, deficit, by recipient_size; "months of cash for small nonprofits" = count_orgs, low_cash, recipientSize max 1000000. Census population and ACS county poverty, income, race and age: perPoverty for "per person in poverty" / "per poor person"; by county_poverty (high- vs low-poverty counties), county_income (rich vs poor), county_race ("majority-Black or Hispanic counties"), county_age (older counties).
Metrics: breakdown (grants split by one dimension, by: state, county, cause = NTEE major groups, cause_detail = codes inside the named cause, recipient_size, funder_size, funder_type, recipient_kind, rurality, year, charity_funder (charity_grants), county_poverty / income / race / age, agency / program (federal_awards), income (household_giving AGI classes); measure dollars, grants (count) or average_grant; e.g. "which cause areas get the most" = by cause, "which counties in California get the most" = by county + CA, "average grant to hospitals by state" = by state + average_grant, "large vs small foundations" = by funder_size, "small vs large nonprofits" = by recipient_size), total (how much), share (what share of all giving), compare (X vs Y, two causes), trend (by year), fastest_causes (which causes grew/shrank most), by_state (states most/least; perResident for per resident/per capita), by_rurality (rural vs urban), top_funders, top_recipients (two causes asked separately, "which fund X and which fund Y" = both causes), out_of_state (money from other states' foundations), grant_size (average/median), general_support (general operating / unrestricted share), concentration (top 1% of recipients), overlap_funders (funders of both X and Y, only when "both" is asked), count_orgs (how many orgs; condition deficit / low_cash / gov_reliant / surplus), none.
Causes: label climate (climate change, clean energy, resilience), women_girls, substance_use (addiction, opioids, overdose, alcohol and drug use, recovery, harm reduction), housing_homelessness (homelessness, homeless shelters, housing, affordable or supportive housing, eviction, rental assistance, Habitat), ai_tech_learning_work (computer science and coding education, digital or AI literacy, tech workforce training, tech capacity for nonprofits; not general STEM), racial_equity (racial equity, racial justice, racism, civil rights of people of color, racial gaps), immigrants_refugees (immigrants, refugees, asylum seekers, resettlement, immigration legal services, DACA; also immigration policy, reform or advocacy: name it 'immigration policy') mental_health (mental health and illness, psychiatric care, counseling, crisis lines, suicide prevention, PTSD, eating disorders; not addiction alone) or education (education and learning: schools, colleges and universities and their foundations, early childhood education, tutoring, literacy, scholarships and college access, adult education, libraries, STEM education, teacher training, education policy; not financial or health education, job training alone, or coding and digital skills). K-12 schools alone or higher education alone stay NTEE (B2, B4), and so does a breakdown of education by type of school or cause detail (B): the label counts all learning as one cause. Cause name = the asker's own words ('AI literacy', 'opioids', 'homeless shelters', 'suicide prevention'), never swapped for the label's name: the answer says when the label is broader. Otherwise NTEE prefixes when the cause maps cleanly (e.g. environment C, animal shelters D20, animals D, food banks K31, K-12 schools B2, higher education B4, hospitals E2, museums A5, disaster M2, legal aid I8, veterans W30, religion X). Else keywords and no ntee ('LGBTQ', 'disability'). A named federal program (Head Start, AmeriCorps, community health centers, Ryan White, TRIO) = name and keywords with the program's name ('head start'), no ntee: federal_awards matches the program's own awards. No causes = all causes.
Years: only when the question names them ("in 2023" -> 2023, 2023; "since 2022" -> 2022, null; "since 2015" -> 2015, null; "from 2015 to 2024" -> 2015, 2024; "last 10 years" -> 2016, null). Set them even outside our years: the answer says which years it covers. Place: states (two-letter), county name, area rural/urban, or area appalachia for Appalachia (the ARC counties: never list its states instead).
topN: "the 100 largest foundations" = top_funders, topN 100. streak: "deficits two years in a row" = count_orgs, deficit, streak 2.
missing (parts we can't answer): individual_giving, corporate_giving (company giving outside company foundations), federal_awards (federal money to governments, public universities, companies, or contracts: for "how much did the federal government spend on climate" answer the nonprofit part with federal_awards and add federal_awards to missing), daf_grants (one donor's DAF account or DAF money by donor; DAF sponsors as a whole are charity_grants, not missing), foreign_giving, forecast, volunteering, other (+ missingNote). Government and federal grants to nonprofits are not missing.
Filters (foundation_grants; null when not asked): recipientSize {min,max} = recipient's annual revenue in dollars ("small nonprofits under $1M" -> max 1000000; "the largest nonprofits, over $100M" -> min 100000000). funderSize {min,max} = foundation assets ("over $1 billion" -> min 1000000000; "small foundations" -> max 10000000). funderType: family, operating (private operating foundations), trust (charitable trusts), company (company or corporate foundations, e.g. the Walmart Foundation). recipientKind: school_district, public_college, private_college, public_entity (school districts and public colleges together, not private colleges), nonprofit. Filters combine with any metric: "how much do family foundations give to religion" = total, religion X, funderType family. "corporate foundations' giving to education" = total, education B, funderType company.
ntee: irs (default) or corrected. corrected only when the question asks for corrected, fixed, better or more accurate NTEE codes or categories ("with corrected categories", "if we fix miscoded orgs"): orgs whose IRS code doesn't fit their 990 text then count under a suggested major group. Keep the cause's NTEE codes as usual. Never for graded labels.
If nothing we have answers it, metric none.
Growth after inflation (BLS CPI-U, real dollars) is in every trend answer: never put inflation in missing.
Missing parts: answer the closest part we have and add missing other with missingNote = a short noun phrase (2-8 words, no period, not a sentence), e.g. "Overhead rates", "Board members", "Executive pay", "Grant relationships over time", "Organization age", "Grant purpose (capacity building, program, capital)", "Who grants serve (low-income people)", "Change in each funder's giving", "Rankings by funder state", "Money per nonprofit by cause", "Side-by-side with foundation grants", "State and local government grants alone", "Metro areas", "Congressional districts", "Where services are delivered", "Money flowing into DAFs", "Multi-year grants", "Grants under a dollar size". Examples: "which foundations increased their grantmaking most" = top_funders + "Change in each funder's giving"; "how does federal money compare with foundation grants" = federal_awards total + "Side-by-side with foundation grants"; "share of foundation grants that benefit low-income people" = share with keywords + "Who grants serve (low-income people)"; "capacity building vs program support" = metric none + grant purpose; "which causes get the least money relative to how many nonprofits work on them" = breakdown by cause, order least + "Money per nonprofit by cause"; "which states' foundations send the most money to other states" = out_of_state + "Rankings by funder state"; "state and local government money separate from federal" = government_grants + "State and local government grants alone". Questions about organizations' age or founding ("newest vs longest established nonprofits") or funding streaks ("which nonprofits got grants every year", "how long do funders keep funding a grantee") are research true, metric none + "Organization age" or "Grant relationships over time".
Audit rules (Oct 17):
- "The largest 1% of nonprofits" with revenue, income or budgets and no grant money = concentration, source revenue. "What share of foundation (or DAF) money goes to the largest 1% of nonprofits by revenue" = concentration, by recipient_size.
- concentration ranks recipients. "How concentrated is giving among the biggest funders or sponsors" = top_funders.
- "Is X growing faster than giving overall" = trend with the one cause X (trend already compares with all grants). Never make "all causes" a cause.
- "Do DAFs (community foundations, United Ways) favor different causes" = breakdown by cause, source charity_grants, that charityFunder.
- recipientKind public_entity = school districts and public colleges only, never private colleges. "School districts compared with private colleges" = breakdown by recipient_kind.
- "Why did X fall" or "why does X get so much" = the metric that shows it (trend, by_state ...), research true.
- premise = a direction the question takes as given: "why did X fall / drop / shrink", "given the decline in X" = fall; "why did X grow / rise / increase" = rise (metric trend); "why do X get less (more) than Y" = less (more), X first (compare). Null when the question asks rather than assumes ("did X fall?", "is X growing?", "how has X changed") or has no direction ("why does X get so much").
- Open-ended questions about money across many orgs are research true: "how has funding for X changed" / "are foundations shifting away from X" = trend; "who are the biggest funders of X" = top_funders; "where does money for X go" / "where does X money go" = by_state; "do big foundations make bigger grants" = breakdown by funder_size, measure average_grant.`;

// llmSpecSchema: Appalachia rides on area (area "appalachia" -> spec.region) to stay under the grammar limit.
const routerSchema = z.object({ research: z.boolean() }).extend(llmSpecSchema.shape);
// Output format without the schema's prose descriptions: the prompt above carries every routing rule, and the
// descriptions (kept in answerSpec for Buddy and API callers) only repeated them here. The SDK writes enums and
// int bounds into descriptions ("{enum: [...]}"); enums become real JSON-schema enums so the output stays valid.
const leanSchema = (o: unknown): unknown => {
  if (Array.isArray(o)) return o.map(leanSchema);
  if (!o || typeof o !== "object") return o;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k !== "description") out[k] = leanSchema(v);
    else { const m = /\{enum: (\[.*\])\}$/.exec(String(v)); if (m) out.enum = JSON.parse(m[1]); }
  }
  return out;
};
const zodFormat = betaZodOutputFormat(routerSchema);
const routerFormat = { ...zodFormat, schema: leanSchema(zodFormat.schema) as typeof zodFormat.schema };

export type Routed = { research: false } | { research: true; spec: Spec };

const cached = memo<Routed>("answer-route:v23", 1000, 24 * 3600_000); // v23: ntee irs | corrected; v22: education label; v21: immigrants_refugees sub-types (immigration policy named as such); v19: racial_equity, immigrants_refugees, mental_health labels (mental health no longer NTEE F); v17: cause name in the asker's words (narrower than a label); v16: ai_tech_learning_work label; v15: named federal programs (Head Start) as keyword causes; v14: housing_homelessness label; v13: two causes asked separately = top_funders / top_recipients with both; v12: grants back to 2012; v11: substance_use label; v10: foundation_finances (payout, assets), org finances by year or size; v9: never mislead (region, topN, streak, years outside the data, missing-note rules, inflation), household_giving; v2: breakdowns and filters; v3: charity_grants; v4: federal_awards, ACS; v5: audit rules (largest 1%, public_entity); v6: trimmed prompt, lean schema, company funderType; v7: company example; v8: premise, "where does X money go"
// onUsage: called with the call's token usage when the router actually calls Claude (not on a cache hit); the
// nightly benchmark uses it to measure its cost (app/api/v1/answer, X-App: nightly-benchmark).
export function routeQuestion(question: string, onUsage?: (u: RouteUsage) => void): Promise<Routed> {
  const q = question.replace(/\s+/g, " ").trim();
  if (!looksLikeResearch(q)) return Promise.resolve({ research: false });
  // A failed call isn't cached (memo drops rejections): the page falls back to a plain search this time.
  return cached(q.toLowerCase(), () => routeFresh(q, onUsage)).catch((err) => {
    console.error("answer router failed; treating as a search", err);
    return { research: false } as const;
  });
}

async function routeFresh(question: string, onUsage?: (u: RouteUsage) => void): Promise<Routed> {
  const r = await routeMeasured(question);
  if (r.usage) onUsage?.(r.usage);
  return r.routed;
}
// One uncached router call with its token usage and time (eval/route.mts measures the prompt with it).
export type RouteUsage = { input: number; output: number; cacheRead: number; cacheWrite: number }; // input = all prompt tokens, cached or not
export async function routeMeasured(question: string): Promise<{ routed: Routed; usage: RouteUsage | null; ms: number }> {
  const t0 = Date.now();
  const client = claude("answerRoute");
  if (!client) return { routed: { research: false }, usage: null, ms: 0 }; // no key: plain search, as before
  {
    const res = await client.beta.messages.parse({
      model: ROUTE_MODEL,
      max_tokens: 1024,
      ...fallback(ROUTE_MODEL),
      output_config: { effort: "low", format: routerFormat },
      // Cached prefix (output schema + system prompt, ~6.7K tokens): repeat questions within 5 minutes read it at 0.1x.
      system: [{ type: "text", text: ROUTER_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: question }],
    }, { timeout: 30_000, maxRetries: 1 }); // a stalled call falls back to a plain search instead of holding the page
    const o = res.stop_reason === "refusal" ? null : res.parsed_output;
    const u = res.usage, cacheRead = u.cache_read_input_tokens ?? 0, cacheWrite = u.cache_creation_input_tokens ?? 0;
    const usage = { input: u.input_tokens + cacheRead + cacheWrite, output: u.output_tokens, cacheRead, cacheWrite };
    if (!o || !o.research) return { routed: { research: false }, usage, ms: Date.now() - t0 };
    const { research: _r, ...spec } = o; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { routed: { research: true, spec: normalizeSpec(fromLlmSpec(spec)) }, usage, ms: Date.now() - t0 };
  }
}
