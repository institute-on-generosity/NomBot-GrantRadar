// Turn a plain-language question into search filters.
// Uses an LLM when a provider key is set (see lib/llm.ts); otherwise a small
// rule-based parser (POC fallback).
import { generateObject } from "ai";
import { languageModel } from "./llm";
import { z } from "zod";

export type Filters = { q: string; semantic: string; states: string[]; maxRevenue?: number; ntee?: string; parser: "llm" | "rules"; labels: string[] };

const STATES: Record<string, string> = { "west virginia": "WV", kentucky: "KY", tennessee: "TN", virginia: "VA", ohio: "OH" };
const REGIONS: Record<string, string[]> = { appalachia: ["WV", "KY", "TN", "VA", "OH"], appalachian: ["WV", "KY", "TN", "VA", "OH"] };
const NTEE: [RegExp, string, string][] = [[/\bfood (banks?|pantr(y|ies))\b|\bpantr(y|ies)\b|\bsoup kitchens?\b/i, "K3", "Food banks"]];

const schema = z.object({
  topic: z.string().describe("What the organizations do, as search words, without places or budget"),
  states: z.array(z.string().length(2)).describe("US state codes; expand regions like Appalachia"),
  maxRevenue: z.number().nullable().describe("Upper revenue/budget limit in dollars, or null"),
  ntee: z.string().nullable().describe("NTEE code prefix if the cause is clear (e.g. K3 for food banks), or null"),
});

function money(n: number) { return n >= 1e6 ? `$${n / 1e6}M` : `$${Math.round(n / 1e3)}K`; }

export async function parseQuestion(question: string): Promise<Filters> {
  const model = languageModel();
  if (model) {
    const { object } = await generateObject({ model, schema, prompt: `Turn this nonprofit search into filters: ${question}` });
    const labels = [object.topic, ...(object.states.length ? [object.states.join(" · ")] : []), ...(object.maxRevenue ? [`Under ${money(object.maxRevenue)}`] : [])];
    return { q: object.topic, semantic: object.topic, states: object.states.map((s) => s.toUpperCase()), maxRevenue: object.maxRevenue ?? undefined, ntee: object.ntee ?? undefined, parser: "llm", labels };
  }
  let rest = ` ${question.toLowerCase()} `;
  let topic = rest; // keeps cause words (e.g. "food banks") for semantic search
  const labels: string[] = [];
  let ntee: string | undefined;
  for (const [re, code, label] of NTEE) if (re.test(rest)) { ntee = code; labels.push(label); rest = rest.replace(re, " "); }
  const states = new Set<string>();
  for (const [name, codes] of Object.entries(REGIONS)) if (rest.includes(name)) { codes.forEach((c) => states.add(c)); labels.push(name[0].toUpperCase() + name.slice(1, 10)); rest = rest.replace(name, " "); topic = topic.replace(name, " "); }
  for (const [name, code] of Object.entries(STATES)) if (rest.includes(` ${name} `)) { states.add(code); labels.push(code); rest = rest.replace(name, " "); topic = topic.replace(name, " "); }
  let maxRevenue: number | undefined;
  const m = rest.match(/(?:under|below|less than|<)\s*\$?\s*([\d.,]+)\s*(k|m|thousand|million)?/);
  if (m) {
    maxRevenue = parseFloat(m[1].replace(/,/g, "")) * ({ k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 }[m[2] as "k"] ?? 1);
    labels.push(`Under ${money(maxRevenue)}`); rest = rest.replace(m[0], " "); topic = topic.replace(m[0], " ");
  }
  const stop = new Set("a an and also are budget do does for in of on or rural that the their them they to with who which".split(" "));
  const words = (t: string) => t.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w && !stop.has(w)).join(" ");
  const q = words(rest);
  if (q) labels.push(q.replace(/\b\w/, (c) => c.toUpperCase()));
  return { q, semantic: words(topic), states: [...states], maxRevenue, ntee, parser: "rules", labels };
}
