import { Suspense } from "react";
import Link from "next/link";

import { FinanceView } from "./FinanceView";
import { LandscapeTabs } from "./LandscapeTabs";
import type { MapData } from "./LandscapeMap";
import { NavLink } from "./NavLink";
import { Chevron, OverviewMenu, OverviewVisual, Related } from "./OverviewVisual";
import { TrackRecord } from "./TrackRecord";
import { LOADED_STATES, money } from "@/lib/filters";
import { db } from "@/lib/db";
import { landscape, type Bar } from "@/lib/landscape";
import { didYouKnow, overviewFacts } from "@/lib/overviewFacts";
import { DidYouKnow } from "./DidYouKnow";
import type { KeyFacts as KeyFactsT } from "@/lib/searchSummary";
import { isStrong, type rank } from "@/lib/rerank";
import { orgTitle } from "./text";
import type { Filters } from "@/lib/parse";
import { themes } from "@/lib/themes";


// Zoom out: what the field looks like, where it is, the kinds of work in it, and who funds it
// (plus strong matches no foundation funds yet). Finances: growing, shrinking, deficits, thin reserves.
// Overview tab, a knowledge panel of section cards: Key facts (no Claude), Track record, then related searches
// (from the search summary). The AI text and the headline chart sit in the main column since Oct 26
// (components/SearchSummary, components/DidYouKnow).
// Export slide sits in the panel header's "⋯" menu. total: every organization the search matched.
export async function Landscape({ question, filters, includeInactive, total, map, gems, matched, keyFacts }: {
  question: string; filters: Filters; includeInactive: boolean; total: number; gems?: React.ReactNode;
  keyFacts?: Promise<KeyFactsT>; // the search summary's set (the N shown in the list) and grant years: Key facts and the slide use these
  matched?: Promise<import("@/lib/search").Result[]>; // place tiers: describe these (the relevance-checked matches) only
  map: (m: MapData) => React.ReactNode;
}) {
  const m = matched ? await matched : undefined;
  const l = await landscape(filters, includeInactive, m);
  if (m) total = m.length;
  const first = { key: "overview", label: "Overview", title: "Overview", node: <Related question={question} /> };
  if (l.size < 5) return <LandscapeTabs views={[first]} />;
  const facts = overviewFacts(l, total);
  // Key facts wait for relevance scores (the summary's head), so they count the same organizations as the count line.
  const age = l.medianAge != null ? [{ value: `${l.medianAge} yrs`, label: "median time tax-exempt" }] : [];
  const withKey = keyFacts?.then((k) => ({ ...facts, tiles: [...k.tiles, ...age].slice(0, 3), basis: k.basis, shown: k.shown }));
  const place = (o: { city: string | null; state: string | null }) => [o.city, o.state].filter(Boolean).join(", ");
  const track = <TrackRecord median={l.medianAge} brackets={l.ages.map((b) => ({ key: b.key, label: b.label, orgs: (b.orgs ?? []).map((i) => ({ ein: l.orgs[i].ein, name: l.orgs[i].name, place: place(l.orgs[i]), since: l.orgs[i].since })) }))} />;
  return (
    <LandscapeTabs views={[
      { ...first, menu: withKey ? <Suspense fallback={null}><KeyMenu facts={withKey} question={question} /></Suspense> : <OverviewMenu facts={facts} question={question} />, node: (
        <>
          {withKey ? <Suspense fallback={<KeyFactsWait />}><KeyFacts facts={withKey} /></Suspense> : <OverviewVisual facts={facts} />}
          {/* The one control for the panel: More insights / Fewer insights (the #insights checkbox, remembered) */}
          <label htmlFor="insights" className="ins-more"><span className="ins-more-on">More insights</span><span className="ins-more-off">Fewer insights</span><Chevron right /></label>
          <DidYouKnow facts={didYouKnow(l)} />
          {track}
          <Related question={question} />
        </>
      ) },
      { key: "breakdown", label: "Breakdown", title: "Breakdown", sub: `${l.size} organizations shown`, node: (
        <div className="ls-grid">
          <Bars title="Size" bars={l.sizes} orgs={l.orgs} />
          <Bars title="Places" bars={l.cities} orgs={l.orgs} />
          <Bars title="Causes" bars={l.causes} orgs={l.orgs} />
          <Bars title="Team" bars={l.team} orgs={l.orgs} note={`${l.teamReported} report staff`} />
          <Bars title="Track record" bars={l.ages} orgs={l.orgs} note="Years tax-exempt" />
        </div>
      ) },
      { key: "finances", label: "Finances", title: "Finances", sub: `${l.health.reported} report finances`, node: (
        <FinanceView signals={l.health.signals} orgs={Object.fromEntries(l.orgs.map((o, i) => [o.ein.replace("-", ""), { ein: o.ein, name: o.name, place: [o.city, o.state].filter(Boolean).join(", "), rank: i }]))} />
      ) },
      { key: "map", label: "Map", title: "Where they are", sub: `${l.size} shown, by county`, node: map({ counts: l.counties, countyOrgs: l.countyOrgs, appalachia: l.appalachia, states: filters.states.length ? filters.states : l.mapStates, need: l.need, underserved: l.underserved, highNeed: l.highNeed, usPoverty: l.usPoverty, povertyCut: l.povertyCut }) },
      { key: "themes", label: "Themes", title: "Kinds of work", sub: `Grouped by Claude · grants ${l.grantYears[0]}–${l.grantYears[1]}`, node: <Suspense fallback={<p className="ls-wait"><span className="spinner" />Grouping by kind of work…</p>}><Themes question={question} l={l} states={filters.states} /></Suspense> },
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

type WithKey = ReturnType<typeof overviewFacts> & { shown: number };
async function KeyFacts({ facts }: { facts: Promise<WithKey> }) {
  const f = await facts;
  return <OverviewVisual facts={f} shown={f.shown} />;
}
async function KeyMenu({ facts, question }: { facts: Promise<WithKey>; question: string }) {
  return <OverviewMenu facts={await facts} question={question} />;
}
function KeyFactsWait() {
  return <section className="kp-card" aria-label="Key facts" aria-busy="true"><h3 className="kp-h">Key facts</h3><div className="ov-lines" aria-hidden><i /><i className="short" /><i /></div></section>;
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

// Each kind of work with the foundation money its organizations received in the newest grant years,
// highest median per organization first (orgs with no grants count as $0, so one big grantee can't
// make a theme look well funded), so the least funded approaches in a field stand out.
async function Themes({ question, l, states }: { question: string; l: Awaited<ReturnType<typeof landscape>>; states: string[] }) {
  const ts = await themes(question, l);
  if (!ts.length) return <p className="ls-note">No clear themes in these results.</p>;
  const byEin = new Map(l.orgs.map((o) => [o.ein, o]));
  const rows = ts.map((t) => {
    const os = t.orgs.map((o) => ({ ...o, grants: byEin.get(o.ein)?.grants ?? 0, local: byEin.get(o.ein)?.local ?? 0 }));
    const total = os.reduce((a, o) => a + o.grants, 0);
    const xs = os.map((o) => o.grants).sort((a, b) => a - b), mid = xs.length >> 1;
    const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
    return { ...t, orgs: os.sort((a, b) => b.grants - a.grants), total, local: os.reduce((a, o) => a + o.local, 0), funded: os.filter((o) => o.grants > 0).length, median };
  }).sort((a, b) => b.median - a.median || b.total - a.total);
  const max = Math.max(1, rows[0].median);
  const least = rows.length > 1 && rows[rows.length - 1].median < rows[0].median ? rows[rows.length - 1] : null; // ties share the tag
  // State searches: how much comes from foundations in the organizations' own state
  const home = states.length === 1 ? `${LOADED_STATES.find(([c]) => c === states[0])?.[1] ?? states[0]} foundations` : "in-state foundations";
  const years = `${l.grantYears[0]}–${l.grantYears[1]}`;
  return (
    <div className="ls-themes">
      {rows.map((t) => (
        <details key={t.label}>
          <summary>
            <span className="ls-tname"><b>{t.label}</b>{least && t.median <= least.median && <em className="ls-least">Least funded</em>}</span>
            <span className="ls-tper" title={`The middle organization's foundation grants, ${years}. Organizations with no grants count as $0.`}><b>{money(t.median)}</b> median per org</span>
            <span className="ls-track"><i style={{ width: `${(100 * t.median) / max}%` }} /></span>
            <span className="ls-tmeta" title={`Linked 990-PF grants, ${years}. About a third of grants can't be matched to an organization, so totals run low.`}>
              {money(t.total)} to {t.funded} of {t.orgs.length} orgs{states.length > 0 && t.total > 0 && <> · {Math.round((100 * t.local) / t.total)}% from {home}</>}
            </span>
          </summary>
          <ul>{t.orgs.map((o) => <li key={o.ein}><NavLink href={`/org/${o.ein}`} className="ls-org" title={`${o.name} · ${o.place}`} label="Opening the organization…"><b>{o.name}</b><span>{o.place}</span></NavLink><span className={o.grants > 0 ? "ls-tamt" : "ls-tamt none"}>{money(o.grants)}</span></li>)}</ul>
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
      <ul>{gems.slice(0, 8).map((o) => <li key={o.ein}><NavLink href={`/org/${o.ein}`} className="ls-org" label="Opening the organization…"><b>{orgTitle(o.name)}</b><span>{o.state}</span></NavLink></li>)}</ul>
    </div>
  );
}
