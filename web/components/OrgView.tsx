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
import { getOrg } from "@/lib/org";

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
  const backHref = back && back.startsWith("/?") ? back : "/";

  return (
    <article className="org">
      {!modal && (back && back.startsWith("/?") ? <BackLink fallback={backHref}>← Back to results</BackLink> : <Link href="/" className="back">← New search</Link>)}
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
      </section>

      <section>
        <h2>Details</h2>
        <dl>
          {o.ntee && <><dt>Cause</dt><dd>{o.ntee.label} ({o.ntee.code})</dd></>}
          {o.subsection && <><dt>Type</dt><dd>501(c)({Number(o.subsection)})</dd></>}
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
