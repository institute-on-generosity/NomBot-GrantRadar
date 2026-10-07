"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BUDDY_KEY, type Conversation, findConversation, removeConversation, saveConversation } from "@/lib/buddyHistory";
import { Answer } from "./CitedAnswer";
import { ago } from "./HistoryList";
import { useStoredList } from "./useStored";

export type Source = { n: number; ein: string; name: string; place: string; filing: string | null };
type Turn = { ask: string; thinking: string; answer: string; sources: Source[]; status: "thinking" | "answering" | "done" | "error"; error?: string };

const noop = () => () => {};
const SUGGESTIONS = ["Which is the strongest fit, and why?", "Compare the top 3", "Which ones are small and community-run?"];

// Research Buddy: ask about the current results; Claude answers from their IRS filings,
// citing each organization as [n] (opens it in a popover), and shows a summary of its reasoning.
// A floating button opens it as a chat panel docked on the right, beside the results.
// Conversations are saved per search (convKey) in this browser; History lists them all.
// GrantRadar reuses it with its own endpoint, suggestions, intro, citation links and storage key.
export function ResearchBuddy({ question, overrides, all, convKey, startOpen = false, endpoint = "/api/buddy", suggestions = SUGGESTIONS, intro, sourceHref = (s) => `/preview/org/${s.ein}`, store = BUDDY_KEY }: {
  question: string; overrides: Record<string, string | undefined>; all: boolean; convKey: string; startOpen?: boolean;
  endpoint?: string; suggestions?: string[]; intro?: React.ReactNode; sourceHref?: (s: Source) => string; store?: string;
}) {
  // Restored from storage on the client; the panel (the only place turns render) starts closed or client-opened.
  const [turns, setTurns] = useState<Turn[]>(() => (typeof window === "undefined" ? [] : findConversation(convKey, store)?.turns.map((t) => ({ ...t, status: "done" as const })) ?? []));
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(startOpen);
  const [view, setView] = useState<"chat" | "history">("chat");
  const saved = useStoredList<Conversation>(store, "nombot-buddy");
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const busy = turns.at(-1)?.status === "thinking" || turns.at(-1)?.status === "answering";
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns]); // follow the answer as it streams
  // Save once every turn has finished (not mid-stream).
  useEffect(() => {
    const done = turns.filter((t) => t.status === "done");
    if (done.length && done.length === turns.length) {
      saveConversation({ key: convKey, question, href: convKey, turns: done.map(({ ask, thinking, answer, sources }) => ({ ask, thinking, answer, sources })) }, store);
    }
  }, [turns, convKey, question, store]);

  const newChat = () => { setTurns([]); removeConversation(convKey, store); setView("chat"); input.current?.focus(); };
  const openConversation = (c: Conversation) => {
    if (c.key === convKey) { setView("chat"); return; }
    router.push(`${c.href}${c.href.includes("?") ? "&" : "?"}buddy=1`);
  };

  const update = (patch: (t: Turn) => Partial<Turn>) =>
    setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, ...patch(t) } : t)));

  async function askBuddy(ask: string) {
    const text = ask.trim();
    if (!text || busy) return;
    const history = turns.filter((t) => t.status === "done").flatMap((t) => [{ role: "user" as const, content: t.ask }, { role: "assistant" as const, content: t.answer }]);
    setDraft("");
    setTurns((ts) => [...ts, { ask: text, thinking: "", answer: "", sources: [], status: "thinking" }]);
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, ask: text, overrides: Object.fromEntries(Object.entries(overrides).filter(([, v]) => v)), all, history }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "Research Buddy is unavailable.");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const e = JSON.parse(line);
          if (e.type === "sources") update(() => ({ sources: e.sources }));
          else if (e.type === "thinking") update((t) => ({ thinking: t.thinking + e.text }));
          else if (e.type === "text") update((t) => ({ answer: t.answer + e.text, status: "answering" }));
          else if (e.type === "error") update(() => ({ status: "error", error: e.message }));
        }
      }
      update((t) => (t.status === "error" ? {} : { status: "done" }));
    } catch (err) {
      update(() => ({ status: "error", error: (err as Error).message }));
    }
    input.current?.focus();
  }

  // The panel is portaled into .shell; render it only after hydration (the server has no DOM),
  // so opening with ?buddy=1 doesn't cause a hydration mismatch.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const shell = hydrated ? document.querySelector(".shell") : null;
  return (
    <>
      {!open && (
        <button type="button" className="buddy-fab" onClick={() => setOpen(true)}>
          <span aria-hidden>✦</span> Ask Research Buddy
        </button>
      )}
      {open && shell && createPortal(
        <aside className="buddy-panel" aria-label="Research Buddy">
          <header className="panel-head">
            <span><b className="buddy-mark" aria-hidden>✦</b> {view === "history" ? "History" : "Research Buddy"}</span>
            <button type="button" className={`iconbtn${view === "history" ? " on" : ""}`} onClick={() => setView(view === "history" ? "chat" : "history")} aria-pressed={view === "history"} aria-label="Conversation history" title="History">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>
            </button>
            <button type="button" className="iconbtn" onClick={newChat} disabled={busy || !turns.length} aria-label="New chat" title="New chat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
            <button type="button" className="iconbtn" onClick={() => setOpen(false)} aria-label="Close Research Buddy" title="Close (Esc)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>

          {view === "history" ? (
            <div className="buddy-body">
              {!saved.length && <p className="buddy-empty-note">No conversations yet. Ask Research Buddy about any search and it will show up here.</p>}
              <ul className="buddy-history">
                {saved.map((c) => (
                  <li key={c.key} className={c.key === convKey ? "on" : undefined}>
                    <button type="button" onClick={() => openConversation(c)}>
                      <b>{c.question}</b>
                      <span>{c.turns[0]?.ask}</span>
                      <small>{c.turns.length} {c.turns.length === 1 ? "question" : "questions"} · {ago(c.at)}{c.key === convKey ? " · this search" : ""}</small>
                    </button>
                    <button type="button" className="iconbtn" onClick={() => removeConversation(c.key, store)} aria-label={`Delete conversation about ${c.question}`} title="Delete">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (<>
          <div className="buddy-body">
            {!turns.length && (
              <div className="buddy-empty">
                <p>{intro ?? <>Ask about the top results for <b>{question}</b>. Answers come only from their IRS filings, with each claim cited.</>}</p>
                <div className="buddy-suggest">
                  {suggestions.map((s) => <button key={s} type="button" className="chip link" onClick={() => askBuddy(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <article key={i} className="buddy-turn">
                <p className="buddy-ask">{t.ask}</p>
                {t.thinking && (
                  <details className="buddy-thinking">
                    <summary>{t.status === "thinking" ? <><span className="spinner" />Reading the filings…</> : "How I reasoned"}</summary>
                    <p>{t.thinking}</p>
                  </details>
                )}
                {!t.thinking && t.status === "thinking" && <p className="buddy-wait"><span className="spinner" />Reading the filings…</p>}
                {t.answer && <Answer text={t.answer} cite={(n) => { const x = t.sources.find((y) => y.n === n); return x && { title: `${x.name} · ${x.place}${x.filing ? ` · ${x.filing}` : ""}`, href: sourceHref(x) }; }} />}
                {t.status === "error" && <p className="notice">{t.error}</p>}
                {t.status === "done" && <Cited text={t.answer} sources={t.sources} href={sourceHref} />}
              </article>
            ))}
            <div ref={end} />
          </div>

          <form className="buddy-form" onSubmit={(e) => { e.preventDefault(); askBuddy(draft); }}>
            <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy}
              placeholder={turns.length ? "Ask a follow-up…" : "Ask about these results…"} aria-label="Ask Research Buddy" />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Ask">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </form>
          </>)}
        </aside>,
        shell,
      )}
    </>
  );
}

// The organizations the answer cites, in order, with the filing each claim comes from.
function Cited({ text, sources, href }: { text: string; sources: Source[]; href: (s: Source) => string }) {
  const used = [...new Set([...text.matchAll(/\[(\d+(?:,\s*\d+)*)\]/g)].flatMap((m) => m[1].split(/,\s*/).map(Number)))].sort((a, b) => a - b);
  const list = used.map((n) => sources.find((s) => s.n === n)).filter((s): s is Source => Boolean(s));
  if (!list.length) return null;
  return (
    <ol className="buddy-sources">
      {list.map((s) => (
        <li key={s.n}>
          <span className="cite-n">{s.n}</span>
          <Link href={href(s)} scroll={false}>{s.name}</Link>
          <span>{s.place}{s.filing ? ` · ${s.filing}` : " · IRS master file only"}</span>
        </li>
      ))}
    </ol>
  );
}
