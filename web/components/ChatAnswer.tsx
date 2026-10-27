"use client";
import { useState } from "react";
import type { Answer } from "@/lib/answer";
import { AnswerMethod } from "./AnswerCard";
import { AnswerSteps } from "./AnswerSteps";
import { AnswerOrgs } from "./AnswerOrgs";
import { AnswerHealth, AnswerHealthOrgs } from "./AnswerHealth";
import { AnswerWho } from "./AnswerWho";
import { InsightChart } from "./InsightChart";
import { SlideButton } from "./SlideButton";

// One research answer in the chat (/research/ask), ChatGPT style: plain content on the page, no card.
// A bold answer sentence, the key numbers as one inline row, the chart, short bullets, what the data
// leaves out, "Show the steps" (the evidence chain, collapsed), then a quiet row of icon actions (copy, CSV,
// slide, how we got this, the organizations).

const parts = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((t, k) => (k % 2 ? <b key={k}>{t}</b> : t));
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");
const slug = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "answer";

const Icon = ({ d }: { d: React.ReactNode }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;

export function ChatAnswer({ a }: { a: Answer }) {
  const [method, setMethod] = useState(false);
  const [copied, setCopied] = useState(false);
  const none = a.status === "unanswerable";
  const copy = async () => {
    const text = [a.headline, a.numbers.map((n) => `${n.value} ${n.label}`).join(" · "), ...a.bullets.map((b) => `- ${plain(b)}`), ...(a.recency ? [a.recency.note] : []), "", `Source: NomBot (public IRS filings), ${location.href}`].join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const csv = async () => {
    const { toCsv, download } = await import("@/lib/insightMeta");
    download(`nombot-answer-${slug(a.question)}.csv`, toCsv(a.rows), "text/csv");
  };
  const slide = () => ({
    kicker: `${a.question} · NomBot research answer`, headline: a.headline,
    numbers: a.numbers.slice(0, 3).map((n) => ({ value: n.value, label: n.label })),
    chart: a.chart && { spec: a.chart.spec, caption: a.chart.title, sub: a.chart.sub },
    bullets: a.bullets.slice(0, 2), link: location.href, file: `nombot-${slug(a.question)}-slide`,
  });
  return (
    <div className="chat-answer">
      {/* Focal point: the first key number, big; the headline under it; the other numbers as smaller figures. */}
      {a.numbers.length > 0 && (
        <p className="chat-nums" aria-label="Key numbers">
          {a.numbers.map((n) => <span key={n.label} title={n.note}><b>{n.value}</b> {n.label}</span>)}
        </p>
      )}
      <p className="chat-lead">{a.headline}</p>
      {a.chart && (
        <figure className="chat-chart">
          <figcaption>{a.chart.title}<span>{a.chart.sub}</span></figcaption>
          <InsightChart spec={a.chart.spec} label={`${a.chart.title}. ${a.headline}`} />
        </figure>
      )}
      {/* Method notes (match basis, data years, number notes) folded under one quiet line */}
      {!none && (a.basis || a.recency || a.numbers.some((n) => n.note)) && (
        <details className="more-info">
          <summary>Details</summary>
          {a.basis && <p className="chat-basis">{a.basis === "codes" ? "Based on IRS category codes, not a checked label." : "Based on keyword matches, not a checked label."} Treat totals as approximate.</p>}
          {a.recency && <p className="chat-basis chat-recency">{a.recency.note}</p>}
          {a.numbers.filter((n) => n.note).map((n) => <p key={n.label} className="chat-basis">{n.value} {n.label}: {n.note}</p>)}
        </details>
      )}
      {a.bullets.length > 0 && <ul className="chat-bullets">{a.bullets.map((p) => <li key={p}>{parts(p)}</li>)}</ul>}
      {a.orgs && !none && <AnswerOrgs orgs={a.orgs} />}
      {a.health && !none && <AnswerHealth h={a.health} />}
      {a.healthOrgs && !none && <AnswerHealthOrgs orgs={a.healthOrgs} />}
      {a.who && !none && <AnswerWho who={a.who} />}
      {a.missing.map((m) => (
        <p key={m.what} className="chat-missing"><b>{none ? "Why we can't answer this:" : `Not included, ${m.what.toLowerCase()}:`}</b> {m.why} {m.url ? <>Try <a href={m.url} target="_blank" rel="noreferrer">{m.source}</a>.</> : null}</p>
      ))}
      {!none && <AnswerSteps a={a} />}
      {!none && (
        <div className="chat-actions" role="toolbar" aria-label="Answer actions">
          <button type="button" className="chat-act" onClick={copy} title={copied ? "Copied" : "Copy answer"} aria-label="Copy answer">
            {copied ? <Icon d={<path d="M5 12.5l4.5 4.5L19 7.5" />} /> : <Icon d={<><rect x="8.5" y="8.5" width="11" height="11" rx="2.2" /><path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8" /></>} />}
            <span className="chat-act-l">{copied ? "Copied" : "Copy"}</span>
          </button>
          {a.rows.length > 0 && (
            <button type="button" className="chat-act" onClick={csv} title="Download data (CSV)" aria-label="Download data as CSV">
              <Icon d={<><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M5 19.5h14" /></>} />
              <span className="chat-act-l">CSV</span>
            </button>
          )}
          <SlideButton icon data={slide} label="Export slide" />
          <button type="button" className={`chat-act${method ? " on" : ""}`} onClick={() => setMethod(!method)} title="How we got this" aria-label="How we got this" aria-expanded={method}>
            <Icon d={<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.9" r=".6" fill="currentColor" /></>} />
            <span className="chat-act-l">Sources</span>
          </button>
        </div>
      )}
      {method && <AnswerMethod a={a} />}
    </div>
  );
}
