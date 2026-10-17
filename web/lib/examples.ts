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

// Home page prompts by kind, shown under the flipping "Look up …" heading. People are board members
// named in IRS filings whose name maps to one clear person in the loaded data (common names left out).
export const PROMPT_SETS = [
  { word: "nonprofits", placeholder: "e.g. food banks in rural Appalachia that do workforce training, under $500K", prompts: EXAMPLES.slice(0, 5) },
  { word: "philanthropic leaders", placeholder: "e.g. Darren Walker: every board a person sits on", prompts: ["Laura Arrillaga-Andreessen", "Darren Walker", "Laurene Powell Jobs", "Ai-jen Poo", "Ursula Burns", "La June Montgomery Tabron"] },
  { word: "foundations", placeholder: "e.g. health foundations in Kentucky", prompts: ["community foundations in Ohio", "health foundations in Kentucky", "foundations that fund the arts in New York", "family foundations in Texas that fund literacy"] },
  // Research questions get an answer card on /research/ask instead of a list (lib/answerSpec.ts)
  { word: "research", placeholder: "e.g. How much foundation money goes to climate?", prompts: ["Is food bank funding growing?", "How much foundation money goes to climate?", "Climate vs women and girls funding", "Which states get the least foundation money per resident?", "How concentrated is climate funding?"] },
];
