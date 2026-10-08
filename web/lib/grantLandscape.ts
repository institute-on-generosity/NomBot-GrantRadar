// GrantRadar's zoom-out view, for a nonprofit looking for grants: what the funding landscape for
// groups like theirs looks like. Figures are computed here from every matched funder; Claude then
// writes a short summary, a few patterns and next steps, citing funders by their rank in the list.
// Without ANTHROPIC_API_KEY (or if the call fails) there is no AI overview, only the figures.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { titleCase } from "../components/text";
import { db } from "./db";
import { money } from "./filters";
import { matchFunders, SIZES, type FunderMatch, type MatchFilters } from "./grants";
import { LEAN_LABEL } from "./grantTypes";
import { claude, LLM_MODEL } from "./llm";
import { memo } from "./memo";

const ALL = 200; // funders the figures cover (every match, in practice)
const READ = 15;  // funders Claude reads: the top of the list

export type Bar = { label: string; count: number };
export type Winner = { name: string; place: string; funders: number; amount: number };
export type GrantLandscape = {
  funders: FunderMatch[]; total: number; peers: number;
  open: number; toPeers: number; topShare: number | null; // share of those dollars from the 3 biggest givers
  sizes: Bar[]; policy: Bar[]; types: Bar[]; homes: Bar[]; winners: Winner[];
};

const place = (city: string | null, state: string | null) => [city && titleCase(city), state].filter(Boolean).join(", ");
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const tally = (xs: string[], k = 6): Bar[] => {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, k).map(([label, count]) => ({ label, count }));
};
const SIZE_LABEL = { small: "Under $5K", mid: "$5K–$25K", large: "$25K+" } as const;

export async function grantLandscape(mission: string, filters: MatchFilters): Promise<GrantLandscape> {
  const { funders, total, peers } = await matchFunders(mission, filters, ALL);
  const paid = funders.map((f) => f.evidence.reduce((s, e) => s + (e.amount ?? 0), 0));
  const toPeers = paid.reduce((a, b) => a + b, 0);
  const top3 = [...paid].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);

  // Groups like yours that the most matched funders pay: who already wins this money.
  const byPeer = new Map<string, Winner>();
  for (const f of funders) for (const e of f.evidence) {
    const w = byPeer.get(e.ein) ?? { name: titleCase(e.recipient), place: place(e.city, e.state), funders: 0, amount: 0 };
    byPeer.set(e.ein, { ...w, funders: w.funders + 1, amount: w.amount + (e.amount ?? 0) });
  }

  const typicals = funders.map((f) => f.typical).filter((x): x is number => x != null);
  return {
    funders, total, peers, toPeers,
    open: funders.filter((f) => !f.inviteOnly).length,
    topShare: funders.length > 3 && toPeers > 0 ? top3 / toPeers : null,
    sizes: (Object.keys(SIZES) as (keyof typeof SIZES)[]).map((k) => ({ label: SIZE_LABEL[k], count: typicals.filter((t) => t >= SIZES[k][0] && t < SIZES[k][1]).length })),
    policy: [{ label: "Open to applications", count: funders.filter((f) => !f.inviteOnly).length }, { label: "Invite only", count: funders.filter((f) => f.inviteOnly).length }],
    types: tally(funders.map((f) => (f.mix?.lean ? LEAN_LABEL[f.mix.lean] : "Mixed or unclear"))),
    homes: tally(funders.map((f) => f.state ?? "Unknown")),
    winners: [...byPeer.values()].filter((w) => w.funders > 1).sort((a, b) => b.funders - a.funders || b.amount - a.amount).slice(0, 6),
  };
}

export type GrantOverview = {
  summary: string; patterns: string[]; next: string[]; count: number;
  funders: { n: number; name: string; place: string; facts: string; liked: string }[];
};

const SYSTEM = `You write the short overview shown above a nonprofit's list of matched private foundations, like a search engine's AI overview.
The reader runs a small nonprofit looking for grants. Foundations are ranked by how many organizations like theirs they already funded (from IRS Form 990-PF grant lists).
You get their mission, figures computed from every matched foundation, and the top numbered foundations.
Help them zoom out: what does the funding landscape for groups like theirs look like, and where should they start?
- summary: 1-2 sentences, at most 40 words: how many foundations, typical grant sizes, how many accept applications, where they are based. Use the computed figures for counts and ranges; never count yourself.
- patterns: 2-3 observations of at most 14 words each about groups of foundations, each citing one or two examples like [2, 7]: what they pay for, grant sizes, unrestricted vs. project money, local vs. distant givers, deadlines. Only what the data shows.
- next: 2-3 concrete next steps of at most 12 words each, each citing the foundations it means, e.g. "Start with the open Kentucky funders that paid food pantries [1, 4]". Never recommend an invite-only foundation as an application target.
Cite foundations only by their number in square brackets. When you name a foundation, use its full name as given (never an abbreviation or initials). Plain language, no hype.`;

