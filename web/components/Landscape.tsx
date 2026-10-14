import { Suspense } from "react";
import Link from "next/link";

import { FinanceView } from "./FinanceView";
import { LandscapeTabs } from "./LandscapeTabs";
import type { MapData } from "./LandscapeMap";
import { NavLink } from "./NavLink";
import { money } from "@/lib/filters";
import { db } from "@/lib/db";
import { landscape, type Bar } from "@/lib/landscape";
import { isStrong, type rank } from "@/lib/rerank";
import { titleCase } from "./text";
import type { Filters } from "@/lib/parse";
import { themes } from "@/lib/themes";


// Zoom out: what the field looks like, where it is, the kinds of work in it, and who funds it
// (plus strong matches no foundation funds yet). Finances: growing, shrinking, deficits, thin reserves.
export async function Landscape({ question, filters, includeInactive, map, overview, gems }: {
  question: string; filters: Filters; includeInactive: boolean; overview: React.ReactNode; gems?: React.ReactNode;
  map: (m: MapData) => React.ReactNode;
}) {
  const l = await landscape(filters, includeInactive);
  const first = { key: "overview", label: "Overview", title: "AI overview", node: overview };
  if (l.size < 5) return <LandscapeTabs views={[first]} />;
  return (
    <LandscapeTabs views={[
      first,
      { key: "breakdown", label: "Breakdown", title: "Breakdown", sub: `${l.size} closest organizations`, node: (
        <div className="ls-grid">
          <Bars title="Size" bars={l.sizes} orgs={l.orgs} />
          <Bars title="Places" bars={l.cities} orgs={l.orgs} />
          <Bars title="Causes" bars={l.causes} orgs={l.orgs} />
          <Bars title="Team" bars={l.team} orgs={l.orgs} note={`${l.teamReported} report staff`} />
        </div>
      ) },
      { key: "finances", label: "Finances", title: "Finances", sub: `${l.health.reported} report finances`, node: (
        <FinanceView signals={l.health.signals} orgs={Object.fromEntries(l.orgs.map((o, i) => [o.ein.replace("-", ""), { ein: o.ein, name: o.name, place: [o.city, o.state].filter(Boolean).join(", "), rank: i }]))} />
      ) },
      { key: "map", label: "Map", title: "Where they are", sub: `${l.size} closest, by county`, node: map({ counts: l.counties, countyOrgs: l.countyOrgs, appalachia: l.appalachia, states: filters.states.length ? filters.states : l.mapStates, need: l.need, underserved: l.underserved, highNeed: l.highNeed, usPoverty: l.usPoverty, povertyCut: l.povertyCut }) },
      { key: "themes", label: "Themes", title: "Kinds of work", sub: "Grouped by Claude", node: <Suspense fallback={<p className="ls-wait"><span className="spinner" />Grouping by kind of work…</p>}><Themes question={question} l={l} /></Suspense> },
      { key: "funders", label: "Funders", title: "Who funds them", sub: `${l.funded} of ${l.size} funded`, node: (
        l.funders.length ? (
          <>
            {/* One line per funder; click to open where it is, its policy and the groups it paid */}
            <ul className="ls-flist">
              {l.funders.map((f) => (
                <li key={f.ein}>
                  <details>
                    <summary>
                      <span className="ls-fname">{f.name}</span>
                      <span className="ls-fstat" title="Grants to these organizations, every year loaded (990-PF)"><b>{money(f.amount)}</b> · {f.orgs} {f.orgs === 1 ? "org" : "orgs"}</span>
                    </summary>
                    <div className="ls-fmore">
                      <p>{[f.city, f.state].filter(Boolean).join(", ")}{f.inviteOnly ? " · invite only" : " · open to applications"} · <Link href={`/org/${f.ein}`} className="ls-fprofile">Foundation profile →</Link></p>
                      <p>Funded {f.grantees.map((g, i) => <span key={g.ein}>{i > 0 && ", "}<Link href={`/org/${g.ein}`}>{g.name}</Link></span>)}</p>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            {gems}
          </>
        ) : <p className="ls-note">No foundation grants to these organizations in the loaded 990-PF data.</p>
      ) },
    ]} />
  );
}

// Each bar opens to the organizations behind it, closest first (same list as Themes).
function Bars({ title, bars, orgs, note }: { title: string; bars: Bar[]; orgs: Awaited<ReturnType<typeof landscape>>["orgs"]; note?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="ls-bars">
      <h3>{title}{note && <small>{note}</small>}</h3>
      <ul>
        {bars.map((b) => {
          const row = <><span className="ls-label">{b.label}</span><span className="ls-track"><i style={{ width: `${(100 * b.count) / max}%` }} /></span><span className="ls-n">{b.count}</span></>;
          return (
            <li key={b.key || b.label}>
              {b.orgs?.length ? (
                <details className="ls-open">
                  <summary className="ls-row" title={`Show the ${b.count} ${b.count === 1 ? "organization" : "organizations"}: ${b.label}`}>{row}</summary>
                  <ul className="ls-orgs">
                    {b.orgs.map((i) => orgs[i]).map((o) => (
                      <li key={o.ein}><NavLink href={`/org/${o.ein}`} className="ls-org" title={`${o.name} · ${[o.city, o.state].filter(Boolean).join(", ")}`} label="Opening the organization…"><b>{o.name}</b><span>{[o.city, o.state].filter(Boolean).join(", ")}</span></NavLink></li>
                    ))}
                  </ul>
                </details>
              ) : <span className="ls-row">{row}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

async function Themes({ question, l }: { question: string; l: Awaited<ReturnType<typeof landscape>> }) {
  const ts = await themes(question, l);
  if (!ts.length) return <p className="ls-note">No clear themes in these results.</p>;
  return (
    <div className="ls-themes">
      {ts.map((t) => (
        <details key={t.label}>
          <summary><b>{t.label}</b><span>{t.orgs.length}</span></summary>
          <ul>{t.orgs.map((o) => <li key={o.ein}><NavLink href={`/org/${o.ein}`} className="ls-org" title={`${o.name} · ${o.place}`} label="Opening the organization…"><b>{o.name}</b><span>{o.place}</span></NavLink></li>)}</ul>
        </details>
      ))}
    </div>
  );
}

// Strong matches with no foundation grant on file: hidden gems for a funder, or groups still unfunded.
export async function Gems({ ranking }: { ranking: ReturnType<typeof rank> }) {
  const strong = (await ranking).results.filter((r) => r.relevance && isStrong(r));
  if (!strong.length) return null;
  const { rows } = await db.query(`SELECT DISTINCT recipient_ein AS ein FROM grants WHERE recipient_ein = ANY($1)`, [strong.map((r) => r.ein.replace("-", ""))]);
  const funded = new Set(rows.map((r) => r.ein as string));
  const gems = strong.filter((r) => !funded.has(r.ein.replace("-", "")));
  if (!gems.length) return null;
  return (
    <div className="unfunded">
      <h3>Not yet funded<small>{gems.length} of {strong.length} strong matches</small></h3>
      <ul>{gems.slice(0, 8).map((o) => <li key={o.ein}><NavLink href={`/org/${o.ein}`} className="ls-org" label="Opening the organization…"><b>{titleCase(o.name)}</b><span>{o.state}</span></NavLink></li>)}</ul>
    </div>
  );
}
