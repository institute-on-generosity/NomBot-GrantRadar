import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ReportImage } from "@/components/ReportImage";
import { ResearchTabs } from "@/components/ResearchTabs";
import { listInsights } from "@/lib/insights";
import { dek, readTime, researchHref, sectionLabel, SECTIONS, updated, type Insight } from "@/lib/insightMeta";
import { reportImage } from "@/lib/reportImages";

export const metadata = { title: "Reports · Research · NomBot" };

// Reports (Oct 27): the finished findings as articles, magazine style. One featured report, then cards (photo,
// category, headline, one-line dek, date, read time). One small row filters by category. No prompts here.
export default function ReportsPage(props: { searchParams: Promise<{ s?: string }> }) {
  return (
    <main className="rp-page">
      <ResearchTabs on="reports" />
      <Suspense fallback={<p className="hint">Loading reports…</p>}><Reports searchParams={props.searchParams} /></Suspense>
    </main>
  );
}

async function Reports({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await connection();
  const s = (await searchParams).s ?? "";
  const { insights } = await listInsights().catch(() => ({ insights: [] as Insight[] }));
  const shown = insights.filter((i) => !s || i.section === s);
  const [top, ...rest] = shown;
  const meta = (i: Insight) => [updated(i), `${readTime(i)} min read`].filter(Boolean).join(" · ");
  return (
    <>
      <nav className="rp-filter" aria-label="Categories">
        <Link href="/research/reports" className={!s ? "on" : undefined} aria-current={!s ? "page" : undefined}>All</Link>
        {SECTIONS.filter((x) => insights.some((i) => i.section === x.key)).map((x) => (
          <Link key={x.key} href={`/research/reports?s=${x.key}`} className={s === x.key ? "on" : undefined} aria-current={s === x.key ? "page" : undefined}>{x.label}</Link>
        ))}
      </nav>
      {top && (
        <Link href={researchHref(top.slug)} className="rp-feature">
          <ReportImage img={reportImage(top)} section={top.section} size="card" priority />
          <div>
            <p className="rp-cat">{sectionLabel(top.section)}</p>
            <h2>{top.headline}</h2>
            <p className="rp-dek">{dek(top)}</p>
            <p className="rp-meta">{meta(top)}</p>
          </div>
        </Link>
      )}
      <div className="rp-grid">
        {rest.map((i) => (
          <Link key={i.slug} href={researchHref(i.slug)} className="rp-card">
            <ReportImage img={reportImage(i)} section={i.section} />
            <p className="rp-cat">{sectionLabel(i.section)}</p>
            <h3>{i.headline}</h3>
            <p className="rp-dek">{dek(i)}</p>
            <p className="rp-meta">{meta(i)}</p>
          </Link>
        ))}
      </div>
      {!shown.length && <p className="hint">No reports yet.</p>}
    </>
  );
}
