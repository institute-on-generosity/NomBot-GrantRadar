// "Why this funder?": Claude explains, from the foundation's own 990-PF grants list, whether it
// fits a nonprofit's mission. Same rules as Research Buddy: every claim cites a numbered grant.
import { getFunder, matchFunders, type MatchFilters } from "./grants";
import { mixLine } from "./grantTypes";

const MAX_GRANTS = 24;

export const SYSTEM = `You help a small nonprofit decide whether a private foundation is worth approaching for a grant.
You get the nonprofit's mission, the foundation's facts from its IRS Form 990-PF, and numbered grants it paid. Grants marked "like you" went to organizations whose filed mission is similar to this nonprofit's.

Rules:
- Use only the facts given. Cite every claim about a specific grant with its number in square brackets, e.g. "gave $10,000 to a Pikeville food pantry [2]". Cite each grant number separately, e.g. [1, 2]; never a range like [1-11], and never cite more than 4 grants for one claim. Never state counts; list the grants instead.
- Facts from the foundation's profile (assets, grant types, where its grants go, how to apply) need no citation; don't cite grants for them.
- Use the filing's own words for purposes and recipients; don't add descriptors it doesn't state. Give amounts exactly as provided.
- Start with "Strong fit", "Possible fit" or "Weak fit", then the main reason, in one sentence of at most 20 words.
- Then at most 3 bullets of at most 15 words each: closest past grants, typical size and whether it mostly gives unrestricted (general operating) or project grants when the profile says so, how to apply. If it only gives to preselected organizations, say "Invite only: no unsolicited applications."
- Under 80 words in all. No preamble, no closing summary. Plain language, no headings. Bold the foundation's name once, written in normal capitalization (e.g. "LG&E and KU Foundation"), not all caps.`;

export type WhySource = { n: number; recipient: string; ein: string | null; place: string; amount: number | null; purpose: string | null; like: boolean };

const money = (n: number | null) => (n == null ? "amount not given" : `$${n.toLocaleString("en-US")}`);

export async function whyContext(mission: string, ein: string, filters: MatchFilters = {}) {
  const [funder, match] = await Promise.all([getFunder(ein), matchFunders(mission, filters, 200)]);
  if (!funder) return null;
  const like = match.funders.find((m) => m.ein === funder.ein)?.evidence ?? [];
  const likeIds = new Set(like.map((e) => e.grantId));
  // Similar grantees first, then the foundation's largest other grants.
  const picked = [
    ...like.slice(0, 12).map((e) => funder.grants.find((g) => g.id === e.grantId) ?? { id: e.grantId, recipient: e.recipient, ein: e.ein, city: e.city, state: e.state, amount: e.amount, purpose: e.purpose }),
    ...funder.grants.filter((g) => !likeIds.has(g.id)),
  ].slice(0, MAX_GRANTS);
  const sources: WhySource[] = picked.map((g, i) => ({
    n: i + 1, recipient: g.recipient, ein: g.ein, place: [g.city, g.state].filter(Boolean).join(", "), amount: g.amount, purpose: g.purpose, like: likeIds.has(g.id),
  }));
  const facts = [
    `Foundation: ${funder.name} — ${[funder.city, funder.state].filter(Boolean).join(", ")} (Form 990-PF, tax year ${funder.taxYear ?? "?"})`,
    `Assets (fair market value): ${money(funder.assets)}; grants paid that year: ${money(funder.grantsPaid)} across ${funder.grantCount} grants listed`,
    funder.inviteOnly ? "Applications: only makes contributions to preselected charitable organizations (does not accept unsolicited requests)" : "Applications: accepts unsolicited requests",
    funder.apply.contact && `How to apply — contact: ${funder.apply.contact}`,
    funder.apply.form && `How to apply — form and materials: ${funder.apply.form}`,
    funder.apply.deadlines && `Deadlines: ${funder.apply.deadlines}`,
    funder.apply.restrictions && `Restrictions: ${funder.apply.restrictions}`,
    mixLine(funder.mix ?? undefined),
    funder.byState.length ? `Where its grants go: ${funder.byState.map((s) => `${s.state} ${s.count} grants`).join(", ")}` : null,
  ].filter(Boolean).join("\n");
  const grants = sources.map((s) => `[${s.n}]${s.like ? " (like you)" : ""} ${s.recipient}, ${s.place || "place not given"}: ${money(s.amount)}${s.purpose ? ` — purpose: ${s.purpose}` : ""}`).join("\n");
  return { sources, context: `Nonprofit's mission: ${mission}\n\n${facts}\n\nGrants paid:\n${grants}` };
}
