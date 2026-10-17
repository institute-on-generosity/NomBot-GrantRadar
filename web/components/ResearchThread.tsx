"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Answer } from "./CitedAnswer";

const href = (q: string, fs: string[]) => {
  const p = new URLSearchParams({ q });
  for (const f of fs) p.append("f", f);
  return `/research/ask?${p}`;
};

// The thread's follow-up box: a text field and up to 3 suggested follow-ups (answerable, from the last
// answer's spec). Each follow-up is added to the URL (?q=…&f=…), so a link reproduces the whole thread.
export function FollowUpBox({ q, fs, chips, max }: { q: string; fs: string[]; chips: string[]; max: number }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [asked, setAsked] = useState<string | null>(null);
  const go = (t: string) => {
    const v = t.trim();
    if (!v || pending) return;
    setAsked(v);
    start(() => router.push(href(q, [...fs, v]), { scroll: false }));
  };
  // Keyed by the thread URL on the page, so it remounts (empty) once the new turn lands.
  if (fs.length >= max) return <p className="fu-note">This thread is at its limit. Start a new question above.</p>;
  return (
    <div className="fu">
      {pending && asked && <div className="fu-pending"><p className="turn-q">{asked}</p><p className="ov-wait"><span className="spinner" />Working out the answer…</p></div>}
      {chips.length > 0 && !pending && (
        <div className="fu-chips" aria-label="Suggested follow-ups">
          {chips.map((c) => <button key={c} type="button" className="chip link" onClick={() => go(c)}>{c}</button>)}
        </div>
      )}
      <form className="buddy-form fu-form" onSubmit={(e) => { e.preventDefault(); go(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={pending} placeholder="Ask a follow-up…" aria-label="Ask a follow-up" maxLength={300} />
        <button type="submit" disabled={pending || !text.trim()} aria-label="Ask">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </form>
    </div>
  );
}

// A "why / what does it mean" follow-up: a short answer streamed from the numbers in the thread.
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
    <section className="answer fu-text" aria-label="Interpretation">
      <p className="answer-kicker">Interpretation · AI-written from the numbers above</p>
      {!text && !error && <p className="ov-wait"><span className="spinner" />Reading the answers…</p>}
      {text && <Answer text={text} cite={() => undefined} />}
      {error && <p className="notice">{error}</p>}
      {done && !error && <p className="answer-ms">Claude, from this thread&apos;s numbers only. Points marked general knowledge are not from the data.</p>}
    </section>
  );
}

// Scroll the newest turn into view after a follow-up is added.
export function ScrollToTurn({ id }: { id: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [id]);
  return null;
}
