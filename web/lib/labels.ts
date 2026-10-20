// Graded cause labels (generosity-data migration 032: cause_labels, org_labels; methods in
// generosity-data docs/labels/<label>.md). Causes no NTEE code captures, each org graded primary or partial.
// Search filters by them (lib/search.ts), the org page and API show them (lib/orgLabels.ts, lib/org.ts, lib/api.ts).
// Client-safe: no database imports here (lib/filters.ts, used by client components, imports it).

export const LABELS = { climate: "Climate", women_girls: "Women and girls", substance_use: "Substance use and addiction", housing_homelessness: "Housing and homelessness", ai_tech_learning_work: "Tech and AI skills" } as const;
export type LabelSlug = keyof typeof LABELS;
export const LABEL_SLUGS = Object.keys(LABELS) as LabelSlug[];
export const isLabel = (s: unknown): s is LabelSlug => typeof s === "string" && s in LABELS;
export const labelName = (s: string) => (isLabel(s) ? LABELS[s] : s);
// The name mid-sentence: "tech and AI skills", "climate" (acronyms keep their case).
export const labelPhrase = (s: LabelSlug) => LABELS[s].replace(/^[A-Z](?![A-Z])/, (m) => m.toLowerCase());

// The question must name the cause itself, so a stray guess never narrows a search to a label.
// "Boys and girls clubs" serve everyone, so they don't count as women and girls; homeless pets aren't housing;
// medical coding and building codes aren't tech skills, and bare "programming" (a charity's programs) or "AI" isn't either.
const NAMES: Record<LabelSlug, RegExp> = {
  climate: /\bclimate\b|\bclean energy\b|\brenewable energy\b|\bglobal warming\b|\bdecarboni[sz]|\bcarbon (emissions?|reduction|removal)\b/i,
  women_girls: /\b(women|woman|womens|girls?|female|feminist)\b/i,
  substance_use: /\baddict|\bsubstance (use|abuse|misuse)\b|\bopioids?\b|\bopiates?\b|\boverdoses?\b|\bnaloxone\b|\bnarcan\b|\bharm reduction\b|\bsober (living|homes?)\b|\bsobriety\b|\bdetox\b|\bfentanyl\b|\balcoholism\b|\bdrug (abuse|addiction|treatment|prevention|use)\b|\b(addiction|alcohol and drug|drug and alcohol) recovery\b|\brecovery (houses?|homes?|residences?|cafes?)\b/i,
  // "Housing" alone counts (housing people); bare "shelter" doesn't (animal, storm and domestic violence shelters).
  housing_homelessness: /\bhomeless|\bunhoused\b|\bunsheltered\b|\bhousing\b|\bre-?housing\b|\bevictions?\b|\brent(al)? assistance\b|\bhabitat for humanity\b|\btenants?'?\s+rights\b|\bcommunity land trusts?\b|\bhomeownership\b/i,
  ai_tech_learning_work: /\bcomputer science\b|\bcoding\b|\bcoders?\b|\blearn(ing)? to (code|program)\b|\bcode\.org\b|\bgirls who code\b|\bprogramming (skills|classes|courses|education|bootcamps?)\b|\bsoftware (engineering|development) (training|education|bootcamps?)\b|\bdigital (literacy|inclusion|divide|skills|equity|navigators?)\b|\bcomputer (literacy|skills|training|classes|education)\b|\b(ai|artificial intelligence) (literacy|education|skills|training|learning|capacity|workforce|readiness)\b|\b(tech|technology|information technology|cyber ?security|data science) (workforce|training|skills|education|careers?|jobs|bootcamps?|pathways?|apprenticeships?)\b|\b(nonprofit|technology|tech) capacity\b|\bnonprofit tech(nology)?\b/i,
};
export function namesLabel(question: string, label: LabelSlug): boolean {
  const q = question.replace(/\bboys\s*(and|&)\s*girls\b/gi, " ").replace(/\bhomeless (pets?|animals?|dogs?|cats?)\b|\banimal housing\b/gi, " ")
    .replace(/\bmedical (billing and |billing & )?coding\b|\b(building|zoning|dress|penal|tax) codes?\b/gi, " ");
  return NAMES[label].test(q);
}
// Rule-based reading (no Claude): the first label the question names.
export const labelFromText = (question: string): LabelSlug | undefined => LABEL_SLUGS.find((l) => namesLabel(question, l));

// Narrower questions: "AI literacy" routes to ai_tech_learning_work, but the label counts all tech and AI skills
// orgs, so a headline "$210M to AI literacy" would overstate it. A cause name counts as the label itself only
// when, after filler words, it is the label's name or one of these whole-scope names; anything else is narrower
// and the answer names the label it actually counted (lib/answer.ts, closestLabel).
const WHOLE: Record<LabelSlug, string[]> = {
  climate: ["climate", "climate change", "climate action", "climate crisis", "climate work", "global warming", "climate and clean energy"],
  women_girls: ["women and girls", "girls and women", "women", "woman", "womens", "womens and girls", "women girls"],
  substance_use: ["substance use and addiction", "substance use", "substance abuse", "substance misuse", "substance use disorder", "substance use disorders", "addiction", "addictions", "addiction and recovery", "addiction recovery", "drug and alcohol", "alcohol and drug", "drug and alcohol addiction", "alcohol and drug addiction", "drug and alcohol use", "alcohol and drug use", "substance use and opioid addiction"],
  housing_homelessness: ["housing and homelessness", "homelessness and housing", "housing", "homelessness", "homeless", "housing and homeless", "unhoused", "people experiencing homelessness", "homeless people"],
  ai_tech_learning_work: ["tech and ai skills", "ai and tech skills", "tech skills", "technology skills", "tech and ai learning and work", "ai tech learning work", "ai tech learning and work", "tech and ai skills and work"],
};
// What each label counts, for the caveat on a narrower question.
export const LABEL_SCOPE: Record<LabelSlug, string> = {
  climate: "climate change mitigation, clean energy, adaptation and resilience, and climate policy and advocacy",
  women_girls: "orgs serving or led for women and girls, across health, economic security, education, safety and rights",
  substance_use: "prevention, treatment, recovery and harm reduction for alcohol and every kind of drug, not only one substance",
  housing_homelessness: "homeless services and shelters, affordable and supportive housing, eviction prevention, rental assistance and home ownership",
  ai_tech_learning_work: "computer science and coding education, digital and AI literacy, tech workforce training, and tech capacity for nonprofits",
};
const FILLER = /\b(the|orgs?|organi[sz]ations?|nonprofits?|non-profits?|charities|charity|groups?|causes?|funding|money|grants?|giving|sector|issues?|efforts?|programs?|services?|work|related|focused)\b/g;
const scopeKey = (s: string) => s.toLowerCase().replace(/[’']s?\b/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(FILLER, " ").replace(/\s+/g, " ").trim();
// Whole-scope names that read as only part of the label ("women" for women and girls): shown as the label's name.
const AS_LABEL: Partial<Record<LabelSlug, string[]>> = { women_girls: ["women", "woman", "womens", "girls and women", "womens and girls", "women girls"] };
export const readsAsLabel = (name: string, label: LabelSlug) => (AS_LABEL[label] ?? []).some((w) => scopeKey(w) === scopeKey(name));
// True when the cause the user named is narrower than the label it routed to. Deterministic: no model call.
export function narrowerThanLabel(name: string, label: LabelSlug): boolean {
  const k = scopeKey(name);
  if (!k || /_/.test(name)) return false; // a bare slug or empty name is the label itself
  return k !== scopeKey(LABELS[label]) && !WHOLE[label].some((w) => scopeKey(w) === k);
}
