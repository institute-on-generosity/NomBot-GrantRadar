// The cause popover (Oct 28): one question per intent per topic, short forms for standard intents, fixed order.
//   npm run test:popover
import { RESEARCH_GROUPS } from "../lib/examples";
import { intentOf, STANDARD, topicsOf } from "../lib/popoverTopics";
import { sameAsk } from "../lib/questionIntent";
let fails = 0, topics = 0, rows = 0;
const bad = (m: string) => { fails++; if (fails <= 30) console.log(`FAIL  ${m}`); };
const shorts = new Set(STANDARD.map(([, s]) => s));
for (const g of RESEARCH_GROUPS.filter((x) => x.table)) { // the cause popovers (Across-causes groups list curated examples)
  for (const t of topicsOf(g)) {
    topics++; rows += t.prompts.length;
    for (let i = 0; i < t.prompts.length; i++) for (let j = 0; j < i; j++) if (sameAsk(t.prompts[i].q, t.prompts[j].q, `${t.label} ${g.label}`)) bad(`${g.label} / ${t.label}: "${t.prompts[i].label}" asks what "${t.prompts[j].label}" asks`);
    const std = t.prompts.filter((a) => shorts.has(a.label)), extras = t.prompts.filter((a) => !shorts.has(a.label));
    if (std.length && t.prompts.slice(0, std.length).some((a) => !shorts.has(a.label))) bad(`${g.label} / ${t.label}: curated questions before the standard ones`);
    if (std.map((a) => a.intent).join() !== STANDARD.slice(0, std.length).map(([k]) => k).join()) bad(`${g.label} / ${t.label}: standard rows out of order`);
    if (std.length && extras.length > 2) bad(`${g.label} / ${t.label}: ${extras.length} curated extras (max 2)`);
    const topic = t.label.replace(/^All of /, "").toLowerCase();
    for (const a of std) if (a.label.toLowerCase().includes(topic)) bad(`${g.label} / ${t.label}: "${a.label}" repeats the topic`);
    for (const a of t.prompts) if (/\(SDG \d+\)|Goal \d+/.test(a.label)) bad(`${g.label} / ${t.label}: "${a.label}" names an SDG`);
  }
}
// The intents of the generated questions themselves
const probe: [string, string][] = [["How much foundation money goes to youth development?", "total"], ["Is youth development funding growing?", "trend"], ["Is foundation money for youth development growing?", "trend"],
  ["Who are the biggest foundation funders of youth development?", "top_funders"], ["Which states get the most foundation money for youth development?", "by_state"],
  ["Which youth development nonprofits get little foundation money for their size?", "underfunded"], ["How many food banks are running deficits?", "health"], ["Which states get the least foundation money per resident?", "other"]];
for (const [q, want] of probe) if (intentOf(q) !== want) bad(`intent of "${q}": ${intentOf(q)}, want ${want}`);
console.log(`${topics} topics, ${rows} rows`);
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
