import type { Who } from "@/lib/recipientTypes";
import { money } from "./money";

const pct = (x: number) => (x >= 0.095 ? `${Math.round(x * 100)}%` : x >= 0.0005 ? `${(x * 100).toFixed(1)}%` : "<0.1%");

// "Who received it" under a foundation grant total (Answer.who, lib/recipientTypes): the dollars split into linked
// nonprofits, governments, public universities, international bodies, companies and unidentified recipients.
export function AnswerWho({ who }: { who: Who }) {
  const rows = who.parts.filter((x) => x.usd > 0);
  if (!rows.length) return null;
  return (
    <details className="answer-orgs answer-who">
      <summary><b>Who received it</b> <span className="chat-basis">{pct(who.public_share)} to governments and public universities</span></summary>
      <div className="answer-orgs-scroll">
        <table>
          <thead><tr><th scope="col">Recipient</th><th scope="col">Grant dollars</th><th scope="col">Share</th></tr></thead>
          <tbody>
            {rows.map((x) => <tr key={x.key}><td>{x.label}</td><td>{money(x.usd)}</td><td>{pct(x.share)}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="chat-basis">{who.note} Linked share of all grant dollars: {pct(who.all_link_rate)}. Of dollars to nonprofits: {pct(who.nonprofit_link_rate)}.</p>
    </details>
  );
}
