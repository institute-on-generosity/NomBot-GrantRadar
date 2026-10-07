import { ViewTransition } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { BackLink } from "./BackLink";
import { titleCase } from "./text";
import { WhyFunder } from "./WhyFunder";
import { money } from "@/lib/filters";
import { filingUrl, getFunder } from "@/lib/grants";

const GRANTS_SHOWN = 40;

// A foundation's page: the facts from its 990-PF, how to apply, where its money goes, every grant
// it listed, and (when opened from a match) "Why this funder?" for the user's mission.
// sheet: rendered inside the popover over the results.
export async function FunderView({ ein, mission, state, back, sheet = false }: { ein: string; mission: string; state: string; back: string; sheet?: boolean }) {
  await connection();
  const f = await getFunder(ein);
  if (!f) notFound();
  const max = Math.max(...f.byState.map((s) => s.amount), 1);
  const facts = [
    ["Assets", f.assets != null ? money(f.assets) : "—"],
    ["Grants paid", f.grantsPaid != null ? money(f.grantsPaid) : "—"],
    ["Grants listed", f.grantCount.toLocaleString("en-US")],
    ["Tax year", f.taxYear ?? "—"],
  ] as const;

  return (
    <article className={`funder-view${sheet ? " sheet" : ""}`}>
      {!sheet && <BackLink fallback={back || "/grants"}>← Back to matches</BackLink>}
      <ViewTransition name={`funder-${f.ein}`} share="morph" default="none">
        <header className="funder-head big">
          <h1>{titleCase(f.name)}</h1>
          <p className="meta">
            {[f.city && titleCase(f.city), f.state].filter(Boolean).join(", ")} · EIN {f.ein.slice(0, 2)}-{f.ein.slice(2)} ·{" "}
            <a href={filingUrl(f.ein, f.objectId)} target="_blank" rel="noreferrer">Form 990-PF ({f.taxYear}) ↗</a>
          </p>
        </header>
      </ViewTransition>

      <div className="fv-body">
        <dl className="fv-facts">
          {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>

        <section className={`fv-apply${f.inviteOnly ? " closed" : ""}`}>
          <h2>{f.inviteOnly ? "Invitation only" : "How to apply"}</h2>
          {f.inviteOnly ? (
            <p>This foundation says it only gives to organizations it selects in advance. It doesn&apos;t accept unsolicited applications, so an introduction from a board member or past grantee is the usual way in.</p>
          ) : (
            <dl>
              {f.apply.contact && <div><dt>Contact</dt><dd>{f.apply.contact === f.apply.contact.toUpperCase() ? titleCase(f.apply.contact) : f.apply.contact}</dd></div>}
              {f.apply.form && <div><dt>What to send</dt><dd>{f.apply.form}</dd></div>}
              {f.apply.deadlines && <div><dt>Deadlines</dt><dd>{f.apply.deadlines}</dd></div>}
              {f.apply.restrictions && <div><dt>Limits</dt><dd>{f.apply.restrictions}</dd></div>}
              {!f.apply.contact && !f.apply.form && !f.apply.deadlines && <p>Open to requests, but the filing gives no instructions. Contact the foundation first.</p>}
            </dl>
          )}
          {f.website && <p><a href={/^https?:/i.test(f.website) ? f.website : `https://${f.website}`} target="_blank" rel="noreferrer">{f.website.replace(/^https?:\/\//i, "").toLowerCase()} ↗</a></p>}
        </section>

        {mission && <WhyFunder ein={f.ein} mission={mission} state={state} />}

        {f.byState.length > 0 && (
          <section className="fv-where">
            <h2>Where its grants go</h2>
            <ul>
              {f.byState.map((s) => (
                <li key={s.state}>
                  <span className="st">{s.state}</span>
                  <span className="track"><i style={{ width: `${Math.max(2, (100 * s.amount) / max)}%` }} /></span>
                  <span className="amt">{money(s.amount)}</span>
                  <small>{s.count} {s.count === 1 ? "grant" : "grants"}</small>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="fv-grants">
          <h2>Grants paid <span>{f.grants.length > GRANTS_SHOWN ? `largest ${GRANTS_SHOWN} of ${f.grantCount.toLocaleString("en-US")}` : `${f.grants.length}`}</span></h2>
          <table>
            <thead><tr><th>Recipient</th><th>Purpose</th><th className="n">Amount</th></tr></thead>
            <tbody>
              {f.grants.slice(0, GRANTS_SHOWN).map((g) => (
                <tr key={g.id}>
                  <td>
                    {g.ein ? <Link href={`/preview/org/${g.ein}`} scroll={false}>{titleCase(g.recipient)}</Link> : titleCase(g.recipient)}
                    <small>{[g.city && titleCase(g.city), g.state].filter(Boolean).join(", ")}</small>
                  </td>
                  <td className="purpose">{g.purpose ? g.purpose.toLowerCase() : "—"}</td>
                  <td className="n amt">{g.amount != null ? money(g.amount) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </article>
  );
}
