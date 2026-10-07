// Turn a plain-language question into search filters.
// Uses Claude (structured outputs) when ANTHROPIC_API_KEY is set (see lib/llm.ts);
// otherwise, or if the call fails, a small rule-based parser (POC fallback).
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, LLM_MODEL } from "./llm";
import { memo } from "./memo";
import type { Requirement } from "./search";
import { z } from "zod";

export type Filters = {
  q: string; semantic: string; states: string[]; cities: string[]; maxRevenue?: number;
  ntee?: string;      // cause the user picked: a hard filter
  nteeHint?: string;  // cause NomBot guessed from the question: a ranking boost only (orgs are often coded elsewhere)
  requirements: Requirement[]; parser: "llm" | "rules";
  topic: string;        // what the organizations do, for display
  placeLabel?: string;  // the place as the user said it ("Appalachia"), for display
};

const STATES: Record<string, string> = { "west virginia": "WV", kentucky: "KY", tennessee: "TN", virginia: "VA", ohio: "OH" };
const REGIONS: Record<string, string[]> = { appalachia: ["WV", "KY", "TN", "VA", "OH"], appalachian: ["WV", "KY", "TN", "VA", "OH"] };
const NTEE: [RegExp, string, string][] = [[/\bfood (banks?|pantr(y|ies))\b|\bpantr(y|ies)\b|\bsoup kitchens?\b/i, "K3", "Food banks"]];
const REQS: [RegExp, string, string[]][] = [
  [/\b(workforce|job (training|skills|readiness)|employment training|vocational)\b/i, "workforce training",
    ["workforce", "job training", "job skills", "job readiness", "employment training", "vocational", "career training"]],
];

const SYSTEM = `You turn a plain-language US nonprofit search into database filters.
- topic: what the organizations do, as search words, without places or budget.
- states: two-letter codes; expand named regions (e.g. Appalachia). When the user names a city, include its state.
- cities: city names exactly as the user wrote them (e.g. "Louisville"), only for an actual city or town; empty for states, regions or counties.
- placeLabel: the place as the user said it ("Appalachia", "Kentucky"), or null.
- ntee: an NTEE prefix ONLY when the main cause clearly maps: food banks/pantries K3, animals D, arts A, education B, environment C, health E, mental health F, employment J, housing L, youth development O, human services P. Otherwise null.
- requirements: specific activities the organization MUST do beyond its main cause (e.g. "that do workforce training"). Each gets 4-8 lowercase words or short phrases likely to appear in IRS mission text. Empty if none.`;

const schema = z.object({
  topic: z.string(),
  states: z.array(z.string()),
  cities: z.array(z.string()),
  placeLabel: z.string().nullable(),
  maxRevenue: z.number().nullable().describe("Upper revenue/budget limit in dollars, or null"),
  ntee: z.string().nullable(),
  requirements: z.array(z.object({ label: z.string(), synonyms: z.array(z.string()) })),
});

const esc = (s: string) => s.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toReq = (label: string, terms: string[]): Requirement => ({ label, pattern: [label, ...terms].filter(Boolean).map(esc).join("|") });

// Same question -> same filters: sorting, "Show more", going back and CSV export reuse
// Claude's reading instead of asking again (faster, and the CSV matches the screen).
const cached = memo<Filters>("parse:v3", 1000, 24 * 3600_000); // bump the name when Filters changes shape
export function parseQuestion(question: string): Promise<Filters> {
  return cached(question.toLowerCase().replace(/\s+/g, " ").trim(), () => parseFresh(question));
}

async function parseFresh(question: string): Promise<Filters> {
  const client = claude();
  if (client) {
    try {
      const res = await client.beta.messages.parse({
        model: LLM_MODEL,
        max_tokens: 2048,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(schema) },
        system: SYSTEM,
        messages: [{ role: "user", content: question }],
      });
      const o = res.stop_reason === "refusal" ? null : res.parsed_output;
      if (o) {
        const states = o.states.map((s) => s.toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
        const requirements = o.requirements.filter((r) => r.label.trim()).map((r) => toReq(r.label, r.synonyms));
        const cities = o.cities.map((c) => c.trim().toUpperCase()).filter(Boolean);
        return { q: o.topic, semantic: o.topic, states, cities, maxRevenue: o.maxRevenue ?? undefined, nteeHint: o.ntee ?? undefined, requirements, parser: "llm", topic: o.topic, placeLabel: o.placeLabel || undefined };
      }
    } catch (err) {
      console.error("Claude parse failed; using rule-based parser", err);
    }
  }
  let rest = ` ${question.toLowerCase()} `;
  let topic = rest; // keeps cause words (e.g. "food banks") for semantic search
  const places: string[] = [];
  let ntee: string | undefined;
  for (const [re, code] of NTEE) if (re.test(rest)) { ntee = code; rest = rest.replace(re, " "); }
  const states = new Set<string>();
  const cap = (w: string) => w.replace(/\b\w/g, (c) => c.toUpperCase());
  for (const [name, codes] of Object.entries(REGIONS)) if (rest.includes(name)) { codes.forEach((c) => states.add(c)); places.push(cap(name.slice(0, 10))); rest = rest.replace(name, " "); topic = topic.replace(name, " "); }
  for (const [name, code] of Object.entries(STATES)) if (rest.includes(` ${name} `)) { states.add(code); places.push(cap(name)); rest = rest.replace(name, " "); topic = topic.replace(name, " "); }
  let maxRevenue: number | undefined;
  const m = rest.match(/(?:under|below|less than|<)\s*\$?\s*([\d.,]+)\s*(k|m|thousand|million)?/);
  if (m) {
    maxRevenue = parseFloat(m[1].replace(/,/g, "")) * ({ k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 }[m[2] as "k"] ?? 1);
    rest = rest.replace(m[0], " "); topic = topic.replace(m[0], " ");
  }
  const requirements: Requirement[] = [];
  for (const [re, label, terms] of REQS) if (re.test(rest)) requirements.push(toReq(label, terms));
  const stop = new Set("a an and also are budget do does for in of on or rural that the their them they to with who which".split(" "));
  const words = (t: string) => t.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w && !stop.has(w)).join(" ");
  const q = words(rest);
  const semantic = words(topic);
  return { q, semantic, states: [...states], cities: [], maxRevenue, nteeHint: ntee, requirements, parser: "rules", topic: semantic, placeLabel: places.join(", ") || undefined };
}
