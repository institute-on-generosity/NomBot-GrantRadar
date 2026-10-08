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
import { readable, titleCase } from "@/components/text";
import { getOrg, RULES, type Diligence, type Income } from "@/lib/org";

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
      <div className="title-line"><h1>{titleCase(o.name)}</h1><StarButton withLabel org={{ ein: o.ein, name: o.name, city: o.city, state: o.state, cause: o.ntee?.label ?? null, revenue: o.years[0]?.revenue ?? null, year: o.years[0]?.year ?? null }} /><FolderPicker ein={o.ein} /></div>
      <p className="sub">
        {[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ")}
        {o.ntee?.label && <> · {o.ntee.label}</>} · EIN {o.ein}
      </p>
      {o.team && <Team {...o.team} />}

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
            <thead><tr><th>Year</th><th className="n">Revenue</th><th className="n">Expenses</th><th className="n">Assets</th><th>Source</th></tr></thead>
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
        {o.income && <IncomeMix i={o.income} />}
        {o.flag && <YearOverYear d={o.flag} />}
      </section>

      {o.flag && (o.flag.people.length > 0 || o.flag.checks.length > 0) && <Leadership d={o.flag} />}

      <section>
        <h2>Details</h2>
        <dl>
          {o.ntee && <><dt>Cause</dt><dd>{o.ntee.label} ({o.ntee.code})</dd></>}
          {o.subsection && <><dt>Type</dt><dd>501(c)({Number(o.subsection)}){o.status.kind && ` · ${o.status.kind}`}</dd></>}
          <dt>IRS status</dt><dd>{o.status.standing}</dd>
          {o.ruling && <><dt>Tax-exempt since</dt><dd>{o.ruling}</dd></>}
          <dt>Address</dt><dd>{[o.careOf, o.street && titleCase(o.street), [o.city && titleCase(o.city), o.state, o.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</dd>
        </dl>
      </section>

      <section>
        <h2>Sources</h2>
        <ul className="sources">
          {o.sources.map((s) => <li key={s.url}>{s.internal ? <NavLink href={modal ? previewWithSource(o.ein, s.url) : s.url} replace={modal} label="Opening the IRS file…">{s.label}</NavLink> : <a href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a>}<span>{s.detail}</span></li>)}
        </ul>
      </section>
    </article>
  );
}

// Staff and volunteers (Form 990 Part I lines 5-6): how the work gets done, e.g. entirely by volunteers.
function Team({ staff, volunteers, year }: { staff: number | null; volunteers: number | null; year: number }) {
  const n = (v: number) => v.toLocaleString("en-US");
  const allVolunteer = staff === 0 && (volunteers ?? 0) > 0;
  return (
    <p className="team" title={`Form 990 (${year}), Part I lines 5–6`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M15.5 14.2A4.6 4.6 0 0 1 20.5 19" /></svg>
      {staff != null && <span><b>{n(staff)}</b> staff</span>}
      {volunteers != null && <span><b>{n(volunteers)}</b> volunteers</span>}
      {allVolunteer && <span className="badge">All-volunteer</span>}
    </p>
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
      {i.gifts >= 0.7 && <p className="income-note">Relies on donors: {Math.round(i.gifts * 100)}% of revenue is gifts and grants. Ask how many donors give most of it.</p>}
    </div>
  );
}

const change = (now: number, before: number | null) => (before && before > 0 ? (now - before) / before : null);
const pctText = (x: number) => `${x > 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`;

// This year vs last year from the same 990 (Part I), then three plain liquidity and spending figures.
function YearOverYear({ d }: { d: Diligence }) {
  const rows = d.compare.filter((c) => c.before != null);
  const facts = [
    d.cashMonths != null && { k: "Cash on hand", v: d.cashMonths >= 12 ? `${(d.cashMonths / 12).toFixed(1)} years of spending` : `${Math.max(0, Math.round(d.cashMonths))} ${Math.round(d.cashMonths) === 1 ? "month" : "months"} of spending`, bad: d.cashMonths < 3 },
    d.programShare != null && { k: "Spent on programs", v: `${Math.round(d.programShare * 100)}% of expenses`, bad: d.programShare < 0.65 },
    d.debtShare != null && { k: "Liabilities", v: `${Math.round(d.debtShare * 100)}% of assets`, bad: d.debtShare > 0.5 },
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
          {paid.map((p) => <li key={p.name + p.title}><span><b>{titleCase(p.name)}</b><small>{titleCase(p.title)}</small></span><span>{money(p.pay + p.other)}</span></li>)}
        </ul>
      )}
      <p className="board-line">
        {d.board ? <><b>{d.board.members}</b> board members, <b>{d.board.independent}</b> independent</> : unpaid.length ? <><b>{unpaid.length}</b> unpaid officers and directors</> : null}
        {d.board && unpaid.length > 0 && <> · {unpaid.length} serve unpaid</>}
      </p>
      {checks.length > 0 && (
        <ul className="checks">
          {checks.map((c) => <li key={c.label} className={c.ok ? "ok" : c.minor ? "minor" : "bad"}>{c.ok ? "✓" : "!"} {c.ok ? c.label : c.label.replace(/^No /, "Reports ").replace("Financial statements audited", "Financial statements not audited").replace(/ policy$/, " policy missing")}</li>)}
        </ul>
      )}
      <p className="note-small">Form {d.form === "990EZ" ? "990-EZ" : "990"}, tax year {d.year}, Parts IV, VI and VII{d.url && <> · <a href={d.url} target="_blank" rel="noreferrer">filing ↗</a></>}</p>
    </section>
  );
}

// Overall financial health from the newest 990, by fixed rules (RULES): the level, then each signal
// with its figure, problems first. The rules are one click away so the rating can be checked.
function HealthRating({ d }: { d: Diligence }) {
  const order = { weak: 0, watch: 1, ok: 2 } as const;
  const signals = [...d.rating.signals].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <section className={`rating ${d.rating.level.toLowerCase()}`}>
      <h2>Financial health <span className="rating-level">{d.rating.level}</span><small>Form {d.form === "990EZ" ? "990-EZ" : "990"}, {d.year}</small></h2>
      <ul>
        {signals.map((x) => <li key={x.label} className={x.level}><b>{x.label}</b>{x.note}</li>)}
      </ul>
      <details>
        <summary>How this is rated</summary>
        <p>Any weak signal makes it Weak; two or more to watch make it Medium; otherwise Strong. Fixed rules, no AI:</p>
        <ul>{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </details>
    </section>
  );
}
