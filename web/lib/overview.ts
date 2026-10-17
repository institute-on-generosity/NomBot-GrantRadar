// AI overview: the zoom-out view above the results. Claude reads the closest matches (the search's top
// CLOSEST candidates, so it starts with the results instead of waiting ~3-5s for relevance scores; or the
// strong matches when scores are passed in) plus figures computed here (sizes, places, causes, team sizes) and writes a one-line headline,
// 2-3 short cited bullets, and related searches to explore. Cited [n] = rank in the results.
// The key-number tiles and chart above it are computed without Claude (lib/overviewFacts).
// Without ANTHROPIC_API_KEY (or if the call fails) there is no overview.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { readable, titleCase } from "../components/text";
import { db } from "./db";
import { claude, FAST_MODEL } from "./llm";
import { memo } from "./memo";
import { healthOf } from "./landscape";
import { isStrong, type Ranked } from "./rerank";
import type { Result } from "./search";

// basis: what Claude read. "closest": the top candidates by meaning, before relevance scoring; "strong": scored strong matches.
export type Overview = { headline: string; bullets: string[]; explore: string[]; orgs: { n: number; ein: string; name: string; place: string; facts: string; about: string }[]; count: number; basis: Basis };
type Basis = "closest" | "strong";
const CLOSEST = 20; // unscored candidates read: the top of the search is mostly on topic (69% relevant in the top 10, eval/bench.mts)

const SYSTEM = `You write the short overview shown above nonprofit search results, like a search engine's AI overview.
You get the user's question, figures computed from the matching organizations, and the numbered organizations themselves (IRS data).
Help the user zoom out: what does this landscape look like?
The answer sits under key-number tiles and a chart, and the headline may go on a conference slide.
- headline: one sentence, at most 14 words, the single most telling fact about this landscape. Lead with a number from the figures. When the figures give a "Story" line, the headline can say it in other words. No citations in the headline.
  The headline must read as one natural, grammatical sentence a researcher would say aloud. Plain verbs ("take in", "spend", "have", "run"), never slang like "pull in" or "rake in". If it has two parts, join them with "and" or "while", each a full clause.
  Usually one clause is best. Add a second only when it is a different, telling fact. Don't reuse the examples' wording.
  Good: "43% of youth mentoring groups spent more than they took in last year"
  Good: "Most Kentucky food banks run on under $500K, while three take in over $5M"
  Bad: "82% of Ohio animal shelters take in under $1M a year, and the biggest pull in $10.4M" (slang, plural verb for one organization)
  Bad: "Small budgets dominate; deficits common" (fragment, semicolon)
- bullets: 2-3 observations of at most 16 words each, each about a group of organizations, citing one or two examples like [2, 7]. Don't repeat the headline or simply restate the tiles (count, median income, deficit share, foundation dollars). Only claims the data shows: sizes, places, causes, team sizes (staff/volunteers), finances (growth, deficits, reserves), program types named in the text, and need where the figures give it (high-poverty counties with none of these organizations).
- No semicolons, colons or dashes as punctuation in the headline or bullets. Short plain sentences.
- explore: 3 related searches the user might run next, phrased like their question (at most 9 words each), each a different angle: a nearby cause, another place, or a narrower activity. Don't repeat the question.
Cite organizations only by their number in square brackets. Plain language, no hype, no advice.
Write for an everyday donor, at about a 6th-grade reading level: short sentences, common words ("income", not "revenue"; "spent more than it took in", not "deficit"; "cash to cover N months", not "reserves"). No jargon or acronyms.`;

const schema = z.object({ headline: z.string(), bullets: z.array(z.string()), explore: z.array(z.string()) });

// Slide-ready text: no em dashes (or spaced en dashes) or semicolons even when the model slips.
// Ranges like "$100K–$1M" keep their en dash.
const tidy = (t: string) => t.replace(/\s+[—–]\s+|\s*—\s*/g, ", ").replace(/\s*;\s*/g, ", ").replace(/\s+/g, " ").trim();

