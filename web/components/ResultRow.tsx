import { money } from "./money";
import { NavLink } from "./NavLink";
import { StarButton } from "./StarButton";
import { CompareButton } from "./CompareButton";
import type { Relevance } from "@/lib/rerank";
import type { Result } from "@/lib/search";
import { Snippet } from "./Snippet";
import { titleCase } from "./text";
import { Vote } from "./Vote";


export { money };

// relevance: 0–100 score + reason (lib/rerank). mentions: the required activity this org's filing mentions.
export function ResultRow({ r, href, patterns, focused = false, index = 0, feedback, relevance, mentions }: {
  r: Result; href: string; patterns: string[]; focused?: boolean; index?: number;
  feedback?: { question: string; rank: number; filters: Record<string, unknown> }; relevance?: Relevance | null; mentions?: string;
}) {
  const text = [r.mission, r.programs].filter(Boolean).join(" ");
  return (
    <div className={`row${focused ? " focused" : ""}`} id={`org-${r.ein}`} style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
      <div className="row-main">
        <div className="name-line">
          <StarButton org={{ ein: r.ein, name: r.name, city: r.city, state: r.state, cause: r.ntee?.label ?? null, revenue: r.revenue?.amount ?? null, year: r.revenue?.year ?? null }} />
          <NavLink href={href} className="name">{titleCase(r.name)}</NavLink>
          {focused && <span className="lastviewed">last viewed</span>}
        </div>
        <div className="sub">
          {[r.city ? titleCase(r.city) : null, r.state].filter(Boolean).join(", ")}
          {r.ntee?.label && <> · {r.ntee.label}</>}
        </div>
        {text && <Snippet text={text} patterns={patterns} />}
        {mentions && <div className="why"><span className="mentions">Mentions {mentions}</span></div>}
        {r.sources.length > 0 && (
          <div className="src">
            Source:{" "}
            {r.sources.map((s, i) => (
              <span key={s.url}>{i > 0 && " · "}{s.internal ? <NavLink href={s.url} title={s.detail} label="Opening the IRS file…">{s.label}</NavLink> : <a href={s.url} target="_blank" rel="noreferrer" title={s.detail}>{s.label} ↗</a>}</span>
            ))}
          </div>
        )}
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
        {feedback && <Vote question={feedback.question} ein={r.ein} rank={feedback.rank} filters={feedback.filters} />}
        <CompareButton org={{ ein: r.ein, name: r.name, city: r.city, state: r.state }} />
      </div>
    </div>
  );
}
