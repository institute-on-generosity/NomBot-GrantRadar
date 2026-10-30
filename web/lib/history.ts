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
// The same question typed again is the same entry: case, spacing, quotes and the closing "?" don't count
export const historyKey = (q: string) => q.toLowerCase().replace(/[“”"']/g, "").replace(/\s+/g, " ").trim().replace(/[\s?.!]+$/, "");

// Newest first, one entry per question (older lists can hold repeats: they are merged on read, the newest kept)
export function dedupeHistory(list: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  return [...list].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).filter((e) => { const k = historyKey(e.question); if (seen.has(k)) return false; seen.add(k); return true; }).map((e) => ({ ...e, key: historyKey(e.question) }));
}
export function readHistory(): HistoryEntry[] {
  try { return dedupeHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]")); } catch { return []; }
}
function write(list: HistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX))); window.dispatchEvent(new Event("nombot-history")); } catch { /* storage unavailable */ }
}

// A question asked again moves to the top (one entry per question, never a repeat)
export function recordSearch(e: Omit<HistoryEntry, "key" | "at" | "viewed">) {
  const key = historyKey(e.question);
  const list = readHistory();
  const old = list.find((x) => x.key === key);
  write([{ ...old, ...e, key, at: Date.now() }, ...list.filter((x) => x.key !== key)]);
  const star = readStarred().find((x) => x.key === key);
  if (star && star.href !== e.href) writeStarred(readStarred().map((x) => (x.key === key ? { ...x, href: e.href } : x)));
}

export function recordViewed(resultsHref: string, ein: string, name: string) {
  const list = readHistory();
  const i = list.findIndex((x) => x.href === resultsHref);
  if (i < 0) return;
  list[i] = { ...list[i], at: Date.now(), viewed: { ein, name, at: Date.now() } };
  write(list);
}

export function removeEntry(key: string) { write(readHistory().filter((x) => x.key !== key)); }
export function clearHistory() { write([]); }

// Starred searches (Oct 29): kept in this browser like Recents, in their own list so they never age out of it.
// Shown under Saved in the sidebar, above Recents, and left out of Recents while starred.
export type StarredSearch = { key: string; question: string; href: string; at: number };
export const STARRED_KEY = "nombot.starred-searches.v1";
export function readStarred(): StarredSearch[] {
  try { return JSON.parse(localStorage.getItem(STARRED_KEY) ?? "[]"); } catch { return []; }
}
function writeStarred(list: StarredSearch[]) {
  try { localStorage.setItem(STARRED_KEY, JSON.stringify(list)); window.dispatchEvent(new Event("nombot-history")); } catch { /* storage unavailable */ }
}
export const isStarred = (question: string) => readStarred().some((x) => x.key === historyKey(question));
// Returns whether the search is starred afterwards
export function toggleStar(e: { question: string; href: string }): boolean {
  const key = historyKey(e.question);
  const list = readStarred();
  if (list.some((x) => x.key === key)) { writeStarred(list.filter((x) => x.key !== key)); return false; }
  writeStarred([{ key, question: e.question, href: e.href, at: Date.now() }, ...list]);
  return true;
}
export const unstar = (key: string) => writeStarred(readStarred().filter((x) => x.key !== key));
// A long question shown short but telling: its start and its end ("How much foundation…goes to health?"), so
// questions that share a beginning stay distinguishable. The full text is the row's title.
export function shortQuestion(q: string, n = 34): string {
  const t = q.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const tail = Math.round(n * 0.7), head = n - tail - 1; // most of the room to the end, where questions differ
  return `${t.slice(0, head).replace(/\s+\S*$/, "")}…${t.slice(-tail).replace(/^\S*\s+/, "")}`;
}

// The label for each question in a list: the full text (the sidebar trims its end), unless another question in the
// same list starts the same way, then the start and the end (shortQuestion) so the part that differs shows
export function rowLabels(questions: string[], prefix = 22, n = 28): string[] {
  const head = (q: string) => q.toLowerCase().slice(0, prefix);
  const count = new Map<string, number>();
  for (const q of questions) count.set(head(q), (count.get(head(q)) ?? 0) + 1);
  return questions.map((q) => ((count.get(head(q)) ?? 0) > 1 ? shortQuestion(q, n) : q));
}
