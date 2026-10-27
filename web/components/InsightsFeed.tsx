"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { View } from "vega";
import { NavLink } from "./NavLink";
import { AskedQuestions } from "./AskedQuestions";
import { InsightChart, exportChart } from "./InsightChart";
import { InsightPoints } from "./InsightPoints";
import { SlideButton } from "./SlideButton";
import { useStoredList } from "./useStored";
import { download, findingSlide, reportMarkdown, researchHref, sectionLabel, SECTIONS, toCsv, updated, type Insight } from "@/lib/insightMeta";
import { clearReport, removeFromReport, REPORT_EVENT, REPORT_KEY, toggleReport } from "@/lib/report";
import { LOADED_STATES } from "@/lib/filters";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; ready: boolean; insights: Insight[] };

// The Research feed: verified findings from the IRS data, each a chart with its method, SQL and sources.
// Used on the home page (Research tab) and at /research; "Open research" goes to the finding's own page. Filters by section and state; cards can be
// saved to a per-browser report and exported as one Markdown file.
export function InsightsFeed() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [section, setSection] = useState<string>("all");
  const [state, setState] = useState("");
  const [showReport, setShowReport] = useState(false);
  const report = useStoredList<Insight>(REPORT_KEY, REPORT_EVENT);

  useEffect(() => {
    let live = true;
    fetch("/api/insights")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Research is unavailable right now."); return j; })
      .then((j) => live && setLoad({ status: "ok", ready: j.ready, insights: j.insights }))
      .catch((e) => live && setLoad({ status: "error", message: (e as Error).message }));
    return () => { live = false; };
  }, []);

  const all = useMemo(() => (load.status === "ok" ? load.insights : []), [load]);
  const states = useMemo(() => [...new Set(all.map((i) => i.state).filter(Boolean) as string[])].sort(), [all]);
  const counts = useMemo(() => Object.fromEntries(SECTIONS.map((s) => [s.key, all.filter((i) => i.section === s.key && (!state || i.state === state)).length])), [all, state]);
  const shown = all.filter((i) => (section === "all" || i.section === section) && (!state || i.state === state));
  const saved = new Set(report.map((i) => i.slug));
  const total = all.filter((i) => !state || i.state === state).length;
  const latest = all.map((i) => updated(i)).find(Boolean);

  return (
    <section className="ins-feed" aria-label="Research">
      <AskedQuestions />
      <h2 className="ins-h">Findings</h2>
      <div className="ins-bar">
        <div className="ins-chips" role="toolbar" aria-label="Sections">
          <button type="button" className={section === "all" ? "on" : undefined} aria-pressed={section === "all"} onClick={() => setSection("all")}>All{load.status === "ok" && <span>{total}</span>}</button>
          {SECTIONS.map((s) => (
            <button key={s.key} type="button" className={section === s.key ? "on" : undefined} aria-pressed={section === s.key}
              disabled={load.status === "ok" && !counts[s.key] && section !== s.key} onClick={() => setSection(s.key)}>
              {s.label}{load.status === "ok" && counts[s.key] > 0 && <span>{counts[s.key]}</span>}
            </button>
          ))}
        </div>
        <div className="ins-tools">
          {states.length > 0 && (
            <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
              <option value="">All states</option>
              {states.map((s) => <option key={s} value={s}>{LOADED_STATES.find(([c]) => c === s)?.[1] ?? s}</option>)}
            </select>
          )}
          <button type="button" className={`ins-report-btn${showReport ? " on" : ""}`} aria-expanded={showReport} onClick={() => setShowReport(!showReport)}>
            Report <span>{report.length}</span>
          </button>
        </div>
      </div>

      {/* Saved copies can be stale after a miner re-run: show and export the live version of each finding */}
      {showReport && <ReportView items={report.map((r) => all.find((i) => i.slug === r.slug) ?? r)} onClose={() => setShowReport(false)} />}

      {load.status === "loading" && <FeedSkeleton />}
      {load.status === "error" && <p className="ins-empty">{load.message}</p>}
      {load.status === "ok" && !all.length && (
        <p className="ins-empty">{load.ready ? "No verified findings yet. Check back soon." : "Research findings are being prepared. Check back soon."}</p>
      )}
      {load.status === "ok" && all.length > 0 && !shown.length && <p className="ins-empty">No findings match these filters.</p>}
      {load.status === "ok" && shown.length > 0 && latest && <p className="ins-meta">Updated {latest}</p>}
      {/* One featured finding (full card), the rest as a compact list: the number, then one line (Oct 27) */}
      <div className="ins-list">
        {shown.slice(0, 1).map((i) => <InsightCard key={i.slug} i={i} saved={saved.has(i.slug)} lead />)}
      </div>
      {shown.length > 1 && (() => {
        const row = (i: Insight) => {
          const num = /\$?\d[\d,.]*\s?(?:%|[KMB]\b|billion|million|x\b)?/.exec(i.headline)?.[0];
          return (
            <li key={i.slug}>
              <NavLink href={researchHref(i.slug)} className="ins-row" label="Opening the finding…" title={i.summary}>
                <b>{num ?? ""}</b><span>{i.headline}</span>
              </NavLink>
            </li>
          );
        };
        const rest = shown.slice(1);
        return (
          <>
            <ol className="ins-compact">{rest.slice(0, 4).map(row)}</ol>
            {rest.length > 4 && (
              <details className="more-info ins-more-list">
                <summary><span className="when-closed">Show {rest.length - 4} more findings</span><span className="when-open">Show fewer findings</span></summary>
                <ol className="ins-compact">{rest.slice(4).map(row)}</ol>
              </details>
            )}
          </>
        );
      })()}
    </section>
  );
}

