import Link from "next/link";
import type { Result } from "@/lib/search";
import { Snippet } from "./Snippet";
import { titleCase } from "./text";

export function money(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;
}

export function ResultRow({ r, href, patterns }: { r: Result; href: string; patterns: string[] }) {
  const text = [r.mission, r.programs].filter(Boolean).join(" ");
  return (
    <div className="row">
      <div className="row-main">
        <Link href={href} className="name">{titleCase(r.name)}</Link>
        <div className="sub">
          {[r.city ? titleCase(r.city) : null, r.state].filter(Boolean).join(", ")}
          {r.ntee?.label && <> · {r.ntee.label}</>}
        </div>
        {text && <Snippet text={text} patterns={patterns} />}
        {r.sources.length > 0 && (
          <div className="src">
            Source:{" "}
            {r.sources.map((s, i) => (
              <span key={s.url}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noreferrer" title={s.detail}>{s.label} ↗</a></span>
            ))}
          </div>
        )}
      </div>
      {r.revenue && (
        <div className="rev"><b>{money(r.revenue.amount)}</b><span>revenue{r.revenue.year ? ` · ${r.revenue.year}` : ""}</span></div>
      )}
    </div>
  );
}
