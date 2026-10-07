// GrantRadar's starred foundations and recent missions, kept only in this browser (localStorage),
// separate from NomBot's lists. Every access is guarded: storage can be blocked or empty.
export type RecentMission = { key: string; mission: string; href: string; total: number; at: number };
export type SavedFunder = { ein: string; name: string; city: string | null; state: string | null; typical: number | null; inviteOnly: boolean; at: number };

export const GR_HISTORY_KEY = "grantradar.history.v1";
export const GR_HISTORY_EVENT = "grantradar-history";
export const GR_SAVED_KEY = "grantradar.saved.v1";
export const GR_SAVED_EVENT = "grantradar-saved";
const MAX = 50;
export const missionKey = (m: string) => m.toLowerCase().replace(/\s+/g, " ").trim();

function read<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function write<T>(key: string, event: string, list: T[]) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, MAX))); window.dispatchEvent(new Event(event)); } catch { /* storage unavailable */ }
}

// New missions go on top; revisiting one updates it in place so the list order stays put.
export function recordMission(e: Omit<RecentMission, "key" | "at">) {
  const key = missionKey(e.mission);
  const list = read<RecentMission>(GR_HISTORY_KEY);
  const i = list.findIndex((x) => x.key === key);
  if (i < 0) return write(GR_HISTORY_KEY, GR_HISTORY_EVENT, [{ ...e, key, at: Date.now() }, ...list]);
  list[i] = { ...list[i], ...e, at: Date.now() };
  write(GR_HISTORY_KEY, GR_HISTORY_EVENT, list);
}
export const removeMission = (key: string) => write(GR_HISTORY_KEY, GR_HISTORY_EVENT, read<RecentMission>(GR_HISTORY_KEY).filter((x) => x.key !== key));
export const clearMissions = () => write(GR_HISTORY_KEY, GR_HISTORY_EVENT, []);

export function toggleFunder(f: Omit<SavedFunder, "at">) {
  const list = read<SavedFunder>(GR_SAVED_KEY);
  write(GR_SAVED_KEY, GR_SAVED_EVENT, list.some((x) => x.ein === f.ein) ? list.filter((x) => x.ein !== f.ein) : [{ ...f, at: Date.now() }, ...list]);
}
export const clearFunders = () => write(GR_SAVED_KEY, GR_SAVED_EVENT, []);
