import { Suspense } from "react";
import Link from "next/link";
import { MiniFigures, MiniSkeleton } from "@/components/BrowseFigures";
import { askHref } from "@/lib/researchQuestions";
import { ENVIRONMENT, inkOn, PILLARS, SDGS, sdgSlug, type Sdg } from "@/lib/sdg";
import "./browse.css";

export const metadata = { title: "Browse by cause · NomBot" };

const COVER: Record<Sdg["coverage"], string> = { label: "Graded labels", ntee: "IRS codes", limited: "Limited nonprofit data" };

// Browse by cause: the 17 UN Sustainable Development Goals in the UN's five groups, each card with its foundation
// dollars, growth and orgs (lib/browse.ts), and the Environment umbrella over the Planet goals.
export default function BrowsePage() {
  return (
    <main className="br-page">
      <h1 className="pagetitle">Browse by cause</h1>
      <p className="hint">Foundation grants by UN goal, 2022 to 24. Open a goal for its causes, funders and states.</p>
      {PILLARS.map((p) => (
        <section key={p.id} className="br-pillar">
          <h2>{p.name} <span>{p.plain}</span></h2>
          <div className="br-grid">
            {p.id === "planet" && (
              <Link href={`/browse/${ENVIRONMENT.id}`} className="br-card env">
                <div className="br-card-h"><b className="sdg-n env">E</b><strong>{ENVIRONMENT.name}</strong></div>
                <p>All environment and animal groups. {ENVIRONMENT.plain}.</p>
                <span className="br-tag">IRS codes, label coming</span>
                <Suspense fallback={<MiniSkeleton />}><MiniFigures id={ENVIRONMENT.id} /></Suspense>
              </Link>
            )}
            {SDGS.filter((g) => g.pillar === p.id).map((g) => (
              <Link key={g.n} href={`/browse/${sdgSlug(g.n)}`} className="br-card">
                <div className="br-card-h"><b className="sdg-n" style={{ background: g.color, color: inkOn(g.color) }}>{g.n}</b><strong>{g.name}</strong></div>
                <p>{g.plain}</p>
                <span className={`br-tag${g.coverage === "limited" ? " limited" : ""}`}>{COVER[g.coverage]}</span>
                <Suspense fallback={<MiniSkeleton />}><MiniFigures id={g.scope.id} /></Suspense>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <section className="br-pillar">
        <h2>Across causes</h2>
        <div className="chips suggest br-cross">
          {["Which causes are growing fastest in foundation funding?", "Which food banks are overlooked by foundations for their size?", "What share of foundation giving comes from the 100 largest foundations?"].map((q) => (
            <Link key={q} href={askHref(q)} className="chip link">{q}</Link>
          ))}
        </div>
      </section>
      <details className="more-info br-foot"><summary>How we count</summary><p>Goal figures count one set of orgs per goal, named on each goal&apos;s page. Graded labels come from each org&apos;s own 990 text. IRS codes are the NTEE codes the IRS lists. Goals marked limited are mostly the work of governments and companies. Goal names and texts are the UN&apos;s (<a href="https://sdgs.un.org/goals">sdgs.un.org/goals</a>). Foundation grants from IRS 990-PF filings.</p></details>
    </main>
  );
}
