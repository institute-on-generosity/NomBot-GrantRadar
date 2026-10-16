"use client";
import { useMemo, useRef, useState } from "react";
import type { View } from "vega";
import { InsightChart, exportChart } from "./InsightChart";
import { Answer } from "./CitedAnswer";
import { useStoredList } from "./useStored";
import { askSuggestions, citation, download, toCsv, type Insight, type Row } from "@/lib/insightMeta";
import { REPORT_EVENT, REPORT_KEY, toggleReport } from "@/lib/report";

// Client parts of a research finding's page (app/research/[slug]): save and cite, the large chart,
// the sortable data table and the chat scoped to this one finding.

const SaveIcon = ({ on }: { on: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden><path d="M6 3h12v18l-6-4.5L6 21Z" /></svg>
);

// Cite: copies a citation and shows it in a small card (selectable, in case the clipboard is blocked).
export function FindingActions({ i }: { i: Insight }) {
  const report = useStoredList<Insight>(REPORT_KEY, REPORT_EVENT);
  const saved = report.some((x) => x.slug === i.slug);
  const [cite, setCite] = useState<{ text: string; copied: boolean } | null>(null);
  const copy = async (text: string) => {
    let copied = true;
    try { await navigator.clipboard.writeText(text); } catch { copied = false; }
    setCite({ text, copied });
  };
  return (
    <span className="rd-actions">
      <button type="button" className={`ins-btn${cite ? " on" : ""}`} aria-expanded={Boolean(cite)} onClick={() => (cite ? setCite(null) : copy(citation(i, location.origin)))} title="Copy a citation for this finding">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 7h3v5H6v-1a4 4 0 0 1 1-3" /><path d="M15 7h3v5h-4v-1a4 4 0 0 1 1-3" /></svg>
        Cite
      </button>
      <button type="button" className={`ins-btn save${saved ? " on" : ""}`} aria-pressed={saved} onClick={() => toggleReport(i)} title="Save to your report">
        <SaveIcon on={saved} />{saved ? "Saved" : "Save"}
      </button>
      {cite && (
        <span className="rd-cite" role="dialog" aria-label="Citation">
          <span className="rd-cite-text">{cite.text}</span>
          <span className="rd-cite-foot">
            <span aria-live="polite">{cite.copied ? "Copied to clipboard" : "Select the text to copy it"}</span>
            {!cite.copied && <button type="button" className="ins-link" onClick={() => copy(cite.text)}>Copy</button>}
            <button type="button" className="ins-link" onClick={() => setCite(null)}>Close</button>
          </span>
        </span>
      )}
    </span>
  );
}

export function FindingChart({ i }: { i: Insight }) {
  const [view, setView] = useState<View | null>(null);
  const file = async (kind: "png" | "svg") => {
    if (!view) return;
    const a = document.createElement("a");
    a.href = await exportChart(view, kind);
    a.download = `${i.slug}.${kind}`;
    a.click();
  };
  return (
    <figure className="rd-figure">
      {i.chart && <InsightChart spec={i.chart} label={i.headline} onView={setView} tall />}
      <figcaption className="rd-figbar">
        <span>Chart</span>
        <span className="ins-quiet">
          <button type="button" className="ins-link" disabled={!view} onClick={() => file("png")}>PNG</button>
          <button type="button" className="ins-link" disabled={!view} onClick={() => file("svg")}>SVG</button>
        </span>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- data table

type Kind = "pct" | "money" | "id" | "num" | "text";
const ID = /^(id|ein|recipient_ein|funder_ein|county_fips|fips|zip|code|year|tax_year|state)$/i;
const PCT = /share|rate|pct|percent|ratio|growth|change|audited|policy|exceed|majority|thin|deficit|ties|insiders|independent|under_|_cash$/i;
const MONEY = /amount|revenue|dollars|assets|per_resident|expenses|^net$|^given$|^received$|^to_|from_out_of_state|grants_\d|capped_\d/i;

function kindOf(col: string, rows: Row[]): Kind {
  const vals = rows.map((r) => r[col]).filter((v) => v != null && v !== "");
  if (!vals.length || vals.some((v) => typeof v !== "number")) return "text";
  if (ID.test(col)) return "id";
  if (PCT.test(col) && vals.every((v) => Math.abs(v as number) <= 5) && vals.some((v) => !Number.isInteger(v))) return "pct";
  if (MONEY.test(col)) return "money";
  return "num";
}

const nf = (d: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d });
function fmt(v: Row[string], k: Kind): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v !== "number") return String(v);
  if (k === "id") return String(v);
  if (k === "pct") return `${nf(Math.abs(v) < 0.1 ? 1 : 0).format(v * 100)}%`;
  if (k === "money") {
    const a = Math.abs(v), sign = v < 0 ? "−" : "";
    if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e4) return `${sign}$${Math.round(a / 1e3)}K`;
    return `${sign}$${nf(a < 100 ? 2 : 0).format(a)}`;
  }
  return nf(Math.abs(v) < 10 ? 2 : 0).format(v);
}

