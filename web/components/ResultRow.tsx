import { money } from "./money";
import { NavLink } from "./NavLink";
import { StarButton } from "./StarButton";
import { CompareButton } from "./CompareButton";
import type { Relevance } from "@/lib/rerank";
import type { Result } from "@/lib/search";
import { HealthBadges } from "./HealthBadges";
import { Preview } from "./Snippet";
import { titleCase } from "./text";


export { money };

// One result, Google style: the name is the only strong element, then one grey line of facts
// (place · cause · income · finance status) and a two-line mission snippet. Save, Compare, the
// relevance reason ("Why this result") and the IRS sources sit in a quiet tools line that shows on
// hover or focus (always on touch screens). relevance: 0–100 score + reason (lib/rerank).
export function ResultRow({ r, href, patterns, focused = false, index = 0, relevance }: {
  r: Result; href: string; patterns: string[]; focused?: boolean; index?: number;
  relevance?: Relevance | null;
}) {
  const facts = [
    [r.city ? titleCase(r.city) : null, r.state].filter(Boolean).join(", "),
    r.ntee?.label,
    r.revenue ? `${money(r.revenue.amount)} income${r.revenue.year ? ` (${r.revenue.year})` : ""}` : null,
  ].filter(Boolean);
  return (
    <div className={`row${focused ? " focused" : ""}`} id={`org-${r.ein}`} style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
      <div className="row-main">
        <div className="name-line">
          <NavLink href={href} className="name">{titleCase(r.name)}</NavLink>
          {focused && <span className="lastviewed">last viewed</span>}
        </div>
        <div className="sub">
          {facts.join(" · ")}
          <HealthBadges h={r.health} />
        </div>
        {r.place && r.place.basis !== "hq" && (
          // Why a place tier lists it: named for the city but mailed from elsewhere, or a filing or grant that names the city.
          <p className={`place-why${r.place.basis === "name" ? " flag" : ""}`}>
            {r.place.note}{r.place.quote && <>: <q>{r.place.quote}</q></>}
          </p>
        )}
        <Preview mission={r.mission} programs={r.programs} patterns={patterns} />
        {r.prefer && r.prefer.length > 0 && <p className="prefer-hit">Mentions {r.prefer.join(", ")}</p>}
        <div className="row-tools">
          <StarButton withLabel org={{ ein: r.ein, name: r.name, city: r.city, state: r.state, cause: r.ntee?.label ?? null, revenue: r.revenue?.amount ?? null, year: r.revenue?.year ?? null }} />
          <CompareButton org={{ ein: r.ein, name: r.name, city: r.city, state: r.state }} />
          {relevance && (
            // Hover or focus to see the score and Claude's reason for it.
            <button type="button" className="why-btn" aria-describedby={`why-${r.ein}`}>
              Why this result
              <span className="tip" role="tooltip" id={`why-${r.ein}`}>
                <span className="tip-h">Relevance {relevance.score} of 100</span>
                {relevance.why}
                <span className="tip-f">AI-generated from the organization&apos;s IRS filings</span>
              </span>
            </button>
          )}
          {r.sources.length > 0 && (
            <span className="src">
              {r.sources.map((s, i) => (
                <span key={s.url}>{i > 0 && " · "}{s.internal ? <NavLink href={s.url} title={s.detail} label="Opening the IRS file…">{s.label}</NavLink> : <a href={s.url} target="_blank" rel="noreferrer" title={s.detail}>{s.label} ↗</a>}</span>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
