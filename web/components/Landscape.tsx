import { Suspense } from "react";
import Link from "next/link";
import { LandscapeTabs } from "./LandscapeTabs";
import { NavLink } from "./NavLink";
import { money } from "@/lib/filters";
import { landscape, type Bar } from "@/lib/landscape";
import type { Filters } from "@/lib/parse";
import { themes } from "@/lib/themes";

type Hrefs = { size: (b: Bar) => string | null; city: (b: Bar) => string; cause: (b: Bar) => string };

// Zoom out: what the field looks like, where it is, the kinds of work in it, and who funds it.
export async function Landscape({ question, filters, includeInactive, hrefs, map }: {
  question: string; filters: Filters; includeInactive: boolean; hrefs: Hrefs;
  map: (counts: Record<string, number>, appalachia: string[], states: string[]) => React.ReactNode;
}) {
  const l = await landscape(filters, includeInactive);
  if (l.size < 5) return null;
  const states = [...new Set(l.cities.map((c) => c.label.slice(-2)))];
  return (
    <LandscapeTabs size={l.size} views={[
      { key: "breakdown", label: "Breakdown", node: (
        <div className="ls-grid">
          <Bars title="Size" bars={l.sizes} href={hrefs.size} />
          <Bars title="Places" bars={l.cities} href={hrefs.city} />
          <Bars title="Causes" bars={l.causes} href={hrefs.cause} />
          <Bars title="Team" bars={l.team} note={`${l.teamReported} report staff`} />
        </div>
      ) },
      { key: "map", label: "Map", node: map(l.counties, l.appalachia, filters.states.length ? filters.states : states) },
      { key: "themes", label: "Themes", node: <Suspense fallback={<p className="ls-wait"><span className="spinner" />Grouping by kind of work…</p>}><Themes question={question} l={l} /></Suspense> },
      { key: "funders", label: "Funders", node: (
        l.funders.length ? (
          <>
            <p className="ls-note">{l.funded} of these {l.size} organizations got a foundation grant in 2025 990-PF filings (foundations in WV, KY, TN, VA, OH).</p>
            <ul className="ls-funders">
              {l.funders.map((f) => (
                <li key={f.ein}>
                  <a href={`https://projects.propublica.org/nonprofits/organizations/${f.ein}`} target="_blank" rel="noreferrer" className="ls-fname">{f.name} ↗</a>
                  <span className="ls-fmeta">{[f.city, f.state].filter(Boolean).join(", ")}{f.inviteOnly && " · invite only"}</span>
                  <span className="ls-fstat"><b>{f.orgs}</b> funded · <b>{money(f.amount)}</b></span>
                  <span className="ls-fgrantees">{f.grantees.join(", ")}{f.orgs > f.grantees.length ? "…" : ""}</span>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="ls-note">No foundation grants found to these organizations in the loaded 990-PF data.</p>
      ) },
    ]} />
  );
}

function Bars({ title, bars, href, note }: { title: string; bars: Bar[]; href?: (b: Bar) => string | null; note?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="ls-bars">
      <h3>{title}{note && <small>{note}</small>}</h3>
      <ul>
        {bars.map((b) => {
          const to = href?.(b);
          const body = <><span className="ls-label">{b.label}</span><span className="ls-track"><i style={{ width: `${(100 * b.count) / max}%` }} /></span><span className="ls-n">{b.count}</span></>;
          return <li key={b.key || b.label}>{to && b.count ? <NavLink href={to} className="ls-row link" title={`Filter: ${b.label}`} label="Updating results…" search>{body}</NavLink> : <span className="ls-row">{body}</span>}</li>;
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
          <ul>{t.orgs.map((o) => <li key={o.ein}><Link href={`/preview/org/${o.ein}`} scroll={false}>{o.name}</Link><span>{o.place}</span></li>)}</ul>
        </details>
      ))}
    </div>
  );
}
