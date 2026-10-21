// Graded cause labels (generosity-data migration 032: cause_labels, org_labels; methods in
// generosity-data docs/labels/<label>.md). Causes no NTEE code captures, each org graded primary or partial.
// Search filters by them (lib/search.ts), the org page and API show them (lib/orgLabels.ts, lib/org.ts, lib/api.ts).
// Client-safe: no database imports here (lib/filters.ts, used by client components, imports it).

export const LABELS = { climate: "Climate", women_girls: "Women and girls", substance_use: "Substance use and addiction", housing_homelessness: "Housing and homelessness", ai_tech_learning_work: "Tech and AI skills", racial_equity: "Racial equity", immigrants_refugees: "Immigrants and refugees", mental_health: "Mental health", education: "Education and learning" } as const;
export type LabelSlug = keyof typeof LABELS;
export const LABEL_SLUGS = Object.keys(LABELS) as LabelSlug[];
export const isLabel = (s: unknown): s is LabelSlug => typeof s === "string" && s in LABELS;
export const labelName = (s: string) => (isLabel(s) ? LABELS[s] : s);
// The name mid-sentence: "tech and AI skills", "climate" (acronyms keep their case).
export const labelPhrase = (s: LabelSlug) => LABELS[s].replace(/^[A-Z](?![A-Z])/, (m) => m.toLowerCase());

// Sub-types inside a label (generosity-data 069: org_labels.subtypes, cause_labels.subtypes). immigrants_refugees splits
// into services (serving immigrants and refugees, the default) and policy (immigration policy research and advocacy of
// any stance, FAIR and NumbersUSA as much as FWD.us). A question about immigrants or refugees counts services; one about
// immigration policy, reform or advocacy counts policy; "all" (API, chips) counts the whole label.
export type LabelSub = "services" | "policy";
export type LabelSubPick = LabelSub | "all";
export const LABEL_SUBTYPES: Partial<Record<LabelSlug, { default: LabelSub; names: Record<LabelSub, string>; notes: Record<LabelSub, string> }>> = {
  immigrants_refugees: {
    default: "services",
    names: { services: "Serving immigrants and refugees", policy: "Immigration policy and advocacy" },
    notes: { services: "Resettlement, legal aid, ESL, relief, immigrant rights", policy: "Every viewpoint, for and against more immigration" },
  },
};
export const hasSubtypes = (l: string | null | undefined): l is LabelSlug => isLabel(l) && !!LABEL_SUBTYPES[l];
export const isLabelSub = (s: unknown): s is LabelSubPick => s === "services" || s === "policy" || s === "all";
// The question asks about immigration policy itself: policy, reform, enforcement, research or advocacy on immigration,
// think tanks, or a side of the debate. "Advocacy for immigrants" or "immigrant rights" is still services.
const POLICY_Q = /\b(immigration|migration|border|asylum|refugee)[- ](polic(y|ies)|reform|enforcement|restrictions?|restrictionists?|research|think[- ]tanks?|advocacy|advocates|debate|levels?|legislation|lobbying)\b|\b(polic(y|ies)|advocacy|lobbying|think[- ]tanks?|research(ers)?|reform)\b[^.?!]{0,40}\bimmigration\b|\b(restrictionists?|anti-?immigration|pro-?immigration|(less|lower|reduce[ds]?|more) immigration)\b/i;
// The sub-type a question means: policy when it asks about immigration policy, else the label's default. undefined for labels without sub-types.
export function subtypeFromText(text: string, label: LabelSlug | null | undefined): LabelSub | undefined {
  const t = label ? LABEL_SUBTYPES[label] : undefined;
  if (!t) return undefined;
  return POLICY_Q.test(text) ? "policy" : t.default;
}

