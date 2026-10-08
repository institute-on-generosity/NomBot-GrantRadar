import { Suspense } from "react";
import { CalendarChart } from "./CalendarChart";
import { GrantOverview, GrantOverviewSkeleton } from "./GrantOverview";
import { LandscapeTabs } from "./LandscapeTabs";
import { money } from "@/lib/filters";
import { grantLandscape, grantOverview, type AskBand, type Bar, type GrantLandscape as Landscape } from "@/lib/grantLandscape";
import { money as dollars } from "./money";
import type { MatchFilters } from "@/lib/grants";

const first = (node: React.ReactNode) => ({ key: "overview", label: "Overview", title: "AI overview", node });
export const GrantLandscapeSkeleton = () => <LandscapeTabs views={[first(<GrantOverviewSkeleton />)]} />;

// Zoom out over the matched funders: an AI overview, how they give (sizes, policy, grant types,
// where they're based), what to ask for, when to apply, and which groups like yours they fund most.
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
      { key: "ask", label: "Ask", title: "What groups like yours get", sub: "by the grantee's yearly budget", node: <AskChart bands={l.ask} /> },
      { key: "calendar", label: "Calendar", title: "When to apply", sub: `${l.open} open funders`, node: <CalendarChart c={l.calendar} mission={mission} /> },
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

// One row per grantee budget band: the middle half of grant amounts as a bar (log scale, so $1K and
// $100K both read), the median as a dot. Shows what a group your size usually gets.
function AskChart({ bands }: { bands: AskBand[] }) {
  if (!bands.length) return <p className="ls-note">Too few grants with a known grantee budget to show ask sizes.</p>;
  const lo = Math.log10(Math.max(100, Math.min(...bands.map((b) => b.p25)) / 1.5));
  const hi = Math.log10(Math.max(...bands.map((b) => b.p75)) * 1.5);
  const x = (v: number) => `${(100 * (Math.log10(Math.max(v, 100)) - lo)) / (hi - lo)}%`;
  const ticks = [1e3, 1e4, 1e5, 1e6].filter((t) => Math.log10(t) > lo && Math.log10(t) < hi);
  return (
    <div className="ask">
      <ul>
        {bands.map((b) => (
          <li key={b.label} title={`Groups with ${b.label} in revenue: ${b.grants} grants; middle half ${dollars(b.p25)}–${dollars(b.p75)}, median ${dollars(b.median)}`}>
            <span className="ask-label">{b.label}<small>{b.grants} grants</small></span>
            <span className="ask-track">
              {ticks.map((t) => <i key={t} className="ask-tick" style={{ left: x(t) }} />)}
              <span className="ask-range" style={{ left: x(b.p25), width: `calc(${x(b.p75)} - ${x(b.p25)})` }} />
              <span className="ask-mid" style={{ left: x(b.median) }} />
            </span>
            <span className="ask-val"><b>{dollars(b.median)}</b><small>{dollars(b.p25)}–{dollars(b.p75)}</small></span>
          </li>
        ))}
      </ul>
      <div className="ask-axis" aria-hidden><span />{ticks.map((t) => <small key={t} style={{ left: x(t) }}>{dollars(t)}</small>)}<span /></div>
      <p className="ls-note">Bar: middle half of grants · dot: median. Find your budget row for a realistic ask.</p>
    </div>
  );
}
