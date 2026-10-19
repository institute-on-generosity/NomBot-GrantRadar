// Internal admin dashboard: database, live site, Linux helper, data freshness, cause labels, API, keys, backups.
// Not linked from any page. proxy.ts asks for ADMIN_PASSWORD (signed cookie, lib/adminAuth.ts) after the site
// password, and this page checks the cookie again. Data: lib/admin.ts (cached 30 s to 10 min).
import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { InsightChart } from "@/components/InsightChart";
import { ADMIN_COOKIE, isAdminCookie } from "@/lib/adminAuth";
import {
  agoText, apiStats, backups, BARS, dataFreshness, fmtBytes, health, helper, keys, labels, STALE_HEARTBEAT_MS, FUNNEL, type Level,
} from "@/lib/admin";
import { AutoRefresh } from "./AutoRefresh";
import s from "./admin.module.css";

export const metadata = { title: "Admin · NomBot", robots: { index: false, follow: false } };

const SECTIONS = [
  ["health", "Health"], ["helper", "Linux helper"], ["data", "Data"], ["labels", "Cause labels"],
  ["api", "API and MCP"], ["keys", "Keys and apps"], ["backups", "Backups"],
] as const;

export default function AdminPage() {
  return (
    <main className={`wide ${s.page}`}>
      <div className={s.head}>
        <div>
          <h1 className="pagetitle">Admin</h1>
          <p className={s.sub}>Internal monitor for the shared database and its API</p>
        </div>
        <div className={s.headRight}>
          <AutoRefresh />
          <form method="post" action="/api/admin/login"><input type="hidden" name="action" value="out" /><button className={s.btn}>Sign out</button></form>
        </div>
      </div>
      <nav className={s.nav} aria-label="Sections">{SECTIONS.map(([id, name]) => <a key={id} href={`#${id}`}>{name}</a>)}</nav>
      <Suspense fallback={<p className="hint">Loading…</p>}><Gate /></Suspense>
    </main>
  );
}

async function Gate() {
  await connection();
  if (!isAdminCookie((await cookies()).get(ADMIN_COOKIE)?.value)) return <p className="hint">Sign in at /admin.</p>;
  const wait = (name: string) => <p className="hint">Loading {name}…</p>;
  return (
    <>
      <Suspense fallback={wait("health")}><HealthSection /></Suspense>
      <Suspense fallback={wait("helper")}><HelperSection /></Suspense>
      <Suspense fallback={wait("data")}><DataSection /></Suspense>
      <Suspense fallback={wait("labels")}><LabelsSection /></Suspense>
      <Suspense fallback={wait("API")}><ApiSection /></Suspense>
      <Suspense fallback={wait("keys")}><KeysSection /></Suspense>
      <Suspense fallback={wait("backups")}><BackupsSection /></Suspense>
      <p className={s.foot}>Live checks cache 30 s, counts 60 s, sampled stats 10 min. Not linked from the site.</p>
    </>
  );
}

// ---------- building blocks ----------
const Dot = ({ level }: { level: Level }) => <span className={`${s.dot} ${s[level]}`} aria-hidden />;
const Status = ({ level, children }: { level: Level; children: ReactNode }) => <span className={s.status}><Dot level={level} />{children}</span>;
const Pill = ({ tone, children }: { tone?: "green" | "warn" | "bad"; children: ReactNode }) =>
  <span className={`${s.pill} ${tone === "green" ? s.pillGreen : tone === "warn" ? s.pillWarn : tone === "bad" ? s.pillBad : ""}`}>{children}</span>;

function Section({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={s.section} data-section={id}>
      <h2 className={s.h2}>{title}{aside && <small>{aside}</small>}</h2>
      {children}
    </section>
  );
}

function Card({ label, value, detail, level }: { label: string; value: ReactNode; detail?: ReactNode; level?: Level }) {
  return (
    <div className={s.card}>
      <div className={s.cardLabel}>{level && <Dot level={level} />}{label}</div>
      <div className={s.cardValue}>{value}</div>
      {detail && <div className={s.cardDetail}>{detail}</div>}
    </div>
  );
}

function Meter({ label, used, total, text }: { label: string; used: number; total: number; text: string }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className={s.card}>
      <div className={s.cardLabel}>{label}</div>
      <div className={s.cardValue}>{pct}%</div>
      <div className={`${s.meter} ${pct >= 85 ? s.hot : ""}`}><span style={{ width: `${pct}%` }} /></div>
      <div className={s.cardDetail}>{text}</div>
    </div>
  );
}

