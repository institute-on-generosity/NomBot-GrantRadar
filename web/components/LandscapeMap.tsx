"use client";
import { useState } from "react";
import { CountyMap, countyLabel } from "./CountyMap";

export type MapData = {
  counts: Record<string, number>; appalachia: string[]; states: string[];
  need: Record<string, { poverty: number | null; population: number | null }>;
  underserved: { fips: string; name: string; state: string; poverty: number; population: number | null }[];
  highNeed: number;
};

const people = (n: number | null) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M people` : n >= 1e3 ? `${Math.round(n / 1e3)}K people` : `${n} people`);

// Where the landscape's organizations are, by county; or, switched to Poverty, where the need is
// (Census SAIPE), with the high-poverty counties none of these organizations are based in.
export function LandscapeMap({ counts, appalachia, states, need, underserved, highNeed }: MapData) {
  const [view, setView] = useState<"orgs" | "need">("orgs");
  const focus = states.length ? states : undefined;
  const hasNeed = Object.keys(need).length > 0;
  return (
    <div className="lmap">
      {hasNeed && (
        <div className="lmap-switch" role="radiogroup" aria-label="Map shows">
          <button type="button" role="radio" aria-checked={view === "orgs"} className={view === "orgs" ? "on" : undefined} onClick={() => setView("orgs")}>Organizations</button>
          <button type="button" role="radio" aria-checked={view === "need"} className={view === "need" ? "on" : undefined} onClick={() => setView("need")}>Poverty</button>
        </div>
      )}
      {view === "orgs" ? (
        <CountyMap counts={counts} appalachia={appalachia} focusStates={focus} label="organizations" />
      ) : (
        <>
          <CountyMap
            counts={Object.fromEntries(Object.entries(need).map(([f, x]) => [f, x.poverty ?? 0]))}
            appalachia={appalachia} focusStates={focus} label="in poverty" bands={[10, 15, 20, 25]} color="#d9480f"
            valueText={(v) => `${v}% in poverty`}
            details={Object.fromEntries(Object.entries(need).map(([f, x]) => [f, `${people(x.population)} · ${counts[f] ? `${counts[f]} of these orgs` : "none of these orgs"}`]))}
          />
          <div className="underserved">
            <h3>High poverty, none of these organizations<small>{underserved.length} of {highNeed} counties at 20%+ poverty</small></h3>
            {underserved.length ? (
              <ul>{underserved.slice(0, 8).map((c) => (
                <li key={c.fips}><b>{countyLabel({ fips: c.fips, name: c.name.replace(/ (County|city|Parish)$/, ""), state: c.state })}</b><span>{people(c.population)}</span><em>{c.poverty}%</em></li>
              ))}</ul>
            ) : <p className="ls-note">Every high-poverty county here has at least one of these organizations.</p>}
            <p className="ls-note">Poverty: Census SAIPE 2023. &quot;None&quot; means none of the 200 closest matches is based there; groups elsewhere may still serve it.</p>
          </div>
        </>
      )}
    </div>
  );
}
