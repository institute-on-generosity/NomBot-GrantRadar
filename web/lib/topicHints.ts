// Topic hints: cause words in a question -> NTEE codes and name words, used as ranking boosts and as extra candidates
// inside a small place (a city, its nearby ZIPs, a county). About 80% of orgs in a city like Inglewood have no 990
// text, so an NTEE code ("N63" baseball) or a name word ("Smiles For Miles") is all there is to find them by.
// Boosts only: never a filter, since orgs are often coded elsewhere. Client-safe (no database imports).

// labels: graded cause labels the topic points to (lib/labels.ts), boosted the same way, never a filter (youth development
// finds about 54% of youth orgs, and a girls' preference must not hide co-ed programs).
// expand: words added to the meaning query, for a topic whose short phrase embeds narrowly ("youth leadership programs"
// missed girls' leadership groups whose filings say "empower young women to become leaders").
type Hint = { re: RegExp; ntee: string[]; names: string[]; labels?: string[]; expand?: string };
export const HINTS: Hint[] = [
  // Youth and amateur sports: N6x amateur sports (N60-N69: soccer N64, baseball and softball N63, basketball N62,
  // swimming N67, football N65), N4x sports training and facilities, N50 recreation clubs.
  { re: /\b(youth )?sports?\b|\bathletic(s)?\b|\bleagues?\b|\bsoccer\b|\bbaseball\b|\bsoftball\b|\bbasketball\b|\bfootball\b|\bswim(ming)?\b|\blacrosse\b|\bboxing\b|\bcheer(leading)?\b|\bvolleyball\b|\btrack and field\b|\bgolf\b|\btennis\b/i,
    ntee: ["N6", "N4"], names: ["sports", "sport", "athletic", "athletics", "league", "soccer", "baseball", "softball", "basketball", "football", "swim", "lacrosse", "boxing", "cheer", "volleyball", "golf", "tennis", "hoop", "hoops", "fc", "sc"] },
  // Dental and oral health: no NTEE code of its own (clinics sit in E30-E32, E70, P70), so the name carries it.
  { re: /\bdental\b|\bdentist(s|ry)?\b|\boral health\b|\bteeth\b|\btooth\b|\bsmiles?\b/i,
    ntee: ["E3", "E7"], names: ["dental", "dentist", "dentistry", "smile", "smiles", "teeth", "tooth", "oral"] },
  { re: /\bhealth\b|\bclinics?\b|\bmedical\b|\bhealth ?care\b/i, ntee: ["E"], names: ["health", "clinic", "medical", "wellness", "care"] },
  // Youth development and leadership: O (O50 youth development programs, O2x boys and girls clubs, O4x scouting).
  { re: /\byouth (development|leadership|programs?|empowerment|mentoring)\b|\bleadership\b|\bmentor(s|ing|ship)?\b|\bteens?\b/i,
    ntee: ["O"], names: ["youth", "leadership", "leaders", "mentor", "mentoring", "empower", "teen", "teens"], labels: ["youth_development"] },
  { re: /\b(youth|teens?|girls'?|young (people|women))\b[^.]{0,30}\bleadership\b|\bleadership\b[^.]{0,30}\b(youth|teens?|girls|young people)\b/i,
    ntee: [], names: [], expand: "mentoring and empowering teens and young people to become leaders" },
  { re: /\bgirls?\b|\bwomen\b|\byoung women\b|\bfemale\b/i, ntee: [], names: ["girl", "girls", "her", "women", "sister", "sisters", "queens", "ladies"], labels: ["women_girls"] },
];

// Words that say nothing about the cause: never required for a keyword match ("youth sports programs" finds
// "Youth Sports League").
export const FILLER = new Set("program programs organization organizations org orgs nonprofit nonprofits non profit profits group groups service services initiative initiatives agency agencies charity charities provider providers that focus focused focusing on in for the and of with especially ideally preferably particularly".split(" "));

export function topicHints(text: string): { ntee: string[]; names: string[]; labels: string[]; expand: string[] } {
  const ntee = new Set<string>(), names = new Set<string>(), labels = new Set<string>(), expand: string[] = [];
  const t = text.replace(/\bboys\s*(and|&)\s*girls\b/gi, " "); // Boys & Girls Clubs serve everyone
  for (const h of HINTS) if (h.re.test(t)) { h.ntee.forEach((n) => ntee.add(n)); h.names.forEach((n) => names.add(n)); h.labels?.forEach((l) => labels.add(l)); if (h.expand) expand.push(h.expand); }
  return { ntee: [...ntee], names: [...names], labels: [...labels], expand };
}