// The question must name the cause itself, so a stray guess never narrows a search to a label.
// "Boys and girls clubs" serve everyone, so they don't count as women and girls; homeless pets aren't housing;
// medical coding and building codes aren't tech skills, and bare "programming" (a charity's programs) or "AI" isn't either.
// Wildlife refuges and "Refuge" shelters aren't refugees, bird and butterfly migration isn't immigration, and an economic
// or tropical depression or an old insane asylum isn't mental health. "Mental" only counts next to health or illness words.
const NAMES: Record<LabelSlug, RegExp> = {
  climate: /\bclimate\b|\bclean energy\b|\brenewable energy\b|\bglobal warming\b|\bdecarboni[sz]|\bcarbon (emissions?|reduction|removal)\b/i,
  women_girls: /\b(women|woman|womens|girls?|female|feminist)\b/i,
  substance_use: /\baddict|\bsubstance (use|abuse|misuse)\b|\bopioids?\b|\bopiates?\b|\boverdoses?\b|\bnaloxone\b|\bnarcan\b|\bharm reduction\b|\bsober (living|homes?)\b|\bsobriety\b|\bdetox\b|\bfentanyl\b|\balcoholism\b|\bdrug (abuse|addiction|treatment|prevention|use)\b|\b(addiction|alcohol and drug|drug and alcohol) recovery\b|\brecovery (houses?|homes?|residences?|cafes?)\b/i,
  // "Housing" alone counts (housing people); bare "shelter" doesn't (animal, storm and domestic violence shelters).
  housing_homelessness: /\bhomeless|\bunhoused\b|\bunsheltered\b|\bhousing\b|\bre-?housing\b|\bevictions?\b|\brent(al)? assistance\b|\bhabitat for humanity\b|\btenants?'?\s+rights\b|\bcommunity land trusts?\b|\bhomeownership\b/i,
  ai_tech_learning_work: /\bcomputer science\b|\bcoding\b|\bcoders?\b|\blearn(ing)? to (code|program)\b|\bcode\.org\b|\bgirls who code\b|\bprogramming (skills|classes|courses|education|bootcamps?)\b|\bsoftware (engineering|development) (training|education|bootcamps?)\b|\bdigital (literacy|inclusion|divide|skills|equity|navigators?)\b|\bcomputer (literacy|skills|training|classes|education)\b|\b(ai|artificial intelligence) (literacy|education|skills|training|learning|capacity|workforce|readiness)\b|\b(tech|technology|information technology|cyber ?security|data science) (workforce|training|skills|education|careers?|jobs|bootcamps?|pathways?|apprenticeships?)\b|\b(nonprofit|technology|tech) capacity\b|\bnonprofit tech(nology)?\b/i,
  // Race named outright: "civil rights" or "equity" alone could be any group's, so they don't count.
  racial_equity: /\bracial (equity|justice|equality|inequit(y|ies)|inequalit(y|ies)|disparit(y|ies)|discrimination|gaps?|wealth gap|healing|reconciliation|bias)\b|\brace (equity|relations|and equity)\b|\bracism\b|\banti-?racis[mt]\b|\bnaacp\b|\burban leagues?\b|\breparations\b/i,
  immigrants_refugees: /\bimmigra(nts?|tion)\b|\brefugees?\b|\basylum\b|\bmigrants?\b|\bnewcomers?\b|\b(refugee )?resettlement\b|\bdaca\b|\bundocumented\b|\bdeportation\b|\bnaturali[sz]ation\b|\bdisplaced (people|persons|families)\b|\bhias\b/i,
  // Learning named outright. Topical "education" (financial, health, environmental, driver's, continuing, sex
  // education), "financial literacy" and "medical school" don't count (namesLabel strips them first).
  education: /\beducation(al)?\b|\bschools?\b|\bk-?12\b|\buniversit(y|ies)\b|\bcolleges?\b|\bliteracy\b|\btutor(s|ing)?\b|\bscholarships?\b|\bpre-?(school|k)\b|\bearly (childhood|learning)\b|\bhead start\b|\blibrar(y|ies)\b|\bteachers?\b|\bstudents?\b|\bstem education\b|\bged\b|\besl\b|\badult (basic )?education\b/i,
  mental_health: /\bmental(ly)? (health|illness(es)?|ill|disorders?|wellness|wellbeing|well-being)\b|\bpsychiatr|\bsuicid|\bcrisis (lines?|hotlines?|text)\b|\b988\b|\bdepression\b|\banxiety\b|\bptsd\b|\bpost-?traumatic stress\b|\bbipolar\b|\bschizophreni|\beating disorders?\b|\bbehavioral health\b|\bpsychotherap|\bnami\b|\bself-harm\b/i,
};
// Topical education, job and hobby schools and plain after-school care only matter for the education label ("digital
// literacy" is still tech and AI skills). Stripped before the shared rules, which would leave "medical coding schools" as "schools".
const EDU_NOT = /\b(financial|health|environmental|sex|driver'?s?|continuing|consumer|patient|civic|media|digital|computer|ai|tech|financial and economic) (education|literacy)\b|\b(medical|law|nursing|dental|driving|flight|dog|sunday|bible|coding) schools?\b|\bmedical coding schools?\b|\beducat(e|es|ing) the public\b|\bafter[- ]school (programs?|programming|care|clubs?)\b/gi;
export function namesLabel(question: string, label: LabelSlug): boolean {
  const q = (label === "education" ? question.replace(EDU_NOT, " ") : question).replace(/\bboys\s*(and|&)\s*girls\b/gi, " ").replace(/\bhomeless (pets?|animals?|dogs?|cats?)\b|\banimal housing\b/gi, " ")
    .replace(/\bmedical (billing and |billing & )?coding\b|\b(building|zoning|dress|penal|tax) codes?\b/gi, " ")
    .replace(/\b(wildlife|bird|animal|national wildlife) refuges?\b|\b(bird|butterfly|monarch|animal|wildlife|fish|salmon|whale) migrat\w*|\bmigratory (birds?|species|fish|waterfowl)\b|\bmigrant (birds?|songbirds?)\b/gi, " ")
    .replace(/\b(great|economic|tropical) depression\b|\b(insane|lunatic) asylums?\b|\bdepression[- ]era\b/gi, " ");
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
  racial_equity: ["racial equity", "racial justice", "racial equity and racial justice", "racial equity and justice", "racial justice and equity", "racial justice and racial equity", "race equity", "racial equality", "racism", "anti racism", "antiracism", "fighting racism", "ending racism", "racial equity and inclusion"],
  immigrants_refugees: ["immigrants and refugees", "refugees and immigrants", "immigrant and refugee", "refugee and immigrant", "immigrants", "immigrant", "immigration", "refugees", "refugee", "migrants", "migrants and refugees", "refugees and migrants", "immigrants refugees and asylum seekers", "immigrant and refugee communities",
    "immigration policy", "immigration policy and advocacy", "immigration advocacy", "immigration reform", "immigration policy research", "immigration policy groups", "immigration debate"],
  education: ["education and learning", "education", "learning", "education and schools", "schools and education", "education funding", "educational", "education and youth learning"],
  mental_health: ["mental health", "mental illness", "mental illnesses", "mental health and mental illness", "mental health and wellness", "mental wellness", "mental health care", "mental and behavioral health", "behavioral and mental health", "behavioral health", "mental health and suicide prevention"],
};
// What each label counts, for the caveat on a narrower question.
export const LABEL_SCOPE: Record<LabelSlug, string> = {
  climate: "climate change mitigation, clean energy, adaptation and resilience, and climate policy and advocacy",
  women_girls: "orgs serving or led for women and girls, across health, economic security, education, safety and rights",
  substance_use: "prevention, treatment, recovery and harm reduction for alcohol and every kind of drug, not only one substance",
  housing_homelessness: "homeless services and shelters, affordable and supportive housing, eviction prevention, rental assistance and home ownership",
  ai_tech_learning_work: "computer science and coding education, digital and AI literacy, tech workforce training, and tech capacity for nonprofits",
  racial_equity: "racism and racial discrimination, civil rights of people of color, racial gaps in wealth, health, education and justice, and racial healing",
  immigrants_refugees: "refugee resettlement, immigration legal services, citizenship and newcomer services, aid to refugees abroad, and immigrant rights (the services sub-type, without immigration policy groups)",
  mental_health: "mental health treatment and counseling, crisis lines and suicide prevention, peer support, and mental health advocacy and research",
  education: "schools, colleges and universities and their foundations, early childhood education, tutoring and literacy, scholarships and college access, adult education, libraries, STEM education, teacher training and education policy",
};
const FILLER = /\b(the|orgs?|organi[sz]ations?|nonprofits?|non-profits?|charities|charity|groups?|causes?|funding|money|grants?|giving|sector|issues?|efforts?|programs?|services?|work|related|focused)\b/g;
const scopeKey = (s: string) => s.toLowerCase().replace(/[’']s?\b/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(FILLER, " ").replace(/\s+/g, " ").trim();
// Whole-scope names that read as only part of the label ("women" for women and girls): shown as the label's name.
const AS_LABEL: Partial<Record<LabelSlug, string[]>> = {
  women_girls: ["women", "woman", "womens", "girls and women", "womens and girls", "women girls"],
  immigrants_refugees: ["immigrants", "immigrant", "immigration", "refugees", "refugee", "migrants", "refugees and immigrants", "refugee and immigrant", "immigrant and refugee"],
};
export const readsAsLabel = (name: string, label: LabelSlug) => (AS_LABEL[label] ?? []).some((w) => scopeKey(w) === scopeKey(name));
// True when the cause the user named is narrower than the label it routed to. Deterministic: no model call.
export function narrowerThanLabel(name: string, label: LabelSlug): boolean {
  const k = scopeKey(name);
  if (!k || /_/.test(name)) return false; // a bare slug or empty name is the label itself
  return k !== scopeKey(LABELS[label]) && !WHOLE[label].some((w) => scopeKey(w) === k);
}
