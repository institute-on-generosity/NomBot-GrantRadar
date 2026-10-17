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
console.log(fails ? `\n${fails} thread(s) failed` : "\nAll threads passed");
await db.end();
process.exit(fails ? 1 : 0);
