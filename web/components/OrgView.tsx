import { Suspense } from "react";
import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { money } from "@/components/money";
import { Icon } from "@/components/Icons";
import { nteeLabel } from "@/lib/ntee";
import { BackLink } from "@/components/BackLink";
import { RecordViewed } from "@/components/HistoryRecorder";
import { StarButton } from "@/components/StarButton";
import { CompareButton } from "@/components/CompareButton";
import { OrgSectionNav } from "@/components/OrgSectionNav";
import { FolderPicker } from "@/components/FolderPicker";
import { PrintButton, PrintStamp } from "@/components/PrintButton";
import { readable, titleCase, orgTitle } from "@/components/text";
import { getOrg, formName, LATEST_RETURN_NOTE, type Income } from "@/lib/org";
import { trackText, vetting } from "@/lib/vetting";
import { LABEL_SUBTYPES, type LabelSub } from "@/lib/labels";
import type { TaxStatus } from "@/lib/taxStatus";
import { prettyTitle, type Diligence } from "@/lib/flag";
import type { BoardLink } from "@/lib/people";
import { OrgFunding } from "@/components/OrgFunding";
import { OrgNews } from "@/components/OrgNews";
import { OrgSimilar } from "@/components/OrgSimilar";
import { OrgHealthSection } from "@/components/OrgHealth";

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
      <div className="title-line"><h1>{orgTitle(o.name)}</h1><StarButton withLabel org={{ ein: o.ein, name: o.name, city: o.city, state: o.state, cause: o.ntee?.label ?? null, revenue: o.years[0]?.revenue ?? null, year: o.years[0]?.year ?? null }} /><FolderPicker ein={o.ein} /><CompareButton org={{ ein: o.ein, name: o.name, city: o.city, state: o.state }} />{!modal && <PrintButton />}</div>
      {/* Top: name, place (website as an icon), then 3 icon stats. Cause, EIN and the latest 990 live in Details. */}
      <p className="sub org-place">
        <Icon name="pin" size={15} />{[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ")}
        {o.website && <a className="site" href={`https://${o.website}`} target="_blank" rel="noreferrer" title={`Website: ${o.website.replace(/^www\./, "").replace(/\/.*$/, "")}`} aria-label="Website"><Icon name="globe" size={15} /></a>}
      </p>
      {o.tax?.revocation && (o.tax.status === "revoked" || o.tax.status === "conflict") && <Revoked r={o.tax.revocation} conflict={o.tax.status === "conflict"} onPub78={o.tax.pub78.eligible} />}
      <ul className="org-stats">
        {o.years[0]?.revenue != null && <li title={`Yearly income, ${o.years[0].year}`}><Icon name="money" size={18} /><b>{money(o.years[0].revenue)}</b><span>income</span></li>}
        {o.team?.staff != null && <li title={`Form 990 (${o.team.year}): ${o.team.staff.toLocaleString("en-US")} staff${o.team.volunteers != null ? `, ${o.team.volunteers.toLocaleString("en-US")} volunteers` : ""}`}><Icon name="people" size={18} /><b>{o.team.staff === 0 && (o.team.volunteers ?? 0) > 0 ? o.team.volunteers!.toLocaleString("en-US") : o.team.staff.toLocaleString("en-US")}</b><span>{o.team.staff === 0 && (o.team.volunteers ?? 0) > 0 ? "volunteers" : "staff"}</span></li>}
        {o.age != null && <li title={`Tax-exempt since ${o.ruling} (IRS ruling date)`}><Icon name="calendar" size={18} /><b>{o.age < 1 ? "<1" : o.age}</b><span>years</span></li>}
      </ul>
      <Suspense fallback={<p className="org-track" aria-hidden="true">&nbsp;</p>}><TrackLine o={o} /></Suspense>
      {!modal && <OrgSectionNav />}

      <section>
        <h2>Mission</h2>
        <p>{o.mission ? readable(o.mission, [o.name]) : "This organization hasn't e-filed a mission statement we've loaded yet."}</p>
      </section>

      {o.programs && (
        <section>
          <h2>Programs</h2>
          <Clamp text={readable(o.programs, [o.name])} />
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
                  <td className="n">{y.expenses != null ? money(y.expenses) : <span className="na">Not reported</span>}</td>
                  <td className="n">{y.assets != null ? money(y.assets) : <span className="na">Not reported</span>}</td>
                  <td><Src href={y.url} inModal={modal ? o.ein : undefined}>{y.source}</Src></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>No financial figures on file.</p>}
        {/* The 990's own split (with government grants) when there is one, else the SOI extract */}
        {/* Where the money comes from and the year-over-year detail: one click away (they repeat cash and debts) */}
        {(o.flag?.income || o.income || o.flag) && (
          <details className="more-info">
            <summary><span className="when-closed">Income sources and year over year</span><span className="when-open">Hide income sources and year over year</span></summary>
            {o.flag?.income ? <IncomeMix i={{ ...o.flag.income, year: o.flag.income.year ?? 0, form: o.flag.form }} /> : o.income && <IncomeMix i={o.income} />}
            {o.flag && <YearOverYear d={o.flag} />}
          </details>
        )}
      </section>

      {/* Financial indicators over the full filing years, with flags and peers (lib/financialHealth); streams in */}
      <Suspense fallback={null}><OrgHealthSection ein={o.ein.replace(/\D/g, "")} /></Suspense>

      {/* 3 to 5 questions for the follow-up call, each with its reason (lib/vetting, fixed rules) */}
      <Suspense fallback={null}><OrgQuestions o={o} /></Suspense>

      {/* Grants received (foundations, charities, federal) and given; streams in after the profile */}
      <Suspense fallback={<p className="hint">Loading grants…</p>}><OrgFunding ein={o.ein} /></Suspense>

      {o.flag && (o.flag.people.length > 0 || o.flag.checks.length > 0) && <Leadership d={o.flag} ein={o.ein} />}

      {o.links.length > 0 && <BoardConnections links={o.links} ein={o.ein} />}

      {/* Nearest orgs by 990 text, with a less-funded toggle (generosity-data org_similar); streams in */}
      <Suspense fallback={null}><OrgSimilar ein={o.ein} /></Suspense>

      <section>
        <h2>Details</h2>
        <dl>
          <dt>EIN</dt><dd>{o.ein}</dd>
          {o.latest990 && <><dt>Latest 990</dt><dd title={LATEST_RETURN_NOTE}>Tax year {o.latest990.year}{o.latest990.form !== "990" && <> (Form {formName(o.latest990.form)})</>}{o.latest990.processed && <>, processed {o.latest990.processed}</>}</dd></>}
          {o.ntee && !o.nteeSuggested && <><dt>Cause</dt><dd title={`IRS code ${o.ntee.code}`}>{o.ntee.label}</dd></>}
          {o.nteeSuggested && <><dt>Cause</dt><dd className="org-labels">
            <span>IRS code: {o.ntee ? <>{o.ntee.code} ({o.ntee.label})</> : (o.nteeSuggested.irs_code ?? "none")}. Likely: <b>{o.nteeSuggested.name} ({o.nteeSuggested.major})</b>{o.nteeSuggested.code && <>, detailed code <b>{o.nteeSuggested.code}</b>{nteeLabel(o.nteeSuggested.code) && nteeLabel(o.nteeSuggested.code) !== o.nteeSuggested.name ? ` (${nteeLabel(o.nteeSuggested.code)})` : ""}</>}
              {o.nteeSuggested.quote && <small>&ldquo;{readable(o.nteeSuggested.quote)}&rdquo;</small>}
              <small>{o.nteeSuggested.note}</small></span></dd></>}
          {o.labels.length > 0 && <><dt>Cause labels</dt><dd className="org-labels">{o.labels.map((l) => (
            <span key={l.label} title="Graded by NomBot from the organization's name and Form 990 text">
              <b>{l.name}</b>: {l.tier === "primary" ? "main focus" : "part of their work"}{l.subtypes && LABEL_SUBTYPES[l.label] && ` · ${l.subtypes.map((x) => LABEL_SUBTYPES[l.label]!.names[x as LabelSub]?.toLowerCase() ?? x).join(" and ")}`}{l.why && <small>{l.why}</small>}
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

      {/* Newest headlines that name this org (generosity-data news_org_links); streams in */}
      <Suspense fallback={null}><OrgNews ein={o.ein} /></Suspense>

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

// What a "no" on a 990 governance question means, in one line (round-2 audit O-2). Only money used for the wrong purpose
// stays red; the rest are amber "ask about this" items, usually explained on Schedule L.
const CHECK_WHY: Record<string, string> = {
  family_business_ties: "Common on small or family boards. Ask who approves deals with relatives.",
  business_with_insiders: "Listed on Schedule L. Ask about the amount and who approved it.",
  insider_loan: "Listed on Schedule L. Ask about the terms.",
  excess_benefit: "The IRS can fine this. Ask what was corrected.",
  conflict_policy: "Ask how conflicts are handled.",
  whistleblower_policy: "Ask how staff can raise concerns.",
  audited: "Ask for financial statements.",
  diversion_of_assets: "A serious finding. Read the filing's explanation.",
};

type OrgT = NonNullable<Awaited<ReturnType<typeof getOrg>>>;
// Track record under the key numbers: tax-exempt since, returns on record, the income trend (advisor brief, Oct 28)
async function TrackLine({ o }: { o: OrgT }) {
  const v = await vetting(o).catch(() => null);
  return v?.track.text ? <p className="org-track" title="From the IRS ruling date and the returns we have loaded">{trackText({ ...v.track, age: o.age != null ? null : v.track.age })}</p> : null; // the years are already in the key numbers
}
async function OrgQuestions({ o }: { o: OrgT }) {
  const v = await vetting(o).catch(() => null);
  if (!v?.questions.length) return null;
  return (
    <section className="org-asks">
      <h2>Questions to ask</h2>
      <ol>{v.questions.map((x) => <li key={x.key}><b>{x.q}</b><small>Because {x.because}</small></li>)}</ol>
    </section>
  );
}

// Long program text: the first few sentences, the rest one click away.
function Clamp({ text, at = 180 }: { text: string; at?: number }) {
  if (text.length <= at + 80) return <p>{text}</p>;
  const cut = text.slice(0, at).search(/[.!?|]\s[^.!?|]*$/);
  // No sentence end near the cut: cut at a word and show an ellipsis (never "improve e", round-2 audit Q3)
  const i = cut > 120 ? cut + 1 : text.slice(0, at).replace(/\s+\S*$/, "").length;
  return (
    <>
      <p>{text.slice(0, i).trim()}{cut > 120 ? "" : "…"}</p>
      <details className="more-info"><summary><span className="when-closed">Read all</span><span className="when-open">Show less</span></summary><p>{text.slice(i).trim()}</p></details>
    </>
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
function Leadership({ d, ein }: { d: Diligence; ein: string }) {
  const paid = d.people.filter((p) => p.pay + p.other > 0).slice(0, 6);
  const unpaid = d.people.filter((p) => p.pay + p.other === 0);
  const checks = [...d.checks].sort((a, b) => Number(a.ok) - Number(b.ok));
  return (
    <section>
      <h2>Leadership and governance</h2>
      {paid.length > 0 && (
        <ul className="people">
          {paid.map((p) => <li key={p.name + p.title}><NavLink href={personHref(p.name, ein)} label="Opening the person…" className="person-link"><b>{titleCase(p.name)}</b><small>{prettyTitle(p.title)}</small></NavLink><span>Pay {money(p.pay + p.other)}</span></li>)}
        </ul>
      )}
      <p className="board-line">
        {d.board ? <><b>{d.board.members}</b> board members, <b>{d.board.independent}</b> independent</> : unpaid.length ? <><b>{unpaid.length}</b> unpaid officers and directors</> : null}
        {d.board && unpaid.length > 0 && <> · {unpaid.length} serve unpaid</>}
      </p>
      {unpaid.length > 0 && (
        <p className="board-names">
          {unpaid.slice(0, 30).map((p, i) => <span key={p.name + i}>{i > 0 && ", "}<NavLink href={personHref(p.name, ein)} label="Opening the person…">{titleCase(p.name)}</NavLink></span>)}
          {unpaid.length > 30 && <> and {unpaid.length - 30} more</>}
        </p>
      )}
      {checks.length > 0 && (
        <ul className="checks">
          {checks.map((c) => <li key={c.key} className={c.ok ? "ok" : c.minor ? "minor" : c.key === "diversion_of_assets" ? "bad" : "watch"} title={c.ok ? undefined : CHECK_WHY[c.key]} tabIndex={c.ok ? undefined : 0}>{c.ok ? "✓" : "!"} {c.label}{!c.ok && CHECK_WHY[c.key] && <small className="gov-why">{CHECK_WHY[c.key]}</small>}</li>)}
        </ul>
      )}
      <p className="note-small">Form {d.form === "990EZ" ? "990-EZ" : "990"}, tax year {d.year}, Parts IV, VI and VII{d.url && <> · <a href={d.url} target="_blank" rel="noreferrer">filing ↗</a></>}</p>
    </section>
  );
}

// Board members who also sit on other boards in this state: who this organization is connected to.
function BoardConnections({ links, ein }: { links: BoardLink[]; ein: string }) {
  return (
    <section>
      <h2>Board connections</h2>
      <ul className="links">
        {links.map((p) => (
          <li key={p.name}>
            <NavLink href={personHref(p.name, ein)} label="Opening the person…" className="link-person"><b>{titleCase(p.name)}</b>{p.title && <small>{prettyTitle(p.title)}</small>}</NavLink>
            <span>Also on {p.others.map((x, i) => <span key={x.ein}>{i > 0 && ", "}<NavLink href={`/org/${x.ein}`} label="Opening the organization…">{orgTitle(x.org)}</NavLink>{x.foundation && <i className="person-tag">Foundation</i>}</span>)}</span>
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
      {/* The questions themselves live in "Questions to ask" (lib/vetting), with the reason for each */}
      {asks.length > 0 && <p className="note-small">Amber and red mean &ldquo;ask about this,&rdquo; not &ldquo;don&apos;t give.&rdquo;</p>}
    </section>
  );
}

// The person holding this seat: ein tells apart people who share a name (generosity-data 078).
const personHref = (name: string, ein: string) => `/person?${new URLSearchParams({ name, ein: ein.replace(/\D/g, "") })}`;
