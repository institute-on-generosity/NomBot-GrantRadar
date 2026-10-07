import { Suspense } from "react";

import { LandscapeTabs } from "./LandscapeTabs";
import { money } from "@/lib/filters";
import { landscape, type Bar } from "@/lib/landscape";
import type { Filters } from "@/lib/parse";
import { themes } from "@/lib/themes";


// Zoom out: what the field looks like, where it is, the kinds of work in it, and who funds it.
export async function Landscape({ question, filters, includeInactive, map, overview }: {
  question: string; filters: Filters; includeInactive: boolean; overview: React.ReactNode;
  map: (counts: Record<string, number>, appalachia: string[], states: string[]) => React.ReactNode;
}) {
  const l = await landscape(filters, includeInactive);
  const first = { key: "overview", label: "Overview", title: "AI overview", node: overview };
  if (l.size < 5) return <LandscapeTabs views={[first]} />;
  const states = [...new Set(l.cities.map((c) => c.label.slice(-2)))];
  return (
    <LandscapeTabs views={[
      first,
      { key: "breakdown", label: "Breakdown", title: "Breakdown", sub: `${l.size} closest organizations`, node: (
        <div className="ls-grid">
          <Bars title="Size" bars={l.sizes} />
          <Bars title="Places" bars={l.cities} />
          <Bars title="Causes" bars={l.causes} />
          <Bars title="Team" bars={l.team} note={`${l.teamReported} report staff`} />
        </div>
      ) },
      { key: "map", label: "Map", title: "Where they are", sub: `${l.size} closest, by county`, node: map(l.counties, l.appalachia, filters.states.length ? filters.states : states) },
      { key: "themes", label: "Themes", title: "Kinds of work", sub: "Grouped by Claude", node: <Suspense fallback={<p className="ls-wait"><span className="spinner" />Grouping by kind of work…</p>}><Themes question={question} l={l} /></Suspense> },
      { key: "funders", label: "Funders", title: "Who funds them", sub: `${l.funded} of ${l.size} funded`, node: (
        l.funders.length ? (
          <>
            <ul className="ls-funders">
              {l.funders.map((f) => (
                <li key={f.ein}>
                  <span className="ls-fname" title={`${f.name} funded ${f.orgs} of these organizations, ${money(f.amount)} in all${f.inviteOnly ? " · gives only to preselected charities" : ""}`}>{f.name}</span>
                  <span className="ls-fmeta">{[f.city, f.state].filter(Boolean).join(", ")}{f.inviteOnly && " · invite only"}</span>
                  <span className="ls-fstat"><b>{f.orgs}</b> funded · <b>{money(f.amount)}</b></span>
                  <span className="ls-fgrantees">{f.grantees.join(", ")}{f.orgs > f.grantees.length ? "…" : ""}</span>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="ls-note">No foundation grants to these organizations in the loaded 990-PF data.</p>
      ) },
    ]} />
  );
}

function Bars({ title, bars, note }: { title: string; bars: Bar[]; note?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="ls-bars">
      <h3>{title}{note && <small>{note}</small>}</h3>
      <ul>
        {bars.map((b) => {
          // Hover only for now: no filtering from the bars.
          return (
            <li key={b.key || b.label}>
              <span className="ls-row" title={`${b.label}: ${b.count} of these organizations`}>
                <span className="ls-label">{b.label}</span><span className="ls-track"><i style={{ width: `${(100 * b.count) / max}%` }} /></span><span className="ls-n">{b.count}</span>
              </span>
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
          <ul>{t.orgs.map((o) => <li key={o.ein} title={`${o.name} · ${o.place}`}><b>{o.name}</b><span>{o.place}</span></li>)}</ul>
        </details>
      ))}
    </div>
  );
}
