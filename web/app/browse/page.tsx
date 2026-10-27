import { Suspense } from "react";
import Link from "next/link";
import { MiniFigures, MiniSkeleton } from "@/components/BrowseFigures";
import { Icon } from "@/components/Icons";
import { askHref } from "@/lib/researchQuestions";
import { ENVIRONMENT, SDG_SHORT, SDGS, sdgSlug } from "@/lib/sdg";
import "./browse.css";

export const metadata = { title: "Browse by cause · NomBot" };

// Browse by cause (Oct 27 redesign): the goal grid is the page. The same compact tiles as the home Research tab
// (one word, the SDG color as a dot, the full name in the tooltip), each with one number: foundation grants
// 2022 to 2024. Environment (the umbrella over the Planet goals) is one more tile. Method under "How we count".
export default function BrowsePage() {
  return (
    <main className="br-page">
      <h1 className="pagetitle">Browse by cause</h1>
      <p className="hint">Foundation grants by goal, 2022–24.</p>
      <div className="br-goals">
        {SDGS.map((g) => (
          <Link key={g.n} href={`/browse/${sdgSlug(g.n)}`} className="br-goal-tile" title={`Goal ${g.n}: ${g.name}. ${g.plain}${g.coverage === "limited" ? ". Limited nonprofit data" : ""}`}>
            <span className="br-goal-name"><i className="sdg-dot" style={{ background: g.color }} aria-hidden />{SDG_SHORT[g.n] ?? g.name}{g.coverage === "limited" && <span className="br-lim" aria-label="Limited nonprofit data"><Icon name="warn" size={12} /></span>}</span>
            <Suspense fallback={<MiniSkeleton />}><MiniFigures id={g.scope.id} /></Suspense>
          </Link>
        ))}
        <Link href={`/browse/${ENVIRONMENT.id}`} className="br-goal-tile" title={`All environment and animal groups. ${ENVIRONMENT.plain}.`}>
          <span className="br-goal-name"><i className="sdg-dot env" aria-hidden />Environment</span>
          <Suspense fallback={<MiniSkeleton />}><MiniFigures id={ENVIRONMENT.id} /></Suspense>
        </Link>
      </div>
      <p className="br-across">
        <span>Across causes</span>
        {[["Fastest growing", "Which causes are growing fastest in foundation funding?"], ["Overlooked food banks", "Which food banks are overlooked by foundations for their size?"], ["Top 100 foundations' share", "What share of foundation giving comes from the 100 largest foundations?"]].map(([l, q]) => (
          <Link key={q} href={askHref(q)} title={q}>{l}</Link>
        ))}
      </p>
      <details className="more-info br-foot"><summary><span className="when-closed">How we count</span><span className="when-open">Hide how we count</span></summary><p>Each goal counts one set of orgs, named on its page. Graded labels come from each org&apos;s own 990 text. IRS codes are the NTEE codes the IRS lists. Goals marked with a warning are mostly the work of governments and companies. Goal names and texts are the UN&apos;s (<a href="https://sdgs.un.org/goals">sdgs.un.org/goals</a>). Foundation grants from IRS 990-PF filings.</p></details>
    </main>
  );
}
