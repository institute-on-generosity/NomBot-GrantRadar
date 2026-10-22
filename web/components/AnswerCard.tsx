"use client";
import { useState } from "react";
import type { Answer } from "@/lib/answer";
import { InsightChart } from "./InsightChart";
import { SlideButton } from "./SlideButton";
import { AnswerSteps } from "./AnswerSteps";
import { AnswerOrgs } from "./AnswerOrgs";
import { AnswerWho } from "./AnswerWho";
import { AnswerHealth, AnswerHealthOrgs } from "./AnswerHealth";

// A research answer at the top of the results (lib/answer.ts): the headline, key numbers, one chart,
// 2-3 bullets, what our data can't answer and where to find it, then "How we got this" (cause set,
// method, caveats, coverage, every SQL query, sources). Export slide and CSV like Research findings.

const parts = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((t, k) => (k % 2 ? <b key={k}>{t}</b> : t));

export function AnswerCard({ a }: { a: Answer }) {
  const [open, setOpen] = useState(false);
  const slide = () => ({
    kicker: `${a.question} · NomBot research answer`,
    headline: a.headline,
    numbers: a.numbers.slice(0, 3).map((n) => ({ value: n.value, label: n.label })),
    chart: a.chart && { spec: a.chart.spec, caption: a.chart.title, sub: a.chart.sub },
    bullets: a.bullets.slice(0, 2),
    link: location.href,
    file: `nombot-${a.question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "answer"}-slide`,
  });
  const csv = async () => {
    const { toCsv, download } = await import("@/lib/insightMeta");
    download(`nombot-answer-${a.question.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.csv`, toCsv(a.rows), "text/csv");
  };
  const none = a.status === "unanswerable";
  return (
    <section className={`answer${none ? " none" : ""}`} aria-label="Research answer">
      <p className="answer-kicker">{none ? "Not in our data" : a.status === "partial" ? "Research answer · partly answerable" : "Research answer"}</p>
      <h2 className="answer-head">{a.headline}</h2>
      {a.numbers.length > 0 && (
        <div className="ovv-tiles answer-tiles" aria-label="Key numbers">
          {a.numbers.map((n) => (
            <div key={n.label} className="ovv-tile" title={n.note}>
              <b>{n.value}</b><span>{n.label}</span>{n.note && <small>{n.note}</small>}
            </div>
          ))}
        </div>
      )}
      {a.chart && (
        <figure className="ovv-chart answer-chart">
          <figcaption><b>{a.chart.title}</b><span>{a.chart.sub}</span></figcaption>
          <InsightChart spec={a.chart.spec} label={`${a.chart.title}. ${a.headline}`} />
        </figure>
      )}
      {a.basis && !none && <p className="chat-basis">{a.basis === "codes" ? "Based on IRS category codes, not a checked label." : "Based on keyword matches, not a checked label."} Treat totals as approximate.</p>}
      {a.recency && !none && <p className="chat-basis chat-recency">{a.recency.note}</p>}
      {a.bullets.length > 0 && <ul className="ins-points">{a.bullets.map((p) => <li key={p}>{parts(p)}</li>)}</ul>}
      {a.orgs && !none && <AnswerOrgs orgs={a.orgs} />}
      {a.who && !none && <AnswerWho who={a.who} />}
      {a.health && !none && <AnswerHealth h={a.health} />}
      {a.healthOrgs && !none && <AnswerHealthOrgs orgs={a.healthOrgs} />}
      {a.missing.length > 0 && (
        <div className="answer-missing">
          <b>{none ? "Why we can't answer this" : "What this leaves out"}</b>
          <ul>
            {a.missing.map((m) => (
              <li key={m.what}><b>{m.what}:</b> {m.why} {m.url ? <>Try <a href={m.url} target="_blank" rel="noreferrer">{m.source}</a>.</> : m.source !== "Not in our data" ? <>Try {m.source}.</> : null}</li>
            ))}
          </ul>
        </div>
      )}
      {!none && (
        <>
          <AnswerSteps a={a} />
          <div className="answer-foot">
            <button type="button" className="ins-method-btn" aria-expanded={open} onClick={() => setOpen(!open)}>How we got this</button>
            <span className="answer-actions">
              {a.rows.length > 0 && <button type="button" className="ins-link" onClick={csv}>CSV</button>}
              <SlideButton data={slide} />
            </span>
          </div>
          {open && <AnswerMethod a={a} />}
        </>
      )}
    </section>
  );
}

// "How we got this": what counts, method, caveats, coverage, sources and every SQL query.
export function AnswerMethod({ a }: { a: Answer }) {
  return (
    <div className="ins-method answer-method">
      <p><b>What counts:</b> {a.causeNote}</p>
      <p><b>Method:</b> {a.method}</p>
      {a.caveats.length > 0 && <><p><b>Caveats</b></p><ul>{a.caveats.map((c) => <li key={c}>{c}</li>)}</ul></>}
      {a.coverage.length > 0 && <p><b>Coverage:</b> {a.coverage.map((c) => `${c.label}: ${c.value}`).join(" · ")}</p>}
      <p><b>Sources:</b> {a.sources.map((s, i) => <span key={s.label}>{i ? " · " : ""}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}</p>
      {a.queries.map((q) => (
        <div key={q.title + q.sql.length}>
          <p className="answer-q">{q.title}</p>
          <pre><code>{q.sql}</code></pre>
        </div>
      ))}
      <p className="answer-ms">Computed in {(a.ms / 1000).toFixed(1)} s from the NomBot database · numbers are templates over query results, not AI-written</p>
    </div>
  );
}

export function AnswerSkeleton() {
  return (
    <section className="answer loading-ov" aria-label="Research answer loading">
      <p className="answer-kicker">Research answer</p>
      <p className="ov-wait"><span className="spinner" />Working out the numbers…</p>
      <div className="ov-lines" aria-hidden><i /><i className="short" /></div>
    </section>
  );
}
