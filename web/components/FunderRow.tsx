import { ViewTransition } from "react";
import Link from "next/link";
import { FunderStar } from "./GrantStore";
import { Bank, Check, Lock, People, Pin } from "./icons";
import { titleCase } from "./text";
import { money } from "@/lib/filters";
import type { FunderMatch } from "@/lib/grants";
import { LEAN_LABEL, share } from "@/lib/grantTypes";

const SHOWN = 3; // grantees like you, per row

// One ranked foundation: who it is, the grantees like you it already paid, and its typical grant.
// The name block shares a view-transition name with the funder sheet, so opening it morphs in place.
export function FunderRow({ f, index, href, state }: { f: FunderMatch; index: number; href: string; state: string }) {
  const like = f.evidence.slice(0, SHOWN);
  const toLike = f.evidence.reduce((s, e) => s + (e.amount ?? 0), 0);
  const lean = f.mix?.lean;
  return (
    <article className="funder" style={{ "--i": index } as React.CSSProperties}>
      <FunderStar funder={{ ein: f.ein, name: f.name, city: f.city, state: f.state, typical: f.typical, inviteOnly: f.inviteOnly }} />
      <Link href={href} scroll={false} className="funder-link" aria-label={`${titleCase(f.name)}: why this funder?`}>
        <div className="funder-main">
          <ViewTransition name={`funder-${f.ein}`} share="morph" default="none">
            <div className="funder-head">
              <h2>{titleCase(f.name)}</h2>
              <p className="meta">
                <span><Pin />{[f.city && titleCase(f.city), f.state].filter(Boolean).join(", ")}</span>
                {f.assets != null && <span title="Assets"><Bank />{money(f.assets)}</span>}
              </p>
            </div>
          </ViewTransition>
          <div className="evidence">
          <p className="funder-like" title="Nonprofits this foundation already paid whose work matches your mission, checked against their IRS filings">
            <People />Funded {f.peers} {f.peers === 1 ? "group" : "groups"} like yours{toLike > 0 && <span className="like-total">{money(toLike)}</span>}
          </p>
          <ul className="grantees">
            {like.map((e) => (
              <li key={e.grantId} className={e.fit >= 85 ? "fit-same" : "fit-close"} title={`${e.fit >= 85 ? "Same kind of work" : "Closely related work"} · match ${e.fit}/100`}>
                <span className="grantee-name">{titleCase(e.recipient)}</span>
                <span className="grantee-place">{[e.city && titleCase(e.city), e.state].filter(Boolean).join(", ")}</span>
                <span className="grantee-amt">{e.amount != null ? money(e.amount) : "—"}</span>
              </li>
            ))}
          </ul>
          </div>
        </div>
        <div className="funder-side">
          <div className="funder-side-top">
            <span className="typical"><b>{f.typical != null ? money(f.typical) : "—"}</b><small>typical grant</small></span>
            <span className={`policy${f.inviteOnly ? " closed" : ""}`}>{f.inviteOnly ? <><Lock size={12} />Invite only</> : <><Check size={12} />Open</>}</span>
            {lean && <span className={`gtype ${lean}`} title={`${Math.round(100 * share(f.mix!, lean))}% of grant dollars with a clear purpose`}>{LEAN_LABEL[lean]}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}
