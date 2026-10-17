// Follow-ups on a research answer (/research/ask?q=…&f=…&f=…). Each follow-up is resolved against the
// thread's earlier specs into one of:
//   answer  a modified spec (swap cause, add a state, change metric, source or years) → a new answer card
//   text    a "why / what does it mean" question → a short streamed text answer from the numbers on the page
//   search  a request for organizations → a link to the search page
// Suggested chips are built from the last spec without any model call; picking one reuses its spec.
// Typed follow-ups get one FAST_MODEL structured-output call, cached 24 h.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, fallback as fallbackOpts, FAST_MODEL } from "./llm";
import { memo } from "./memo";
import { ROUTER_SYSTEM } from "./answerRoute";
import { DEFAULT_SPEC, normalizeSpec, specSchema, type Spec } from "./answerSpec";
import { LOADED_STATES } from "./filters";

export type Turn = { question: string; spec: Spec };
export type Resolved =
  | { kind: "answer"; spec: Spec; standalone: string }
  | { kind: "text"; standalone: string }
  | { kind: "search"; standalone: string };

const STATE = Object.fromEntries(LOADED_STATES) as Record<string, string>;

// A plain standalone question for a spec, used for chips' saved questions and as a fallback.
const CHARITY_MONEY: Record<string, string> = { daf_sponsor: "donor-advised fund money", community_foundation: "community foundation money", united_way: "United Way money", other: "money from grantmaking charities" };
const moneyOf = (s: Spec) => s.source === "government_grants" ? "government money" : s.source === "federal_awards" ? "federal money for nonprofits" : s.source === "contributions" ? "contributions" : s.source === "revenue" ? "revenue"
  : s.source === "charity_grants" ? CHARITY_MONEY[s.charityFunder ?? ""] ?? "grant money from charities" : "foundation money";
export function describeSpec(s: Spec): string {
  const cause = s.causes.map((c) => c.name).join(" and ") || "all causes";
  const place = s.county ? ` in ${s.county}` : s.states.length === 1 ? ` in ${STATE[s.states[0]] ?? s.states[0]}` : s.states.length ? ` in ${s.states.join(", ")}` : "";
  const money = moneyOf(s);
  switch (s.metric) {
    case "trend": return `Is ${money} for ${cause}${place} growing?`;
    case "share": return `What share of ${money} goes to ${cause}${place}?`;
    case "compare": return `How does ${money} for ${cause}${place} compare?`;
    case "by_state": return `Which states get the ${s.order === "least" ? "least" : "most"} ${money} for ${cause}${s.perResident ? " per resident" : ""}?`;
    case "top_funders": return `Which foundations give the most to ${cause}${place}?`;
    case "top_recipients": return `Which organizations get the most ${money} for ${cause}${place}?`;
    case "by_rurality": return `Do rural counties get less ${money} for ${cause}?`;
    case "grant_size": return `What is the typical foundation grant for ${cause}${place}?`;
    case "concentration": return `How concentrated is foundation money for ${cause}${place}?`;
    case "general_support": return `What share of foundation money for ${cause}${place} is general operating support?`;
    case "out_of_state": return `How much foundation money for ${cause}${place} comes from other states?`;
    case "overlap_funders": return `Which foundations fund both ${cause}?`;
    case "count_orgs": return `How many ${cause} organizations${place} ${s.condition === "deficit" ? "run deficits" : s.condition === "low_cash" ? "have under 3 months of cash" : s.condition === "gov_reliant" ? "rely on government grants" : "are there"}?`;
    default: return `How much ${money} goes to ${cause}${place}?`;
  }
}

