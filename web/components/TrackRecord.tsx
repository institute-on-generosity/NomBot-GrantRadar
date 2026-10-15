"use client";
import { useState } from "react";
import { NavLink } from "./NavLink";

type Org = { ein: string; name: string; place: string; since: number | null };
const SHOW = 8;

// Track record at a glance (Overview tab): the median years tax-exempt, then one row per age bracket
// (years since the IRS ruling), drawn like the Breakdown bars. Pick a row to list its organizations,
// closest first, each with the year it became tax-exempt.
export function TrackRecord({ median, brackets }: { median: number | null; brackets: { key: string; label: string; orgs: Org[] }[] }) {
  const [pick, setPick] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const max = Math.max(0, ...brackets.map((b) => b.orgs.length));
  if (!max) return null;
  return (
    <div className="track ls-bars">
      <h3>Track record{median != null && <small>Median <b>{median}</b> {median === 1 ? "year" : "years"}</small>}</h3>
      <ul>
        {brackets.map((b) => {
          const open = pick === b.key;
          const n = b.orgs.length;
          return (
            <li key={b.key}>
              <button type="button" className={`ls-row${open ? " on" : ""}`} aria-expanded={open} disabled={!n}
                onClick={() => { setPick(open ? null : b.key); setAll(false); }}>
                <span className="ls-label">{b.label}</span>
                <span className="ls-track"><i style={{ width: `${(100 * n) / max}%` }} /></span>
                <span className="ls-n">{n}</span>
              </button>
              {open && (
                <div className="track-list">
                  <p>{n} {n === 1 ? "org" : "orgs"} · {b.label} tax-exempt</p>
                  <ul className="ls-orgs">
                    {(all ? b.orgs : b.orgs.slice(0, SHOW)).map((o) => (
                      <li key={o.ein}>
                        <NavLink href={`/org/${o.ein}`} className="ls-org" title={`${o.name} · ${o.place}`} label="Opening the organization…">
                          <b>{o.name}</b><span>{o.place}</span>{o.since != null && <em>Since {o.since}</em>}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                  {!all && n > SHOW && <button type="button" className="track-more" onClick={() => setAll(true)}>Show all {n}</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
