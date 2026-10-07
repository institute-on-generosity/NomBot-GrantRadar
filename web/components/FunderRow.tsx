import { ViewTransition } from "react";
import Link from "next/link";
import { titleCase } from "./text";
import { money } from "@/lib/filters";
import type { FunderMatch } from "@/lib/grants";

const SHOWN = 3; // grantees like you, per row

// One ranked foundation: who it is, the grantees like you it already paid, and its typical grant.
// The name block shares a view-transition name with the funder sheet, so opening it morphs in place.
export function FunderRow({ f, index, href, state }: { f: FunderMatch; index: number; href: string; state: string }) {
  const like = f.evidence.slice(0, SHOWN);
  const toLike = f.evidence.reduce((s, e) => s + (e.amount ?? 0), 0);
  return (
    <article className="funder" style={{ "--i": index } as React.CSSProperties}>
      <Link href={href} scroll={false} className="funder-link" aria-label={`${titleCase(f.name)}: why this funder?`}>
        <div className="funder-main">
          <ViewTransition name={`funder-${f.ein}`} share="morph" default="none">
            <div className="funder-head">
              <h2>{titleCase(f.name)}</h2>
              <p className="meta">
                {[f.city && titleCase(f.city), f.state].filter(Boolean).join(", ")}
                {f.assets != null && <> · {money(f.assets)} in assets</>}
                {state && f.inState > 0 && <> · {f.inState} {f.inState === 1 ? "grant" : "grants"} in {state}</>}
              </p>
            </div>
          </ViewTransition>
          <p className="funder-like">
            Funded <b>{f.peers} {f.peers === 1 ? "nonprofit" : "nonprofits"} like yours</b>{toLike > 0 && <>, {money(toLike)} in all</>}
          </p>
          <ul className="grantees">
            {like.map((e) => (
              <li key={e.grantId}>
                <span className="grantee-name">{titleCase(e.recipient)}</span>
                <span className="grantee-place">{[e.city && titleCase(e.city), e.state].filter(Boolean).join(", ")}</span>
                <span className="amt">{e.amount != null ? money(e.amount) : "—"}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="funder-side">
          <span className="typical"><b>{f.typical != null ? money(f.typical) : "—"}</b><small>typical grant</small></span>
          <span className={`policy${f.inviteOnly ? " closed" : ""}`}>{f.inviteOnly ? "Invitation only" : "Open to applications"}</span>
          <span className="why-cta">Why this funder?</span>
        </div>
      </Link>
    </article>
  );
}