// Suggested follow-ups, in two steps so every chip is answerable AND about the research question:
//   1. candidateFollowUps: every next question our fixed SQL can answer from the last spec, kept on topic by
//      rule (onTopic: same causes as the thread, no wider place than asked, nothing already asked). Each names
//      its subject so it reads on its own ("Who gets the most money for climate?", not "Is it growing?").
//   2. pickFollowUps: one FAST_MODEL call picks the 3 that best deepen the thread's FIRST question, in order.
//      It can only choose from the candidates (indices), so it can't invent an unanswerable chip. No key,
//      an error or a slow reply falls back to the first 3 candidates.
type Chip = { label: string; spec: Spec };
export function candidateFollowUps(s: Spec, history: Turn[] = []): Chip[] {
  const out: Chip[] = [];
  const add = (label: string, change: Partial<Spec>) => {
    if (!out.some((o) => o.label === label)) out.push({ label, spec: normalizeSpec({ ...s, missing: [], missingNote: null, ...change }) });
  };
  const c = s.causes[0];
  const one = s.causes.length <= 1;
  const pf = s.source === "foundation_grants" || s.source === "charity_grants"; // grant-level sources: funders, recipients, sizes
  const cause = c?.name ?? "";
  const of = cause ? ` ${cause}` : "";
  const forX = cause ? ` for ${cause}` : "";
  const money = moneyOf(s);
  const next: Record<string, () => void> = {
    concentration: () => {
      add(`Who gets the most money${forX}?`, { metric: "top_recipients" });
      add(`Which foundations give the most${of ? ` to${of}` : ""}?`, { metric: "top_funders" });
      add(`What is the typical grant${forX}?`, { metric: "grant_size" });
      add(`How much money${forX} is general support?`, { metric: "general_support" });
    },
    top_recipients: () => {
      if (pf) add(`How concentrated is funding${forX}?`, { metric: "concentration" });
      if (pf) add(`Which foundations give the most${of ? ` to${of}` : ""}?`, { metric: "top_funders" });
    },
    top_funders: () => {
      if (pf) add(`Who gets the most money${forX}?`, { metric: "top_recipients" });
      if (pf) add(`How much money${forX} is general support?`, { metric: "general_support" });
      if (pf) add(`How much money${forX} crosses state lines?`, { metric: "out_of_state" });
    },
    grant_size: () => {
      add(`How much money${forX} is general support?`, { metric: "general_support" });
      add(`How concentrated is funding${forX}?`, { metric: "concentration" });
    },
    general_support: () => {
      add(`What is the typical grant${forX}?`, { metric: "grant_size" });
      add(`Which foundations give the most${of ? ` to${of}` : ""}?`, { metric: "top_funders" });
    },
    out_of_state: () => {
      add(`Which foundations give the most${of ? ` to${of}` : ""}?`, { metric: "top_funders" });
      add(`Which states get the most money${forX} per resident?`, { metric: "by_state", perResident: true, order: "most", states: [], county: null });
    },
    by_state: () => {
      add(`Is ${money}${of ? ` for${of}` : ""} growing?`, { metric: "trend", perResident: false });
      add(`Which states get the ${s.order === "least" ? "most" : "least"}?`, { order: s.order === "least" ? "most" : "least" });
    },
    by_rurality: () => add(`Which states get the most money${forX} per resident?`, { metric: "by_state", perResident: true, order: "most" }),
    trend: () => {
      if (!s.states.length && !s.county) add(`Which states get the most money${forX} per resident?`, { metric: "by_state", perResident: true, order: "most" });
      if (pf && c) add(`Who gets the most money${forX}?`, { metric: "top_recipients" });
      if (pf && c) add(`Is government money for${of} growing too?`, { source: "government_grants", yearFrom: null, yearTo: null });
    },
    total: () => {
      add(`Is ${money}${of ? ` for${of}` : ""} growing?`, { metric: "trend", perResident: false });
      if (!s.states.length && !s.county) add(`Which states get the most money${forX} per resident?`, { metric: "by_state", perResident: true, order: "most" });
      if (pf && c) add(`Who gets the most money${forX}?`, { metric: "top_recipients" });
    },
  };
  next.share = next.total;
  if (one) next[s.metric]?.();
  // A thread that compares two causes keeps comparing them.
  if (s.causes.length === 2 && s.metric !== "compare") add(describeSpec(normalizeSpec({ ...s, metric: "compare" })), { metric: "compare" });
  if (s.causes.length === 2 && s.metric === "compare") add(`Is money for ${s.causes[0].name} or ${s.causes[1].name} growing faster?`, { metric: "trend" });
  if (s.source !== "foundation_grants" && ["total", "trend", "top_recipients"].includes(s.metric)) add(`What about foundation money${forX}?`, { source: "foundation_grants" });
  if (s.source === "foundation_grants" && c && ["total", "trend"].includes(s.metric)) add(`What about donor-advised fund money${forX}?`, { source: "charity_grants", charityFunder: "daf_sponsor" });
  return out.filter((o) => onTopic(o.spec, history));
}

const causeKey = (x: Spec) => x.causes.map((c) => c.label ?? c.name.toLowerCase()).sort().join("+");
// A chip stays on the research question: the causes someone asked about (no new cause they never mentioned),
// no wider place than the thread's first question, and nothing the thread already answered.
function onTopic(c: Spec, history: Turn[]): boolean {
  if (!history.length) return true;
  const asked = new Set(history.map((h) => causeKey(h.spec)));
  if (!asked.has(causeKey(c)) && !(c.metric === "compare" && history.some((h) => h.spec.causes.length === 2))) return false;
  const first = history[0].spec;
  if ((first.states.length || first.county) && !c.states.length && !c.county && c.metric !== "by_state") return false;
  const done = new Set(history.map((h) => describeSpec(h.spec)));
  return !done.has(describeSpec(c));
}

