import { Suspense } from "react";
import Link from "next/link";
import { MiniFigures, MiniSkeleton } from "@/components/BrowseFigures";
import { CauseIcon } from "@/components/CauseIcon";
import { askHref } from "@/lib/researchQuestions";
import { ENVIRONMENT, SDG_SHORT, SDGS, sdgSlug, trustOf, trustText } from "@/lib/sdg";
import { TrustLegend, TrustMark } from "@/components/TrustMark";
import "./browse.css";

export const metadata = { title: "Browse by cause · NomBot" };

// Browse by cause (Oct 27 redesign): the goal grid is the page. The same compact tiles as the home Research tab
// (one word, the SDG color as a dot, the full name in the tooltip), each with one number: foundation grants
// 2022 to 2024. Environment (the umbrella over the Planet goals) is one more tile. Method under "How we count".
export default function BrowsePage() {
  return (
    <main className="br-page">
      <h1 className="pagetitle">Browse by cause</h1>
      <p className="hint">Foundation grants by cause, 2022–24.</p>
      <div className="br-goals">
        {SDGS.map((g) => (
          <Link key={g.n} href={`/browse/${sdgSlug(g.n)}`} className="br-goal-tile" title={`Goal ${g.n}: ${g.name}. ${g.plain}${g.coverage === "limited" ? ". Limited nonprofit data" : ""}`}>
            <CauseIcon n={g.n} color={g.color} size={34} />
            <Suspense fallback={<MiniSkeleton />}><MiniFigures id={g.scope.id} /></Suspense>
            <span className="br-goal-name"><span className="br-goal-label">{SDG_SHORT[g.n] ?? g.name}</span><TrustMark trust={trustOf(g.scope, g)} tip={g.limited ? `Limited nonprofit data for this cause. ${g.limited}` : trustText(g.scope, g)} /></span>
          </Link>
        ))}
      </div>
      <div className="br-goals br-env">
        <Link href={`/browse/${ENVIRONMENT.id}`} className="br-goal-tile" title={`All environment and animal groups. ${ENVIRONMENT.plain}.`}>
          <span className="br-goal-name"><CauseIcon label="Environment" size={34} />Environment<TrustMark trust={trustOf(ENVIRONMENT.scope)} tip={trustText(ENVIRONMENT.scope)} /></span>
          <Suspense fallback={<MiniSkeleton />}><MiniFigures id={ENVIRONMENT.id} /></Suspense>
        </Link>
      </div>
      <TrustLegend limited />
      <p className="br-across">
        <span>Across causes</span>
        {[["Fastest growing", "Which causes are growing fastest in foundation funding?"], ["Overlooked food banks", "Which food banks are overlooked by foundations for their size?"], ["Top 100 foundations' share", "What share of foundation giving comes from the 100 largest foundations?"]].map(([l, q]) => (
          <Link key={q} href={askHref(q)} title={q}>{l}</Link>
        ))}
      </p>
      <details className="more-info br-foot"><summary><span className="when-closed">How we count</span><span className="when-open">Hide how we count</span></summary><p>Each cause counts one set of orgs, named on its page. Graded labels come from each org&apos;s own 990 text. IRS codes are the NTEE codes the IRS lists. ◐ partial marks causes counted by the IRS cause codes nonprofits choose, not yet by a checked cause label. ✓ marks a checked label. ◌ marks goals that are mostly the work of governments and companies. Goal names and texts are the UN&apos;s (<a href="https://sdgs.un.org/goals">sdgs.un.org/goals</a>). Foundation grants from IRS 990-PF filings.</p></details>
    </main>
  );
}
