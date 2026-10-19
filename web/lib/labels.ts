// Graded cause labels (generosity-data migration 032: cause_labels, org_labels; methods in
// generosity-data docs/labels/<label>.md). Causes no NTEE code captures, each org graded primary or partial.
// Search filters by them (lib/search.ts), the org page and API show them (lib/orgLabels.ts, lib/org.ts, lib/api.ts).
// Client-safe: no database imports here (lib/filters.ts, used by client components, imports it).

export const LABELS = { climate: "Climate", women_girls: "Women and girls", substance_use: "Substance use and addiction", housing_homelessness: "Housing and homelessness" } as const;
export type LabelSlug = keyof typeof LABELS;
export const LABEL_SLUGS = Object.keys(LABELS) as LabelSlug[];
export const isLabel = (s: unknown): s is LabelSlug => typeof s === "string" && s in LABELS;
export const labelName = (s: string) => (isLabel(s) ? LABELS[s] : s);

// The question must name the cause itself, so a stray guess never narrows a search to a label.
// "Boys and girls clubs" serve everyone, so they don't count as women and girls; homeless pets aren't housing.
const NAMES: Record<LabelSlug, RegExp> = {
  climate: /\bclimate\b|\bclean energy\b|\brenewable energy\b|\bglobal warming\b|\bdecarboni[sz]|\bcarbon (emissions?|reduction|removal)\b/i,
  women_girls: /\b(women|woman|womens|girls?|female|feminist)\b/i,
  substance_use: /\baddict|\bsubstance (use|abuse|misuse)\b|\bopioids?\b|\bopiates?\b|\boverdoses?\b|\bnaloxone\b|\bnarcan\b|\bharm reduction\b|\bsober (living|homes?)\b|\bsobriety\b|\bdetox\b|\bfentanyl\b|\balcoholism\b|\bdrug (abuse|addiction|treatment|prevention|use)\b|\b(addiction|alcohol and drug|drug and alcohol) recovery\b|\brecovery (houses?|homes?|residences?|cafes?)\b/i,
  // "Housing" alone counts (housing people); bare "shelter" doesn't (animal, storm and domestic violence shelters).
  housing_homelessness: /\bhomeless|\bunhoused\b|\bunsheltered\b|\bhousing\b|\bre-?housing\b|\bevictions?\b|\brent(al)? assistance\b|\bhabitat for humanity\b|\btenants?'?\s+rights\b|\bcommunity land trusts?\b|\bhomeownership\b/i,
};
export function namesLabel(question: string, label: LabelSlug): boolean {
  const q = question.replace(/\bboys\s*(and|&)\s*girls\b/gi, " ").replace(/\bhomeless (pets?|animals?|dogs?|cats?)\b|\banimal housing\b/gi, " ");
  return NAMES[label].test(q);
}
// Rule-based reading (no Claude): the first label the question names.
export const labelFromText = (question: string): LabelSlug | undefined => LABEL_SLUGS.find((l) => namesLabel(question, l));
