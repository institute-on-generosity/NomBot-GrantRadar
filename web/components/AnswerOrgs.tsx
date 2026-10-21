import type { OrgPick } from "@/lib/answer";
import { money } from "./money";

// The orgs an "under-funded" answer lists (metric underfunded, lib/answer.ts): each links to its org page, with its
// budget, the foundation grants it got a year and what peers its size get, and how much comes from government.
export function AnswerOrgs({ orgs }: { orgs: OrgPick[] }) {
  if (!orgs.length) return null;
  return (
    <div className="answer-orgs">
      <p className="chat-basis">Few foundation grants for their size compared with similar orgs, not short of money overall. Some may get grants we can&apos;t link to them, so check before you act.</p>
      <div className="answer-orgs-scroll">
        <table>
          <thead>
            <tr><th scope="col">Organization</th><th scope="col">Revenue</th><th scope="col">Foundation grants a year</th><th scope="col">Peers its size</th><th scope="col">From government</th></tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.ein}>
                <td><a href={`/org/${o.ein}`}>{o.name}</a><small>{[o.city && o.city.charAt(0) + o.city.slice(1).toLowerCase(), o.state].filter(Boolean).join(", ")} · 990 {o.tax_year}</small></td>
                <td>{money(o.revenue)}</td>
                <td>{o.foundation_usd_a_year ? money(o.foundation_usd_a_year) : "None linked"}</td>
                <td>{money(o.peer_median_usd_a_year)}</td>
                <td>{Math.round(o.government_share * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
