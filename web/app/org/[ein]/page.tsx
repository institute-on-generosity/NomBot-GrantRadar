import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { money } from "@/components/ResultRow";
import { readable, titleCase } from "@/components/text";
import { getOrg } from "@/lib/org";

type Props = { params: Promise<{ ein: string }>; searchParams: Promise<{ back?: string }> };

export default function OrgPage(props: Props) {
  return (
    <main>
      <Link href="/" className="brand"><span className="logo">N</span>NomBot</Link>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <Org {...props} />
      </Suspense>
    </main>
  );
}

function Src({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return null;
  return href.startsWith("/") ? <Link className="cite" href={href}>{children}</Link> : <a className="cite" href={href} target="_blank" rel="noreferrer">{children} ↗</a>;
}

async function Org({ params, searchParams }: Props) {
  const [{ ein }, { back }] = await Promise.all([params, searchParams]);
  await connection();
  const o = await getOrg(ein);
  if (!o) notFound();
  const backHref = back && back.startsWith("/?") ? back : "/";

  return (
    <article className="org">
      <Link href={backHref} className="back">← Back to results</Link>
      <h1>{titleCase(o.name)}</h1>
      <p className="sub">
        {[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ")}
        {o.ntee?.label && <> · {o.ntee.label}</>} · EIN {o.ein}
      </p>

      <section>
        <h2>Mission <Src href={o.filing?.url}>Form {o.filing?.form} ({o.filing?.year})</Src></h2>
        <p>{o.mission ? readable(o.mission) : "This organization hasn't e-filed a mission statement we've loaded yet."}</p>
      </section>

      {o.programs && (
        <section>
          <h2>Programs <Src href={o.filing?.url}>Form {o.filing?.form} ({o.filing?.year})</Src></h2>
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
                  <td><Src href={y.url}>{y.source}</Src></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>No financial figures on file.</p>}
      </section>

      <section>
        <h2>Details <Src href={o.bmfUrl}>IRS master file</Src></h2>
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
          {o.sources.map((s) => <li key={s.url}>{s.internal ? <Link href={s.url}>{s.label}</Link> : <a href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a>}<span>{s.detail}</span></li>)}
        </ul>
      </section>
    </article>
  );
}