function Chart({ title, spec, label }: { title: string; spec: Record<string, unknown>; label: string }) {
  return (
    <div className={s.card}>
      <div className={s.chartTitle}>{title}</div>
      <div className={s.chart}><InsightChart spec={spec} label={label} /></div>
    </div>
  );
}

const n = (x: number | null | undefined) => (x == null ? "–" : x.toLocaleString("en-US"));
const pct = (x: number | null | undefined, d = 0) => (x == null ? "–" : `${(x * 100).toFixed(d)}%`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "–");

// ---------- 1. Health ----------
async function HealthSection() {
  const h = await health();
  const m = h.mac;
  const growth = (b: number | null) => (b == null ? "not enough history" : `${b >= 0 ? "+" : ""}${fmtBytes(b)}`);
  const sizeSpec = {
    width: "container", height: 110,
    data: { values: h.size.history.map((r) => ({ day: r.day, gb: +(r.bytes / 1024 ** 3).toFixed(2) })) },
    mark: { type: h.size.history.length > 1 ? "line" : "point", point: true, tooltip: true },
    encoding: { x: { field: "day", type: "temporal", title: null }, y: { field: "gb", type: "quantitative", title: "GB", scale: { zero: false }, axis: { format: ".1f" } } },
  };
  return (
    <Section id="health" title="Health">
      <div className={s.grid}>
        {h.checks.map((c) => <Card key={c.key} label={c.label} level={c.level} value={c.value} detail={c.detail} />)}
      </div>
      <div className={s.grid}>
        <Card label="Database size" value={fmtBytes(h.size.bytes)} detail={`7 days ${growth(h.size.growth7)}, 30 days ${growth(h.size.growth30)}`} />
        <Meter label="Mac disk used" used={m.diskTotal - m.diskFree} total={m.diskTotal} text={`${fmtBytes(m.diskFree)} free of ${fmtBytes(m.diskTotal)}`} />
        <Meter label="Mac memory used" used={m.memUsed} total={m.memTotal} text={`${fmtBytes(m.memUsed)} of ${fmtBytes(m.memTotal)}`} />
        <Meter label="Mac CPU load" used={m.load1} total={m.cores} text={`${m.load1.toFixed(2)} on ${m.cores} cores, 1 min`} />
      </div>
      <div className={s.grid2}>
        <Chart title="Database size by day" spec={sizeSpec} label="Database size in GB by day" />
      </div>
      <p className={s.note}>Public link: {FUNNEL}. Size history is written on each dashboard view and by the nightly backup.</p>
    </Section>
  );
}

