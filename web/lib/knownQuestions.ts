// Known research questions (Oct 27, speed): the questions NomBot itself offers (the home and /research cause popover,
// Browse ask links and the curated prompts) map straight to their answer spec, so they skip the Claude router
// (~2 s) and, prewarmed at startup (instrumentation.ts), answer from cache. Free text still goes through the router.
import { DEFAULT_SPEC, normalizeSpec, type Metric, type Spec } from "./answerSpec";
import { causeOf, causeQuestions, covered, displayCause, ENVIRONMENT, findSub, type Sdg, type Sub } from "./sdg";
import { BY_SDG } from "./examples";

const norm = (q: string) => q.toLowerCase().replace(/[?.!]+$/, "").replace(/\s+/g, " ").trim();
export const KNOWN_METRICS = ["total", "trend", "top_funders", "top_recipients", "by_state", "concentration", "count_orgs", "underfunded"] as const;

const specOf = (sub: Sub, sdg: Sdg | null, metric: Metric): Spec | null => {
  const c = causeOf(sub, sdg);
  return c ? normalizeSpec({ ...DEFAULT_SPEC, causes: [c], metric }) : null;
};

// Curated prompt -> (subcategory, metric), for the curated ones that ask one of the standard things.
export function metricOfPrompt(q: string): Metric | null {
  const t = q.toLowerCase();
  // Only plain cause questions: a place, a comparison or any other qualifier goes through the router
  if (/\b(in|across|per|vs|versus|than|compared?|since|by)\b/.test(t.replace(/^how much foundation money goes to|^which states get the most foundation money for|^who are the biggest foundation funders of|^is foundation money for/, ""))) return null;
  if (/little foundation money for their size|under-funded|overlooked/.test(t)) return "underfunded";
  if (/\bconcentrated\b/.test(t)) return "concentration";
  if (/^which states get the most foundation money/.test(t)) return "by_state";
  if (/^who are the biggest foundation funders of/.test(t)) return "top_funders";
  if (/\bgrowing\b/.test(t) && !/faster than|fastest/.test(t)) return "trend";
  if (/^how much foundation money goes to/.test(t)) return "total";
  return null;
}

let MAP: Map<string, Spec> | null = null;
function build(): Map<string, Spec> {
  const m = new Map<string, Spec>();
  for (const f of covered()) {
    const qs = causeQuestions(displayCause(f.sub, f.sdg));
    for (const k of KNOWN_METRICS) { const s = specOf(f.sub, f.sdg, k); if (s) m.set(norm(qs[k]), s); }
  }
  const env = covered().find((f) => f.sub === ENVIRONMENT.scope);
  if (!env) for (const k of KNOWN_METRICS) { const s = specOf(ENVIRONMENT.scope, null, k); if (s) m.set(norm(causeQuestions(displayCause(ENVIRONMENT.scope, null))[k]), s); }
  // Curated prompts (lib/examples.ts) that ask one of the standard things, with their subcategory
  for (const list of Object.values(BY_SDG)) for (const { sub, prompts } of list) {
    const f = findSub(sub);
    if (!f) continue;
    for (const q of prompts) { const k = metricOfPrompt(q); const s = k ? specOf(f.sub, f.sdg, k) : null; if (s && !m.has(norm(q))) m.set(norm(q), s); }
  }
  return m;
}
export function knownSpec(q: string): Spec | null {
  MAP ??= build();
  return MAP.get(norm(q)) ?? null;
}
export function knownQuestions(): { q: string; spec: Spec }[] {
  MAP ??= build();
  return [...MAP].map(([q, spec]) => ({ q, spec }));
}
