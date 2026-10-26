import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FiguresSkeleton, FullFigures, MiniFigures, MiniSkeleton } from "@/components/BrowseFigures";
import { COVERAGE_TEXT, coverageOf, ENVIRONMENT, findSub, inkOn, SDGS, sdgSlug, type Sdg, type Sub } from "@/lib/sdg";
import "../browse.css";

// A goal (sdg-4) or the Environment umbrella: what the whole goal counts and its figures, then its subcategories.
type Goal = { sdg: Sdg | null; title: string; scope: Sub; subs: { sub: Sub; sdg: Sdg | null; isScope: boolean }[] };
function goalOf(slug: string): Goal | null {
  if (slug === ENVIRONMENT.id) return { sdg: null, title: ENVIRONMENT.name, scope: ENVIRONMENT.scope, subs: ENVIRONMENT.includes.map((id) => findSub(id)).filter((f) => !!f).map((f) => ({ sub: f!.sub, sdg: f!.sdg, isScope: f!.isScope })) };
  const g = SDGS.find((x) => sdgSlug(x.n) === slug);
  return g ? { sdg: g, title: g.name, scope: g.scope, subs: g.subs.map((sub) => ({ sub, sdg: g, isScope: false })) } : null;
}
export function generateStaticParams() { return [...SDGS.map((g) => ({ goal: sdgSlug(g.n) })), { goal: ENVIRONMENT.id }]; }

export async function generateMetadata(props: PageProps<"/browse/[goal]">): Promise<Metadata> {
  const g = goalOf((await props.params).goal);
  return { title: g ? `${g.sdg ? `Goal ${g.sdg.n}: ` : ""}${g.title} · Browse · NomBot` : "Browse · NomBot" };
}

export default async function GoalPage(props: PageProps<"/browse/[goal]">) {
  const slug = (await props.params).goal;
  const g = goalOf(slug);
  if (!g) notFound();
  const s = g.sdg;
  const see = (s?.seeAlso ?? []).map((id) => findSub(id)).filter((f) => !!f);
  return (
    <main className="br-page">
      <Link href="/browse" className="back">← Browse by cause</Link>
      <header className="br-head">
        {s ? <b className="sdg-n big" style={{ background: s.color, color: inkOn(s.color) }}>{s.n}</b> : <b className="sdg-n big env">E</b>}
        <div>
          <p className="br-kicker">{s ? `UN Sustainable Development Goal ${s.n}` : "Umbrella over the Planet goals"}</p>
          <h1 className="pagetitle">{g.title}</h1>
          <p className="br-sub">{s ? s.plain : ENVIRONMENT.plain}</p>
        </div>
      </header>
      {s && <p className="br-goal">&ldquo;{s.goal}.&rdquo; <a href={`https://sdgs.un.org/goals/goal${s.n}`}>UN targets</a></p>}
      {s?.limited && <p className="br-limited"><b>Limited nonprofit data.</b> {s.limited}</p>}

      <section className="br-sec">
        <h2>{s ? "The whole goal" : "All environment and animals"} <span className="br-tag">{COVERAGE_TEXT[coverageOf(g.scope)]}</span></h2>
        <p className="br-counts">Counts: {g.scope.plain}.{g.scope.note ? ` ${g.scope.note}` : ""}</p>
        <Suspense fallback={<FiguresSkeleton />}><FullFigures id={g.scope.id} searchName={g.scope.name.toLowerCase()} /></Suspense>
      </section>

      <section className="br-sec">
        <h2>Subcategories</h2>
        <div className="br-grid">
          {g.subs.map(({ sub, sdg, isScope }) => sub.coverage === "none" ? (
            <div key={sub.id} className="br-card off">
              <div className="br-card-h"><strong>{sub.name}</strong></div>
              <p>{sub.plain}</p>
              <span className="br-tag none">Not in our data yet</span>
              {sub.note && <p className="br-mini muted">{sub.note}</p>}
            </div>
          ) : (
            <Link key={sub.id} href={`/browse/${sdg ? sdgSlug(sdg.n) : ENVIRONMENT.id}${isScope ? "" : `/${sub.id}`}`} className="br-card">
              <div className="br-card-h">{!s && sdg && <b className="sdg-n" style={{ background: sdg.color, color: inkOn(sdg.color) }}>{sdg.n}</b>}<strong>{sub.name}</strong></div>
              <p>{sub.plain}</p>
              <span className={`br-tag${coverageOf(sub) === "keywords" ? " limited" : ""}`}>{COVERAGE_TEXT[coverageOf(sub)]}{sub.pending && coverageOf(sub) !== "label" ? ", label coming" : ""}</span>
              <Suspense fallback={<MiniSkeleton />}><MiniFigures id={sub.id} /></Suspense>
            </Link>
          ))}
        </div>
      </section>

      {see.length > 0 && (
        <section className="br-sec">
          <h2>Also serves this goal</h2>
          <div className="chips suggest">
            {see.map((f) => <Link key={f!.sub.id} href={`/browse/${f!.sdg ? sdgSlug(f!.sdg.n) : ENVIRONMENT.id}${f!.isScope ? "" : `/${f!.sub.id}`}`} className="chip link">{f!.sub.name}{f!.sdg ? ` (Goal ${f!.sdg.n})` : ""}</Link>)}
          </div>
        </section>
      )}
    </main>
  );
}
