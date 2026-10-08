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

// relevance: 0–100 score + reason (lib/rerank).
export function ResultRow({ r, href, patterns, focused = false, index = 0, relevance }: {
  r: Result; href: string; patterns: string[]; focused?: boolean; index?: number;
  relevance?: Relevance | null;
}) {
  return (
    <div className={`row${focused ? " focused" : ""}`} id={`org-${r.ein}`} style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
      <div className="row-main">
        <div className="name-line">
          <StarButton org={{ ein: r.ein, name: r.name, city: r.city, state: r.state, cause: r.ntee?.label ?? null, revenue: r.revenue?.amount ?? null, year: r.revenue?.year ?? null }} />
          <NavLink href={href} className="name">{titleCase(r.name)}</NavLink>
          {focused && <span className="lastviewed">last viewed</span>}
        </div>
        {/* One quiet line of facts: place, cause, then size and team */}
        <div className="sub">
          {[
            [r.city ? titleCase(r.city) : null, r.state].filter(Boolean).join(", "),
            r.ntee?.label,
            r.financials?.expenses ? `${money(r.financials.expenses)} spent` : null,
            r.team?.staff != null ? `${r.team.staff.toLocaleString("en-US")} staff` : null,
            r.team?.volunteers ? `${r.team.volunteers.toLocaleString("en-US")} volunteers` : null,
          ].filter(Boolean).join(" · ")}
        </div>
        <Preview mission={r.mission} programs={r.programs} patterns={patterns} />
        {/* Footer: finance tags; sources appear on hover (they're also on the org page) */}
        <div className="row-foot">
          <HealthBadges h={r.health} />
          {r.sources.length > 0 && (
            <span className="src">
              {r.sources.map((s, i) => (
                <span key={s.url}>{i > 0 && " · "}{s.internal ? <NavLink href={s.url} title={s.detail} label="Opening the IRS file…">{s.label}</NavLink> : <a href={s.url} target="_blank" rel="noreferrer" title={s.detail}>{s.label} ↗</a>}</span>
              ))}
            </span>
          )}
        </div>
      </div>
      <div className="row-side">
        {relevance && (
          // Hover or focus the score to see Claude's reason for it.
          <button type="button" className={`score ${relevance.score >= 80 ? "hi" : relevance.score >= 50 ? "mid" : "lo"}`} aria-describedby={`why-${r.ein}`}>
            <b>{relevance.score}</b>
            <span className="meter" aria-hidden><i style={{ width: `${relevance.score}%` }} /></span>
            <span className="sr">relevance out of 100</span>
            <span className="tip" role="tooltip" id={`why-${r.ein}`}>
              <span className="tip-h">Relevance {relevance.score}/100</span>
              {relevance.why}
              <span className="tip-f">AI-generated from the organization&apos;s IRS filings</span>
            </span>
          </button>
        )}
        {r.revenue && <div className="rev"><b>{money(r.revenue.amount)}</b><span>revenue{r.revenue.year ? ` · ${r.revenue.year}` : ""}</span></div>}
        {/* Compare shows on hover (or once picked), so the column reads score → revenue */}
        <div className="row-actions">
          <CompareButton org={{ ein: r.ein, name: r.name, city: r.city, state: r.state }} />
        </div>
      </div>
    </div>
  );
}
