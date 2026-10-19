"use client";
import { useEffect, useMemo, useState } from "react";
import type { CallFacets, CallRow, CallSummary } from "@/lib/admin";
import { fmtCallTime } from "@/lib/callTime";
import s from "./admin.module.css";

// The /admin "API calls" tab: every keyed /api/v1 and /mcp call, newest first (lib/apiLog.ts writes them,
// /api/admin/calls reads them). Filters, paging, live tail every 5 s, CSV of the filtered view.
type Data = { rows: CallRow[]; total: number; page: number; size: number; summary: CallSummary; facets: CallFacets; fetchedAt: number; qs: string };
type Filters = { key: string; app: string; route: string; tool: string; status: string; range: string; from: string; to: string };
const EMPTY: Filters = { key: "", app: "", route: "", tool: "", status: "", range: "24h", from: "", to: "" };
const RANGES = [["15m", "15 min"], ["1h", "1 hour"], ["24h", "24 hours"], ["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"]] as const;
const SIZE = 50, TAIL_MS = 5000;

const query = (f: Filters, page: number) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && !(k === "range" && (f.from || f.to))) p.set(k, v);
  p.set("page", String(page));
  p.set("size", String(SIZE));
  return p.toString();
};
async function fetchCalls(qs: string): Promise<Data> {
  const r = await fetch(`/api/admin/calls?${qs}`, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 401 ? "Signed out. Reload /admin." : `HTTP ${r.status}`);
  return { ...(await r.json()), fetchedAt: Date.now(), qs };
}
const n = (x: number | null | undefined) => (x == null ? "–" : x.toLocaleString("en-US"));

