"use client";
import { useState } from "react";
import Link from "next/link";
import type { Answer } from "@/lib/answer";

// "Show the steps" under a research answer (lib/answerSteps): a numbered chain, collapsed by default. Each step is
// one line with its numbers, a chevron opens its details (per-year totals, the biggest recipients and funders with
// links, the arithmetic, the checks, the SQL). On paper every step prints open.

// **bold** and [name](/org/ein) in step text.
function rich(s: string) {
  return s.split(/(\*\*.+?\*\*|\[[^\]]+\]\(\/org\/\d{9}\))/g).map((t, k) => {
    const bold = /^\*\*(.+)\*\*$/.exec(t);
    if (bold) return <b key={k}>{bold[1]}</b>;
    const link = /^\[([^\]]+)\]\((\/org\/\d{9})\)$/.exec(t);
    if (link) return <Link key={k} href={link[2]}>{link[1]}</Link>;
    return t;
  });
}

export function AnswerSteps({ a }: { a: Answer }) {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const steps = a.steps ?? [];
  if (!steps.length) return null;
  const flip = (n: number) => setOpen((o) => { const x = new Set(o); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  return (
    <div className={`steps${show ? " on" : ""}`}>
      <button type="button" className="steps-btn" aria-expanded={show} onClick={() => setShow(!show)}>
        {show ? "Hide the steps" : "Show the steps"}<span className="steps-count">{steps.length}</span>
      </button>
      <ol className="steps-list" aria-label="How we got this answer, step by step">
        {steps.map((st) => {
          const isOpen = open.has(st.n);
          const has = st.details.length > 0 || (st.key === "reproduce" && a.queries.length > 0);
          return (
            <li key={st.n} className={`step${isOpen ? " open" : ""}`}>
              <button type="button" className="step-head" aria-expanded={isOpen} disabled={!has} onClick={() => flip(st.n)}>
                <span className="step-n">{st.n}</span>
                <span className="step-text"><b>{st.title}.</b> {rich(st.line)}</span>
                {has && <svg className="step-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>}
              </button>
              {has && (
                <div className="step-body">
                  {st.key === "reproduce"
                    ? a.queries.map((q, k) => (
                      <div key={q.title + k}>
                        <p className="answer-q">{k + 1}. {q.title}</p>
                        <pre><code>{q.sql}</code></pre>
                      </div>
                    ))
                    : <ul>{st.details.map((d, k) => <li key={k}>{rich(d)}</li>)}</ul>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
