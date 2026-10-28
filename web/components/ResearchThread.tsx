"use client";
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Answer } from "./CitedAnswer";

// The research chat (/research/ask), ChatGPT style. Turns are rendered on the server and passed in;
// this shell adds the pending turn (the new question as a bubble + "Working out the answer…"), the
// suggested follow-ups under the latest answer, and the composer pinned at the bottom of the column.
// Each question is added to the URL (?q=first&f=follow1…), so a link reproduces the whole thread.

const href = (q: string | null, fs: string[], next: string) => {
  if (!q) return `/research/ask?${new URLSearchParams({ q: next })}`;
  const p = new URLSearchParams({ q });
  for (const f of [...fs, next]) p.append("f", f);
  return `/research/ask?${p}`;
};

type Ctx = { ask: (t: string) => void; pending: boolean; asked: string | null };
const ChatCtx = createContext<Ctx>({ ask: () => {}, pending: false, asked: null });

// q: the thread's first question (null on a new, empty chat). fs: follow-ups so far.
export function Chat({ q, fs, max, children }: { q: string | null; fs: string[]; max: number; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asked, setAsked] = useState<string | null>(null);
  const ask = (t: string) => {
    const v = t.trim();
    if (!v || pending) return;
    setAsked(v);
    start(() => router.push(href(q, fs, v), { scroll: false }));
  };
  // Follow the conversation: the pending question while it works, then the new answer.
  useEffect(() => {
    if (pending) document.getElementById("chat-pending")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pending]);
  useEffect(() => {
    if (fs.length) document.getElementById(`turn-${fs.length}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [fs.length]);
  return (
    <ChatCtx.Provider value={{ ask, pending, asked }}>
      <div className="chat-thread">
        {children}
        {pending && asked && (
          <div className="chat-turn" id="chat-pending">
            <div className="chat-q"><p>{asked}</p></div>
            <ThinkingSteps thread={href(q, fs, asked).split("?")[1]} />
          </div>
        )}
      </div>
      <Composer key={`${q}:${fs.length}`} full={fs.length >= max} autoFocus={!q} />
    </ChatCtx.Provider>
  );
}

export function Thinking({ label }: { label: string }) {
  return <p className="chat-thinking" role="status"><span className="dots" aria-hidden><i /><i /><i /></span>{label}…</p>;
}

// While an answer is on its way (Oct 27): what is happening, in order, and the shape of the answer to come. The steps
// follow the server's real stages (/api/research/stages streams "routed" then "queried" for this thread, sharing the
// page's own cached work); only if that stream fails do they advance on a timer (the router takes about 2 s on a new
// free-text question, the query under a second to a few; known questions skip both).
const STEPS: [number, string][] = [[0, "Understanding the question"], [1800, "Querying 5.3 million foundation grants"], [4500, "Drawing the chart"]];
const STAGE_STEP: Record<string, number> = { routed: 1, queried: 2, done: 2 };

// thread: the thread's URL query (?q=…&f=…); defaults to this page's own (the first load of /research/ask)
export function ThinkingSteps({ thread }: { thread?: string }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    let timers: ReturnType<typeof setTimeout>[] = [];
    const fallback = () => { if (!timers.length) timers = STEPS.slice(1).map(([at], i) => setTimeout(() => setK((x) => Math.max(x, i + 1)), at)); };
    const qs = thread ?? location.search;
    (async () => {
      const res = await fetch(`/api/research/stages${qs.startsWith("?") ? qs : `?${qs}`}`, { signal: ac.signal });
      if (!res.ok || !res.body) throw new Error(`stages ${res.status}`);
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const l of lines) { const st = (JSON.parse(l) as { stage?: string }).stage; if (st && st in STAGE_STEP) setK((x) => Math.max(x, STAGE_STEP[st])); }
      }
    })().catch(() => { if (!ac.signal.aborted) fallback(); });
    return () => { ac.abort(); timers.forEach(clearTimeout); };
  }, [thread]);
  return (
    <div className="chat-wait">
      <p className="chat-thinking" role="status" aria-live="polite"><span className="dots" aria-hidden><i /><i /><i /></span>{STEPS[k][1]}…</p>
      <ol className="chat-steps" aria-hidden>{STEPS.map(([, l], i) => <li key={l} className={i < k ? "done" : i === k ? "now" : undefined}>{l}</li>)}</ol>
      <div className="chat-skel" aria-hidden><i className="n" /><i className="l" /><i className="c" /></div>
    </div>
  );
}

// The first load of /research/ask: React doesn't hydrate a Suspense fallback the server is still working on, so the
// steps sit beside that boundary instead (they hydrate with the page shell and follow the stage stream). Hidden once
// the thread's first turn is on the page, or when there's no question (?new=1).
export function PendingSteps() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const done = () => !new URLSearchParams(location.search).get("q") || !!document.querySelector(".chat-turn, .chat-empty");
    if (done()) { setGone(true); return; }
    const mo = new MutationObserver(() => { if (done()) { setGone(true); mo.disconnect(); } });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return gone ? null : <div className="chat-thread chat-pending-first"><ThinkingSteps /></div>;
}

// Suggested follow-ups, under the latest answer only.
export function Suggestions({ chips }: { chips: string[] }) {
  const { ask, pending } = useContext(ChatCtx);
  if (!chips.length || pending) return null;
  return (
    <div className="chat-chips" aria-label="Suggested follow-ups">
      {chips.map((c) => <button key={c} type="button" className="chip link" onClick={() => ask(c)}
        title={/corrected categories/i.test(c) ? "Some organizations carry the wrong IRS cause code. This recounts them under a corrected code, from their own filings." : undefined}>
        {c}{/corrected categories/i.test(c) && <span className="chip-info" aria-hidden> ⓘ</span>}</button>)}
    </div>
  );
}

function Composer({ full, autoFocus }: { full: boolean; autoFocus: boolean }) {
  const { ask, pending } = useContext(ChatCtx);
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) box.current?.focus(); }, [autoFocus]);
  const send = () => { if (text.trim() && !pending) ask(text); };
  return (
    <div className="chat-composer">
      {full ? <p className="chat-full">This conversation is at its limit. Start a new question.</p> : (
        <form className="chat-box" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea ref={box} rows={1} value={text} maxLength={300} disabled={pending} aria-label={autoFocus ? "Ask a research question" : "Ask a follow-up"}
            placeholder={autoFocus ? "Ask a research question" : "Ask a follow-up"} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <button type="submit" disabled={pending || !text.trim()} aria-label="Send">
            {pending ? <span className="spinner" /> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>}
          </button>
        </form>
      )}
      <p className="chat-disclaimer">NomBot answers from public IRS filings. Check important numbers.</p>
    </div>
  );
}

// A "why / what does it mean" follow-up: streamed text, from the numbers in the thread only.
export function FollowUpText({ q, fs, i }: { q: string; fs: string[]; i: number }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const key = JSON.stringify([q, fs.slice(0, i + 1)]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/research/followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, f: fs.slice(0, i + 1), i }) });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "This follow-up couldn't be answered.");
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end || !live) break;
          buf += value;
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const l of lines.filter(Boolean)) {
            const e = JSON.parse(l);
            if (e.type === "text") setText((t) => t + e.text);
            else if (e.type === "error") setError(e.message);
          }
        }
        if (live) setDone(true);
      } catch (e) { if (live) setError((e as Error).message); }
    })();
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="chat-answer chat-text" aria-label="Interpretation">
      {!text && !error && <Thinking label="Reading the answers" />}
      {text && <Answer text={text} cite={() => undefined} />}
      {error && <p className="notice">{error}</p>}
      {done && !error && <p className="chat-note">Interpretation written by AI from the numbers above. Points marked general knowledge are not from the data.</p>}
    </div>
  );
}
