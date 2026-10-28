// The cause popover's topics and questions (Oct 28, Hunter): one question per INTENT per topic, never the same ask
// twice in different words. Standard intents always show their short form (the breadcrumb already names the topic) and
// still send the full question. Fixed order: how much, growing, funders, states, under-funded, then up to 2 curated
// questions with a different intent, as written. Pure and client-safe (components/GoalGrid; eval/popover.mts).
import type { PromptGroup } from "@/components/HeroFlip";
import type { Trust } from "./sdg";
import { intentOf, sameAsk, type Intent } from "./questionIntent";

export type Ask = { q: string; label: string; intent: Intent };
export type Topic = { label: string; prompts: Ask[]; trust?: Trust; tip?: string };
export { intentOf };

type Standard = "total" | "trend" | "top_funders" | "by_state" | "underfunded";
export const STANDARD: [Standard, string][] = [
  ["total", "How much foundation money goes here?"], ["trend", "Is it growing?"], ["top_funders", "Who are the biggest funders?"],
  ["by_state", "Which states get the most?"], ["underfunded", "Which nonprofits get little for their size?"]];
const ORDER: Intent[] = ["total", "trend", "top_funders", "by_state", "underfunded"];
const rank = (i: Intent) => (ORDER.includes(i) ? ORDER.indexOf(i) : ORDER.length);

const clean = (q: string) => q.replace(/\s\(SDG \d+\)/, "");
export function topicsOf(g: PromptGroup): Topic[] {
  const full = (q: string): Ask => ({ q, label: clean(q), intent: intentOf(q) });
  if (!g.table) return [{ label: g.label, prompts: g.prompts.map(full) }];
  const curated = new Map((g.subs ?? []).map((s) => [s.label, s.prompts]));
  const used = new Set<string>();
  const build = (label: string, q: NonNullable<PromptGroup["table"]>[number]["q"], mine: string[]): Ask[] => {
    const std: Ask[] = q ? STANDARD.map(([k, short]) => ({ q: q[k], label: short, intent: k })) : [];
    // A curated question keeps its own words only when it asks something the standard ones don't (intent + place
    // + years, lib/questionIntent); at most 2 of those, and never two that ask the same thing
    const seen = std.map((a) => a.q);
    const extras: Ask[] = [];
    for (const a of mine.map(full)) {
      if (seen.some((x) => sameAsk(a.q, x, `${label} ${g.label}`))) continue;
      seen.push(a.q);
      extras.push(a);
    }
    return [...std, ...extras.sort((a, b) => rank(a.intent) - rank(b.intent)).slice(0, q ? 2 : 5)];
  };
  const out = g.table.map((r) => {
    const mine = curated.get(r.label) ?? [];
    if (mine.length) used.add(r.label);
    return { label: r.label, trust: r.trust, tip: r.tip, prompts: build(r.label, r.q, mine) };
  });
  // Curated prompts whose topic isn't a row (a goal-wide question) join the goal's own row
  const extra = (g.subs ?? []).filter((s) => !used.has(s.label)).flatMap((s) => s.prompts);
  if (extra.length && out[0]) out[0].prompts = build(out[0].label, g.table[0].q, [...(curated.get(out[0].label) ?? []), ...extra]);
  return out.filter((t) => t.prompts.length);
}
