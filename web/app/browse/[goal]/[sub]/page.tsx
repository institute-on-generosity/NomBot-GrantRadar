import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FiguresSkeleton, FullFigures } from "@/components/BrowseFigures";
import { COVERAGE_TEXT, coverageOf, covered, ENVIRONMENT, findSub, inkOn, sdgSlug } from "@/lib/sdg";
import "../../browse.css";

// One subcategory: what it counts, its coverage and limits, the UN targets it serves, and its figures.
function subOf(goal: string, id: string) {
  const f = findSub(id);
  if (!f || f.isScope || f.sub.coverage === "none") return null;
  return (f.sdg ? sdgSlug(f.sdg.n) : ENVIRONMENT.id) === goal ? f : null;
}
export function generateStaticParams() {
  return covered().filter((f) => !f.isScope && f.sdg).map((f) => ({ goal: sdgSlug(f.sdg!.n), sub: f.sub.id }));
}
export async function generateMetadata(props: PageProps<"/browse/[goal]/[sub]">): Promise<Metadata> {
  const p = await props.params, f = subOf(p.goal, p.sub);
  return { title: f ? `${f.sub.name} · Browse · NomBot` : "Browse · NomBot" };
}

export default async function SubPage(props: PageProps<"/browse/[goal]/[sub]">) {
  const p = await props.params;
  const f = subOf(p.goal, p.sub);
  if (!f) notFound();
  const s = f.sdg!, sub = f.sub, cov = coverageOf(sub);
  return (
    <main className="br-page">
      <Link href={`/browse/${sdgSlug(s.n)}`} className="back">← Goal {s.n}: {s.name}</Link>
      <header className="br-head">
        <b className="sdg-n big" style={{ background: s.color, color: inkOn(s.color) }}>{s.n}</b>
        <div>
          <p className="br-kicker">Goal {s.n}, {s.name}</p>
          <h1 className="pagetitle">{sub.name}</h1>
          <p className="br-sub">{sub.plain}</p>
        </div>
      </header>
      <p className="br-counts">
        <span className={`br-tag${cov === "keywords" ? " limited" : ""}`}>{COVERAGE_TEXT[cov]}{sub.pending && cov !== "label" ? ", label coming" : ""}</span>
        {sub.targets?.length ? ` Serves UN targets ${sub.targets.join(", ")}.` : ""}{sub.note ? ` ${sub.note}` : ""}
      </p>
      <Suspense fallback={<FiguresSkeleton />}><FullFigures id={sub.id} searchName={sub.name.toLowerCase()} /></Suspense>
    </main>
  );
}
