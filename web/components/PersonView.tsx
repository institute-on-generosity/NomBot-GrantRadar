import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { titleCase, orgTitle } from "@/components/text";
import { prettyTitle } from "@/lib/flag";
import { STATE_NAMES } from "@/lib/bmf";
import type { Profile, Seat } from "@/lib/people";

// One person, from IRS board lists. Reads top-down: who they are (main role), four totals, then their
// seats (grouped by state: one name in two states is often two people), what their foundations give,
// grants between their boards, and who they keep serving with.
// topicHref: on the results page, a way back to an organization search for the same words.
export function PersonView({ name, profile, topicHref }: { name: string; profile: Profile; topicHref?: string }) {
  const { seats, others, giving, peers, between } = profile;
  if (!seats.length) {
    return (
      <div className="person">
        <header className="person-head">
          <span className="person-kicker">Philanthropic leader</span>
          <h1>{titleCase(name)}</h1>
          <p className="person-lede">No board seats under this name in the IRS filings we load (990 Part VII, 990-PF officers). Filings use legal names, so try “William Gates” rather than “Bill Gates”.</p>
        </header>
      </div>
    );
  }
  const shown = titleCase(seats[0].name);
  const byState = new Map<string, Seat[]>();
  for (const s of seats) byState.set(s.state ?? "", [...(byState.get(s.state ?? "") ?? []), s]);
  const foundations = seats.filter((s) => s.foundation).length;
  const pay = seats.reduce((a, s) => a + s.pay, 0);
  const paidAt = seats.filter((s) => s.pay > 0);
  const hours = seats.reduce((a, s) => a + (s.hours ?? 0), 0);
  const given = giving.reduce((a, g) => a + g.total, 0);
  const grants = giving.reduce((a, g) => a + g.grants, 0);
  // Main role: the best-paid seat, else the largest organization they sit on.
  const main = [...seats].sort((a, b) => b.pay - a.pay || weight(b) - weight(a))[0];

  return (
    <div className="person">
      <header className="person-head">
        <span className="person-kicker">Philanthropic leader</span>
        <h1>{shown}</h1>
        <p className="person-lede">
          {main.title ? prettyTitle(main.title) : "Board member"}, <NavLink href={`/org/${main.ein}`} label="Opening the organization…">{orgTitle(main.org)}</NavLink>
          {main.city && <span className="person-place"> · {titleCase(main.city)}, {main.state}</span>}
        </p>
        {(byState.size > 1 || topicHref) && (
          <p className="person-meta">
            {byState.size > 1 && <>Matched by first and last name: seats in different states may be different people.</>}
            {topicHref && <> <NavLink href={topicHref} label="Searching organizations…">Search organizations for “{name}” instead</NavLink></>}
          </p>
        )}
        {others.length > 0 && (
          // generosity-data 078: one name, several people told apart by middle initial or Jr / Sr
          <p className="person-meta">
            Other people with this name:{" "}
            {others.slice(0, 6).map((o, i) => (
              <span key={o.ein + o.name}>{i > 0 && ", "}<NavLink href={`/person?${new URLSearchParams({ name: o.name, ein: o.ein })}`} label="Opening the person…">{titleCase(o.name)}</NavLink>
                {" "}({o.noMiddle ? "name only, " : ""}{o.boards} {o.boards === 1 ? "board" : "boards"}{o.states.length ? `, ${o.states.slice(0, 3).join(", ")}` : ""})</span>
            ))}
            {others.length > 6 && <> and {others.length - 6} more</>}
          </p>
        )}
      </header>

      <dl className="person-stats">
        <div><dt>Boards</dt><dd>{seats.length}</dd><small>{foundations} {foundations === 1 ? "foundation" : "foundations"} · {byState.size} {byState.size === 1 ? "state" : "states"}</small></div>
        <div><dt>Reported pay</dt><dd>{pay > 0 ? money(pay) : "Unpaid"}</dd><small>{paidAt.length === 1 ? titleCase(paidAt[0].org) : paidAt.length ? `from ${paidAt.length} organizations` : "on every board"}</small></div>
        <div><dt>Time</dt><dd>{hours > 0 ? <>{Math.round(hours)}<span className="unit"> hrs/wk</span></> : "Not reported"}</dd><small>as reported, all boards</small></div>
        <div><dt>Their foundations gave</dt><dd>{given > 0 ? money(given) : "None"}</dd><small>{grants > 0 ? `${grants.toLocaleString()} grants, all years` : "no 990-PF grants on file"}</small></div>
      </dl>

      <section className="person-sec">
        <h2>Boards and roles <span className="count">{seats.length}</span></h2>
        {[...byState].map(([st, list]) => (
          <div key={st} className="person-group">
            {byState.size > 1 && <h3>{STATE_NAMES[st] ?? (st || "State not listed")}</h3>}
            <ul className="seats">
              {list.map((s) => (
                <li key={s.ein}>
                  <div className="seat-org">
                    <NavLink href={`/org/${s.ein}`} label="Opening the organization…"><b>{orgTitle(s.org)}</b></NavLink>
                    {s.foundation && <i className="person-tag">Foundation</i>}
                    <small>{[s.city && `${titleCase(s.city)}, ${s.state}`, s.cause, size(s)].filter(Boolean).join(" · ")}</small>
                  </div>
                  <div className="seat-role">
                    <span>{s.title ? prettyTitle(s.title) : "Board member"}{s.pay > 0 && <b> · {money(s.pay)}</b>}</span>
                    <small>{[s.year, s.hours ? `${fmtHours(s.hours)} hrs/wk` : null].filter(Boolean).join(" · ")}{s.filing && <> · <a href={s.filing} target="_blank" rel="noreferrer">Filing ↗</a></>}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {giving.length > 0 && (
        <section className="person-sec">
          <h2>What their foundations give</h2>
          {giving.map((g) => {
            const top = Math.max(1, ...g.top.map((t) => t.amount ?? 0));
            return (
              <div key={g.ein} className="give">
                <div className="give-head">
                  <NavLink href={`/org/${g.ein}`} label="Opening the organization…"><b>{orgTitle(g.org)}</b></NavLink>
                  <span className="give-total">{money(g.total)}</span>
                  <small>{g.grants.toLocaleString()} {g.grants === 1 ? "grant" : "grants"}, {years(g.years)}{g.grants > 1 && " · largest grantees"}</small>
                </div>
                <ol className="give-list">
                  {g.top.map((t, k) => (
                    <li key={k} style={{ "--w": `${Math.round((100 * (t.amount ?? 0)) / top)}%` } as React.CSSProperties}>
                      {/* Grants carry no EIN: unmatched recipients open a search for the name and place instead */}
                      {t.ein
                        ? <NavLink href={`/org/${t.ein}`} label="Opening the organization…">{orgTitle(t.name)}</NavLink>
                        : <NavLink href={`/?${new URLSearchParams({ question: [t.name, t.city, t.state].filter(Boolean).join(" "), as: "topic" })}`} label="Searching…" title="Not matched to an IRS record yet: search for it"><span className="unmatched">{orgTitle(t.name)}</span></NavLink>}
                      <span className="give-amt">{money(t.amount ?? 0)}{t.grants > 1 && <small> · {t.grants} grants</small>}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </section>
      )}

      {between.length > 0 && (
        <section className="person-sec">
          <h2>Grants between their boards</h2>
          <p className="person-meta">A foundation paying an organization where {shown.split(" ")[0]} also sits on the board.</p>
          <ul className="flows">
            {between.map((b) => (
              <li key={b.from + b.to}>
                <span><NavLink href={`/org/${b.from}`}>{orgTitle(b.fromOrg)}</NavLink><i aria-hidden="true">→</i><NavLink href={`/org/${b.to}`}>{orgTitle(b.toOrg)}</NavLink></span>
                <b>{money(b.amount)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {peers.length > 0 && (
        <section className="person-sec">
          <h2>Often serves with</h2>
          <ul className="peers">
            {peers.map((p) => (
              <li key={p.name}>
                <NavLink href={`/person?${new URLSearchParams({ name: p.name, ein: p.ein })}`} label="Opening the person…"><b>{titleCase(p.name)}</b></NavLink>
                <span className="count">{p.shared.length} boards together</span>
                <small>{p.shared.map((x) => orgTitle(x.org)).join(", ")}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="person-sources">Sources: IRS Form 990 Part VII and Form 990-PF officer lists (each organization&apos;s newest return), 990-PF grants, IRS master file. Pay is what each return reports for that organization.</p>
    </div>
  );
}

const weight = (s: Seat) => s.assets ?? s.revenue ?? 0;
const fmtHours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));
// "2022–2024" -> "tax years 2022–2024"; "2023–2023" -> "tax year 2023"
function years(span: string) {
  const [a, b] = span.split("–");
  return a === b ? `tax year ${a}` : `tax years ${span}`;
}
function size(s: Seat) {
  if (s.foundation && s.assets) return `${money(s.assets)} assets`;
  if (s.revenue) return `${money(s.revenue)} income`;
  return null;
}
