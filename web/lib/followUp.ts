// Follow-ups on a research answer (/research/ask?q=…&f=…&f=…). Each follow-up is resolved against the
// thread's earlier specs into one of:
//   answer  a modified spec (swap cause, add a state, change metric, source or years) → a new answer card
//   text    a "why / what does it mean" question → a short streamed text answer from the numbers on the page
//   search  a request for organizations → a link to the search page
// Suggested chips are built from the last spec without any model call; picking one reuses its spec.
// Typed follow-ups get one FAST_MODEL structured-output call, cached 24 h.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, FAST_MODEL } from "./llm";
import { memo } from "./memo";
import { ROUTER_SYSTEM } from "./answerRoute";
import { DEFAULT_SPEC, normalizeSpec, specSchema, type Cause, type Spec } from "./answerSpec";
import { LOADED_STATES } from "./filters";

export type Turn = { question: string; spec: Spec };
export type Resolved =
  | { kind: "answer"; spec: Spec; standalone: string }
  | { kind: "text"; standalone: string }
  | { kind: "search"; standalone: string };

const STATE = Object.fromEntries(LOADED_STATES) as Record<string, string>;
const CLIMATE: Cause = { name: "climate", label: "climate", ntee: [], keywords: [] };
const WOMEN: Cause = { name: "women and girls", label: "women_girls", ntee: [], keywords: [] };
const MONEY = ["total", "share", "trend", "by_state", "top_funders", "top_recipients", "compare"];

// A plain standalone question for a spec, used for chips' saved questions and as a fallback.
export function describeSpec(s: Spec): string {
  const cause = s.causes.map((c) => c.name).join(" and ") || "all causes";
  const place = s.county ? ` in ${s.county}` : s.states.length === 1 ? ` in ${STATE[s.states[0]] ?? s.states[0]}` : s.states.length ? ` in ${s.states.join(", ")}` : "";
  const money = s.source === "government_grants" ? "government money" : s.source === "contributions" ? "contributions" : s.source === "revenue" ? "revenue" : "foundation money";
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

// Up to 3 answerable next questions, deterministic from the last spec.
export function suggestFollowUps(s: Spec): { label: string; spec: Spec }[] {
  const out: { label: string; spec: Spec }[] = [];
  const add = (label: string, change: Partial<Spec>) => out.push({ label, spec: normalizeSpec({ ...s, missing: [], missingNote: null, ...change }) });
  const c = s.causes[0];
  const one = s.causes.length <= 1;
  if (one && MONEY.includes(s.metric)) {
    if (c?.label === "climate") add("And for women and girls?", { causes: [WOMEN] });
    else if (c?.label === "women_girls") add("And for climate?", { causes: [CLIMATE] });
    else if (c) add("Compare with climate", { metric: "compare", causes: [c, CLIMATE], source: "foundation_grants" });
  }
  if (s.metric !== "trend" && ["total", "share", "by_state", "top_recipients"].includes(s.metric) && one) add("Is it growing?", { metric: "trend" });
  if (s.metric !== "by_state" && !s.states.length && !s.county && one && ["total", "share", "trend"].includes(s.metric)) add("By state", { metric: "by_state", perResident: true, order: "most" });
  if (s.source === "foundation_grants" && s.metric !== "top_funders" && one && c) add("Which foundations give the most?", { metric: "top_funders" });
  if (s.source === "foundation_grants" && ["total", "share", "trend"].includes(s.metric) && one && c) add("Government money instead", { source: "government_grants", metric: s.metric === "share" ? "total" : s.metric, yearFrom: null, yearTo: null });
  if (s.source !== "foundation_grants" && ["total", "trend", "top_recipients"].includes(s.metric)) add("Foundation money instead", { source: "foundation_grants" });
  return out.slice(0, 3);
}

const FOLLOW_SYSTEM = `${ROUTER_SYSTEM}

You are resolving a FOLLOW-UP in a research thread. You get the earlier questions with their specs (JSON) and the new message.
- kind "answer": the follow-up asks for a number, share, ranking, trend or count. Start from the LAST spec and change only what the follow-up changes ("and for women and girls?" swaps the cause; "by state?" sets metric by_state; "in Ohio?" sets states; "since 2023?" sets years; "government money?" changes source). Fill spec fully.
- kind "text": it asks why, what it means, how to interpret or what to do (no new number needed). spec: copy the last spec.
- kind "search": it asks to see or list specific organizations. spec: copy the last spec.
- standalone: the follow-up rewritten as a complete question that makes sense alone, e.g. "How much foundation money goes to women and girls in New York?"`;

const followSchema = z.object({ kind: z.enum(["answer", "text", "search"]), standalone: z.string() }).extend({ spec: specSchema });

const cached = memo<Resolved>("follow-up:v1", 1000, 24 * 3600_000);
export function resolveFollowUp(text: string, history: Turn[]): Promise<Resolved> {
  const last = history.at(-1)!;
  const chip = suggestFollowUps(last.spec).find((x) => x.label.toLowerCase() === text.trim().toLowerCase());
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
