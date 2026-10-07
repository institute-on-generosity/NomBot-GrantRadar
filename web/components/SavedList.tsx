"use client";
import { clearSaved, SAVED_KEY, type SavedOrg } from "@/lib/saved";
import { NavLink } from "./NavLink";
import { money } from "./money";
import { StarButton } from "./StarButton";
import { titleCase } from "./text";
import { useStoredList } from "./useStored";

export function SavedList() {
  const list = useStoredList<SavedOrg>(SAVED_KEY, "nombot-saved");
  if (!list.length) return <p className="empty-note">Nothing saved yet. Tap ☆ on any organization to save it here.</p>;
  return (
    <>
      <p className="count">{list.length} saved</p>
      {list.map((o) => (
        <div className="row" key={o.ein}>
          <div className="row-main">
            <div className="name-line"><StarButton org={o} /><NavLink href={`/org/${o.ein}`} className="name">{titleCase(o.name)}</NavLink></div>
            <div className="sub">{[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ")}{o.cause && <> · {o.cause}</>}</div>
          </div>
          {o.revenue != null && <div className="rev"><b>{money(o.revenue)}</b><span>revenue{o.year ? ` · ${o.year}` : ""}</span></div>}
        </div>
      ))}
      <button className="h-clear" onClick={() => clearSaved()}>Clear saved</button>
    </>
  );
}
