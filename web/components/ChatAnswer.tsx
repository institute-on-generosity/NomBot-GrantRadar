"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
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

// controls: the latest answer's in-place settings (from the URL); older answers show none.
export function ChatAnswer({ a, controls }: { a: Answer; controls?: { corr: boolean; since: number | null } }) {
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
        <p className="chat-nums" aria-label="Key number">
          <span title={a.numbers[0].note}><b>{a.numbers[0].value}</b> {a.numbers[0].label}</span>
        </p>
      )}
      <p className="chat-lead">{a.headline}</p>
      {controls && (a.options?.corrected || a.options?.since || controls.corr || controls.since) && <AnswerSettings options={a.options ?? {}} on={controls} />}
      {a.chart && (
        <figure className="chat-chart">
          <figcaption>{a.chart.title}<span>{a.chart.sub}</span></figcaption>
          <InsightChart spec={a.chart.spec} label={`${a.chart.title}. ${a.headline}`} />
        </figure>
      )}
      {/* Org lists and one org's health are the answer itself, so they stay open */}
      {a.orgs && !none && <AnswerOrgs orgs={a.orgs} />}
      {a.health && !none && <AnswerHealth h={a.health} />}
      {a.healthOrgs && !none && <AnswerHealthOrgs orgs={a.healthOrgs} />}
      {none && a.bullets.length > 0 && <ul className="chat-bullets">{a.bullets.map((p) => <li key={p}>{parts(p)}</li>)}</ul>}
      {none && a.missing.map((m) => (
        <p key={m.what} className="chat-missing"><b>Why we can&apos;t answer this:</b> {m.why} {m.url ? <>Try <a href={m.url} target="_blank" rel="noreferrer">{m.source}</a>.</> : null}</p>
      ))}
      {/* Everything else in one Details: other numbers, bullets, who received it, caveats (⚠), data years, method, steps */}
      {!none && (
        <details className="more-info chat-details">
          <summary><span className="when-closed">Details</span><span className="when-open">Hide details</span></summary>
          {a.numbers.length > 1 && <p className="chat-nums more">{a.numbers.slice(1).map((n) => <span key={n.label} title={n.note}><b>{n.value}</b> {n.label}</span>)}</p>}
          {a.bullets.length > 0 && <ul className="chat-bullets">{a.bullets.map((p) => <li key={p}>{parts(p)}</li>)}</ul>}
          {a.who && <AnswerWho who={a.who} />}
          {a.missing.map((m) => (
            <p key={m.what} className="chat-missing chat-warn">⚠ <b>Not included, {m.what.toLowerCase()}:</b> {m.why} {m.url ? <>Try <a href={m.url} target="_blank" rel="noreferrer">{m.source}</a>.</> : null}</p>
          ))}
          {a.basis && <p className="chat-basis chat-warn">⚠ {a.basis === "codes" ? "Based on IRS category codes, not a checked label." : "Based on keyword matches, not a checked label."} Treat totals as approximate.</p>}
          {a.recency && <p className="chat-basis chat-recency">{a.recency.note}</p>}
          {a.numbers.filter((n) => n.note).map((n) => <p key={n.label} className="chat-basis">{n.value} {n.label}: {n.note}</p>)}
          <AnswerSteps a={a} />
        </details>
      )}
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

// Settings, not questions (Oct 27, Hunter): corrected categories and a start year switch the same answer in place
// (router.replace on ?corr=1 / ?since=YYYY, no chat turn, no extra history).
function AnswerSettings({ options, on }: { options: NonNullable<Answer["options"]>; on: { corr: boolean; since: number | null } }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v); else p.delete(k);
    start(() => router.replace(`${path}?${p}`, { scroll: false }));
  };
  const since = on.since ?? options.since ?? null;
  return (
    <div className={`chat-settings${pending ? " pending" : ""}`} aria-busy={pending}>
      {(options.corrected || on.corr) && (
        <span className="seg-set" role="group" aria-label="Categories">
          <span className="seg-l">Categories</span>
          <button type="button" aria-pressed={!on.corr} className={!on.corr ? "on" : undefined} onClick={() => set("corr", null)}>IRS codes</button>
          <button type="button" aria-pressed={on.corr} className={on.corr ? "on" : undefined} onClick={() => set("corr", "1")}>Corrected</button>
          <span className="seg-i" tabIndex={0} title="Fixes organizations whose IRS cause code is missing or wrong, using the cause their own filings describe (graded, about 94–98% accurate)." aria-label="About corrected categories">ⓘ</span>
        </span>
      )}
      {since && (
        <span className="seg-set" role="group" aria-label="Years">
          <span className="seg-l">Years</span>
          <button type="button" aria-pressed={!on.since} className={!on.since ? "on" : undefined} onClick={() => set("since", null)}>All</button>
          <button type="button" aria-pressed={Boolean(on.since)} className={on.since ? "on" : undefined} onClick={() => set("since", String(since))}>Since {since}</button>
        </span>
      )}
    </div>
  );
}
