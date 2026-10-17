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
  if (!data || (!data.recent.length && !data.top.length)) return null;
  const top = data.top.filter((q) => q.asked_count > 1);
  const list = (title: string, qs: Q[], count = false) => qs.length > 0 && (
    <div className="aq-col">
      <h3>{title}</h3>
      <ul>
        {qs.map((q) => (
          <li key={q.question}>
            <NavLink href={href(q.question)} label="Opening the answer…">{q.question}</NavLink>
            <span>{q.headline}{count ? ` · asked ${q.asked_count} times` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section className="aq" aria-label="Asked questions">
      <h2>Asked questions</h2>
      <div className="aq-cols">
        {list("Recent", data.recent)}
        {list("Most asked", top, true)}
      </div>
    </section>
  );
}