const pickSchema = z.object({ picks: z.array(z.number().int()).describe("Indices of the chosen candidates, most useful first, at most 3") });
const picked = memo<string[]>("follow-up-picks:v1", 1000, 7 * 24 * 3600_000);
export async function pickFollowUps(history: Turn[]): Promise<string[]> {
  const pool = candidateFollowUps(history.at(-1)!.spec, history);
  const fallback = pool.slice(0, 3).map((c) => c.label);
  const client = claude();
  if (pool.length <= 3 || !client) return fallback;
  const key = JSON.stringify([history.map((h) => [h.question, describeSpec(h.spec)]), pool.map((c) => c.label)]);
  const choose = picked(key, async () => {
    const res = await client.beta.messages.parse({
      model: FAST_MODEL,
      max_tokens: 200,
      ...fallbackOpts(FAST_MODEL),
      output_config: { effort: "low", format: betaZodOutputFormat(pickSchema) },
      system: "You suggest next questions for a philanthropy researcher. Pick the candidates that best deepen or test the answer to the thread's FIRST question (the research question), most useful first. Prefer questions that explain the latest answer (who is behind it, how it changes, where). Skip any that drift from the research question. Return candidate indices only.",
      messages: [{ role: "user", content: `Research question: ${history[0].question}\nThread:\n${history.map((h, i) => `${i + 1}. ${h.question}`).join("\n")}\n\nCandidates:\n${pool.map((c, i) => `${i}. ${c.label}`).join("\n")}` }],
    });
    const idx = res.stop_reason === "refusal" ? [] : res.parsed_output?.picks ?? [];
    const out = [...new Set(idx)].filter((i) => i >= 0 && i < pool.length).slice(0, 3).map((i) => pool[i].label);
    if (!out.length) throw new Error("no picks");
    return out;
  });
  const slow = new Promise<string[]>((r) => setTimeout(() => r(fallback), 4000));
  return Promise.race([choose, slow]).catch(() => fallback);
}

const FOLLOW_SYSTEM = `${ROUTER_SYSTEM}

You are resolving a FOLLOW-UP in a research thread. You get the earlier questions with their specs (JSON) and the new message.
- kind "answer": the follow-up asks for a number, share, ranking, trend or count. Start from the LAST spec and change only what the follow-up changes ("and for women and girls?" swaps the cause; "by state?" sets metric by_state; "in Ohio?" sets states; "since 2023?" sets years; "government money?" changes source). Fill spec fully.
- kind "text": it asks why, what it means, how to interpret or what to do (no new number needed). spec: copy the last spec.
- kind "search": it asks to see or list specific organizations. spec: copy the last spec.
- standalone: the follow-up rewritten as a complete question that makes sense alone, e.g. "How much foundation money goes to women and girls in New York?"`;

const followSchema = z.object({ kind: z.enum(["answer", "text", "search"]), standalone: z.string() }).extend({ spec: specSchema });

const cached = memo<Resolved>("follow-up:v2", 1000, 24 * 3600_000);
export function resolveFollowUp(text: string, history: Turn[]): Promise<Resolved> {
  const last = history.at(-1)!;
  const chip = candidateFollowUps(last.spec, history).find((x) => x.label.toLowerCase() === text.trim().toLowerCase());
  if (chip) return Promise.resolve({ kind: "answer", spec: chip.spec, standalone: describeSpec(chip.spec) });
  const key = JSON.stringify([history.map((h) => h.spec), text.trim().toLowerCase()]);
  return cached(key, () => resolveFresh(text, history));
}

async function resolveFresh(text: string, history: Turn[]): Promise<Resolved> {
  const client = claude();
  if (!client) return { kind: "text", standalone: text };
  const thread = history.map((h, i) => `${i + 1}. ${h.question}\nspec: ${JSON.stringify(h.spec)}`).join("\n\n");
  const res = await client.beta.messages.parse({
    model: FAST_MODEL,
    max_tokens: 1200,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(followSchema) },
    system: FOLLOW_SYSTEM,
    messages: [{ role: "user", content: `Thread so far:\n${thread}\n\nFollow-up: ${text}` }],
  });
  const o = res.stop_reason === "refusal" ? null : res.parsed_output;
  if (!o) return { kind: "text", standalone: text };
  if (o.kind === "answer") return { kind: "answer", spec: normalizeSpec({ ...DEFAULT_SPEC, ...o.spec }), standalone: o.standalone || text };
  return { kind: o.kind, standalone: o.standalone || text };
}
