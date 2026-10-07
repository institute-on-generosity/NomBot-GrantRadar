"use client";
import { HISTORY_KEY, type HistoryEntry, clearHistory, removeEntry } from "@/lib/history";
import { NavLink } from "./NavLink";
import { titleCase } from "./text";
import { useStoredList } from "./useStored";

export function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const historyTarget = (e: HistoryEntry) => (e.viewed ? `${e.href}&focus=${e.viewed.ein}` : e.href);

export function HistoryList() {
  const list = useStoredList<HistoryEntry>(HISTORY_KEY, "nombot-history");
  if (!list.length) return <p className="empty-note">No searches yet.</p>;
  return (
    <>
      <ul className="history">
        {list.map((e) => (
          <li key={e.key}>
            <NavLink href={historyTarget(e)} className="h-q" label="Opening your results…" search>{e.question}</NavLink>
            <div className="h-meta">
              {e.total} results · {ago(e.at)}
              {e.viewed && <> · last viewed <b>{titleCase(e.viewed.name)}</b></>}
            </div>
            <button className="h-x" onClick={() => removeEntry(e.key)} aria-label={`Remove ${e.question}`}>Remove</button>
          </li>
        ))}
      </ul>
      <button className="h-clear" onClick={() => clearHistory()}>Clear history</button>
    </>
  );
}