export function ApiCalls() {
  const [f, setF] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(0);
  const [live, setLive] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qs = useMemo(() => query(f, page), [f, page]);

  const loading = !error && data?.qs !== qs;

  // Load on every filter or page change, then every 5 s while live tail is on and the tab is visible.
  useEffect(() => {
    let alive = true;
    const load = () => fetchCalls(qs).then((d) => { if (alive) { setData(d); setError(null); } }, (e: Error) => { if (alive) setError(e.message); });
    void load();
    const id = live ? setInterval(() => { if (document.visibilityState === "visible") void load(); }, TAIL_MS) : null;
    return () => { alive = false; if (id) clearInterval(id); };
  }, [qs, live]);

  const set = (k: keyof Filters, v: string) => { setF((old) => ({ ...old, [k]: v })); setPage(0); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const csv = `/api/admin/calls?${query(f, 0)}&format=csv`;

  return (
    <>
      <div className={s.grid2}>
        <PerMinute summary={data?.summary} at={data?.fetchedAt} />
        <div className={s.card}>
          <div className={s.chartTitle}>Top apps today (New York day){data ? `, ${n(data.summary.today)} calls` : ""}</div>
          {data?.summary.topApps.length ? (
            <ul className={s.list}>{data.summary.topApps.map((a) => (
              <li key={`${a.app}|${a.key}`}><b>{a.app}</b> <span className={s.muted}>{a.key ?? "no key"}, {n(a.n)} calls</span></li>
            ))}</ul>
          ) : <p className={s.note}>No calls today</p>}
        </div>
      </div>

      <div className={s.filters}>
        <Select label="Key" value={f.key} on={(v) => set("key", v)} options={data?.facets.keys ?? []} />
        <Select label="App" value={f.app} on={(v) => set("app", v)} options={data?.facets.apps ?? []} />
        <Select label="Endpoint" value={f.route} on={(v) => set("route", v)} options={data?.facets.routes ?? []} />
        <Select label="MCP tool" value={f.tool} on={(v) => set("tool", v)} options={data?.facets.tools ?? []} />
        <Select label="Status" value={f.status} on={(v) => set("status", v)} options={["2xx", "3xx", "4xx", "5xx"]} />
        <label className={s.field}>Range
          <select className={s.select} value={f.from || f.to ? "" : f.range} onChange={(e) => { setF((o) => ({ ...o, range: e.target.value, from: "", to: "" })); setPage(0); }}>
            {(f.from || f.to) && <option value="">custom</option>}
            {RANGES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label className={s.field}>From (NY)<input className={s.select} type="datetime-local" step={1} value={f.from} onChange={(e) => set("from", e.target.value)} /></label>
        <label className={s.field}>To (NY)<input className={s.select} type="datetime-local" step={1} value={f.to} onChange={(e) => set("to", e.target.value)} /></label>
        <div className={s.filterActions}>
          <label className={s.toggle}><input type="checkbox" checked={live} onChange={(e) => { setLive(e.target.checked); if (e.target.checked) setPage(0); }} /> Live tail, 5 s</label>
          <button className={s.btn} onClick={() => { setF(EMPTY); setPage(0); }}>Reset</button>
          <a className={s.btn} href={csv} download>CSV</a>
        </div>
      </div>

      {error && <div className={s.banner}>Could not load calls: {error}</div>}
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>Time (New York)</th><th>App / key</th><th>Endpoint or MCP tool</th><th>Status</th><th className={s.num}>ms</th><th className={s.num}>Rows</th><th>Path</th></tr></thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} title={[r.ip && `IP ${r.ip}`, r.ua && `UA ${r.ua}`].filter(Boolean).join("\n")}>
                <td className={s.mono} title={`${r.at.replace("T", " ").replace("Z", "")} UTC`}>{fmtCallTime(r.at)}</td>
                <td>{r.app ?? <span className={s.muted}>unknown</span>}<br /><span className={s.muted}>{r.key ?? "no valid key"}</span></td>
                <td>{r.route === "/mcp" ? <><span className={s.pill}>MCP</span> <span className={s.mono}>{r.tool ?? "?"}</span></> : <span className={s.mono}>{r.method !== "GET" ? `${r.method} ` : ""}{r.route}</span>}</td>
                <td><span className={`${s.pill} ${r.status >= 500 ? s.pillBad : r.status >= 400 ? s.pillWarn : s.pillGreen}`}>{r.status}</span></td>
                <td className={s.num}>{n(r.ms)}</td>
                <td className={s.num}>{n(r.rows)}</td>
                <td className={`${s.mono} ${s.pathCell}`} title={r.path}>{r.path}</td>
              </tr>
            ))}
            {data && !data.rows.length && <tr><td colSpan={7} className={s.muted}>No calls match these filters</td></tr>}
            {!data && <tr><td colSpan={7} className={s.muted}>{error ? "–" : "Loading…"}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className={s.pager}>
        <button className={s.btn} disabled={page === 0} onClick={() => setPage(0)}>Newest</button>
        <button className={s.btn} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Newer</button>
        <span>Page {page + 1} of {n(pages)}, {n(data?.total)} calls{loading ? ", loading…" : ""}</span>
        <button className={s.btn} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Older</button>
      </div>
      <p className={s.note}>Calls that send an API key to /api/v1/* or /mcp, kept 90 days. Hover a time for UTC and a row for IP and user agent. Apps name themselves with the X-App header, else the MCP client name or user agent.</p>
    </>
  );
}

function Select({ label, value, on, options }: { label: string; value: string; on: (v: string) => void; options: string[] }) {
  const list = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className={s.field}>{label}
      <select className={s.select} value={value} onChange={(e) => on(e.target.value)}>
        <option value="">All</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

// 60 bars, one per minute of the last hour, errors stacked in red.
function PerMinute({ summary, at }: { summary?: CallSummary; at?: number }) {
  if (!summary || !at) return <div className={s.card}><div className={s.chartTitle}>Calls per minute, last hour</div><p className={s.note}>Loading…</p></div>;
  const now = Math.floor(at / 60_000) * 60_000;
  const by = new Map(summary.perMinute.map((m) => [Date.parse(m.minute), m]));
  const bars = Array.from({ length: 60 }, (_, i) => { const t = now - (59 - i) * 60_000; return { t, n: by.get(t)?.n ?? 0, errors: by.get(t)?.errors ?? 0 }; });
  const max = Math.max(1, ...bars.map((b) => b.n));
  const total = bars.reduce((a, b) => a + b.n, 0);
  return (
    <div className={s.card}>
      <div className={s.chartTitle}>Calls per minute, last hour: {n(total)} calls, peak {n(max === 1 && !total ? 0 : max)}/min</div>
      <div className={s.bars} role="img" aria-label={`API calls per minute over the last hour, ${total} in all`}>
        {bars.map((b) => (
          <span key={b.t} title={`${fmtCallTime(new Date(b.t).toISOString()).slice(11, 16)} NY: ${b.n} calls${b.errors ? `, ${b.errors} errors` : ""}`}>
            <i style={{ height: `${(b.n / max) * 100}%` }}><em style={{ height: b.n ? `${(b.errors / b.n) * 100}%` : 0 }} /></i>
          </span>
        ))}
      </div>
    </div>
  );
}
