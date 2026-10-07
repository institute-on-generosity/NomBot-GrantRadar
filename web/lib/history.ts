// Search history, kept only in this browser (localStorage). Every access is
// guarded: storage can be blocked or empty (private windows, cleared data).
export type HistoryEntry = {
  key: string;            // normalized question
  question: string;
  href: string;           // the exact results view: question + "show more" + filters
  total: number;
  at: number;             // last visited (ms)
  viewed?: { ein: string; name: string; at: number }; // last organization opened from these results
};

export const HISTORY_KEY = "nombot.history.v1";
const MAX = 50;
export const historyKey = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();

export function readHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
}
function write(list: HistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX))); window.dispatchEvent(new Event("nombot-history")); } catch { /* storage unavailable */ }
}

export function recordSearch(e: Omit<HistoryEntry, "key" | "at" | "viewed">) {
  const key = historyKey(e.question);
  const list = readHistory();
  const old = list.find((x) => x.key === key);
  write([{ ...e, key, at: Date.now(), viewed: old?.viewed }, ...list.filter((x) => x.key !== key)]);
}

export function recordViewed(resultsHref: string, ein: string, name: string) {
  const list = readHistory();
  const i = list.findIndex((x) => x.href === resultsHref);
  if (i < 0) return;
  list[i] = { ...list[i], at: Date.now(), viewed: { ein, name, at: Date.now() } };
  write([list[i], ...list.filter((_, j) => j !== i)]);
}

export function removeEntry(key: string) { write(readHistory().filter((x) => x.key !== key)); }
export function clearHistory() { write([]); }
