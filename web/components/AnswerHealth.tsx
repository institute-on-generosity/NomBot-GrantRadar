import type { HealthPick } from "@/lib/answer";
import { HEALTH_NOTE, monthsText, type OrgHealth } from "@/lib/healthText";
import { money } from "./money";

// Financial health indicators (lib/financialHealth): one org's full filing years as a table with plain flags and
// peer medians (research answers with an ein, and the org page), or a cause's listed orgs (AnswerHealthOrgs).
// Indicators, not a rating: no colors for good or bad, only the flags in words.
const pct = (x: number | null) => (x == null ? "n/a" : `${Math.round(x * 100)}%`);
const signed = (x: number) => (x < 0 ? money(x) : `+${money(x)}`);

export function AnswerHealth({ h, title }: { h: OrgHealth; title?: string }) {
  if (!h.years.length) return null;
  const own = [...h.years].reverse().find((y) => y.source === "filing");
  const facts = [
    own?.fundraising_per_dollar != null && `Fundraising cost $${own.fundraising_per_dollar.toFixed(2)} per $1 of gifts and grants (${own.year})`,
    own?.months_unrestricted != null && `Unrestricted net assets: ${monthsText(own.months_unrestricted)} of expenses, buildings included (${own.year})`,
    h.peers && `Peers its size (${h.peers.band_name}, NTEE ${h.peers.ntee}, ${h.peers.n.toLocaleString("en-US")} orgs, ${h.peers.year}): median ${monthsText(h.peers.median_months_cash)} of cash, ${pct(h.peers.median_program_ratio)} on programs`,
  ].filter(Boolean) as string[];
  return (
    <div className="answer-orgs fin-health">
      {title && <h3>{title}</h3>}
      <ul className="fh-flags">
        {h.flags.length ? h.flags.map((f) => <li key={f}>{f}</li>) : <li className="none">No flags in these years</li>}
        {h.notes.map((n) => <li key={n} className="none">{n}</li>)}
      </ul>
      <div className="answer-orgs-scroll">
        <table>
          <thead>
            <tr><th scope="col">Tax year</th><th scope="col">Revenue</th><th scope="col">Expenses</th><th scope="col">Surplus or deficit</th><th scope="col">Cash</th><th scope="col">Programs</th><th scope="col">Gifts · fees · government</th><th scope="col">Liabilities to assets</th></tr>
          </thead>
          <tbody>
            {h.years.map((y) => (
              <tr key={y.year}>
                <td>{y.year}<small>{y.source === "prior_year" ? "next year's 990" : y.form === "990EZ" ? "990-EZ" : "990"}</small></td>
                <td>{money(y.revenue)}</td>
                <td>{money(y.expenses)}</td>
                <td>{signed(y.surplus)}</td>
                <td>{y.months_cash == null ? "n/a" : monthsText(y.months_cash)}</td>
                <td>{pct(y.program_ratio)}</td>
                <td>{pct(y.contributions_share)} · {pct(y.program_revenue_share)} · {pct(y.government_share)}</td>
                <td>{pct(y.liabilities_to_assets)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Secondary detail (fundraising cost, net assets, peers, method) folded under "Details" */}
      <details className="more-info">
        <summary><span className="when-closed">Details ({facts.length + 1})</span><span className="when-open">Hide details</span></summary>
        {facts.map((f) => <p key={f} className="fh-fact">{f}</p>)}
        <p className="chat-basis">{HEALTH_NOTE} Full years only{h.partial_return ? `, so ${h.partial_return} (still arriving) isn't shown` : ""}. n/a = not on that form or year.</p>
      </details>
    </div>
  );
}

export function AnswerHealthOrgs({ orgs }: { orgs: HealthPick[] }) {
  if (!orgs.length) return null;
  return (
    <div className="answer-orgs">
      <p className="chat-basis">{HEALTH_NOTE} Largest first, each from its own full-year returns.</p>
      <div className="answer-orgs-scroll">
        <table>
          <thead>
            <tr><th scope="col">Organization</th><th scope="col">Revenue</th><th scope="col">Deficit years</th><th scope="col">Cash</th><th scope="col">Programs</th><th scope="col">Flags</th></tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.ein}>
                <td><a href={`/org/${o.ein}`}>{o.name}</a><small>{[o.city && o.city.charAt(0) + o.city.slice(1).toLowerCase(), o.state].filter(Boolean).join(", ")} · {o.tax_year}</small></td>
                <td>{money(o.revenue)}</td>
                <td>{o.deficit_years} of {o.years}{o.consecutive_deficits >= 2 && <small>{o.consecutive_deficits} in a row, {money(o.deficit_total)}</small>}</td>
                <td>{o.months_cash == null ? "n/a" : monthsText(o.months_cash)}</td>
                <td>{pct(o.program_ratio)}</td>
                <td className="fh-cell">{o.flags.length ? o.flags.join(". ") : "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