// ---------- 2. Linux helper ----------
async function HelperSection() {
  const h = await helper();
  const p = h.latest?.payload;
  const ts = h.tailscale;
  const tsLevel: Level = ts.error || !ts.found ? "off" : ts.online ? "ok" : "bad";
  const hbLevel: Level = !h.latest ? "off" : h.stale ? "warn" : "ok";
  const mem = p?.mem;
  const disk = p?.disks?.find((d) => d.mount === "/home") ?? p?.disks?.[0];
  const gpu = p?.gpus?.[0];
  const spec = {
    width: "container", height: 110,
    data: { values: h.history.flatMap((r) => [
      { at: r.at, what: "CPU load", v: r.load != null && p?.cpus ? Math.round((r.load / p.cpus) * 100) : null },
      { at: r.at, what: "GPU", v: r.gpu }, { at: r.at, what: "Memory", v: r.mem },
    ]).filter((r) => r.v != null) },
    mark: { type: "line", tooltip: true },
    encoding: {
      x: { field: "at", type: "temporal", title: null }, y: { field: "v", type: "quantitative", title: "%", scale: { domain: [0, 100] } },
      color: { field: "what", type: "nominal", title: null },
    },
  };
  return (
    <Section id="helper" title="Linux helper" aside={ts.host ?? "100.83.20.103"}>
      <div className={s.grid}>
        <Card label="Tailscale" level={tsLevel} value={ts.error ? "unknown" : !ts.found ? "not in tailnet" : ts.online ? "online" : "offline"}
          detail={ts.error ? ts.error : ts.online ? `${ts.os ?? ""} peer` : ts.lastSeen ? `last seen ${agoText(ts.lastSeen)}` : "last seen unknown"} />
        <Card label="Heartbeat" level={hbLevel} value={!h.latest ? "none yet" : h.stale ? "stale" : "live"}
          detail={h.latest ? `${agoText(h.latest.at)}, stale after ${STALE_HEARTBEAT_MS / 60_000} min` : "cron posts every minute"} />
        <Meter label="CPU load" used={p?.load?.[0] ?? 0} total={p?.cpus ?? 1} text={p?.load ? `${p.load[0].toFixed(2)} on ${p.cpus} cores` : "no data"} />
        <Meter label="Memory used" used={mem?.total_mb && mem.available_mb != null ? mem.total_mb - mem.available_mb : 0} total={mem?.total_mb ?? 1}
          text={mem?.total_mb ? `${fmtBytes((mem.available_mb ?? 0) * 1024 ** 2)} free of ${fmtBytes(mem.total_mb * 1024 ** 2)}` : "no data"} />
        <Meter label={`Disk used${disk ? ` (${disk.mount})` : ""}`} used={disk ? disk.total_gb - disk.free_gb : 0} total={disk?.total_gb ?? 1}
          text={disk ? `${fmtBytes(disk.free_gb * 1024 ** 3)} free of ${fmtBytes(disk.total_gb * 1024 ** 3)}` : "no data"} />
        <Card label="GPU" value={gpu ? `${gpu.util ?? "–"}%` : "–"}
          detail={gpu ? `${gpu.name}, ${fmtBytes((gpu.mem_used_mb ?? 0) * 1024 ** 2)} of ${fmtBytes((gpu.mem_total_mb ?? 0) * 1024 ** 2)}, ${gpu.temp_c ?? "–"}°C` : "no data"} />
      </div>
      <div className={s.grid2}>
        {h.history.length > 1 && <Chart title="Last 2 hours" spec={spec} label="Linux helper CPU, GPU and memory use, percent" />}
        <div className={s.card}>
          <div className={s.chartTitle}>Running helper jobs</div>
          {p?.jobs?.length ? (
            <ul className={s.list}>{p.jobs.map((j) => (
              <li key={j.pid}><Pill>{j.kind}</Pill> <span className={s.mono}>{j.cmd}</span> <span className={s.muted}>{Math.round(j.elapsed_s / 60)} min</span></li>
            ))}</ul>
          ) : <p className={s.note}>{p ? "No rsync or embedding jobs running" : "No heartbeat yet"}</p>}
        </div>
      </div>
    </Section>
  );
}

