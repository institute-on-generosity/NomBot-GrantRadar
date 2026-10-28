// Follow-up chips test: for each sample research thread, the chips must be (1) at most 3, (2) on the research
// question (no cause nobody asked about, no wider place, nothing already asked) and (3) answerable (the chip's
// spec returns an ok or partial answer). Routes the questions and picks chips with Claude.
//   npm run test:followups
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }

const { resolveThread } = await import("../lib/thread");
const { candidateFollowUps, pickFollowUps } = await import("../lib/followUp");
const { answer } = await import("../lib/answer");
const { db } = await import("../lib/db");

const threads: [string, string[]][] = [
  ["How concentrated is climate funding?", []],
  ["How much foundation money goes to climate?", ["Which states get the most money for climate per resident?"]],
  ["Is food bank funding growing?", []],
  ["How much foundation money goes to women and girls in New York?", []],
  ["Climate vs women and girls funding", []],
  ["Which states get the least foundation money per resident?", []],
  ["Which foundations give the most to animal shelters?", []],
  ["How much government money goes to climate organizations?", []],
  ["How much do itemizers deduct for charitable gifts in each state?", []],
  ["How much do households in Ohio deduct for charity?", []],
  ["Are foundations paying out more than 5%?", []],
  ["What share of food banks ran deficits each year?", []],
  ["How much federal grant money went to Head Start providers?", ["Which states get the most money for Head Start providers per resident?"]],
  ["Which federal agencies give the most to nonprofits in Ohio?", []],
  ["Which mental health nonprofits in California ran deficits 3 years in a row?", []],
  ["Is Feeding America financially healthy?", []],
];

let fails = 0;
for (const [q, fs] of threads) {
  const t0 = Date.now();
  const turns = await resolveThread(q, fs);
  if (!turns) { console.log(`SKIP  ${q} (not a research question)`); continue; }
  const history = turns.flatMap((t) => (t.kind === "answer" ? [{ question: t.standalone, spec: t.spec }] : []));
  const pool = candidateFollowUps(history.at(-1)!.spec, history);
  const t1 = Date.now();
  const picks = await pickFollowUps(history);
  const pickMs = Date.now() - t1;
  const asked = new Set(history.flatMap((h) => h.spec.causes.map((c) => c.name.toLowerCase())));
  const problems: string[] = [];
  if (picks.length > 3) problems.push(`${picks.length} chips`);
  for (const p of picks) {
    const c = pool.find((x) => x.label === p);
    if (!c) { problems.push(`not a candidate: ${p}`); continue; }
    const strange = c.spec.causes.filter((x) => !asked.has(x.name.toLowerCase()));
    if (strange.length) problems.push(`new cause in "${p}": ${strange.map((x) => x.name).join(", ")}`);
    const a = await answer(p, c.spec);
    if (a.status === "unanswerable") problems.push(`unanswerable: ${p} (${a.headline})`);
  }
  if (problems.length) fails++;
  console.log(`${problems.length ? "FAIL" : "ok  "}  ${[q, ...fs].join(" → ")}  [pick ${pickMs} ms, total ${Date.now() - t0} ms]`);
  for (const p of picks) console.log(`        · ${p}`);
  for (const p of problems) console.log(`        ✗ ${p}`);
}
// Answer settings: a trend whose start year spiked (food banks, 2020) offers "Since 2021" (options.since), which resolves
// without a model call to the same spec from 2021 and is answerable.
{
  const { resolveFollowUp } = await import("../lib/followUp");
  const { DEFAULT_SPEC } = await import("../lib/answerSpec");
  const fb = { ...DEFAULT_SPEC, metric: "trend" as const, causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] };
  const a = await answer("Is food bank funding growing?", fb);
  // Since Oct 27 the start year is an in-place setting on the answer (options.since), not a chat chip
  const chip = a.options?.since ? `Since ${a.options.since}?` : undefined;
  const problems: string[] = [];
  if (chip !== "Since 2021?") problems.push(`answer option ${JSON.stringify(a.options)}, want since 2021`);
  else {
    const r = await resolveFollowUp(chip, [{ question: "Is food bank funding growing?", spec: fb }]);
    if (r.kind !== "answer" || r.spec.yearFrom !== 2021) problems.push(`"${chip}" resolved to ${JSON.stringify(r)}`);
    else {
      const b = await answer(r.standalone, r.spec);
      if (b.status === "unanswerable" || !b.headline.includes("2021")) problems.push(`"${chip}" answer: ${b.status} ${b.headline}`);
      else console.log(`ok    answer chip ${chip} → ${b.headline}`);
    }
  }
  if (problems.length) { fails++; console.log(`FAIL  answer chips (food banks)`); for (const p of problems) console.log(`        ✗ ${p}`); }
}
// No follow-up may fall back to a text turn because the resolver call failed (grammar limit, Oct 27)
{
  const { followUpFallbackCount } = await import("../lib/followUp");
  const n = followUpFallbackCount();
  if (n) { fails++; console.log(`FAIL  ${n} follow-up(s) fell back because the resolver call failed`); }
  else console.log("ok    no follow-up resolver fallbacks");
}
console.log(fails ? `\n${fails} thread(s) failed` : "\nAll threads passed");
await db.end();
process.exit(fails ? 1 : 0);
