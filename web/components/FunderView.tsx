import { ViewTransition } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { BackLink } from "./BackLink";
import { FunderStar } from "./GrantStore";
import { Bank, Calendar, Check, Coins, Doc, Globe, Info, ListIcon, Lock, MapIcon, Phone, Pin, Receipt } from "./icons";
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
    [<Bank key="a" />, "Assets", f.assets != null ? money(f.assets) : "—"],
    [<Coins key="g" />, "Paid out", f.grantsPaid != null ? money(f.grantsPaid) : "—"],
    [<Receipt key="n" />, "Grants", f.grantCount.toLocaleString("en-US")],
    [<Calendar key="y" />, "Tax year", f.taxYear ?? "—"],
  ] as const;

  const head = (
    <header className="funder-head big">
      <div className="title-line">
        <h1>{titleCase(f.name)}</h1>
        <FunderStar funder={{ ein: f.ein, name: f.name, city: f.city, state: f.state, typical: f.typical, inviteOnly: f.inviteOnly }} withLabel />
      </div>
      <p className="meta">
        <span><Pin />{[f.city && titleCase(f.city), f.state].filter(Boolean).join(", ")}</span>
        <span>EIN {f.ein.slice(0, 2)}-{f.ein.slice(2)}</span>{" "}
        <a href={filingUrl(f.ein, f.objectId)} target="_blank" rel="noreferrer">Form 990-PF ({f.taxYear}) ↗</a>
      </p>
    </header>
  );

  return (
    <article className={`funder-view${sheet ? " sheet" : ""}`}>
      {!sheet && <BackLink fallback={back || "/grants"}>← Back to matches</BackLink>}
      {/* The full page morphs from the funder row it replaces. The sheet rises over the list instead:
          the row stays mounted under it, and two live elements can't share a transition name. */}
      {sheet ? head : <ViewTransition name={`funder-${f.ein}`} share="morph" default="none">{head}</ViewTransition>}

      <div className="fv-body">
        <dl className="fv-facts">
          {facts.map(([icon, k, v]) => <div key={k}><dt>{icon}{k}</dt><dd>{v}</dd></div>)}
        </dl>

        <section className={`fv-apply${f.inviteOnly ? " closed" : ""}`}>
          <h2>{f.inviteOnly ? <><Lock size={16} />Invite only</> : <><Check size={16} />How to apply</>}</h2>
          {f.inviteOnly ? (
            <p>Gives only to preselected charities. No unsolicited applications.</p>
          ) : (
            <dl>
              {f.apply.contact && <div><dt><Phone />Contact</dt><dd>{f.apply.contact === f.apply.contact.toUpperCase() ? titleCase(f.apply.contact).replace(/, ([A-Z][a-z])\b/g, (m) => m.toUpperCase()) : f.apply.contact}</dd></div>}
              {f.apply.form && <div><dt><Doc />Send</dt><dd>{f.apply.form}</dd></div>}
              {f.apply.deadlines && <div><dt><Calendar />Deadlines</dt><dd>{f.apply.deadlines}</dd></div>}
              {f.apply.restrictions && <div><dt><Info />Limits</dt><dd>{f.apply.restrictions}</dd></div>}
              {!f.apply.contact && !f.apply.form && !f.apply.deadlines && <p>No instructions filed. Contact the foundation.</p>}
            </dl>
          )}
          {f.website && <p className="fv-site"><Globe /><a href={/^https?:/i.test(f.website) ? f.website : `https://${f.website}`} target="_blank" rel="noreferrer">{f.website.replace(/^https?:\/\//i, "").toLowerCase()} ↗</a></p>}
        </section>

        {mission && <WhyFunder ein={f.ein} mission={mission} state={state} />}

        {f.byState.length > 0 && (
          <section className="fv-where">
            <h2><MapIcon size={16} />Where it gives</h2>
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
          <h2><ListIcon size={16} />Grants <span>{f.grants.length > GRANTS_SHOWN ? `top ${GRANTS_SHOWN} of ${f.grantCount.toLocaleString("en-US")}` : `${f.grants.length}`}</span></h2>
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