// Cut at a word boundary, with an ellipsis when shortened.
const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`);
const top = (xs: (string | null)[], k: number) => {
  const c = new Map<string, number>();
  for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, k).map(([x, n]) => `${x} (${n})`).join(", ");
};

async function fresh(question: string, strong: Result[], basis: Basis, need?: string, story?: string): Promise<Overview | null> {
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
  const h = await healthOf(strong.map((r) => r.ein.replace("-", "")));
  const count = (bars: { label: string; count: number }[]) => bars.map((b) => `${b.label} ${b.count}`).join(", ");
  const revs = strong.map((r) => r.revenue?.amount).filter((x): x is number => x != null && x > 0);
  const staffed = strong.filter((r) => team.get(r.ein)?.staff != null);
  const allVol = staffed.filter((r) => team.get(r.ein)!.staff === 0 && (team.get(r.ein)!.vols ?? 0) > 0).length;

  const figures = [
    basis === "strong" ? `Strong matches: ${strong.length}` : `Closest matches (by meaning, not yet checked one by one): ${strong.length}`,
    revs.length ? `Revenue: median ${money(median(revs)!)}, range ${money(Math.min(...revs))}–${money(Math.max(...revs))} (${revs.length} with figures); under $250K: ${revs.filter((x) => x < 250_000).length}; over $1M: ${revs.filter((x) => x >= 1_000_000).length}` : "Revenue: no figures",
    `States: ${top(strong.map((r) => r.state), 5)}`,
    `Cities: ${top(strong.map((r) => r.city && titleCase(r.city)), 6)}`,
    `Causes: ${top(strong.map((r) => r.ntee?.label ?? null), 5)}`,
    h.reported ? `Finances (${h.reported} report): last year ${count(h.margin)}; reserves ${count(h.reserves)}; revenue trend (${h.trendReported} with two years) ${count(h.trend)}` : "Finances: not reported",
    staffed.length ? `Team size (${staffed.length} report it): median staff ${median(staffed.map((r) => team.get(r.ein)!.staff!))}; all-volunteer (0 staff): ${allVol}` : "Team size: not reported",
    need ?? null,
    story ? `Story (from the chart shown above the overview): ${story}` : null,
  ].filter(Boolean).join("\n");
  const list = strong.map((r, i) => {
    const t = team.get(r.ein);
    return [`[${i + 1}] ${orgs[i].name} — ${orgs[i].place}`, r.ntee?.label, r.revenue ? `revenue ${money(r.revenue.amount)}` : null,
      t?.staff != null ? `${t.staff} staff` : null, t?.vols != null ? `${t.vols} volunteers` : null,
      readable([r.mission, r.programs].filter(Boolean).join(" ")).slice(0, 260)].filter(Boolean).join(" · ");
  }).join("\n");

  const res = await client.beta.messages.parse({
    model: FAST_MODEL,
    max_tokens: 3000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Question: ${question}\n\nFigures:\n${figures}\n\nOrganizations:\n${list}${basis === "closest" ? `\n\nThese are the closest search matches, not yet checked one by one: a few may not fit the question. Write about the ones that clearly do, and cite only those.` : ""}` }],
  });
  const o = res.parsed_output;
  if (res.stop_reason === "refusal" || !o) return null;
  return { headline: tidy(o.headline).replace(/\s*\[\d+(?:,\s*\d+)*\]/g, ""), bullets: o.bullets.slice(0, 3).map(tidy), explore: o.explore.slice(0, 3), orgs, count: strong.length, basis };
}

const cached = memo<Overview | null>("overview:v12", 200, 24 * 3600_000); // bump when the prompt changes (v12: closest matches before scoring; v11: headline examples; v9: headline + bullets)
// need: an optional figures line about county poverty vs. where these organizations are (lib/landscape).
// story: the overview chart's takeaway (lib/overviewFacts), so the headline can agree with the chart.
// results: search candidates in order (unscored: the top CLOSEST are read) or ranked results (strong matches are read).
export function overview(question: string, results: (Result | Ranked)[], need?: string, story?: string) {
  const scored = results.some((r) => "relevance" in r && r.relevance);
  const basis: Basis = scored ? "strong" : "closest";
  const strong = scored ? results.filter((r) => "relevance" in r && r.relevance && isStrong(r as Ranked)) : results.slice(0, CLOSEST);
  const key = `${basis}|${question.toLowerCase().replace(/\s+/g, " ").trim()}|${strong.map((r) => r.ein).join(",")}`;
  return cached(`${key}|${need ?? ""}|${story ?? ""}`, () => fresh(question, strong, basis, need, story).catch((err) => { console.error("AI overview failed", err); return null; }));
}
