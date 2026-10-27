import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { InsightPoints } from "@/components/InsightPoints";
import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { titleCase } from "@/components/text";
import { AskFinding, DataTable, FindingActions, FindingChart } from "@/components/ResearchFinding";
import { getInsight, orgsByEin, relatedInsights } from "@/lib/insights";
import { dek, exploreHref, findingEins, readTime, researchHref, sectionLabel, updated, type Insight } from "@/lib/insightMeta";
import { coverNumber, reportImage } from "@/lib/reportImages";
import { ReportImage } from "@/components/ReportImage";
import { ShareTools } from "@/components/ShareTools";
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
      <Link href="/research/reports" className="back rd-back">← Reports</Link>
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
  const img = reportImage(i);
  // The summary after its first sentence (the dek), as short paragraphs of two sentences each.
  const rest = i.summary.slice(dek(i).length).trim();
  const sentences = rest.match(/[^.!?]+[.!?]+(\s|$)/g) ?? (rest ? [rest] : []);
  const paras = sentences.reduce<string[]>((out, x, k) => { if (k % 2) out[out.length - 1] += x; else out.push(x); return out; }, []);
  const stat = i.stats?.[0];
  return (
    // Article layout (Oct 27): photo with credit, headline, dek, byline, a pull stat, short paragraphs, the chart with
    // its caption, "What this means", then organizations, a follow-up, and Method and sources folded at the end.
    <article className="rd ra" data-section={i.section}>
      <ReportImage img={img} section={i.section} size="hero" priority cover={coverNumber(i)} />
      <header className="ra-head">
        <p className="rp-cat">{sectionLabel(i.section)}{place ? ` · ${place}` : ""}</p>
        <h1>{i.headline}</h1>
        <p className="ra-dek">{dek(i)}</p>
        <p className="ra-byline">Institute on Generosity · NomBot research{date ? ` · ${date}` : ""} · {readTime(i)} min read</p>
        <div className="ra-tools"><ShareTools /><FindingActions i={i} /></div>
      </header>
      {/* The pull stat, unless the generated cover above already shows the same number */}
      {stat && img && <p className="ra-pull"><b>{stat.value}</b><span>{stat.label}</span></p>}
      {paras.map((p) => <p key={p} className="ra-p">{p.trim()}</p>)}
      {i.chart && <FindingChart i={i} />}
      <section className="ra-sec">
        <h2>What this means</h2>
        <InsightPoints i={i} className="rd-points" />
      </section>
      {i.data?.length > 0 && (
        <details className="more-info ra-data">
          <summary><span className="when-closed">The data ({i.data.length} rows)</span><span className="when-open">Hide the data</span></summary>
          <DataTable rows={i.data} slug={i.slug} />
        </details>
      )}
      {(eins.length > 0 || explore) && (
        <section className="ra-sec">
          <div className="rd-sec-head">
            <h2>Organizations involved</h2>
            {i.explore_query && explore && <NavLink href={explore} className="ins-link" label="Searching…" search>Search similar →</NavLink>}
          </div>
          {eins.length > 0
            ? <Suspense fallback={<div className="sk rd-sk-list" />}><Orgs eins={eins} /></Suspense>
            : <p className="rd-note">This finding covers whole groups, not a list of organizations.</p>}
        </section>
      )}
      <AskFinding slug={i.slug} section={i.section} />

      <details className="more-info ra-method">
        <summary><span className="when-closed">Method and sources</span><span className="when-open">Hide method and sources</span></summary>
        {i.method && <p>{i.method}</p>}
        {i.caveats && <p className="rd-caveat"><b>Caveats</b> {i.caveats}</p>}
        {i.sources?.length > 0 && (
          <ul className="rd-sources">
            {i.sources.map((s) => <li key={s.url + s.label}><a href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a></li>)}
          </ul>
        )}
        {i.query && (
          <details className="rd-sql">
            <summary>SQL</summary>
            <pre><code>{i.query.trim()}</code></pre>
          </details>
        )}
      </details>

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
