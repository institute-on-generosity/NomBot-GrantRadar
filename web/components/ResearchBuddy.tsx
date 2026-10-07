"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

type Source = { n: number; ein: string; name: string; place: string; filing: string | null };
type Turn = { ask: string; thinking: string; answer: string; sources: Source[]; status: "thinking" | "answering" | "done" | "error"; error?: string };

const SUGGESTIONS = ["Which is the strongest fit, and why?", "Compare the top 3", "Which ones are small and community-run?"];

// Research Buddy: ask about the current results; Claude answers from their IRS filings,
// citing each organization as [n] (opens it in a popover), and shows a summary of its reasoning.
// A floating button opens it as a chat panel docked on the right, beside the results.
export function ResearchBuddy({ question, overrides, all }: { question: string; overrides: Record<string, string | undefined>; all: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
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

  const update = (patch: (t: Turn) => Partial<Turn>) =>
    setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, ...patch(t) } : t)));

  async function askBuddy(ask: string) {
    const text = ask.trim();
    if (!text || busy) return;
    const history = turns.filter((t) => t.status === "done").flatMap((t) => [{ role: "user" as const, content: t.ask }, { role: "assistant" as const, content: t.answer }]);
    setDraft("");
    setTurns((ts) => [...ts, { ask: text, thinking: "", answer: "", sources: [], status: "thinking" }]);
    try {
      const res = await fetch("/api/buddy", {
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

  const shell = typeof document === "undefined" ? null : document.querySelector(".shell");
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
            <span><b className="buddy-mark" aria-hidden>✦</b> Research Buddy</span>
            <button type="button" className="iconbtn" onClick={() => setOpen(false)} aria-label="Close Research Buddy" title="Close (Esc)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <div className="buddy-body">
            {!turns.length && (
              <div className="buddy-empty">
                <p>Ask about the top results for <b>{question}</b>. Answers come only from their IRS filings, with each claim cited.</p>
                <div className="buddy-suggest">
                  {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip link" onClick={() => askBuddy(s)}>{s}</button>)}
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
                {t.answer && <Answer text={t.answer} sources={t.sources} />}
                {t.status === "error" && <p className="notice">{t.error}</p>}
                {t.status === "done" && <Cited text={t.answer} sources={t.sources} />}
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
        </aside>,
        shell,
      )}
    </>
  );
}

// Minimal, safe rendering of the answer: paragraphs, "- " bullets, **bold**, and [n] citations.
function Answer({ text, sources }: { text: string; sources: Source[] }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const item = /^\s*[-*]\s+/.test(line);
    if (!line.trim()) { blocks.push({ list: false, lines: [] }); continue; }
    const last = blocks.at(-1);
    if (last && last.list === item && (item || last.lines.length)) last.lines.push(line.replace(/^\s*[-*]\s+/, ""));
    else blocks.push({ list: item, lines: [line.replace(/^\s*[-*]\s+/, "")] });
  }
  return (
    <div className="buddy-answer">
      {blocks.filter((b) => b.lines.length).map((b, i) => (b.list
        ? <ul key={i}>{b.lines.map((l, j) => <li key={j}><Inline text={l} sources={sources} /></li>)}</ul>
        : <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && " "}<Inline text={l} sources={sources} /></Fragment>)}</p>))}
    </div>
  );
}

function Inline({ text, sources }: { text: string; sources: Source[] }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\[\d+(?:,\s*\d+)*\])/).map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={i}><Inline text={part.slice(2, -2)} sources={sources} /></b>;
        const cite = part.match(/^\[(\d+(?:,\s*\d+)*)\]$/);
        if (!cite) return <Fragment key={i}>{part}</Fragment>;
        return (
          <span key={i} className="cites">
            {cite[1].split(/,\s*/).map((n) => {
              const s = sources.find((x) => x.n === Number(n));
              return s
                ? <Link key={n} href={`/preview/org/${s.ein}`} scroll={false} className="cite-n" title={`${s.name} · ${s.place}${s.filing ? ` · ${s.filing}` : ""}`}>{n}</Link>
                : <span key={n} className="cite-n">{n}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}

// The organizations the answer cites, in order, with the filing each claim comes from.
function Cited({ text, sources }: { text: string; sources: Source[] }) {
  const used = [...new Set([...text.matchAll(/\[(\d+(?:,\s*\d+)*)\]/g)].flatMap((m) => m[1].split(/,\s*/).map(Number)))].sort((a, b) => a - b);
  const list = used.map((n) => sources.find((s) => s.n === n)).filter((s): s is Source => Boolean(s));
  if (!list.length) return null;
  return (
    <ol className="buddy-sources">
      {list.map((s) => (
        <li key={s.n}>
          <span className="cite-n">{s.n}</span>
          <Link href={`/preview/org/${s.ein}`} scroll={false}>{s.name}</Link>
          <span>{s.place}{s.filing ? ` · ${s.filing}` : " · IRS master file only"}</span>
        </li>
      ))}
    </ol>
  );
}
