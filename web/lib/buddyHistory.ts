// Research Buddy conversations, kept only in this browser (localStorage), one per search
// (question + filter edits). Every access is guarded: storage can be blocked or empty.
export type SavedTurn = { ask: string; thinking: string; answer: string; sources: { n: number; ein: string; name: string; place: string; filing: string | null }[] };
export type Conversation = { key: string; question: string; href: string; at: number; turns: SavedTurn[] };

export const BUDDY_KEY = "nombot.buddy.v1";
const MAX = 30;

export function readConversations(): Conversation[] {
  try { return JSON.parse(localStorage.getItem(BUDDY_KEY) ?? "[]"); } catch { return []; }
}
function write(list: Conversation[]) {
  try { localStorage.setItem(BUDDY_KEY, JSON.stringify(list.slice(0, MAX))); window.dispatchEvent(new Event("nombot-buddy")); } catch { /* storage unavailable */ }
}
export const findConversation = (key: string) => readConversations().find((c) => c.key === key);

// Most recently used first; a conversation keeps its key, so saving again moves it to the top.
export function saveConversation(c: Omit<Conversation, "at">) {
  write([{ ...c, at: Date.now() }, ...readConversations().filter((x) => x.key !== c.key)]);
}
export function removeConversation(key: string) { write(readConversations().filter((x) => x.key !== key)); }
