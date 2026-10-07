"use client";
import { historyKey } from "@/lib/history";
import { useStored } from "./useStored";

const VOTES_KEY = "nombot.votes.v1";   // { "question key|ein": 1 | -1 }, so votes survive reloads
const CLIENT_KEY = "nombot.client.v1"; // random id; lets a person change or clear their vote

function clientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(CLIENT_KEY, id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

function setLocal(key: string, vote: number) {
  try {
    const all = JSON.parse(localStorage.getItem(VOTES_KEY) ?? "{}");
    if (vote) all[key] = vote; else delete all[key];
    localStorage.setItem(VOTES_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("nombot-votes"));
  } catch { /* storage unavailable */ }
}

const Thumb = ({ down }: { down?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={down ? { transform: "scaleY(-1)" } : undefined}>
    <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4-7.5a2 2 0 0 1 3 2.1L13 9h6a2 2 0 0 1 2 2.3l-1.3 7.5A2.5 2.5 0 0 1 17.2 21H7" />
  </svg>
);

// 👍/👎 on one result: "is this what you were looking for?" Labels feed the search eval.
export function Vote({ question, ein, rank, filters }: { question: string; ein: string; rank: number; filters: Record<string, unknown> }) {
  const key = `${historyKey(question)}|${ein}`;
  const raw = useStored(VOTES_KEY, "nombot-votes");
  let current = 0;
  try { current = Number(JSON.parse(raw)[key]) || 0; } catch { /* empty */ }

  const cast = (v: 1 | -1) => {
    const next = current === v ? 0 : v;
    setLocal(key, next);
    fetch("/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ clientId: clientId(), question, ein, vote: next, rank, filters }),
    }).then((r) => { if (!r.ok) throw new Error(String(r.status)); }).catch(() => setLocal(key, current)); // undo if not saved
  };

  return (
    <div className="vote" role="group" aria-label="Is this a good match?">
      <button type="button" className={current === 1 ? "on up" : ""} aria-pressed={current === 1} onClick={() => cast(1)} title="Good match"><Thumb /><span className="sr">Good match</span></button>
      <button type="button" className={current === -1 ? "on down" : ""} aria-pressed={current === -1} onClick={() => cast(-1)} title="Not a match"><Thumb down /><span className="sr">Not a match</span></button>
    </div>
  );
}
