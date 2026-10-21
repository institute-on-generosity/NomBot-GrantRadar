import type { PromptSet } from "@/components/HeroFlip";

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

// Research prompts by cause (each one checked to answer ok), on the home Research tab under a cause label: the first
// SHOWN of each group, the rest behind "+ N more".
const RESEARCH_GROUPS = [
  { label: "Climate", prompts: ["How much foundation money goes to climate?", "Is climate funding growing?", "How concentrated is climate funding?", "Which federal agencies fund the most climate work at nonprofits?"] },
  { label: "Women and girls", prompts: ["How much foundation money goes to women and girls?", "How does foundation support for women and girls compare to climate?", "Which foundations fund climate, and which foundations fund women and girls?"] },
  { label: "Education", prompts: ["How much foundation money goes to education?", "Is education funding growing?", "How does foundation support for education compare to climate?"] },
  { label: "Food banks", prompts: ["Is food bank funding growing?", "Who are the biggest foundation funders of food banks?", "How many food banks are running deficits?"] },
  { label: "Mental health", prompts: ["Is mental health funding growing?", "Which states get the most foundation money for mental health?", "Who are the biggest foundation funders of mental health?"] },
  { label: "Health equity", prompts: ["How much foundation money goes to health equity?", "Who are the biggest foundation funders of health equity?", "Which states get the most foundation money for health equity?"] },
  { label: "Housing", prompts: ["Which states get the most foundation money for housing?", "Is foundation money for housing growing faster than foundation giving overall?", "Who are the biggest foundation funders of homelessness work in Washington State?"] },
  { label: "Tech and AI", prompts: ["Who are the biggest funders of tech and AI skills?", "How much foundation money goes to tech and AI skills?", "Is tech and AI skills funding growing?"] },
  { label: "Racial equity", prompts: ["How has racial equity funding changed since 2020?", "Who are the biggest foundation funders of racial equity?", "Which foundations give the most to Native American communities?"] },
  { label: "Immigrants", prompts: ["How much goes to immigrant services vs immigration policy?", "Which states get the most foundation money for immigrants and refugees?", "Who are the top recipients of foundation money for immigrants?"] },
  { label: "Foundations", prompts: ["Which states get the least foundation money per resident?", "What share of foundation giving comes from the 100 largest foundations?", "What is the median payout rate by foundation size?", "Which causes are growing fastest in foundation funding?"] },
  { label: "Finances", prompts: ["How many nonprofits ran deficits two years in a row?", "What share of nonprofit revenue do the largest 1% of nonprofits take in?", "How many nonprofits in Mississippi have less than three months of cash?"] },
  { label: "Household giving", prompts: ["Do high-income households give a larger share of income than low-income households?", "How has itemized charitable giving changed since 2015?"] },
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
