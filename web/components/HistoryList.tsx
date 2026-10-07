"use client";
import { useSyncExternalStore } from "react";
import { clearHistory, readHistory, removeEntry, type HistoryEntry } from "@/lib/history";
import { NavLink } from "./NavLink";
import { titleCase } from "./text";

const subscribe = (cb: () => void) => {
  window.addEventListener("nombot-history", cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener("nombot-history", cb); window.removeEventListener("storage", cb); };
};
let snap = "";
const getSnapshot = () => { try { snap = localStorage.getItem("nombot.history.v1") ?? "[]"; } catch { snap = "[]"; } return snap; };

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const target = (e: HistoryEntry) => (e.viewed ? `${e.href}&focus=${e.viewed.ein}` : e.href);

export function HistoryList({ limit, heading }: { limit?: number; heading?: string }) {
  useSyncExternalStore(subscribe, getSnapshot, () => "[]");
  const list = readHistory().slice(0, limit);
  if (!list.length) return limit ? null : <p className="empty-note">No searches yet.</p>;
  return (
    <>
      {heading && <p className="hint">{heading}</p>}
      <ul className="history">
        {list.map((e) => (
          <li key={e.key}>
            <NavLink href={target(e)} className="h-q" label="Opening your results…">{e.question}</NavLink>
            <div className="h-meta">
              {e.total} results · {ago(e.at)}
              {e.viewed && <> · last viewed <b>{titleCase(e.viewed.name)}</b></>}
            </div>
            {!limit && <button className="h-x" onClick={() => removeEntry(e.key)} aria-label={`Remove ${e.question}`}>Remove</button>}
          </li>
        ))}
      </ul>
      {!limit && <button className="h-clear" onClick={() => clearHistory()}>Clear history</button>}
    </>
  );
}
