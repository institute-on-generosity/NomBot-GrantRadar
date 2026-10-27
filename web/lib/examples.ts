import type { PromptGroup, PromptSet } from "@/components/HeroFlip";
import { causeOf, causeQuestions, findSub, SDGS, sdgSlug } from "./sdg";

// Example questions (every state is loaded; the first five, the home-page pills, stay in Appalachia, IoG's focus).
// The first five are the home-page pills; all of them feed the search-bar suggestions.
export const EXAMPLES = [
  "food banks in rural Appalachia that do workforce training, under $500K",
  "youth mentoring nonprofits in Kentucky under $1M",
  "animal shelters in Ohio",
  "arts organizations in West Virginia",
  "housing nonprofits in Tennessee that help veterans",
  "addiction recovery programs in West Virginia",
  "free health clinics in Virginia",
  "adult literacy programs in Ohio under $250K",
  "domestic violence shelters in Kentucky",
  "food banks in Texas that run mobile pantries",
  "climate education nonprofits in California under $1M",
  "after-school STEM programs in Virginia",
  "river and watershed conservation groups in Tennessee",
  "community foundations in Ohio",
];

// Research prompts (each one checked to answer ok), on the home Research tab. Causes sit under the 17 UN Sustainable
// Development Goals (lib/sdg.ts, Oct 26 ask from Helen Cashman and Julia Hess): SDG blocks first, one block's prompts
// on tap, grouped by subcategory. Questions that cut across causes stay in their own groups after the goals.
// After a change: copy the prompts to ~/iog-qa/home-prompts.json on the helper (eval/nightly_benchmark.py).
const BY_SDG: Record<number, { sub: string; prompts: string[] }[]> = {
  1: [{ sub: "no_poverty", prompts: ["How much foundation money goes to SDG 1, no poverty?"] }],
  2: [{ sub: "food_banks", prompts: ["Is food bank funding growing?", "Who are the biggest foundation funders of food banks?", "How many food banks are running deficits?"] },
    { sub: "zero_hunger", prompts: ["Is foundation money for zero hunger growing?"] }],
  3: [{ sub: "healthcare", prompts: ["How much foundation money goes to Goal 3, good health and well-being?"] },
    { sub: "mental_health", prompts: ["Is mental health funding growing?", "Which states get the most foundation money for mental health?", "Who are the biggest foundation funders of mental health?"] },
    { sub: "health_equity", prompts: ["How much foundation money goes to health equity?", "Who are the biggest foundation funders of health equity?", "Which states get the most foundation money for health equity?"] }],
  4: [{ sub: "education", prompts: ["How much foundation money goes to education?", "Is education funding growing?", "How does foundation support for education compare to climate?", "How does SDG 4 compare to SDG 13?"] },
    { sub: "youth_development", prompts: ["How much foundation money goes to youth development?", "Who are the biggest foundation funders of youth development?", "Is youth development funding growing?", "Which states get the most foundation money for youth development?"] },
    { sub: "tech_ai", prompts: ["Who are the biggest funders of tech and AI skills?", "How much foundation money goes to tech and AI skills?", "Is tech and AI skills funding growing?"] }],
  5: [{ sub: "women_girls", prompts: ["How much foundation money goes to women and girls?", "How does foundation support for women and girls compare to climate?", "Which foundations fund climate, and which foundations fund women and girls?"] }],
  6: [{ sub: "clean_water", prompts: ["Which states get the most foundation money for clean water (SDG 6)?"] }],
  7: [{ sub: "energy", prompts: ["Who are the biggest foundation funders of affordable and clean energy (SDG 7)?"] }],
  8: [{ sub: "workforce", prompts: ["How much foundation money goes to workforce development (SDG 8)?"] },
    { sub: "economic_dev", prompts: ["Is community economic development funding growing (SDG 8)?"] }],
  9: [{ sub: "science_research", prompts: ["How much foundation money goes to science and technology research (SDG 9)?"] }],
  10: [{ sub: "racial_equity", prompts: ["How has racial equity funding changed since 2020?", "Who are the biggest foundation funders of racial equity?", "Which foundations give the most to Native American communities?"] },
    { sub: "immigrants", prompts: ["How much goes to immigrant services vs immigration policy?", "Which states get the most foundation money for immigrants and refugees?", "Who are the top recipients of foundation money for immigrants?"] }],
  11: [{ sub: "housing", prompts: ["Which states get the most foundation money for housing?", "Is foundation money for housing growing faster than foundation giving overall?", "Who are the biggest foundation funders of homelessness work in Washington State?"] },
    { sub: "disaster", prompts: ["How much foundation money goes to disaster preparedness and relief (SDG 11)?"] }],
  12: [{ sub: "food_rescue", prompts: ["Who are the biggest foundation funders of food rescue (SDG 12)?"] }],
  13: [{ sub: "climate", prompts: ["How much foundation money goes to climate?", "Is climate funding growing?", "How concentrated is climate funding?", "Which federal agencies fund the most climate work at nonprofits?"] }],
  14: [{ sub: "oceans", prompts: ["How much foundation money goes to life below water?", "Who are the biggest foundation funders of SDG 14?"] }],
  15: [{ sub: "animal_welfare", prompts: ["How much foundation money goes to animal welfare?", "Who are the biggest foundation funders of animal welfare?", "Is animal welfare funding growing?", "Which states get the most foundation money for animal welfare?"] },
    { sub: "life_on_land", prompts: ["Is funding for life on land growing?"] }],
  16: [{ sub: "legal_aid", prompts: ["Who are the biggest foundation funders of legal aid (SDG 16)?"] }],
  17: [{ sub: "philanthropy", prompts: ["How much foundation money goes to community foundations and giving programs (SDG 17)?"] }],
};
// Across causes: foundations, under-funded orgs, nonprofit finances, household giving.
const CROSS = [
  { label: "Foundations", prompts: ["Which states get the least foundation money per resident?", "What share of foundation giving comes from the 100 largest foundations?", "What is the median payout rate by foundation size?", "Which causes are growing fastest in foundation funding?"] },
  { label: "Under-funded orgs", prompts: ["Which mental health nonprofits in California get little foundation money for their size?", "Which housing and homelessness nonprofits in Texas are under-funded by foundations?", "Which food banks are overlooked by foundations for their size?"] },
  { label: "Financial health", prompts: ["Is Feeding America financially healthy?", "Which mental health nonprofits in California ran deficits 3 years in a row?", "What are the median cash reserves and program ratios of arts nonprofits by size?", "How many nonprofits ran deficits two years in a row?", "What share of nonprofit revenue do the largest 1% of nonprofits take in?", "How many nonprofits in Mississippi have less than three months of cash?"] },
  { label: "Household giving", prompts: ["Do high-income households give a larger share of income than low-income households?", "How has itemized charitable giving changed since 2015?"] },
];
const subLabel = (id: string) => findSub(id)?.sub.name ?? id;
// The goal panel's table (Oct 27): the whole goal first, then each subcategory, one question per column (How much,
// Growing?, Top funders, Top states, Under-funded orgs), the same questions Browse asks. A subcategory with no data
// gets no questions. Curated prompts that aren't one of those go under "More questions" (max 3).
const COLS = ["total", "trend", "top_funders", "by_state", "underfunded"] as const;
const tableOf = (g: (typeof SDGS)[number]) => {
  const row = (label: string, sub: (typeof g.subs)[number]) => {
    const c = causeOf(sub, g);
    const q = c ? causeQuestions(c.name) : null;
    return { label, q: q ? Object.fromEntries(COLS.map((k) => [k, q[k]])) as Record<(typeof COLS)[number], string> : null };
  };
  return [row(`All of ${g.name}`, g.scope), ...g.subs.map((s) => row(s.name, s))];
};
export const RESEARCH_GROUPS: PromptGroup[] = [
  ...SDGS.filter((g) => BY_SDG[g.n]).map((g) => {
    const subs = BY_SDG[g.n].map((x) => ({ label: subLabel(x.sub), prompts: x.prompts }));
    const table = tableOf(g);
    const asked = new Set(table.flatMap((r) => (r.q ? Object.values(r.q) : [])));
    const more = subs.flatMap((x) => x.prompts).filter((q) => !asked.has(q)).slice(0, 3);
    // prompts: every question the popover can ask (eval/browse checks each one routes to a covered cause)
    return { label: `SDG ${g.n} ${g.name}`, prompts: [...new Set([...table.flatMap((r) => (r.q ? Object.values(r.q) : [])), ...subs.flatMap((x) => x.prompts)])], sdg: { n: g.n, name: g.name, color: g.color, href: `/browse/${sdgSlug(g.n)}` }, subs, table, more };
  }),
  ...CROSS,
];

// Home page prompts by kind, shown under the flipping "Look up …" heading. People are board members
// named in IRS filings whose name maps to one clear person in the loaded data (common names left out).
export const PROMPT_SETS: PromptSet[] = [
  { word: "nonprofits", placeholder: "e.g. food banks in rural Appalachia that do workforce training, under $500K", prompts: EXAMPLES.slice(0, 5) },
  { word: "philanthropic leaders", placeholder: "e.g. Darren Walker: every board a person sits on", prompts: ["Laura Arrillaga-Andreessen", "Darren Walker", "Laurene Powell Jobs", "Ai-jen Poo", "Ursula Burns", "La June Montgomery Tabron"] },
  { word: "foundations", placeholder: "e.g. health foundations in Kentucky", prompts: ["community foundations in Ohio", "health foundations in Kentucky", "foundations that fund the arts in New York", "family foundations in Texas that fund literacy"] },
  // Research questions get an answer card on /research/ask instead of a list (lib/answerSpec.ts)
  { word: "research", placeholder: "e.g. How much foundation money goes to climate?", prompts: RESEARCH_GROUPS.flatMap((g) => g.prompts), groups: RESEARCH_GROUPS },
];
