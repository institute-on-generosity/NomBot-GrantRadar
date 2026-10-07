// Research Buddy conversations, kept only in this browser (localStorage), one per search
// (question + filter edits). Every access is guarded: storage can be blocked or empty.
export type SavedTurn = { ask: string; thinking: string; answer: string; sources: { n: number; ein: string; name: string; place: string; filing: string | null }[] };
export type Conversation = { key: string; question: string; href: string; at: number; turns: SavedTurn[] };

export const BUDDY_KEY = "nombot.buddy.v1";
export const GRANTS_BUDDY_KEY = "grantradar.buddy.v1"; // GrantRadar's Buddy keeps its own conversations
const MAX = 30;

export function readConversations(store = BUDDY_KEY): Conversation[] {
  try { return JSON.parse(localStorage.getItem(store) ?? "[]"); } catch { return []; }
}
function write(list: Conversation[], store: string) {
  try { localStorage.setItem(store, JSON.stringify(list.slice(0, MAX))); window.dispatchEvent(new Event("nombot-buddy")); } catch { /* storage unavailable */ }
}
export const findConversation = (key: string, store = BUDDY_KEY) => readConversations(store).find((c) => c.key === key);

// Most recently used first; a conversation keeps its key, so saving again moves it to the top.
export function saveConversation(c: Omit<Conversation, "at">, store = BUDDY_KEY) {
  write([{ ...c, at: Date.now() }, ...readConversations(store).filter((x) => x.key !== c.key)], store);
}
export function removeConversation(key: string, store = BUDDY_KEY) { write(readConversations(store).filter((x) => x.key !== key), store); }
