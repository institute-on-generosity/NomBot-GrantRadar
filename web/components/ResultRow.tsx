import { money } from "./money";
import { NavLink } from "./NavLink";
import { StarButton } from "./StarButton";
import { CompareButton } from "./CompareButton";
import type { Relevance } from "@/lib/rerank";
import type { Result } from "@/lib/search";
import { HealthBadges } from "./HealthBadges";
import { Preview } from "./Snippet";
import { titleCase, orgTitle } from "./text";
import { Icon } from "./Icons";
import { labelName } from "@/lib/labels";
import { prefNoun, strictPrefRe } from "@/lib/summaryFacts";


export { money };

// One result, Google style: the name is the only strong element, then one grey line of facts
// (place · cause · income · finance status) and a two-line mission snippet. Save, Compare, the
// relevance reason ("Why this result") and the IRS sources sit in a quiet tools line that shows on
// hover or focus (always on touch screens). relevance: 0–100 score + reason (lib/rerank).
// hide: facts every row in the list shares (one cause or one state), shown once instead of on each row.
export function ResultRow({ r, href, patterns, focused = false, index = 0, relevance, hide }: {
  r: Result; href: string; patterns: string[]; focused?: boolean; index?: number;
  relevance?: Relevance | null; hide?: { cause?: boolean; state?: boolean };
}) {
  // Short, iconed facts (Oct 27 word cut): place, income (year in the tooltip), cause
  const place = [r.city ? titleCase(r.city) : null, hide?.state && r.city ? null : r.state].filter(Boolean).join(", ");
  const why = r.place && r.place.basis !== "hq" ? `${r.place.note}${r.place.quote ? `: "${r.place.quote}"` : ""}` : null;
  return (
    <div className={`row${focused ? " focused" : ""}`} id={`org-${r.ein}`} style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
      <div className="row-main">
        <div className="name-line">
          <NavLink href={href} className="name" title={r.ntee?.label ?? undefined}>{orgTitle(r.name)}</NavLink>
          {focused && <span className="lastviewed">last viewed</span>}
        </div>
        <div className="sub">
          {place && <span className="fact"><Icon name="pin" size={14} />{place}</span>}
          {r.revenue && (r.revenue.amount > 0
            ? <span className="fact" title={`Yearly income${r.revenue.year ? `, ${r.revenue.year}` : ""}`}><Icon name="money" size={14} />{money(r.revenue.amount)}</span>
            : <span className="fact none" title={`Its ${r.revenue.year ?? "latest"} filing reports no income`}>No income reported</span>)}
          {/* Cause: in the name's tooltip, not on the row (word cut, Oct 27) */}
          {/* Why a place tier lists it (named for the city but mailed from elsewhere, or a filing or grant naming it): one icon, text on hover */}
          {why && <span className={`fact place-why${r.place!.basis === "name" ? " flag" : ""}`} title={why} aria-label={why} tabIndex={0}><Icon name={r.place!.basis === "name" ? "warn" : "info"} size={14} /></span>}
          <HealthBadges h={r.health} />
        </div>
        {r.mission || r.programs || !r.web ? <Preview mission={r.mission} programs={r.programs} patterns={patterns} />
          : <p className="preview-line from-web-row" title={`From ${r.web.site}, read ${r.web.fetched}`}><span className="from-web-tag">From their website</span> {r.web.description}</p>}
        <PreferTags r={r} />
        <div className="row-tools">
          <StarButton withLabel org={{ ein: r.ein, name: r.name, city: r.city, state: r.state, cause: r.ntee?.label ?? null, revenue: r.revenue?.amount ?? null, year: r.revenue?.year ?? null }} />
          <CompareButton org={{ ein: r.ein, name: r.name, city: r.city, state: r.state }} />
          {relevance && (
            // Hover or focus to see the score and Claude's reason for it.
            <button type="button" className="why-btn" aria-describedby={`why-${r.ein}`}>
              <Icon name="sparkle" size={14} />Why
              <span className="tip" role="tooltip" id={`why-${r.ein}`}>
                <span className="tip-h">Relevance {relevance.score} of 100</span>
                {relevance.why}
                <span className="tip-f">AI-generated from the organization&apos;s IRS filings</span>
              </span>
            </button>
          )}
          {r.sources.length > 0 && (
            <details className="src">
              <summary><Icon name="info" size={14} />Sources</summary>
              <span className="src-list">
                {r.sources.map((s) => (
                  <span key={s.url}>{s.internal ? <NavLink href={s.url} title={s.detail} label="Opening the IRS file…">{s.label}</NavLink> : <a href={s.url} target="_blank" rel="noreferrer" title={s.detail}>{s.label} ↗</a>}</span>
                ))}
              </span>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// The question's soft preferences on this row: confirmed by its website or a place program (a check, bold), a
// preferred cause label as its main focus (bold) or part of its work, else "Mentions X" from its filings.
function PreferTags({ r }: { r: Result }) {
  const pl = r.preferLabel;
  // A confirmed preference that says the same as a main-focus label ("girls" with Women and girls) shows once, as the label
  const conf = (r.preferConfirmed ?? []).filter((c) => !(pl?.tier === "primary" && strictPrefRe(c.label)?.test(labelName(pl.label))));
  // A mention that says the same as the preferred label ("focused on girls" with Women and girls) shows once, as the label
  const mentions = (r.prefer ?? []).filter((p) => !(r.preferConfirmed ?? []).some((c) => c.label === p) && !(pl && strictPrefRe(p)?.test(labelName(pl.label))));
  if (!conf.length && !pl && !mentions.length) return null;
  return (
    <>
      {conf.map((c) => <p key={c.label} className="prefer-hit ok"><Icon name="check" size={14} />Confirmed: {prefNoun(c.label)} <small>({c.via === "website" ? "its website" : "place program"})</small></p>)}
      {pl && (pl.tier === "primary"
        ? <p className="prefer-hit ok"><Icon name="check" size={14} />{labelName(pl.label)}: main focus <small>(graded label)</small></p>
        : <p className="prefer-hit">{labelName(pl.label)}: part of their work</p>)}
      {mentions.length > 0 && <p className="prefer-hit">Mentions {mentions.map(prefNoun).join(", ")}</p>}
    </>
  );
}
