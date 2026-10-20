import { Suspense } from "react";
import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { money } from "@/components/money";
import { BackLink } from "@/components/BackLink";
import { RecordViewed } from "@/components/HistoryRecorder";
import { StarButton } from "@/components/StarButton";
import { FolderPicker } from "@/components/FolderPicker";
import { PrintButton, PrintStamp } from "@/components/PrintButton";
import { readable, titleCase } from "@/components/text";
import { getOrg, type Income } from "@/lib/org";
import type { TaxStatus } from "@/lib/taxStatus";
import { prettyTitle, type Diligence } from "@/lib/flag";
import type { BoardLink } from "@/lib/people";
import { OrgFunding } from "@/components/OrgFunding";

type Props = { params: Promise<{ ein: string }>; searchParams: Promise<{ back?: string }>; modal?: boolean };

// One organization: mission, programs, finances, details and sources.
// modal: shown in a popover over the current page (no back link, no history update).
export function OrgView(props: Props) {
  return (
    <main>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <Org {...props} />
      </Suspense>
    </main>
  );
}

// In a modal, NomBot's own source viewers open beside the organization inside the popover
// (/preview/org/<ein>?src=<viewer url>), replacing the history entry so × still closes it all.
export const previewWithSource = (ein: string, src: string) => `/preview/org/${ein}?src=${encodeURIComponent(src)}`;

function Src({ href, children, inModal }: { href?: string; children: React.ReactNode; inModal?: string }) {
  if (!href) return null;
  if (!href.startsWith("/")) return <a className="cite" href={href} target="_blank" rel="noreferrer">{children} ↗</a>;
  return <NavLink className="cite" href={inModal ? previewWithSource(inModal, href) : href} replace={Boolean(inModal)} label="Opening the IRS file…">{children}</NavLink>;
}

