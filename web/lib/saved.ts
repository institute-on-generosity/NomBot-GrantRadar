// Starred organizations, kept only in this browser (localStorage).
export type SavedOrg = { ein: string; name: string; city: string | null; state: string | null; cause?: string | null; revenue?: number | null; year?: number | null; at: number };

export const SAVED_KEY = "nombot.saved.v1";

export function readSaved(): SavedOrg[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]"); } catch { return []; }
}
function write(list: SavedOrg[]) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); window.dispatchEvent(new Event("nombot-saved")); } catch { /* storage unavailable */ }
}
export const isSaved = (ein: string) => readSaved().some((o) => o.ein === ein);
export function toggleSaved(o: Omit<SavedOrg, "at">) {
  const list = readSaved();
  write(list.some((x) => x.ein === o.ein) ? list.filter((x) => x.ein !== o.ein) : [{ ...o, at: Date.now() }, ...list]);
}
export function clearSaved() { write([]); }
