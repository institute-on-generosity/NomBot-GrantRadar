"use client";
import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { titleCase, orgTitle } from "@/components/text";
import type { SimilarOrg } from "@/lib/similar";

// The list part of components/OrgSimilar.tsx: all similar orgs, or only the less-funded ones.
export function SimilarToggle({ all, less }: { all: SimilarOrg[]; less: SimilarOrg[] }) {
  const [onlyLess, setOnlyLess] = useState(false);
  const list = onlyLess ? less : all;
  return (
    <section className="similar">
      <h2>Similar organizations</h2>
      <div className="seg" style={{ "--n": 2, "--i": onlyLess ? 1 : 0, display: "inline-grid", marginBottom: 8 } as React.CSSProperties} role="group" aria-label="Which similar organizations">
        <span className="seg-thumb" />
        <button type="button" className={onlyLess ? "" : "on"} aria-pressed={!onlyLess} onClick={() => setOnlyLess(false)}>All</button>
        <button type="button" className={onlyLess ? "on" : ""} aria-pressed={onlyLess} onClick={() => setOnlyLess(true)}
          title="Active peers (revenue $50K or more) with under $25K in linked foundation grants in 2022-2024">Less funded peers</button>
      </div>
      {list.length ? (
        <ul className="people fund-list">
          {list.map((s) => (
            <li key={s.ein}>
              <span>
                <NavLink href={`/org/${s.ein}`} label="Opening the organization…" className="person-link"><b>{orgTitle(s.name)}</b></NavLink>
                <small>{[[s.city && titleCase(s.city), s.state].filter(Boolean).join(", "), s.ntee?.label,
                  s.revenue != null && `${money(s.revenue)} revenue`,
                  onlyLess && (s.foundation_grants_2022_2024 > 0 ? `${money(s.foundation_grants_2022_2024)} foundation grants 2022-24` : "no foundation grants found 2022-24")]
                  .filter(Boolean).join(" · ")}</small>
              </span>
              <span title={`Similarity ${s.similarity.toFixed(2)} of 1, from their Form 990 mission and program text`} style={{ fontWeight: 500, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{s.similarity_words}</span>
            </li>
          ))}
        </ul>
      ) : <p className="hint">{onlyLess ? "No less funded peers close enough to show." : "No organizations close enough to show."}</p>}
      <p className="hint"><small>By the meaning of their newest Form 990 mission and program text. Similar wording, not a judgment of quality.{onlyLess && " Less funded: active orgs with under $25K in foundation grants we could link in 2022-2024."}</small></p>
    </section>
  );
}
