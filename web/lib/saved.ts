// Starred organizations, kept only in this browser (localStorage).
export type SavedOrg = { ein: string; name: string; city: string | null; state: string | null; cause?: string | null; revenue?: number | null; year?: number | null; at: number; folder?: string | null };

export const SAVED_KEY = "nombot.saved.v1";

export function readSaved(): SavedOrg[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]"); } catch { return []; }
}
function write(list: SavedOrg[]) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); window.dispatchEvent(new Event("nombot-saved")); } catch { /* storage unavailable */ }
}
export const isSaved = (ein: string) => readSaved().some((o) => o.ein === ein);
export function toggleSaved(o: Omit<SavedOrg, "at" | "folder">) {
  const list = readSaved();
  write(list.some((x) => x.ein === o.ein) ? list.filter((x) => x.ein !== o.ein) : [{ ...o, at: Date.now() }, ...list]);
}

// Folders for starred organizations (e.g. "Youth mentoring", "Arts education"). The folder list is
// stored separately so a new, still-empty folder persists; each saved org names its folder or none.
export const FOLDERS_KEY = "nombot.folders.v1";
export const readFolders = (): string[] => { try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "[]"); } catch { return []; } };
function writeFolders(list: string[]) {
  try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(list)); window.dispatchEvent(new Event("nombot-saved")); } catch { /* storage unavailable */ }
}
const clean = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 40);
export function addFolder(name: string) {
  const n = clean(name);
  if (n && !readFolders().some((f) => f.toLowerCase() === n.toLowerCase())) writeFolders([...readFolders(), n]);
  return n;
}
export function setFolder(ein: string, folder: string | null) {
  if (folder) addFolder(folder);
  write(readSaved().map((o) => (o.ein === ein ? { ...o, folder: folder ? clean(folder) : null } : o)));
}
export function renameFolder(from: string, to: string) {
  const n = clean(to);
  if (!n || n === from) return;
  writeFolders(readFolders().map((f) => (f === from ? n : f)).filter((f, i, a) => a.indexOf(f) === i));
  write(readSaved().map((o) => (o.folder === from ? { ...o, folder: n } : o)));
}
// Deleting a folder keeps its organizations starred, just unfiled.
export function deleteFolder(name: string) {
  writeFolders(readFolders().filter((f) => f !== name));
  write(readSaved().map((o) => (o.folder === name ? { ...o, folder: null } : o)));
}
export function clearSaved() { write([]); writeFolders([]); }
