// Themes: Claude groups the closest organizations in a landscape into 3-5 kinds of work
// (e.g. "Mentoring through sports", "Faith-based tutoring"), so users see the approaches in a field.
// Without ANTHROPIC_API_KEY (or if the call fails) there are no themes.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { readable } from "../components/text";
import { claude, LLM_MODEL } from "./llm";
import { memo } from "./memo";
import type { Landscape } from "./landscape";

const TOP = 60;
export type Theme = { label: string; orgs: { ein: string; name: string; place: string }[] };

const SYSTEM = `You group nonprofits found by a search into the main kinds of work they do, so a researcher can see the different approaches in a field.
Make 3-5 themes. Each theme: a label of 2-5 plain words naming the activity or approach (not a place, not "Other"), and the ids of the organizations that clearly belong to it (at least 2). An organization may be in at most one theme; leave out ones that don't fit clearly. Judge only from the names and descriptions given.`;

const schema = z.object({ themes: z.array(z.object({ label: z.string(), ids: z.array(z.string()) })) });

async function fresh(question: string, l: Landscape): Promise<Theme[]> {
  const client = claude();
  const orgs = l.orgs.slice(0, TOP);
  if (!client || orgs.length < 6) return [];
  const items = orgs.map((o, i) => ({ id: `o${i + 1}`, name: o.name, work: readable(o.text) || null }));
  const res = await client.beta.messages.parse({
    model: LLM_MODEL,
    max_tokens: 3000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Search: ${question}\n\nOrganizations:\n${JSON.stringify(items)}` }],
  });
  if (res.stop_reason === "refusal") return [];
  const seen = new Set<string>();
  return (res.parsed_output?.themes ?? []).map((t) => ({
    label: t.label,
    orgs: t.ids.map((id) => orgs[Number(id.replace(/\D/g, "")) - 1]).filter((o) => o && !seen.has(o.ein) && seen.add(o.ein))
      .map((o) => ({ ein: o.ein, name: o.name, place: [o.city, o.state].filter(Boolean).join(", ") })),
  })).filter((t) => t.orgs.length >= 2).sort((a, b) => b.orgs.length - a.orgs.length).slice(0, 5);
}

const cached = memo<Theme[]>("themes", 200, 24 * 3600_000);
export function themes(question: string, l: Landscape) {
  const key = `${question.toLowerCase().replace(/\s+/g, " ").trim()}|${l.orgs.slice(0, TOP).map((o) => o.ein).join(",")}`;
  return cached(key, () => fresh(question, l).catch((err) => { console.error("Themes failed", err); return []; }));
}
