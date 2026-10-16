import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { titleCase } from "@/components/text";
import { AskFinding, DataTable, FindingActions, FindingChart } from "@/components/ResearchFinding";
import { getInsight, orgsByEin, relatedInsights } from "@/lib/insights";
import { exploreHref, findingEins, researchHref, sectionLabel, updated, type Insight } from "@/lib/insightMeta";
import { LOADED_STATES } from "@/lib/filters";
import { nteeLabel } from "@/lib/ntee";

// One research finding, for researchers and advisors: key numbers, a large chart, the data table,
// the organizations behind it, a chat scoped to this finding, method and sources, related findings.
// The finding is cached (lib/insights getInsight); the page shell renders at once and the rest streams in.

export async function generateMetadata(props: PageProps<"/research/[slug]">): Promise<Metadata> {
  const i = await getInsight((await props.params).slug);
  return { title: i ? `${i.headline} · Research · NomBot` : "Research · NomBot", description: i?.summary };
}

export default function FindingPage(props: PageProps<"/research/[slug]">) {
  return (
    <main className="rd-page">
      <Link href="/research" className="back rd-back">← Research</Link>
      <Suspense fallback={<FindingSkeleton />}>
        <Finding params={props.params} />
      </Suspense>
    </main>
  );
}

async function Finding({ params }: { params: Promise<{ slug: string }> }) {
  const i = await getInsight((await params).slug);
  if (!i) notFound();
  const date = updated(i);
  const place = i.state ? LOADED_STATES.find(([c]) => c === i.state)?.[1] ?? i.state : null;
  const explore = exploreHref(i);
  const eins = findingEins(i);
  return (
    <article className="rd" data-section={i.section}>
      <header className="rd-head">
        <p className="ins-kicker">
          <span className="ins-sec">{sectionLabel(i.section)}</span>
          {place && <span className="ins-place">{place}</span>}
        </p>
        <h1>{i.headline}</h1>
        <div className="rd-meta">
          {date && <span>Updated {date}</span>}
          <FindingActions i={i} />
        </div>
      </header>

      {i.stats && i.stats.length > 0 && (
        <section className="rd-stats" aria-label="Key numbers">
          {i.stats.slice(0, 4).map((s) => (
            <div key={s.label} className="rd-stat"><b>{s.value}</b><span>{s.label}</span></div>
          ))}
        </section>
      )}

      {i.chart && <FindingChart i={i} />}

      <section className="rd-sec">
        <h2>What it means</h2>
        <p className="rd-lede">{i.summary}</p>
      </section>

      {i.data?.length > 0 && (
        <section className="rd-sec">
          <DataTable rows={i.data} slug={i.slug} />
        </section>
      )}

      {(eins.length > 0 || explore) && (
        <section className="rd-sec">
          <div className="rd-sec-head">
            <h2>Organizations involved</h2>
            {i.explore_query && explore && <NavLink href={explore} className="ins-link" label="Searching…" search>Search similar →</NavLink>}
          </div>
          {eins.length > 0
            ? <Suspense fallback={<div className="sk rd-sk-list" />}><Orgs eins={eins} /></Suspense>
            : <p className="rd-note">This finding covers whole groups, not a list of organizations.</p>}
        </section>
      )}

      <section className="rd-sec">
        <AskFinding slug={i.slug} section={i.section} />
      </section>

      <section className="rd-sec rd-method">
        <h2>Method and sources</h2>
        {i.method && <p>{i.method}</p>}
        {i.caveats && <p className="rd-caveat"><b>Caveats</b> {i.caveats}</p>}
        {i.query && (
          <details className="rd-sql">
            <summary>SQL</summary>
            <pre><code>{i.query.trim()}</code></pre>
          </details>
        )}
        {i.sources?.length > 0 && (
          <ul className="rd-sources">
            {i.sources.map((s) => <li key={s.url + s.label}><a href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a></li>)}
          </ul>
        )}
      </section>

      <Suspense fallback={null}><Related i={i} /></Suspense>
    </article>
  );
}

const SHOWN = 8;

async function Orgs({ eins }: { eins: string[] }) {
  await connection();
  const orgs = await orgsByEin(eins);
  if (!orgs.length) return <p className="rd-note">None of these organizations are in NomBot yet.</p>;
  const row = (o: (typeof orgs)[number]) => (
    <li key={o.ein}>
      <Link href={`/preview/org/${o.ein}`} scroll={false}>{titleCase(o.name)}</Link>
      <span>{[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ")}{o.ntee_cd && nteeLabel(o.ntee_cd) ? ` · ${nteeLabel(o.ntee_cd)}` : ""}</span>
      <span className="rd-rev">{o.revenue_amt ? money(Number(o.revenue_amt)) : ""}{o.revenue_amt && o.tax_year ? <small> {o.tax_year}</small> : null}</span>
    </li>
  );
  return (
    <>
      <ul className="rd-orgs">{orgs.slice(0, SHOWN).map(row)}</ul>
      {orgs.length > SHOWN && (
        <details className="rd-more">
          <summary>Show all {orgs.length}</summary>
          <ul className="rd-orgs">{orgs.slice(SHOWN).map(row)}</ul>
        </details>
      )}
      <p className="rd-note">Largest revenue first. Revenue from the newest IRS filing.</p>
    </>
  );
}

async function Related({ i }: { i: Insight }) {
  const rows = await relatedInsights(i);
  if (!rows.length) return null;
  return (
    <nav className="rd-sec rd-related" aria-label="Related research">
      <h2>Related research</h2>
      <ul>
        {rows.map((r) => (
          <li key={r.slug} data-section={r.section}>
            <NavLink href={researchHref(r.slug)} label="Opening the finding…">
              <span className="ins-sec">{sectionLabel(r.section)}</span>
              <b>{r.headline}</b>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function FindingSkeleton() {
  return (
    <div aria-hidden className="rd">
      <div className="sk sk-line short" style={{ width: 120 }} />
      <div className="sk rd-sk-title" />
      <div className="sk rd-sk-title short" />
      <div className="rd-stats">{[0, 1, 2].map((k) => <div key={k} className="sk rd-sk-stat" />)}</div>
      <div className="sk rd-sk-chart" />
    </div>
  );
}