function InsightCard({ i, saved, lead = false }: { i: Insight; saved: boolean; lead?: boolean }) {
  const [view, setView] = useState<View | null>(null);
  const [method, setMethod] = useState(false);
  const hasMethod = Boolean(i.method || i.caveats || i.query);
  const href = researchHref(i.slug);
  const date = updated(i);
  const chartFile = async (kind: "png" | "svg") => {
    if (!view) return;
    const url = await exportChart(view, kind);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${i.slug}.${kind}`;
    a.click();
  };
  const place = i.state ? LOADED_STATES.find(([c]) => c === i.state)?.[1] ?? i.state : null;
  return (
    <article className={`ins-card${lead ? " lead" : ""}`} id={`insight-${i.slug}`} data-section={i.section}>
      <p className="ins-kicker">
        <span className="ins-sec">{lead ? "Top finding · " : ""}{sectionLabel(i.section)}</span>
        {place && <span className="ins-place">{place}</span>}
      </p>
      <h2><NavLink href={href} className="ins-title" label="Opening the finding…">{i.headline}</NavLink></h2>
      <InsightPoints i={i} />
      {i.chart && <div className="ins-figure"><InsightChart spec={i.chart} label={i.headline} onView={setView} /></div>}

      <div className="ins-actions">
        <NavLink href={href} className="ins-btn primary" label="Opening the finding…">Open research<span aria-hidden className="ins-arrow">→</span></NavLink>
        <span className="ins-quiet">
          {i.data?.length > 0 && <button type="button" className="ins-link" onClick={() => download(`${i.slug}.csv`, toCsv(i.data), "text/csv")}>CSV</button>}
          {i.chart && <>
            <button type="button" className="ins-link" disabled={!view} onClick={() => chartFile("png")}>PNG</button>
            <button type="button" className="ins-link" disabled={!view} onClick={() => chartFile("svg")}>SVG</button>
          </>}
          <SlideButton quiet label="Slide" data={() => findingSlide(i, location.origin)} />
          <button type="button" className={`ins-btn save${saved ? " on" : ""}`} aria-pressed={saved} onClick={() => toggleReport(i)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden><path d="M6 3h12v18l-6-4.5L6 21Z" /></svg>
            {saved ? "Saved" : "Save"}
          </button>
        </span>
      </div>

      <footer className="ins-foot">
        {hasMethod && (
          <button type="button" className="ins-method-btn" aria-expanded={method} aria-controls={`method-${i.slug}`} onClick={() => setMethod(!method)}>Method and SQL</button>
        )}
        {i.sources?.length > 0 && (
          <span className="ins-sources">
            {i.sources.map((s) => <a key={s.url + s.label} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}
          </span>
        )}
        {date && <span className="ins-date">{date}</span>}
      </footer>
      {hasMethod && method && (
        <div className="ins-method" id={`method-${i.slug}`}>
          {i.method && <p>{i.method}</p>}
          {i.caveats && <p><b>Caveats.</b> {i.caveats}</p>}
          {i.query && <pre><code>{i.query.trim()}</code></pre>}
        </div>
      )}
    </article>
  );
}

const noop = () => () => {};

// Saved findings, docked on the right like Research Buddy (portaled into .shell).
function ReportView({ items, onClose }: { items: Insight[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const shell = hydrated ? document.querySelector(".shell") : null;
  const exportAll = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`nombot-research-${stamp}.md`, reportMarkdown(items, location.origin), "text/markdown");
  };
  if (!shell) return null;
  return createPortal(
    <aside className="buddy-panel ins-report" aria-label="Report">
      <header className="panel-head">
        <span>Report <small className="ins-report-count">{items.length}</small></span>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Close report" title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </header>
      <div className="buddy-body">
        {!items.length && <p className="ins-report-note">Save findings to collect them here. Saved in this browser.</p>}
        {items.length > 0 && (
          <ol>
            {items.map((i) => (
              <li key={i.slug}>
                <span className="ins-report-item">
                  <NavLink href={researchHref(i.slug)} label="Opening the finding…">{i.headline}</NavLink>
                  <small>{sectionLabel(i.section)}</small>
                </span>
                <button type="button" className="iconbtn" onClick={() => removeFromReport(i.slug)} aria-label={`Remove ${i.headline}`} title="Remove">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
      {items.length > 0 && (
        <footer className="ins-report-foot">
          <div className="ins-report-actions">
            <button type="button" className="ins-btn primary" onClick={exportAll}>Export report (Markdown)</button>
            <button type="button" className="ins-btn" onClick={() => { if (confirm("Remove every saved finding?")) clearReport(); }}>Clear</button>
          </div>
          <p className="ins-report-note">Key points, method, caveats, sources and data tables for each saved finding.</p>
        </footer>
      )}
    </aside>,
    shell,
  );
}

function FeedSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1].map((k) => (
        <div key={k} className="ins-card">
          <div className="sk sk-line short" /><div className="sk sk-title" /><div className="sk sk-line" /><div className="sk ins-sk-chart" />
        </div>
      ))}
    </div>
  );
}
