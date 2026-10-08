import { Suspense } from "react";
import { GrantOverview, GrantOverviewSkeleton } from "./GrantOverview";
import { LandscapeTabs } from "./LandscapeTabs";
import { money } from "@/lib/filters";
import { grantLandscape, grantOverview, type Bar, type GrantLandscape as Landscape } from "@/lib/grantLandscape";
import type { MatchFilters } from "@/lib/grants";

const first = (node: React.ReactNode) => ({ key: "overview", label: "Overview", title: "AI overview", node });
export const GrantLandscapeSkeleton = () => <LandscapeTabs views={[first(<GrantOverviewSkeleton />)]} />;

// Zoom out over the matched funders: an AI overview, how they give (sizes, policy, grant types,
// where they're based), and which groups like yours they already fund most.
export async function GrantLandscape({ mission, filters }: { mission: string; filters: MatchFilters }) {
  const l = await grantLandscape(mission, filters);
  const overview = first(<Suspense fallback={<GrantOverviewSkeleton />}><Overview mission={mission} l={l} /></Suspense>);
  if (l.funders.length < 3) return <LandscapeTabs views={[overview]} />;
  return (
    <LandscapeTabs views={[
      overview,
      { key: "breakdown", label: "Breakdown", title: "How they give", sub: `${l.funders.length} funders`, node: (
        <div className="ls-grid">
          <Bars title="Typical grant" bars={l.sizes} />
          <Bars title="Applications" bars={l.policy} />
          <Bars title="Grant type" bars={l.types} />
          <Bars title="Based in" bars={l.homes} />
        </div>
      ) },
      { key: "peers", label: "Peers", title: "Groups like yours they fund most", sub: `${money(l.toPeers)} to ${l.peers} groups`, node: (
        l.winners.length ? (
          <ul className="ls-funders">
            {l.winners.map((w) => (
              <li key={`${w.name}-${w.place}`}>
                <span className="ls-fname">{w.name}</span>
                <span className="ls-fmeta">{w.place}</span>
                <span className="ls-fstat"><b>{w.funders}</b> funders · <b>{money(w.amount)}</b></span>
              </li>
            ))}
          </ul>
        ) : <p className="ls-note">No group like yours is funded by more than one of these foundations.</p>
      ) },
    ]} />
  );
}

async function Overview({ mission, l }: { mission: string; l: Landscape }) {
  const o = await grantOverview(mission, l);
  return o ? <GrantOverview o={o} /> : <p className="ls-note">No overview for these funders.</p>;
}

function Bars({ title, bars }: { title: string; bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="ls-bars">
      <h3>{title}</h3>
      <ul>
        {bars.map((b) => (
          <li key={b.label}>
            <span className="ls-row" title={`${b.label}: ${b.count} of these funders`}>
              <span className="ls-label">{b.label}</span><span className="ls-track"><i style={{ width: `${(100 * b.count) / max}%` }} /></span><span className="ls-n">{b.count}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
