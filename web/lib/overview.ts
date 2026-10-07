// AI overview: the zoom-out view above the results. Claude reads the strong matches (up to POOL)
// plus figures computed here (sizes, places, causes, team sizes) and writes a short landscape
// summary, a few patterns, and related searches to explore. Cited [n] = rank in the results.
// Without ANTHROPIC_API_KEY (or if the call fails) there is no overview.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { readable, titleCase } from "../components/text";
import { db } from "./db";
import { claude, LLM_MODEL } from "./llm";
import { memo } from "./memo";
import { isStrong, type Ranked } from "./rerank";

export type Overview = { summary: string; patterns: string[]; explore: string[]; orgs: { n: number; ein: string; name: string; place: string; facts: string; about: string }[]; count: number };

const SYSTEM = `You write the short overview shown above nonprofit search results, like a search engine's AI overview.
You get the user's question, figures computed from the matching organizations, and the numbered organizations themselves (IRS data).
Help the user zoom out: what does this landscape look like?
- summary: 1-2 sentences, at most 38 words, on the overall picture (how many, how big, where, what kinds of work). Use the computed figures for counts and ranges; never count yourself.
- patterns: 2-3 observations of at most 12 words each, each about a group of organizations, citing one or two examples like [2, 7]. Only claims the data shows: sizes, places, causes, team sizes (staff/volunteers), program types named in the text.
- explore: 3 related searches the user might run next, phrased like their question (at most 9 words each), each a different angle: a nearby cause, another place, or a narrower activity. Don't repeat the question.
Cite organizations only by their number in square brackets. Plain language, no hype, no advice.`;

const schema = z.object({ summary: z.string(), patterns: z.array(z.string()), explore: z.array(z.string()) });

// Cut at a word boundary, with an ellipsis when shortened.
const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`);
const top = (xs: (string | null)[], k: number) => {
  const c = new Map<string, number>();
  for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, k).map(([x, n]) => `${x} (${n})`).join(", ");
};

async function fresh(question: string, strong: Ranked[]): Promise<Overview | null> {
  const client = claude();
  if (!client || strong.length < 3) return null;
  const { rows } = await db.query(
    `SELECT DISTINCT ON (ein) ein, employees, volunteers FROM filing_text WHERE ein = ANY($1) ORDER BY ein, tax_year DESC`, [strong.map((r) => r.ein)]);
  const team = new Map(rows.map((r) => [r.ein as string, { staff: r.employees as number | null, vols: r.volunteers as number | null }]));
  const orgs = strong.map((r, i) => ({
    n: i + 1, ein: r.ein, name: titleCase(r.name), place: [r.city && titleCase(r.city), r.state].filter(Boolean).join(", "),
    facts: [r.ntee?.label, r.revenue ? `${money(r.revenue.amount)} revenue` : null, team.get(r.ein)?.staff != null ? `${team.get(r.ein)!.staff} staff` : null].filter(Boolean).join(" · "),
    about: clip(readable([r.mission, r.programs].filter(Boolean).join(" ")), 160),
  }));
  const revs = strong.map((r) => r.revenue?.amount).filter((x): x is number => x != null && x > 0);
  const staffed = strong.filter((r) => team.get(r.ein)?.staff != null);
  const allVol = staffed.filter((r) => team.get(r.ein)!.staff === 0 && (team.get(r.ein)!.vols ?? 0) > 0).length;

  const figures = [
    `Strong matches: ${strong.length}`,
    revs.length ? `Revenue: median ${money(median(revs)!)}, range ${money(Math.min(...revs))}–${money(Math.max(...revs))} (${revs.length} with figures); under $250K: ${revs.filter((x) => x < 250_000).length}; over $1M: ${revs.filter((x) => x >= 1_000_000).length}` : "Revenue: no figures",
    `States: ${top(strong.map((r) => r.state), 5)}`,
    `Cities: ${top(strong.map((r) => r.city && titleCase(r.city)), 6)}`,
    `Causes: ${top(strong.map((r) => r.ntee?.label ?? null), 5)}`,
    staffed.length ? `Team size (${staffed.length} report it): median staff ${median(staffed.map((r) => team.get(r.ein)!.staff!))}; all-volunteer (0 staff): ${allVol}` : "Team size: not reported",
  ].join("\n");
  const list = strong.map((r, i) => {
    const t = team.get(r.ein);
    return [`[${i + 1}] ${orgs[i].name} — ${orgs[i].place}`, r.ntee?.label, r.revenue ? `revenue ${money(r.revenue.amount)}` : null,
      t?.staff != null ? `${t.staff} staff` : null, t?.vols != null ? `${t.vols} volunteers` : null,
      readable([r.mission, r.programs].filter(Boolean).join(" ")).slice(0, 260)].filter(Boolean).join(" · ");
  }).join("\n");

  const res = await client.beta.messages.parse({
    model: LLM_MODEL,
    max_tokens: 3000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Question: ${question}\n\nFigures:\n${figures}\n\nOrganizations:\n${list}` }],
  });
  const o = res.parsed_output;
  if (res.stop_reason === "refusal" || !o) return null;
  return { summary: o.summary, patterns: o.patterns.slice(0, 3), explore: o.explore.slice(0, 3), orgs, count: strong.length };
}

const cached = memo<Overview | null>("overview:v4", 200, 24 * 3600_000); // bump when the prompt changes
export function overview(question: string, results: Ranked[]) {
  const strong = results.filter((r) => r.relevance && isStrong(r));
  const key = `${question.toLowerCase().replace(/\s+/g, " ").trim()}|${strong.map((r) => r.ein).join(",")}`;
  return cached(key, () => fresh(question, strong).catch((err) => { console.error("AI overview failed", err); return null; }));
}