const UPPER: Record<string, string> = { ein: "EIN", id: "ID", fips: "FIPS", ntee: "NTEE", pf: "PF", usd: "USD", dc: "DC" };
const header = (c: string) => c.replace(/(\d{4})_(\d{2})\b/, "$1–$2").split("_").map((w, n) => UPPER[w.toLowerCase()] ?? (n ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

export function DataTable({ rows, slug }: { rows: Row[]; slug: string }) {
  const cols = useMemo(() => [...new Set(rows.flatMap((r) => Object.keys(r)))], [rows]);
  const kinds = useMemo(() => Object.fromEntries(cols.map((c) => [c, kindOf(c, rows)])), [cols, rows]);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { col, dir } = sort;
    return [...rows].sort((a, b) => {
      const x = a[col], y = b[col];
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true })) * dir;
    });
  }, [rows, sort]);
  const click = (col: string) => {
    const numeric = kinds[col] !== "text" && kinds[col] !== "id";
    setSort((s) => (s?.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: numeric ? -1 : 1 }));
  };
  return (
    <>
      <div className="rd-sec-head">
        <h2>Data <span className="rd-count">{rows.length.toLocaleString("en-US")} rows</span></h2>
        <button type="button" className="ins-link" onClick={() => download(`${slug}.csv`, toCsv(rows), "text/csv")}>Download CSV</button>
      </div>
      <div className="rd-table" tabIndex={0} role="region" aria-label="Data table">
        <table>
          <thead>
            <tr>
              {cols.map((c) => {
                const on = sort?.col === c;
                return (
                  <th key={c} className={kinds[c] === "text" || kinds[c] === "id" ? undefined : "n"} aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => click(c)}>
                      {header(c)}<span aria-hidden className={`rd-sort${on ? " on" : ""}`}>{on && sort!.dir === 1 ? "↑" : "↓"}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, k) => (
              <tr key={k}>
                {cols.map((c) => <td key={c} className={kinds[c] === "text" || kinds[c] === "id" ? undefined : "n"}>{fmt(r[c], kinds[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rd-note">Select a column to sort. The CSV has the exact values.</p>
    </>
  );
}

// ---------------------------------------------------------------- ask about this finding

type Turn = { ask: string; answer: string; status: "waiting" | "answering" | "done" | "error"; error?: string };

export function AskFinding({ slug, section }: { slug: string; section: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const busy = turns.at(-1)?.status === "waiting" || turns.at(-1)?.status === "answering";
  const update = (patch: (t: Turn) => Partial<Turn>) => setTurns((ts) => ts.map((t, n) => (n === ts.length - 1 ? { ...t, ...patch(t) } : t)));

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    const history = turns.filter((t) => t.status === "done").slice(-6).flatMap((t) => [{ role: "user" as const, content: t.ask }, { role: "assistant" as const, content: t.answer }]);
    setDraft("");
    setTurns((ts) => [...ts, { ask: text, answer: "", status: "waiting" }]);
    try {
      const res = await fetch(`/api/research/${slug}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ask: text, history }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "Asking is unavailable right now.");
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
          if (e.type === "text") update((t) => ({ answer: t.answer + e.text, status: "answering" }));
          else if (e.type === "error") update(() => ({ status: "error", error: e.message }));
        }
      }
      update((t) => (t.status === "error" ? {} : { status: "done" }));
    } catch (err) {
      update(() => ({ status: "error", error: (err as Error).message }));
    }
    input.current?.focus();
  }

  return (
    <div className="rd-ask">
      <h2><span aria-hidden className="ins-spark">✦</span> Ask about this finding</h2>
      <p className="rd-note">Answers come from this finding&apos;s data. Anything from general knowledge is marked.</p>
      {turns.map((t, n) => (
        <div key={n} className="buddy-turn">
          <p className="buddy-ask">{t.ask}</p>
          {t.status === "waiting" && <p className="buddy-wait"><span className="spinner" aria-hidden /> Reading the data…</p>}
          {t.answer && <Answer text={t.answer} cite={() => null} />}
          {t.status === "error" && <p className="rd-error">{t.error}</p>}
        </div>
      ))}
      {!turns.length && (
        <div className="rd-suggest">
          {askSuggestions(section).map((s) => <button key={s} type="button" className="chip" onClick={() => ask(s)}>{s}</button>)}
        </div>
      )}
      <form className="buddy-form rd-ask-form" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
        <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask a question about this data" aria-label="Ask about this finding" maxLength={1000} />
        <button type="submit" disabled={busy || !draft.trim()} aria-label="Ask">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </form>
    </div>
  );
}