async function Org({ params, searchParams, modal }: Props) {
  const [{ ein }, { back }] = await Promise.all([params, searchParams]);
  await connection();
  const o = await getOrg(ein);
  if (!o) notFound();
  const fromResults = Boolean(back?.startsWith("/?"));
  const fromStarred = Boolean(back && /^\/saved(\?|$)/.test(back));
  const backHref = fromResults || fromStarred ? back! : "/";

  return (
    <article className="org">
      {!modal && (fromResults ? <BackLink fallback={backHref}>← Back to results</BackLink>
        : fromStarred ? <Link href={backHref} className="back">← Back to Starred</Link>
        : <BackLink fallback="/">← Back</BackLink>)}
      {!modal && back && back.startsWith("/?") && <RecordViewed back={back} ein={o.ein} name={o.name} />}
      <div className="title-line"><h1>{titleCase(o.name)}</h1><StarButton withLabel org={{ ein: o.ein, name: o.name, city: o.city, state: o.state, cause: o.ntee?.label ?? null, revenue: o.years[0]?.revenue ?? null, year: o.years[0]?.year ?? null }} /><FolderPicker ein={o.ein} />{!modal && <PrintButton />}</div>
      <p className="sub">
        {[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ")}
        {o.ntee?.label && <> · {o.ntee.label}</>} · EIN {o.ein}
        {o.website && <> · <a className="site" href={`https://${o.website}`} target="_blank" rel="noreferrer" title="Their website, as listed on their Form 990">{o.website.replace(/^www\./, "").replace(/\/.*$/, "")} ↗</a></>}
      </p>
      {o.tax?.revocation && (o.tax.status === "revoked" || o.tax.status === "conflict") && <Revoked r={o.tax.revocation} conflict={o.tax.status === "conflict"} onPub78={o.tax.pub78.eligible} />}
      {(o.team || o.age != null) && <Team team={o.team} age={o.age} since={o.ruling} />}

      <section>
        <h2>Mission</h2>
        <p>{o.mission ? readable(o.mission) : "This organization hasn't e-filed a mission statement we've loaded yet."}</p>
      </section>

      {o.programs && (
        <section>
          <h2>Programs</h2>
          <p>{readable(o.programs)}</p>
        </section>
      )}

      {o.flag && o.flag.rating.signals.length >= 3 && <HealthRating d={o.flag} />}

      <section>
        <h2>Finances</h2>
        {o.years.length ? (
          <table>
            <thead><tr><th>Year</th><th className="n">Income</th><th className="n">Spending</th><th className="n">Assets</th><th>Source</th></tr></thead>
            <tbody>
              {o.years.map((y) => (
                <tr key={`${y.year}-${y.source}`}>
                  <td>{y.year}</td>
                  <td className="n">{money(y.revenue)}</td>
                  <td className="n">{y.expenses != null ? money(y.expenses) : "—"}</td>
                  <td className="n">{y.assets != null ? money(y.assets) : "—"}</td>
                  <td><Src href={y.url} inModal={modal ? o.ein : undefined}>{y.source}</Src></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>No financial figures on file.</p>}
        {/* The 990's own split (with government grants) when there is one, else the SOI extract */}
        {o.flag?.income ? <IncomeMix i={{ ...o.flag.income, year: o.flag.income.year ?? 0, form: o.flag.form }} /> : o.income && <IncomeMix i={o.income} />}
        {o.flag && <YearOverYear d={o.flag} />}
      </section>

      {/* Grants received (foundations, charities, federal) and given; streams in after the profile */}
      <Suspense fallback={<p className="hint">Loading grants…</p>}><OrgFunding ein={o.ein} /></Suspense>

      {o.flag && (o.flag.people.length > 0 || o.flag.checks.length > 0) && <Leadership d={o.flag} />}

      {o.links.length > 0 && <BoardConnections links={o.links} />}

      <section>
        <h2>Details</h2>
        <dl>
          {o.ntee && <><dt>Cause</dt><dd>{o.ntee.label} ({o.ntee.code})</dd></>}
          {o.labels.length > 0 && <><dt>Cause labels</dt><dd className="org-labels">{o.labels.map((l) => (
            <span key={l.label} title="Graded by NomBot from the organization's name and Form 990 text">
              <b>{l.name}</b>: {l.tier === "primary" ? "main focus" : "partial focus"}{l.why && <small>{l.why}</small>}
            </span>))}</dd></>}
          {o.subsection && <><dt>Type</dt><dd>501(c)({Number(o.subsection)}){o.status.kind && ` · ${o.status.kind}`}</dd></>}
          <dt>IRS status</dt><dd>{o.status.standing}</dd>
          {o.tax && <><dt>Tax-deductible gifts</dt><dd>{o.tax.pub78.eligible
            ? <>Eligible for tax-deductible gifts (Pub 78){o.tax.pub78.codes.length > 0 && ` · ${o.tax.pub78.codes.map((c) => c.label).join(", ")}`}</>
            : <>Not listed on IRS Pub 78{o.tax.status === "revoked" ? " (exemption revoked)" : ". Churches and orgs under a group exemption can be eligible without a listing"}</>}
            {o.tax.pub78.file_date && <small> IRS list of {o.tax.pub78.file_date}</small>}</dd></>}
          {o.tax?.revocation && o.tax.status !== "revoked" && o.tax.status !== "conflict" && <><dt>Past revocation</dt><dd>Exemption revoked {o.tax.revocation.revocation_date}, reinstated {o.tax.revocation.reinstatement_date}</dd></>}
          {o.ruling && <><dt>Tax-exempt since</dt><dd>{o.ruling}{o.age != null && ` (${o.age} ${o.age === 1 ? "year" : "years"})`}</dd></>}
          <dt>Address</dt><dd>{[o.careOf, o.street && titleCase(o.street), [o.city && titleCase(o.city), o.state, o.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</dd>
        </dl>
      </section>

      <section>
        <h2>Sources</h2>
        <ul className="sources">
          {o.sources.map((s) => <li key={s.url}>{s.internal ? <NavLink href={modal ? previewWithSource(o.ein, s.url) : s.url} replace={modal} label="Opening the IRS file…">{s.label}</NavLink> : <a href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a>}<span>{s.detail}</span></li>)}
        </ul>
      </section>
      <PrintStamp />
    </article>
  );
}

// IRS automatic revocation (no 990 for 3 straight years) with no reinstatement date. conflict: the org is on
// Pub 78 or has a newer BMF ruling date, which usually means a reinstatement the revocation file doesn't show,
// so a softer note.
function Revoked({ r, conflict, onPub78 }: { r: NonNullable<TaxStatus["revocation"]>; conflict: boolean; onPub78: boolean }) {
  const g = r.grants_after_revocation;
  const funded = g.count > 0 && <> Foundations reported {g.count.toLocaleString("en-US")} {g.count === 1 ? "grant" : "grants"} ({money(g.total)}) to this EIN after the revocation, latest in {g.latest_year}.</>;
  const check = <>{" "}<a href="https://apps.irs.gov/app/eos/" target="_blank" rel="noreferrer">Check the IRS ↗</a></>;
  if (conflict) return (
    <p className="notice">
      <b>IRS lists disagree.</b> The IRS revoked this EIN&apos;s tax-exempt status on {r.revocation_date} (posted {r.posting_date}) and its revocation list shows no reinstatement, but {onPub78 ? "the organization is on Pub 78" : "the IRS master file shows a newer ruling date"}, so it was probably reinstated.{funded}{check}
    </p>
  );
  return (
    <p className="notice revoked" role="alert">
      <b>Tax-exempt status revoked by the IRS on {r.revocation_date}</b> (posted {r.posting_date}) for not filing a Form 990 for 3 years in a row, with no reinstatement on the IRS list of {r.file_date}. Gifts to this EIN are not tax-deductible.
      {funded}{g.count > 0 && " Check for a fiscal sponsor or a new EIN."}{check}
    </p>
  );
}

// Staff and volunteers (Form 990 Part I lines 5-6): how the work gets done, e.g. entirely by volunteers.
// Then the track record: years since the IRS ruling.
function Team({ team, age, since }: { team: { staff: number | null; volunteers: number | null; year: number } | null; age: number | null; since: string | null }) {
  const n = (v: number) => v.toLocaleString("en-US");
  const allVolunteer = team?.staff === 0 && (team.volunteers ?? 0) > 0;
  return (
    <div className="team">
      {team && (
        <p title={`Form 990 (${team.year}), Part I lines 5–6`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M15.5 14.2A4.6 4.6 0 0 1 20.5 19" /></svg>
          {team.staff != null && <span><b>{n(team.staff)}</b> staff</span>}
          {team.volunteers != null && <span><b>{n(team.volunteers)}</b> volunteers</span>}
          {allVolunteer && <span className="badge">All-volunteer</span>}
        </p>
      )}
      {age != null && (
        <p title={`Tax-exempt since ${since} (IRS ruling date)`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></svg>
          <span>{age < 1 ? <><b>Under 1</b> year</> : <><b>{age}</b> {age === 1 ? "year" : "years"}</>} tax-exempt</span>
        </p>
      )}
    </div>
  );
}

// Where the money comes from: one row per source with a share bar. Over 70% from gifts and grants
// gets a note, since that means depending on donors (slide-style "funding concentration").
function IncomeMix({ i }: { i: Income }) {
  const pct = (x: number) => `${Math.round((100 * x) / i.total)}%`;
  return (
    <div className="income">
      <h3>Where the money comes from <small>{i.year} · Form {i.form === "990EZ" ? "990-EZ" : "990"}</small></h3>
      <ul>
        {i.parts.map((p) => (
          <li key={p.key}>
            <span>{p.label}</span>
            <span className="income-bar"><i style={{ width: pct(p.amount) }} /></span>
            <b>{pct(p.amount)}</b><small>{money(p.amount)}</small>
          </li>
        ))}
      </ul>
      {i.gifts >= 0.7 && (() => {
        const gov = i.parts.find((p) => p.key === "gov")?.amount ?? 0;
        return <p className="income-note">Relies on grants and gifts: {Math.round(i.gifts * 100)}% of income{gov > 0 && <>, {pct(gov)} from government</>}. Ask how many funders give most of it.</p>;
      })()}
    </div>
  );
}

const change = (now: number, before: number | null) => (before && before > 0 ? (now - before) / before : null);
const pctText = (x: number) => `${x > 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`;

// This year vs last year from the same 990 (Part I), then three plain liquidity and spending figures.
// The spending split isn't colored: a low program share often means fair pay and good systems, not waste.
function YearOverYear({ d }: { d: Diligence }) {
  const rows = d.compare.filter((c) => c.before != null);
  const facts = [
    d.cashMonths != null && { k: "Cash", v: d.cashMonths >= 12 ? `${(d.cashMonths / 12).toFixed(1)} years of spending` : `${Math.max(0, Math.round(d.cashMonths))} ${Math.round(d.cashMonths) === 1 ? "month" : "months"} of spending`, bad: d.cashMonths < 3 },
    d.spending ? { k: "Spending", v: `${Math.round(d.spending.program * 100)}% programs · ${Math.round(d.spending.admin * 100)}% admin · ${Math.round(d.spending.fundraising * 100)}% fundraising`, bad: false }
      : d.programShare != null && { k: "Spent on programs", v: `${Math.round(d.programShare * 100)}% of expenses`, bad: false },
    d.debtShare != null && { k: "Debts", v: `owes ${Math.round(d.debtShare * 100)}% of what it owns`, bad: d.debtShare > 0.5 },
  ].filter((x): x is { k: string; v: string; bad: boolean } => Boolean(x));
  if (!rows.length && !facts.length) return null;
  return (
    <div className="yoy">
      {rows.length > 0 && (
        <table>
          <thead><tr><th>Form {d.form === "990EZ" ? "990-EZ" : "990"}, {d.year}</th><th className="n">Last year</th><th className="n">This year</th><th className="n">Change</th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const x = change(c.now, c.before);
              return (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className="n">{money(c.before!)}</td>
                  <td className="n">{money(c.now)}</td>
                  {/* Color only income lines: growth is good there; for spending it depends */}
                  <td className={`n chg${x == null || !c.income ? "" : x <= -0.1 ? " down" : x >= 0.1 ? " up" : ""}`}>{x == null ? "—" : pctText(x)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {facts.length > 0 && <dl className="yoy-facts">{facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd className={f.bad ? "bad" : undefined}>{f.v}</dd></div>)}</dl>}
    </div>
  );
}

// Who leads it (Part VII): paid staff first with their pay, then the board in one line; then the
// governance answers (Part VI, IV) as a short checklist, problems first.
function Leadership({ d }: { d: Diligence }) {
  const paid = d.people.filter((p) => p.pay + p.other > 0).slice(0, 6);
  const unpaid = d.people.filter((p) => p.pay + p.other === 0);
  const checks = [...d.checks].sort((a, b) => Number(a.ok) - Number(b.ok));
  return (
    <section>
      <h2>Leadership and governance</h2>
      {paid.length > 0 && (
        <ul className="people">
          {paid.map((p) => <li key={p.name + p.title}><NavLink href={`/person?name=${encodeURIComponent(p.name)}`} label="Opening the person…" className="person-link"><b>{titleCase(p.name)}</b><small>{prettyTitle(p.title)}</small></NavLink><span>{money(p.pay + p.other)}</span></li>)}
        </ul>
      )}
      <p className="board-line">
        {d.board ? <><b>{d.board.members}</b> board members, <b>{d.board.independent}</b> independent</> : unpaid.length ? <><b>{unpaid.length}</b> unpaid officers and directors</> : null}
        {d.board && unpaid.length > 0 && <> · {unpaid.length} serve unpaid</>}
      </p>
      {unpaid.length > 0 && (
        <p className="board-names">
          {unpaid.slice(0, 30).map((p, i) => <span key={p.name + i}>{i > 0 && ", "}<NavLink href={`/person?name=${encodeURIComponent(p.name)}`} label="Opening the person…">{titleCase(p.name)}</NavLink></span>)}
          {unpaid.length > 30 && <> and {unpaid.length - 30} more</>}
        </p>
      )}
      {checks.length > 0 && (
        <ul className="checks">
          {checks.map((c) => <li key={c.key} className={c.ok ? "ok" : c.minor ? "minor" : "bad"}>{c.ok ? "✓" : "!"} {c.label}</li>)}
        </ul>
      )}
      <p className="note-small">Form {d.form === "990EZ" ? "990-EZ" : "990"}, tax year {d.year}, Parts IV, VI and VII{d.url && <> · <a href={d.url} target="_blank" rel="noreferrer">filing ↗</a></>}</p>
    </section>
  );
}

// Board members who also sit on other boards in this state: who this organization is connected to.
function BoardConnections({ links }: { links: BoardLink[] }) {
  return (
    <section>
      <h2>Board connections</h2>
      <ul className="links">
        {links.map((p) => (
          <li key={p.name}>
            <NavLink href={`/person?name=${encodeURIComponent(p.name)}`} label="Opening the person…" className="link-person"><b>{titleCase(p.name)}</b>{p.title && <small>{prettyTitle(p.title)}</small>}</NavLink>
            <span>Also on {p.others.map((x, i) => <span key={x.ein}>{i > 0 && ", "}<NavLink href={`/org/${x.ein}`} label="Opening the organization…">{titleCase(x.org)}</NavLink>{x.foundation && <i className="person-tag">Foundation</i>}</span>)}</span>
          </li>
        ))}
      </ul>
      <p className="note-small">Same first and last name on another board in this state, from IRS 990 and 990-PF board lists. Common names are left out.</p>
    </section>
  );
}

// Financial health from the newest 990: each signal with its figure, problems first (red, then amber),
// colored by fixed rules (lib/flag RULES), then a question to ask for each one that needs context.
function HealthRating({ d }: { d: Diligence }) {
  const order = { weak: 0, watch: 1, ok: 2 } as const;
  const signals = [...d.rating.signals].sort((a, b) => order[a.level] - order[b.level]);
  const asks = signals.filter((x) => x.ask && x.level !== "ok");
  return (
    <section className={`rating ${d.rating.level.toLowerCase()}`}>
      <h2>Financial health <small>Form {d.form === "990EZ" ? "990-EZ" : "990"}, {d.year}</small></h2>
      <ul>
        {signals.map((x) => <li key={x.key} className={x.level}><b>{x.label}</b>{x.note}</li>)}
      </ul>
      {asks.length > 0 && (
        <div className="asks">
          <h3>Questions to ask</h3>
          <ul>{asks.map((x) => <li key={x.key}>{x.ask}</li>)}</ul>
          <p>Amber and red mean &ldquo;ask about this,&rdquo; not &ldquo;don&apos;t give.&rdquo;</p>
        </div>
      )}
    </section>
  );
}
