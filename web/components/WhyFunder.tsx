"use client";
import { useEffect, useState } from "react";
import { Answer } from "./CitedAnswer";
import { Spark } from "./icons";
import { titleCase } from "./text";

type Source = { n: number; recipient: string; ein: string | null; place: string; amount: number | null; purpose: string | null; like: boolean };
type State = { status: "thinking" | "answering" | "done" | "error"; thinking: string; answer: string; sources: Source[]; error?: string };

const money = (n: number | null) => (n == null ? "amount not given" : `$${n.toLocaleString("en-US")}`);

// "Why this funder?": streams Claude's explanation, citing the foundation's own grants as [n].
export function WhyFunder({ ein, mission, state }: { ein: string; mission: string; state: string }) {
  const [s, setS] = useState<State>({ status: "thinking", thinking: "", answer: "", sources: [] });

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/grants/why", {
          method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mission, ein, filters: state ? { state } : {} }),
        });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "The explanation isn't available right now.");
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
            setS((p) => e.type === "sources" ? { ...p, sources: e.sources }
              : e.type === "thinking" ? { ...p, thinking: p.thinking + e.text }
              : e.type === "text" ? { ...p, status: "answering", answer: p.answer + e.text }
              : e.type === "error" ? { ...p, status: "error", error: e.message } : p);
          }
        }
        setS((p) => (p.status === "error" ? p : { ...p, status: "done" }));
      } catch (err) {
        if (!ctl.signal.aborted) setS((p) => ({ ...p, status: "error", error: (err as Error).message }));
      }
    })();
    return () => ctl.abort();
  }, [ein, mission, state]);

  const cite = (n: number) => {
    const x = s.sources.find((y) => y.n === n);
    return x && { title: `${titleCase(x.recipient)} · ${x.place} · ${money(x.amount)}${x.purpose ? ` · ${x.purpose.toLowerCase()}` : ""}`, href: x.ein ? `/preview/org/${x.ein}` : undefined };
  };

  return (
    <section className={`why${s.status === "done" ? " done" : ""}`} aria-live="polite">
      <h2><span className="why-mark"><Spark size={16} /></span>Why this funder</h2>
      {s.thinking && (
        <details className="buddy-thinking">
          <summary>How I reasoned</summary>
          <p>{s.thinking}</p>
        </details>
      )}
      {s.status === "thinking" && <p className="buddy-wait"><span className="spinner" />Reading grants…</p>}
      {s.answer && <Answer text={s.answer} cite={cite} />}
      {s.status === "error" && <p className="notice">{s.error}</p>}
    </section>
  );
}
