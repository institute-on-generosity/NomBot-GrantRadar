"use client";
import { useEffect } from "react";
import { clearFunders, clearMissions, GR_HISTORY_EVENT, GR_HISTORY_KEY, GR_SAVED_EVENT, GR_SAVED_KEY, recordMission, removeMission, toggleFunder, type RecentMission, type SavedFunder } from "@/lib/grantStore";
import { ago } from "./HistoryList";
import { Lock, Pin } from "./icons";
import { money } from "./money";
import { NavLink } from "./NavLink";
import { titleCase } from "./text";
import { useStored, useStoredList } from "./useStored";
import { MATCH_STEPS } from "@/lib/grantExamples";

// On a matches page: remember the mission and this exact view.
export function RecordMission({ mission, href, total }: { mission: string; href: string; total: number }) {
  useEffect(() => { recordMission({ mission, href, total }); }, [mission, href, total]);
  return null;
}

// ☆ / ★ for a foundation. Sits outside the row's link, so it never opens the sheet.
export function FunderStar({ funder, withLabel = false }: { funder: Omit<SavedFunder, "at">; withLabel?: boolean }) {
  const raw = useStored(GR_SAVED_KEY, GR_SAVED_EVENT);
  const on = raw.includes(`"ein":"${funder.ein}"`);
  const name = titleCase(funder.name);
  return (
    <button type="button" className={`star${on ? " on" : ""}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFunder(funder); }}
      aria-pressed={on} aria-label={on ? `Unstar ${name}` : `Star ${name}`} title={on ? "Starred: click to remove" : "Star"}>
      {on ? "★" : "☆"}{withLabel && <span>{on ? "Starred" : "Star"}</span>}
    </button>
  );
}

export function SavedFunders() {
  const list = useStoredList<SavedFunder>(GR_SAVED_KEY, GR_SAVED_EVENT);
  if (!list.length) return <p className="empty-note">No starred funders. Tap ☆ on a funder to keep it here.</p>;
  return (
    <>
      <p className="count">{list.length} starred</p>
      {list.map((f) => (
        <div className="row" key={f.ein}>
          <div className="row-main">
            <div className="name-line"><FunderStar funder={f} /><NavLink href={`/grants/funder/${f.ein}`} className="name">{titleCase(f.name)}</NavLink></div>
            <div className="sub icon-sub">
              <span><Pin />{[f.city && titleCase(f.city), f.state].filter(Boolean).join(", ")}</span>
              {f.inviteOnly && <span><Lock />Invite only</span>}
            </div>
          </div>
          {f.typical != null && <div className="rev"><b className="amt">{money(f.typical)}</b><span>typical</span></div>}
        </div>
      ))}
      <button className="h-clear" onClick={() => clearFunders()}>Clear starred</button>
    </>
  );
}

export function RecentMissions() {
  const list = useStoredList<RecentMission>(GR_HISTORY_KEY, GR_HISTORY_EVENT);
  if (!list.length) return <p className="empty-note">No missions yet.</p>;
  return (
    <>
      <ul className="history">
        {list.map((e) => (
          <li key={e.key}>
            <NavLink href={e.href} className="h-q" label="Reading your mission…" steps={MATCH_STEPS} search>{e.mission}</NavLink>
            <div className="h-meta">{e.total} funders · {ago(e.at)}</div>
            <button className="h-x" onClick={() => removeMission(e.key)} aria-label={`Remove ${e.mission}`}>Remove</button>
          </li>
        ))}
      </ul>
      <button className="h-clear" onClick={() => clearMissions()}>Clear recents</button>
    </>
  );
}