const schema = z.object({ summary: z.string(), patterns: z.array(z.string()), next: z.array(z.string()) });

async function fresh(mission: string, l: GrantLandscape): Promise<GrantOverview | null> {
  const client = claude();
  const top = l.funders.slice(0, READ);
  if (!client || top.length < 3) return null;
  const { rows } = await db.query(`SELECT ein, apply_deadlines FROM funders WHERE ein = ANY($1)`, [top.map((f) => f.ein)]);
  const deadlines = new Map(rows.map((r) => [r.ein as string, (r.apply_deadlines as string | null)?.trim() || null]));

  const funders = top.map((f, i) => ({
    n: i + 1, name: titleCase(f.name), place: place(f.city, f.state),
    facts: [f.typical != null ? `${money(f.typical)} typical grant` : null, f.inviteOnly ? "invite only" : "open to applications", f.mix?.lean ? LEAN_LABEL[f.mix.lean].toLowerCase() : null].filter(Boolean).join(" · "),
    liked: `Funded ${f.evidence.slice(0, 3).map((e) => titleCase(e.recipient)).join(", ")}${f.evidence.length > 3 ? ` and ${f.evidence.length - 3} more` : ""}`,
  }));
  const list = top.map((f, i) => [
    `[${i + 1}] ${funders[i].name} — ${funders[i].place}`, funders[i].facts,
    f.assets != null ? `assets ${money(f.assets)}` : null,
    deadlines.get(f.ein) ? `deadlines: ${deadlines.get(f.ein)!.slice(0, 120)}` : null,
    `groups like theirs it funded: ${f.evidence.slice(0, 4).map((e) => `${titleCase(e.recipient)} (${place(e.city, e.state)}) ${e.amount != null ? money(e.amount) : ""}${e.purpose ? ` for "${e.purpose.slice(0, 80)}"` : ""}`).join("; ")}`,
  ].filter(Boolean).join(" · ")).join("\n");

  const typicals = l.funders.map((f) => f.typical).filter((x): x is number => x != null);
  const figures = [
    `Matched foundations: ${l.total}; groups like theirs they funded: ${l.peers}`,
    `Open to applications: ${l.open} of ${l.funders.length}`,
    typicals.length ? `Typical grant: median ${money(median(typicals)!)}, range ${money(Math.min(...typicals))}–${money(Math.max(...typicals))}; ${l.sizes.map((s) => `${s.label}: ${s.count}`).join(", ")}` : "Typical grant: no figures",
    `Grant types: ${l.types.map((t) => `${t.label} ${t.count}`).join(", ")}`,
    `Based in: ${l.homes.map((h) => `${h.label} ${h.count}`).join(", ")}`,
    `Paid to groups like theirs: ${money(l.toPeers)}${l.topShare != null ? `; ${Math.round(100 * l.topShare)}% of it from the 3 biggest givers` : ""}`,
  ].join("\n");

  const res = await client.beta.messages.parse({
    model: LLM_MODEL,
    max_tokens: 3000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Mission: ${mission}\n\nFigures:\n${figures}\n\nFoundations:\n${list}` }],
  });
  const o = res.parsed_output;
  if (res.stop_reason === "refusal" || !o) return null;
  return { summary: o.summary, patterns: o.patterns.slice(0, 3), next: o.next.slice(0, 3), count: l.total, funders };
}

const cached = memo<GrantOverview | null>("grant-overview:v2", 200, 24 * 3600_000); // bump when the prompt changes
export function grantOverview(mission: string, l: GrantLandscape) {
  const key = `${mission.toLowerCase().replace(/\s+/g, " ").trim()}|${l.funders.slice(0, READ).map((f) => f.ein).join(",")}`;
  return cached(key, () => fresh(mission, l).catch((err) => { console.error("GrantRadar overview failed", err); return null; }));
}
