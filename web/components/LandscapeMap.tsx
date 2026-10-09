"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { CountyMap, countyLabel } from "./CountyMap";
import type { Underserved } from "@/lib/landscape";

export type MapData = {
  counts: Record<string, number>; appalachia: string[]; states: string[];
  need: Record<string, { poverty: number | null; population: number | null }>;
  underserved: Underserved[];
  highNeed: number; usPoverty: number | null;
};

const GAP = "#e8590c", SERVED = "var(--g)";
const people = (n: number | null) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M people` : n >= 1e3 ? `${Math.round(n / 1e3)}K people` : `${n} people`);

// Where the landscape's organizations are, by county; or Gaps: high-poverty counties (Census SAIPE,
// 20%+) where none of these organizations is based, against the counties that have one.
export function LandscapeMap({ counts, appalachia, states, need, underserved, highNeed, usPoverty }: MapData) {
  const [view, setView] = useState<"orgs" | "gaps">("orgs");
  const [picked, setPicked] = useState<string | null>(null); // gap county hovered in the list -> outlined on the map
  const focus = states.length ? states : undefined;
  const gaps = new Set(underserved.map((c) => c.fips));
  return (
    <div className="lmap">
      {Object.keys(need).length > 0 && (
        <div className="lmap-switch" role="radiogroup" aria-label="Map shows">
          <button type="button" role="radio" aria-checked={view === "orgs"} className={view === "orgs" ? "on" : undefined} onClick={() => setView("orgs")}>Organizations</button>
          <button type="button" role="radio" aria-checked={view === "gaps"} className={view === "gaps" ? "on" : undefined} onClick={() => setView("gaps")}>Gaps</button>
        </div>
      )}
      {view === "orgs" ? (
        <CountyMap counts={counts} appalachia={appalachia} focusStates={focus} label="organizations" />
      ) : (
        <>
          <p className="gap-head"><b>{underserved.length}</b> of {highNeed} high-poverty counties have none of these organizations</p>
          <CountyMap
            counts={Object.fromEntries(Object.entries(need).map(([f, x]) => [f, x.poverty ?? 0]))}
            focusStates={focus} label="in poverty" bands={[20]} valueText={(v) => `${v}% in poverty`}
            fillOf={(f) => (gaps.has(f) ? GAP : counts[f] ? SERVED : null)} highlight={picked}
            details={Object.fromEntries(Object.entries(need).map(([f, x]) => [f, `${people(x.population)} · ${counts[f] ? `${counts[f]} of these orgs` : "none of these orgs"}`]))}
            legend={<>
              <span className="gap-key"><i style={{ background: GAP }} />High poverty, no match</span>
              <span className="gap-key"><i style={{ background: SERVED }} />Has a match</span>
            </>}
          />
          {underserved.length > 0 && (
            <ul className="gap-list" onMouseLeave={() => setPicked(null)}>{underserved.map((c) => (
              <li key={c.fips} className={picked === c.fips ? "on" : undefined} onMouseEnter={() => setPicked(c.fips)} onFocus={() => setPicked(c.fips)} onBlur={() => setPicked(null)}><span>{countyLabel({ fips: c.fips, name: c.name.replace(/ (County|city|Parish)$/, ""), state: c.state })}</span><PovertyRate c={c} us={usPoverty} /></li>
            ))}</ul>
          )}
          <p className="ls-note">High poverty = 20%+ (Census, 2023). &quot;No match&quot; = none of the 200 closest organizations is based there.</p>
        </>
      )}
    </div>
  );
}

// "48% poverty", with a popover on hover/focus that says what the number means in plain words.
// Portaled to <body> with fixed positioning so the scrolling list can't clip it; opens upward near the bottom.
function PovertyRate({ c, us }: { c: Underserved; us: number | null }) {
  const [at, setAt] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 130;
    setAt({ x: Math.min(r.right, window.innerWidth - 12), y: up ? r.top - 6 : r.bottom + 6, up });
  };
  const per100 = Math.round(c.poverty);
  const around = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toLocaleString("en-US")}K` : n.toLocaleString("en-US"));
  return (
    <>
      <b className="pov" tabIndex={0} onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={() => setAt(null)} onFocus={(e) => show(e.currentTarget)} onBlur={() => setAt(null)}>
        {per100}% poverty
      </b>
      {at && createPortal(
        <span className={`pov-tip${at.up ? " up" : ""}`} role="tooltip" style={{ left: at.x, top: at.y }}>
          <strong>{per100} in 100 people live below the poverty line</strong>
          <span>{c.poor != null && <>About {around(c.poor)} people</>}{c.poor != null && us != null && " · "}{us != null && <>U.S.: {us}%</>}</span>
          <small>Poverty line ≈ $30,900 a year for a family of four · Census 2023</small>
        </span>,
        document.body,
      )}
    </>
  );
}
