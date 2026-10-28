// What a research question asks, by its words (Oct 28, Hunter: no repeated questions anywhere). intent + scope is the
// identity of a question: two questions with the same intent, about the same cause, place and years ask the same thing
// in different words ("Is food bank funding growing?" = "Is foundation money for food banks growing?" = "Is it growing?"
// under the Food banks topic). Pure and client-safe: the popover (lib/popoverTopics), the curated prompts
// (lib/examples), follow-up chips (app/research/ask) and eval/questions.mts use it.

export type Intent = "total" | "trend" | "top_funders" | "top_recipients" | "by_state" | "underfunded" | "count" | "health" | "concentration" | "compare" | "other";

export function intentOf(q: string): Intent {
  const t = q.toLowerCase();
  if (/little (foundation )?money for their size|under-?funded|overlooked/.test(t)) return "underfunded";
  if (/\b(compare|compared|vs\.?|versus)\b|\bwhich foundations fund .*, and which\b/.test(t)) return "compare";
  if (/\bhow concentrated\b|\bshare of .* from the \d+ largest\b/.test(t)) return "concentration";
  if (/\b(deficits?|financially healthy|cash reserves|months of cash|program ratios?)\b/.test(t)) return "health";
  if (/\bwhich states\b|\bwhat states\b|\bby state\b/.test(t) && !/per (resident|person)|\bleast\b/.test(t)) return "by_state";
  if (/\b(biggest|largest|top) (foundation )?funders\b|\bwho funds\b|\bwhich foundations (give|fund)\b/.test(t)) return "top_funders";
  if (/\bwho gets the most\b|\btop recipients\b/.test(t)) return "top_recipients";
  if (/\b(grow|growing|grew|trend|changed|change|shrink|shrinking|rising|falling)\b/.test(t) && !/fastest/.test(t)) return "trend";
  if (/^how many\b/.test(t)) return "count";
  if (/^how much (foundation )?money goes (to|here)\b|^how much do foundations give to\b/.test(t)) return "total";
  return "other";
}

// The scope a question narrows to beyond its cause: a place, years, or a comparison qualifier
export function scopeOf(q: string): string {
  const place = /\b(?:in|across) ((?:[A-Z][a-z]+)(?: [A-Z][a-z]+)*(?: State)?)\b/.exec(q)?.[1] ?? "";
  // "since 2020" is the default trend window (lib/answer G_TREND), so it doesn't narrow anything
  const years = (q.replace(/\bsince 2020\b/i, "").match(/\b(since |from |in )?(19|20)\d\d\b/g) ?? []).join(" ");
  const qual = /faster than|than .* overall/.test(q.toLowerCase()) ? "vs-overall" : "";
  return [place, years, qual].filter(Boolean).join("|").toLowerCase();
}

// Content words of a question without its intent words, singular, for "other" questions and cross-topic checks
const STOP = new Set("a an the is are was were do does did of for to in on at by and or with from how much many what which who whom where why when it its their they them this that these those foundation foundations money funding funders funder fund funds give gives given giving get gets goes go most biggest largest top more less least growing grow work organizations orgs nonprofits nonprofit grants grant here".split(" "));
export function topicWords(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/(ies)$/, "y").replace(/([^s])s$/, "$1")).sort().join(" ");
}

// The identity used to dedupe: within one topic (the cause is fixed) intent + scope; "other" questions keep their words
export function questionKey(q: string): string {
  const i = intentOf(q);
  return i === "other" ? `other:${topicWords(q)}` : `${i}:${scopeOf(q)}`;
}
// The identity across topics: also the cause words
export const questionKeyWithTopic = (q: string) => `${questionKey(q)}:${topicWords(q)}`;

// Same ask about the same cause: intent and scope match and the two share a cause word (or the curated question
// names the topic, given as extra words: the subcategory and goal names). A curated question about a narrower group
// with no word in common ("…to Native American communities?" under Racial equity) stays.
export function sameAsk(a: string, b: string, topic = ""): boolean {
  if (questionKey(a) !== questionKey(b)) return false;
  const wa = new Set(topicWords(a).split(" ").filter(Boolean));
  const wb = [...topicWords(b).split(" "), ...topicWords(topic).split(" ")].filter(Boolean);
  return wb.some((w) => wa.has(w));
}
