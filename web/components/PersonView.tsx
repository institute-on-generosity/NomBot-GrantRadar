import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { titleCase } from "@/components/text";
import { prettyTitle } from "@/lib/flag";
import { STATE_NAMES } from "@/lib/bmf";
import type { Profile, Seat } from "@/lib/people";

// One person, from IRS board lists: their seats (grouped by state: one name in two states is often
// two people), what the foundations they help lead give, who they keep serving with, and grants
// between the boards they sit on. topicHref: on the results page, a way back to an organization search.
export function PersonView({ name, profile, topicHref }: { name: string; profile: Profile; topicHref?: string }) {
  const { seats, giving, peers, between } = profile;
  const shown = titleCase(seats[0]?.name ?? name);
  if (!seats.length) {
    return (
      <section className="person">
        <h1>{titleCase(name)}</h1>
        <p className="person-sub">No board seats under this name in the IRS filings we load (990 Part VII, 990-PF officers). Filings use legal names, so try “William Gates” rather than “Bill Gates”.</p>
      </section>
    );
  }
  const byState = new Map<string, Seat[]>();
  for (const s of seats) byState.set(s.state ?? "", [...(byState.get(s.state ?? "") ?? []), s]);
  const foundations = seats.filter((s) => s.foundation).length;
  const pay = seats.reduce((a, s) => a + s.pay, 0);
  const hours = seats.reduce((a, s) => a + (s.hours ?? 0), 0);
  const given = giving.reduce((a, g) => a + g.total, 0);
  const paid = seats.filter((s) => s.pay > 0).length;

  return (
    <div className="person">
      <header className="person-head">
        <span className="person-kicker">Philanthropic leader · from IRS board lists</span>
        <h1>{shown}</h1>
        {topicHref && <p className="person-sub"><NavLink href={topicHref} label="Searching organizations…">Search organizations for “{name}” instead</NavLink></p>}
        {byState.size > 1 && <p className="person-note">Matched by first and last name, so seats in different states may belong to different people.</p>}
      </header>

      <dl className="person-stats">
        <div><dt>Boards</dt><dd>{seats.length}</dd></div>
        <div><dt>Foundations</dt><dd>{foundations}</dd></div>
        <div><dt>States</dt><dd>{byState.size}</dd></div>
        <div><dt>Reported pay</dt><dd>{pay > 0 ? money(pay) : "None"}</dd><small>{pay > 0 ? `from ${paid} ${paid === 1 ? "org" : "orgs"}, newest returns` : "serves unpaid"}</small></div>
        {hours > 0 && <div><dt>Hours a week</dt><dd>{Math.round(hours)}</dd><small>as reported, all boards</small></div>}
        {given > 0 && <div><dt>Their foundations gave</dt><dd>{money(given)}</dd><small>every year loaded</small></div>}
      </dl>

      <section className="person-sec">
        <h2>Boards and roles</h2>
        {[...byState].map(([st, list]) => (
          <div key={st} className="person-state">
            {byState.size > 1 && <h3>{STATE_NAMES[st] ?? (st || "State not listed")}</h3>}
            <ul>
              {list.map((s) => (
                <li key={s.ein}>
                  <NavLink href={`/org/${s.ein}`} label="Opening the organization…" className="person-org">
                    <b>{titleCase(s.org)}{s.foundation && <i className="person-tag">Foundation</i>}</b>
                    <span>{[s.city && titleCase(s.city), s.state].filter(Boolean).join(", ")}{s.cause && ` · ${s.cause}`}{size(s) && ` · ${size(s)}`}</span>
                  </NavLink>
                  <span className="person-role">
                    <span>{s.title ? prettyTitle(s.title) : "Board member"}</span>
                    <small>{[s.year, s.hours ? `${fmtHours(s.hours)} hrs/wk` : null].filter(Boolean).join(" · ")}{s.filing && <> · <a href={s.filing} target="_blank" rel="noreferrer">filing ↗</a></>}</small>
                    {s.pay > 0 && <b>{money(s.pay)}</b>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {giving.length > 0 && (
        <section className="person-sec">
          <h2>What their foundations give</h2>
          {giving.map((g) => (
            <div key={g.ein} className="person-give">
              <p><NavLink href={`/org/${g.ein}`} label="Opening the organization…"><b>{titleCase(g.org)}</b></NavLink> gave <b>{money(g.total)}</b> in {g.grants.toLocaleString()} {g.grants === 1 ? "grant" : "grants"}, {years(g.years)}.{g.grants > 1 && " Largest:"}</p>
              <ol>
                {g.top.map((t, k) => (
                  <li key={k}>
                    {t.ein ? <NavLink href={`/org/${t.ein}`} label="Opening the organization…">{titleCase(t.name)}</NavLink> : <span>{titleCase(t.name)}</span>}
                    <span>{money(t.amount ?? 0)}{t.grants > 1 && ` · ${t.grants} grants`}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      {between.length > 0 && (
        <section className="person-sec">
          <h2>Grants between their boards</h2>
          <ul className="person-flow">
            {between.map((b) => (
              <li key={b.from + b.to}>
                <span><NavLink href={`/org/${b.from}`}>{titleCase(b.fromOrg)}</NavLink> → <NavLink href={`/org/${b.to}`}>{titleCase(b.toOrg)}</NavLink></span>
                <b>{money(b.amount)}</b>
              </li>
            ))}
          </ul>
          <p className="person-note">A foundation paying an organization where {shown.split(" ")[0]} also sits on the board.</p>
        </section>
      )}

      {peers.length > 0 && (
        <section className="person-sec">
          <h2>Often serves with</h2>
          <ul className="person-peers">
            {peers.map((p) => (
              <li key={p.name}>
                <NavLink href={`/person?name=${encodeURIComponent(p.name)}`} label="Opening the person…"><b>{titleCase(p.name)}</b></NavLink>
                <span>{p.shared.length} boards together: {p.shared.map((x) => titleCase(x.org)).join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="person-note">Sources: IRS Form 990 Part VII and Form 990-PF officer lists (each organization&apos;s newest return), 990-PF grants, IRS master file. Pay is what each return reports for that organization.</p>
    </div>
  );
}

// "2022–2024" -> "tax years 2022–2024"; "2023–2023" -> "tax year 2023"
function years(span: string) {
  const [a, b] = span.split("–");
  return a === b ? `tax year ${a}` : `tax years ${span}`;
}
const fmtHours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));
function size(s: Seat) {
  if (s.foundation && s.assets) return `${money(s.assets)} assets`;
  if (s.revenue) return `${money(s.revenue)} income`;
  return null;
}
