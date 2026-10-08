"use client";
import { useState } from "react";
import Link from "next/link";
import { money } from "./money";
import type { Calendar } from "@/lib/grantLandscape";

// Twelve columns, one per month: how many open funders name a deadline then. One month is selected
// at a time (this month to start); its funders are listed below, best fit first, with their typical grant.
export function CalendarChart({ c, mission }: { c: Calendar; mission: string }) {
  const [pick, setPick] = useState(c.now);
  const max = Math.max(1, ...c.months.map((m) => m.funders.length));
  const month = c.months[pick];
  const href = (ein: string) => `/grants/funder/${ein}?${new URLSearchParams({ mission })}`;
  return (
    <div className="cal">
      <div className="cal-cols" role="radiogroup" aria-label="Deadline month">
        {c.months.map((m, i) => (
          <button key={m.label} type="button" role="radio" aria-checked={pick === i} onClick={() => setPick(i)} className={pick === i ? "on" : undefined}
            title={`${m.label}: ${m.funders.length || "no"} ${m.funders.length === 1 ? "funder" : "funders"} with a deadline`}>
            <span className="cal-n">{m.funders.length || ""}</span>
            <span className="cal-bar"><i style={{ height: `${(100 * m.funders.length) / max}%` }} /></span>
            <span className="cal-m">{m.label}{i === c.now && <small aria-label="this month">•</small>}</span>
          </button>
        ))}
      </div>
      <p className="cal-other"><b>{c.anytime}</b> any time · <b>{c.quarterly}</b> quarterly · <b>{c.unclear}</b> not stated</p>
      <div className="cal-soon">
        <h3>Deadlines in {month.label}{pick === c.now && " (this month)"}</h3>
        {month.funders.length ? (
          <ul>{month.funders.map((f) => (
            <li key={f.n} title={`#${f.n} in your matches`}>
              <Link href={href(f.ein)} scroll={false}>{f.name}</Link>
              <small>{f.typical != null ? `${money(f.typical)} typical` : ""}</small>
            </li>
          ))}</ul>
        ) : <p className="ls-note">No open funder names a deadline in {month.label}. Pick another month, or try the {c.anytime} that take applications any time.</p>}
      </div>
    </div>
  );
}
