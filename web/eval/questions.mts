// No repeated questions anywhere a cause lists questions (Oct 28, Hunter). Every list is normalized (intent, place and
// years, cause words: lib/questionIntent) and checked for two questions that ask the same thing in different words:
// the popover topics, the curated prompts (raw, to count what lib/examples drops, and as shown), the Across-causes
// groups, Browse's asks per cause, report follow-up suggestions, and follow-up chips for every known question.
//   npm run test:questions
import { BY_SDG, RESEARCH_GROUPS } from "../lib/examples";
import { topicsOf } from "../lib/popoverTopics";
import { intentOf, questionKeyWithTopic, sameAsk } from "../lib/questionIntent";
import { causeQuestions, covered, displayCause, findSub, SDGS } from "../lib/sdg";
import { askSuggestions } from "../lib/insightMeta";
import { candidateFollowUps } from "../lib/followUp";
import { knownQuestions } from "../lib/knownQuestions";

let fails = 0, lists = 0;
const bad = (m: string) => { fails++; if (fails <= 25) console.log(`FAIL  ${m}`); };
const dupesIn = (qs: string[], topic = "") => { const d: [string, string][] = []; qs.forEach((q, i) => qs.slice(0, i).forEach((p) => { if (sameAsk(q, p, topic)) d.push([p, q]); })); return d; };

// 1. Curated prompts as written, against their topic's generated questions: what lib/examples drops
let found = 0;
for (const g of SDGS) for (const x of BY_SDG[g.n] ?? []) {
  const f = findSub(x.sub); if (!f) continue;
  const gen = Object.values(causeQuestions(displayCause(f.sub, g))).slice(0, 7);
  const names = `${f.sub.name} ${g.name} ${f.sub.plain}`;
  const seen = [...gen];
  for (const q of x.prompts) { if (seen.some((p) => sameAsk(q, p, names))) found++; else seen.push(q); }
}
// 2. What people see: each popover topic, and the curated lists after the drop
for (const g of RESEARCH_GROUPS.filter((x) => x.table)) {
  for (const t of topicsOf(g)) { lists++; for (const [a, b] of dupesIn(t.prompts.map((p) => p.q), `${t.label} ${g.label}`)) bad(`popover ${g.label} / ${t.label}: "${b}" repeats "${a}"`); }
  for (const s of g.subs ?? []) { lists++; for (const [a, b] of dupesIn(s.prompts, s.label)) bad(`curated ${g.label} / ${s.label}: "${b}" repeats "${a}"`); }
  // across levels: the goal-level row and a topic row never ask the same thing about the same cause
  const rows = (g.table ?? []).filter((r) => r.q);
  const byKey = new Map<string, string>();
  for (const r of rows) for (const q of Object.values(r.q!)) { const k = questionKeyWithTopic(q); if (byKey.has(k) && byKey.get(k) !== r.label) bad(`levels ${g.label}: "${q}" in ${r.label} and ${byKey.get(k)}`); byKey.set(k, r.label); }
}
// 3. Across-causes groups (no table): their example lists
for (const g of RESEARCH_GROUPS.filter((x) => !x.table)) { lists++; for (const [a, b] of dupesIn(g.prompts)) bad(`group ${g.label}: "${b}" repeats "${a}"`); }
// 4. Browse's questions per cause: one per intent
for (const f of covered()) {
  lists++;
  const qs = Object.values(causeQuestions(displayCause(f.sub, f.sdg)));
  const intents = qs.map(intentOf);
  if (new Set(intents).size !== intents.length) bad(`browse ${f.sub.id}: two questions share an intent (${intents.join(", ")})`);
}
// 5. Report follow-up suggestions per section
for (const sec of ["funding-gaps", "rising-fading", "money-flows", "track-record", "affiliations", "financial-stress", "other"]) { lists++; for (const [a, b] of dupesIn(askSuggestions(sec))) bad(`report ${sec}: "${b}" repeats "${a}"`); }
// 6. Follow-up chips for every known question: distinct, and none asks the thread's own question again
let chipLists = 0;
for (const { q, spec } of knownQuestions()) {
  const chips = candidateFollowUps(spec, [{ question: q, spec }]).map((c) => c.label);
  chipLists++; lists++;
  for (const c of chips) if (!/^since \d{4}\??$/i.test(c) && sameAsk(c, q) && questionKeyWithTopic(c) === questionKeyWithTopic(q)) bad(`chips for "${q}": "${c}" asks it again`);
  for (const [a, b] of dupesIn(chips).filter(([a, b]) => questionKeyWithTopic(a) === questionKeyWithTopic(b))) bad(`chips for "${q}": "${b}" repeats "${a}"`);
}
console.log(`${lists} question lists checked (${chipLists} follow-up chip sets). Curated prompts that repeated a generated question: ${found} found, dropped from what people see.`);
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
