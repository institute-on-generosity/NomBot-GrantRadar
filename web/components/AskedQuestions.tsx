"use client";
import { useEffect, useState } from "react";
import { NavLink } from "./NavLink";

type Q = { question: string; headline: string; asked_count: number };
const href = (q: string) => `/research/ask?${new URLSearchParams({ q })}`;

// Research questions people asked (research_questions): recent and most asked, each opening its answer.
// Sits above the findings feed; hidden until someone has asked one.
export function AskedQuestions() {
  const [data, setData] = useState<{ recent: Q[]; top: Q[] } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/research/questions").then((r) => r.json()).then((j) => live && setData(j)).catch(() => live && setData({ recent: [], top: [] }));
    return () => { live = false; };
  }, []);
  if (!data || !data.recent.length) return null;
  // Three recent questions as plain links, sentence case (Oct 27: no columns, no previews)
  const nice = (q: string) => q.charAt(0).toUpperCase() + q.slice(1);
  const seen = new Set<string>();
  const recent = data.recent.filter((q) => { const k = q.question.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
  return (
    <details className="aq more-info" aria-label="Recent questions">
      <summary><span className="when-closed">Recent questions ({recent.length})</span><span className="when-open">Hide recent questions</span></summary>
      <ul>
        {recent.map((q) => <li key={q.question} title={q.headline}><NavLink href={href(q.question)} label="Opening the answer…">{nice(q.question)}</NavLink></li>)}
      </ul>
    </details>
  );
}
