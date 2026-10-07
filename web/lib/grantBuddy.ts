// Research Buddy for GrantRadar: answers follow-up questions about the matched foundations,
// from their 990-PF facts and grants, citing each foundation as [n]. Same rules as NomBot's Buddy.
import { titleCase } from "../components/text";
import { getFunder, matchFunders, type MatchFilters } from "./grants";
import { mixLine } from "./grantTypes";

export const TOP = 12; // foundations Buddy reads: the top of the matches

export const SYSTEM = `You are Research Buddy, helping a small nonprofit decide which private foundations to approach for a grant, using only public IRS Form 990-PF data.
You get the nonprofit's mission and numbered foundations ranked by how many organizations like the nonprofit they already funded, each with its 990-PF facts, how to apply, the kinds of grants it makes, where it gives, and grants it paid to organizations like the nonprofit ("groups like yours").

Rules:
- Use only the foundations and facts provided. If the filings don't say something, say so plainly; never guess or use outside knowledge.
- Cite every claim about a foundation with its number in square brackets, e.g. "gave $10,000 to a Pikeville food pantry [3]". Cite each foundation you mention.
- Be concise: lead with a one- or two-sentence direct answer, then at most 5 short bullets. Stay under about 150 words unless the user asks for more detail. Plain language, no jargon, no headings. Use **bold** for foundation names on first mention, in normal capitalization (not all caps).
- Every sentence that says something about the foundations needs citations, including the opening answer and any summary ("all of them…", "most…"): cite each foundation it covers, or don't say it.
- Don't state counts ("six of them", "twelve funders"); list the matching foundations with citations instead.
- Use the filing's own words for purposes, recipients and application rules. Never add descriptors it doesn't state.
- Give numbers exactly as provided; don't compute ratios, percentages or rankings from them. "Typical grant" is the median grant.
- "Invite only" means it gives only to preselected organizations and doesn't accept unsolicited applications; say so when it matters.
- When comparing, name the trade-off (fit, typical grant, how to apply, unrestricted vs. project giving) instead of declaring one "best" without a reason.`;

export type GrantBuddySource = { n: number; ein: string; name: string; place: string; filing: string | null };

const money = (n: number | null) => (n == null ? "not given" : `$${n.toLocaleString("en-US")}`);
const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

// The same ranking and filters as the /grants results (cached, so usually instant).
export async function grantBuddyContext(mission: string, filters: MatchFilters = {}) {
  const { funders } = await matchFunders(mission, filters, TOP);
  const details = await Promise.all(funders.map((f) => getFunder(f.ein)));
  const sources: GrantBuddySource[] = [];
  const blocks = funders.map((m, i) => {
    const d = details[i];
    const place = [m.city && titleCase(m.city), m.state].filter(Boolean).join(", ");
    sources.push({ n: i + 1, ein: m.ein, name: titleCase(m.name), place, filing: d?.taxYear ? `Form 990-PF (${d.taxYear})` : "Form 990-PF" });
    return [
      `[${i + 1}] ${titleCase(m.name)} — ${place}${d?.taxYear ? ` (Form 990-PF, tax year ${d.taxYear})` : ""}`,
      `Assets: ${money(m.assets)}; grants paid: ${money(m.grantsPaid)} across ${m.grantCount} grants listed; typical grant: ${money(m.typical)}`,
      m.inviteOnly ? "Applications: invite only (gives only to preselected organizations)" : "Applications: accepts unsolicited requests",
      d?.apply.contact && `How to apply — contact: ${clip(d.apply.contact)}`,
      d?.apply.form && `How to apply — form and materials: ${clip(d.apply.form)}`,
      d?.apply.deadlines && `Deadlines: ${clip(d.apply.deadlines)}`,
      d?.apply.restrictions && `Restrictions: ${clip(d.apply.restrictions)}`,
      mixLine(m.mix ?? undefined),
      d?.byState.length ? `Where its grants go: ${d.byState.map((s) => `${s.state} ${money(s.amount)}`).join(", ")}` : null,
      `Groups like yours it funded: ${m.evidence.slice(0, 5).map((e) => `${titleCase(e.recipient)} (${[e.city && titleCase(e.city), e.state].filter(Boolean).join(", ")}): ${money(e.amount)}${e.purpose ? ` — ${clip(e.purpose, 120)}` : ""}`).join("; ")}`,
    ].filter(Boolean).join("\n");
  });
  const context = `Nonprofit's mission: ${mission}\n\nFoundations (top ${funders.length} by fit):\n\n${blocks.join("\n\n")}`;
  return { sources, context };
}