// ---------- 3. Data ----------
async function DataSection() {
  const f = await dataFreshness();
  return (
    <Section id="data" title="Data freshness and coverage" aside="row counts from planner stats for big tables">
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>Source</th><th>Table</th><th>Last load</th><th>Basis</th><th className={s.num}>Rows</th><th>Years</th><th>Status</th></tr></thead>
          <tbody>{f.sources.map((r) => (
            <tr key={r.key}>
              <td>{r.name}</td><td className={s.mono}>{r.table}</td>
              <td title={r.lastLoad ?? ""}>{day(r.lastLoad)} <span className={s.muted}>{r.lastLoad ? agoText(r.lastLoad) : ""}</span></td>
              <td className={s.muted}>{r.basis}</td><td className={s.num}>{n(r.rows)}</td><td>{r.years ?? "–"}</td>
              <td>{r.stale ? <Status level="warn">stale</Status> : <Status level="ok">fresh</Status>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className={s.grid}>
        {f.links.map((l) => <Card key={l.name} label={l.name} value={pct(l.rate)} detail={`${l.basis}, sampled`} level={l.rate == null ? "off" : l.rate >= 0.7 ? "ok" : "warn"} />)}
      </div>
      <p className={s.note}>Basis: load log is source_updates, a column name is that column&apos;s newest value, table stats is the last analyze. Link goal 70%.</p>
    </Section>
  );
}

// ---------- 4. Labels ----------
async function LabelsSection() {
  const l = await labels();
  const grade = (v: number | null, bar: number) => v == null ? <span className={s.muted}>–</span> : <Pill tone={v >= bar ? "green" : "bad"}>{pct(v)}</Pill>;
  return (
    <Section id="labels" title="Cause labels" aside={`bars: primary ${pct(BARS.primary)} exact, partial ${pct(BARS.partial)} in label`}>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>Label</th><th>Version</th><th className={s.num}>Primary</th><th className={s.num}>Partial</th><th>Primary grade</th><th>Partial grade</th><th className={s.num}>Recall est.</th><th>Last top-up</th></tr></thead>
          <tbody>{l.labels.map((r) => (
            <tr key={r.label}>
              <td>{r.name} <span className={`${s.mono} ${s.muted}`}>{r.label}</span></td>
              <td className={s.mono}>{r.version}{r.tag ? ` · ${r.tag}` : ""}</td>
              <td className={s.num}>{n(r.primary)}</td><td className={s.num}>{n(r.partial)}</td>
              <td>{grade(r.gradePrimary, BARS.primary)}</td><td>{grade(r.gradePartial, BARS.partial)}</td>
              <td className={s.num}>{pct(r.recall)}</td><td>{when(r.lastTopUp)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className={s.grid2}>
        <div className={s.card}>
          <div className={s.cardLabel}><Dot level={l.pending.length ? "warn" : "ok"} />Pending approvals</div>
          {l.pending.length ? (
            <ul className={s.list}>{l.pending.map((d) => <li key={d.key}>{d.name} <span className={`${s.mono} ${s.muted}`}>{d.key} {d.version ?? ""}</span></li>)}</ul>
          ) : <p className={s.note}>{l.defsFound ? "None. Every definition is approved" : "Label definitions folder not found"}</p>}
        </div>
      </div>
    </Section>
  );
}

// ---------- 5. API and MCP ----------
const KIND_COLORS = { domain: ["OK", "4xx", "429", "5xx"], range: ["#30c552", "#f5a300", "#a86bff", "#ff3b30"] };

async function ApiSection() {
  const a = await apiStats();
  const dailySpec = {
    width: "container", height: 120,
    data: { values: a.daily.map((d) => ({ ...d, label: new Date(`${d.day}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) })) },
    mark: { type: "bar", tooltip: true },
    encoding: {
      x: { field: "label", type: "ordinal", sort: null, title: null, axis: { labelAngle: 0, labelOverlap: true } },
      y: { field: "n", type: "quantitative", title: "calls", stack: true },
      color: { field: "kind", type: "nominal", title: null, scale: KIND_COLORS },
    },
  };
  const top = [...a.endpoints.map((e) => ({ name: e.path, n: e.calls30 })), ...a.tools.map((t) => ({ name: `mcp:${t.name}`, n: t.calls30 }))]
    .filter((x) => x.n > 0).sort((x, y) => y.n - x.n).slice(0, 8);
  const topSpec = {
    width: "container", height: { step: 16 },
    data: { values: top },
    mark: { type: "bar", tooltip: true },
    encoding: { y: { field: "name", type: "nominal", sort: "-x", title: null, axis: { labelLimit: 220 } }, x: { field: "n", type: "quantitative", title: "calls, 30 days" } },
  };
  const rate = (bad: number, all: number) => (all ? `${Math.round((bad / all) * 100)}%` : "–");
  return (
    <Section id="api" title="API and MCP" aside={`${n(a.totals.calls7)} calls in 7 days, ${n(a.totals.calls30)} in 30, ${pct(a.totals.errorRate)} errors`}>
      <div className={s.grid2}>
        <Chart title="Calls per day, 30 days" spec={dailySpec} label="API and MCP calls per day by status" />
        {top.length > 0 && <Chart title="Top endpoints and tools" spec={topSpec} label="Most called endpoints and MCP tools in 30 days" />}
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>Endpoint</th><th>Status</th><th>Scope</th><th className={s.num}>7 days</th><th className={s.num}>30 days</th><th className={s.num}>4xx</th><th className={s.num}>5xx</th><th className={s.num}>429</th><th className={s.num}>Avg ms</th><th className={s.num}>Max ms</th></tr></thead>
          <tbody>{a.endpoints.map((e) => (
            <tr key={e.id}>
              <td><span className={s.mono}>{e.path}</span><br /><span className={s.muted}>{e.title}</span></td>
              <td><Status level={e.status === "live" ? "ok" : "off"}>{e.status}</Status></td>
              <td>{e.scope === "read" ? <Pill>read</Pill> : <Pill tone="warn">{e.scope}</Pill>}</td>
              <td className={s.num}>{n(e.calls7)}</td><td className={s.num}>{n(e.calls30)}</td>
              <td className={s.num}>{e.err4 ? `${n(e.err4)} (${rate(e.err4, e.calls30)})` : "0"}</td>
              <td className={s.num}>{e.err5 ? <Pill tone="bad">{n(e.err5)}</Pill> : "0"}</td>
              <td className={s.num}>{n(e.r429)}</td><td className={s.num}>{n(e.avgMs)}</td><td className={s.num}>{n(e.maxMs)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className={s.grid2}>
        <div className={s.card}>
          <div className={s.chartTitle}>MCP tools, 30 days</div>
          <ul className={s.list}>{a.tools.map((t) => (
            <li key={t.name}><span className={s.mono}>{t.name}</span> <span className={s.muted}>{n(t.calls30)} calls{t.errors ? `, ${n(t.errors)} errors` : ""}{t.avgMs != null ? `, ${t.avgMs} ms avg` : ""}</span></li>
          ))}</ul>
          {a.other.length > 0 && <p className={s.note}>Also called: {a.other.map((o) => `${o.route} (${o.calls30})`).join(", ")}</p>}
        </div>
        <div className={s.card}>
          <div className={s.chartTitle}>Latest errors</div>
          {a.errors.length ? (
            <ul className={s.list}>{a.errors.map((e, i) => (
              <li key={i}><Pill tone={e.status >= 500 ? "bad" : "warn"}>{e.status}</Pill> <span className={s.mono}>{e.route}</span> <span className={s.muted}>{e.key ?? "no key"}, {agoText(e.at)}</span></li>
            ))}</ul>
          ) : <p className={s.note}>None logged yet. Logging started with this dashboard</p>}
        </div>
      </div>
    </Section>
  );
}

// ---------- 6. Keys and connected apps ----------
async function KeysSection() {
  const k = await keys();
  const active = k.filter((r) => !r.revoked), revoked = k.filter((r) => r.revoked);
  // Partner use per name (the test suite makes and revokes many "api-test" keys).
  const byName = new Map<string, number>();
  for (const r of k) if (r.calls30) byName.set(r.name, (byName.get(r.name) ?? 0) + r.calls30);
  const table = (list: typeof k) => (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th className={s.num}>Rate/min</th><th>Created</th><th>Last used</th><th className={s.num}>30 days</th><th>State</th></tr></thead>
        <tbody>{list.map((r) => (
          <tr key={r.id}>
            <td>{r.name}</td><td className={s.mono}>{r.prefix}…</td>
            <td>{r.scopes.map((sc) => <Pill key={sc} tone={sc === "read" ? undefined : "warn"}>{sc}</Pill>)}</td>
            <td className={s.num}>{r.rate}</td><td>{day(r.created)}</td>
            <td>{r.lastUsed ? agoText(r.lastUsed) : <span className={s.muted}>never</span>}</td>
            <td className={s.num}>{n(r.calls30)}</td>
            <td>{r.revoked ? <Status level="off">revoked</Status> : r.unused ? <Status level="warn">unused</Status> : <Status level="ok">active</Status>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
  return (
    <Section id="keys" title="Keys and connected apps" aside={`${active.length} active, ${active.filter((r) => r.unused).length} unused in 30 days, ${revoked.length} revoked`}>
      <div className={s.grid2}>
        <div className={s.card}>
          <div className={s.cardLabel}><Dot level="ok" />NomBot web app</div>
          <p className={s.note}>Search, research and Research Buddy. Runs in-process with the database, no API key. Claude calls use the server&apos;s Anthropic key.</p>
        </div>
        <div className={s.card}>
          <div className={s.cardLabel}><Dot level={active.some((r) => r.calls30 > 0) ? "ok" : "off"} />Partner apps, calls in 30 days</div>
          <p className={s.note}>{[...byName].sort((a, b) => b[1] - a[1]).map(([name, c]) => `${name} ${n(c)}`).join(", ") || "No partner calls in 30 days"}</p>
        </div>
      </div>
      {active.length ? table(active) : <p className={s.note}>No active keys</p>}
      {revoked.length > 0 && (
        <details className={s.details}>
          <summary>{revoked.length} revoked keys</summary>
          {table(revoked)}
        </details>
      )}
    </Section>
  );
}

// ---------- 7. Backups ----------
async function BackupsSection() {
  const b = await backups();
  return (
    <Section id="backups" title="Backups" aside="nightly pg_dump at 2:30, launchd org.iog.backup">
      <div className={s.grid}>
        <Card label="Last backup" level={b.level} value={b.latest ? agoText(b.latest.at) : "none"} detail={b.latest ? when(b.latest.at) : "~/Backups/nombot is empty"} />
        <Card label="Size" value={fmtBytes(b.latest?.bytes)} detail={b.latest?.file ?? "–"} />
        <Card label="Kept" value={`${b.dumps.length}`} detail="newest 3 are kept" />
        <Card label="Last run" level={b.ok ? "ok" : "bad"} value={b.ok ? "success" : "check log"} detail={b.lastLog ?? "no log"} />
      </div>
      <div className={s.banner}><Dot level="warn" />No off-machine copy. Every dump lives on this Mac only.</div>
      {b.dumps.length > 0 && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>File</th><th>Written</th><th className={s.num}>Size</th></tr></thead>
            <tbody>{b.dumps.map((d) => <tr key={d.file}><td className={s.mono}>{d.file}</td><td>{when(d.at)}</td><td className={s.num}>{fmtBytes(d.bytes)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
