// Data for the internal /admin dashboard (app/admin/page.tsx): health of the database, the live site and its
// public link, the Linux helper, data freshness, cause labels, API and MCP use, keys and backups.
// Server only. Every loader is cached in memory (lib/memo.ts): 30 s for live checks, 60 s for counts, 10 min
// for sampled or scanned stats. No single query is meant to take more than ~500 ms: big tables are read from
// planner stats (pg_class, pg_stats) or a small TABLESAMPLE, never counted.
// Partner API keys never reach this file's output: api_keys is read by column (prefix only, never key_hash).
import { execFile } from "node:child_process";
import { readFile, readdir, stat, statfs } from "node:fs/promises";
import { cpus, homedir, loadavg, totalmem } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { db } from "./db";
import { memo } from "./memo";
import { whoSplit, whoTagged } from "./recipientTypes";
import { ENDPOINTS, MCP_TOOLS } from "./apiDocs";
import { CALL_TZ, fmtCallTime } from "./callTime";

const run = promisify(execFile);
export type Level = "ok" | "warn" | "bad" | "off";
export const LIVE = "http://127.0.0.1:4000";
export const FUNNEL = "https://thes-macbook-air.tail3090cf.ts.net";
export const HELPER_IP = "100.83.20.103";
const TAILSCALE = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
const BACKUP_DIR = join(homedir(), "Backups", "nombot");
const BACKUP_LOG = join(homedir(), "Library", "Logs", "iog", "backup.log");
// Off-machine copy to the Linux helper (~/iog-host/backup-offsite.sh): last good copy (JSON) and one log line per run.
const OFFSITE_JSON = join(homedir(), "Library", "Logs", "iog", "backup-offsite.json");
const OFFSITE_LOG = join(homedir(), "Library", "Logs", "iog", "backup-offsite.log");
const LABEL_DEFS = join(homedir(), "Desktop", "generosity-data", "etl", "labels", "defs");
export const STALE_HEARTBEAT_MS = 3 * 60_000;

const short = memo<unknown>("admin:30s", 50, 30_000);
const minute = memo<unknown>("admin:60s", 50, 60_000);
const slow = memo<unknown>("admin:10m", 50, 10 * 60_000);
const cached = <T>(store: typeof short, key: string, make: () => Promise<T>) => store(key, make) as Promise<T>;

const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
const timed = async <T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number; error: string | null }> => {
  const t = performance.now();
  try { return { value: await fn(), ms: Math.round(performance.now() - t), error: null }; }
  catch (e) { return { value: null, ms: Math.round(performance.now() - t), error: (e as Error).message.slice(0, 160) }; }
};
async function probe(url: string, init: RequestInit = {}) {
  const t = performance.now();
  try {
    const r = await fetch(url, { ...init, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(4000) });
    await r.body?.cancel();
    return { status: r.status, ms: Math.round(performance.now() - t) };
  } catch { return { status: 0, ms: Math.round(performance.now() - t) }; }
}

// ---------- 1. Health strip ----------
export type Check = { key: string; label: string; level: Level; value: string; detail: string };
export type Health = {
  checks: Check[];
  size: { bytes: number; history: { day: string; bytes: number }[]; growth7: number | null; growth30: number | null };
  mac: { diskFree: number; diskTotal: number; memUsed: number; memTotal: number; load1: number; cores: number };
};

export const health = () => cached<Health>(short, "health", async () => {
  const [dbq, live, pub, api, mcp, backup, freshness, size, mac] = await Promise.all([
    timed(() => db.query("SELECT 1")),
    probe(`${LIVE}/api/docs`),
    probe(FUNNEL),
    probe(`${LIVE}/api/v1/search?q=health`),
    probe(`${LIVE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' }),
    backups(),
    dataFreshness(),
    dbSize(),
    macStats(),
  ]);
  const ago = (iso: string | null) => (iso ? agoText(iso) : "never");
  const newestLoad = freshness.sources.map((s) => s.lastLoad).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const checks: Check[] = [
    { key: "db", label: "Database", level: dbq.error ? "bad" : dbq.ms > 500 ? "warn" : "ok", value: dbq.error ? "down" : `${dbq.ms} ms`, detail: dbq.error ?? "Postgres 17, nombot" },
    { key: "live", label: "Live site", level: live.status === 200 ? "ok" : "bad", value: live.status === 200 ? `${live.ms} ms` : live.status ? `HTTP ${live.status}` : "down", detail: "127.0.0.1:4000" },
    { key: "public", label: "Public link", level: pub.status === 401 ? "ok" : pub.status ? "warn" : "bad", value: pub.status === 401 ? "locked" : pub.status ? `HTTP ${pub.status}` : "down", detail: "Funnel answers 401 until signed in" },
    { key: "api", label: "API", level: api.status === 401 ? "ok" : "bad", value: api.status === 401 ? `${api.ms} ms` : api.status ? `HTTP ${api.status}` : "down", detail: "Keyless call answers 401" },
    { key: "mcp", label: "MCP", level: mcp.status === 401 ? "ok" : "bad", value: mcp.status === 401 ? `${mcp.ms} ms` : mcp.status ? `HTTP ${mcp.status}` : "down", detail: "Keyless call answers 401" },
    { key: "backup", label: "Last backup", level: backup.level, value: ago(backup.latest?.at ?? null), detail: backup.latest ? fmtBytes(backup.latest.bytes) : "no dump found" },
    { key: "load", label: "Last data load", level: newestLoad ? "ok" : "warn", value: ago(newestLoad), detail: freshness.sources.find((s) => s.lastLoad === newestLoad)?.name ?? "" },
  ];
  return { checks, size, mac };
});

async function dbSize() {
  const [{ bytes }] = await rows<{ bytes: string }>("SELECT pg_database_size(current_database()) AS bytes");
  // Today's row (the nightly backup writes one too). Cheap upsert, at most once per 30 s.
  await db.query("INSERT INTO db_size_history (day, bytes) VALUES (current_date, $1) ON CONFLICT (day) DO UPDATE SET bytes = EXCLUDED.bytes, recorded_at = now()", [bytes]);
  const history = (await rows<{ day: string; bytes: string }>("SELECT to_char(day, 'YYYY-MM-DD') AS day, bytes FROM db_size_history WHERE day > current_date - 90 ORDER BY day"))
    .map((r) => ({ day: r.day, bytes: Number(r.bytes) }));
  const now = Number(bytes);
  const back = (days: number) => {
    const cut = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const old = history.filter((h) => h.day <= cut).at(-1);
    return old ? now - old.bytes : null;
  };
  return { bytes: now, history, growth7: back(7), growth30: back(30) };
}

async function macStats() {
  const fs = await statfs("/System/Volumes/Data").catch(() => statfs("/"));
  const memTotal = totalmem();
  let memUsed = 0;
  try {
    // Activity Monitor's "memory used" is about active + wired + compressed pages.
    const { stdout } = await run("/usr/bin/vm_stat", [], { timeout: 2000 });
    const page = Number(/page size of (\d+)/.exec(stdout)?.[1] ?? 16384);
    const n = (k: string) => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(stdout)?.[1] ?? 0);
    memUsed = (n("Pages active") + n("Pages wired down") + n("Pages occupied by compressor")) * page;
  } catch { /* not macOS */ }
  return { diskFree: fs.bavail * fs.bsize, diskTotal: fs.blocks * fs.bsize, memUsed, memTotal, load1: loadavg()[0], cores: cpus().length };
}

// ---------- 2. Linux helper ----------
// host 'admin-eval' is eval/admin.mts's test heartbeat, deleted after the test.
export type HeartbeatPayload = {
  host?: string; at?: string; uptime_s?: number; cpus?: number; load?: number[];
  mem?: { total_mb?: number; available_mb?: number };
  disks?: { mount: string; total_gb: number; free_gb: number }[];
  gpus?: { name: string; util?: number; mem_used_mb?: number; mem_total_mb?: number; temp_c?: number }[];
  jobs?: { pid: number; elapsed_s: number; kind: string; cmd: string }[];
  // embed_worker.py status (cron every 10 min): rows still without a vector, last run, rows written, result.
  embedding?: { pending?: number | null; last_run?: string; done?: number; result?: string; device?: string; tagging?: boolean } | null;
  // ~/iog-backups/restore-test.sh summary (cron, weekly): newest dump restored into a scratch DB and checked.
  restore_test?: RestoreTest | null;
  // Nightly jobs on the helper (generosity-data docs/linux-helper.md): ~/iog-qa/quality.json and benchmark.json summaries.
  quality?: QualitySummary | null;
  benchmark?: BenchSummary | null;
  // Weekly Parquet export (~/iog-etl/export_snapshot.sh, Sunday 3:30) and the daily IRS batch check (irs_watch.py, 6:15).
  snapshot?: Snapshot | null;
  irs_watch?: IrsWatch | null;
};
export type Snapshot = { at?: string; ok?: boolean; folder?: string; files?: number; total_bytes?: number; rows_match?: boolean; duration_s?: number };
export type IrsWatch = { at?: string; new_batches?: unknown[]; staged?: unknown[]; waiting_for_mac?: unknown[]; errors?: unknown[] };
export const IRS_LOAD_CMD = "~/iog-host/irs-pull-and-load.sh --list";
// "2026-10-19T23:01:21-0700" (no colon in the offset) to a form Date.parse always reads.
export const isoAt = (at?: string) => at?.replace(/([+-]\d\d)(\d\d)$/, "$1:$2");
const olderThan = (at: string | undefined, ms: number) => { const t = Date.parse(isoAt(at) ?? ""); return !Number.isFinite(t) || Date.now() - t > ms; };
// Levels for the Linux jobs cards: snapshot weekly (warn after 8 days), IRS watch daily (warn after 30 h or when a batch waits).
export function linuxJobLevels(snap?: Snapshot | null, irs?: IrsWatch | null): { snapshot: Level; irs: Level } {
  return {
    snapshot: !snap?.at ? "off" : !snap.ok || snap.rows_match === false ? "bad" : olderThan(snap.at, 8 * 86400_000) ? "warn" : "ok",
    irs: !irs?.at ? "off" : irs.errors?.length ? "bad" : irs.staged?.length || irs.waiting_for_mac?.length || olderThan(irs.at, 30 * 3600_000) ? "warn" : "ok",
  };
}
// A nightly job's last report is older than 30 hours: it missed a night.
export const missedNight = (at?: string) => !at || Date.now() - Date.parse(at) > 30 * 3600_000;
export type QualityCheck = { key: string; name: string; status: "pass" | "warn" | "fail"; detail: string };
export type QualitySummary = { at?: string; pass?: number; warn?: number; fail?: number; failing?: QualityCheck[]; duration_s?: number };
export type BenchSummary = {
  at?: string; score?: number; total?: number; misleading?: number; statuses?: Record<string, number>; errors?: number; prev_score?: number | null;
  newly_failing?: { id: string; q: string; was: string; now: string }[]; newly_failing_count?: number; fixed?: string[];
  misleading_list?: { id: string; q: string; why: string }[]; cost_usd?: number; router_calls?: number; wall_s?: number;
  trend?: { date: string; score: number; total: number; misleading: number }[];
  prompts?: { ok: number; total: number; failing: { group: string; q: string; status: string; headline: string }[] } | null; // home Research prompts
};
export type RestoreTest = { at?: string; ok?: boolean; file?: string; duration_s?: number; restore_s?: number; tables_matched?: number; tables_total?: number; error?: string | null };
export type Helper = {
  tailscale: { found: boolean; online: boolean; lastSeen: string | null; host: string | null; os: string | null; error: string | null };
  latest: { at: string; payload: HeartbeatPayload } | null;
  stale: boolean;
  history: { at: string; load: number | null; gpu: number | null; mem: number | null }[];
};

export const helper = () => cached<Helper>(short, "helper", async () => {
  const [ts, hb] = await Promise.all([tailscalePeer(), rows<{ at: string; payload: HeartbeatPayload }>(
    `SELECT received_at AS at, payload FROM helper_heartbeats WHERE received_at > now() - interval '2 hours' AND host <> 'admin-eval' ORDER BY received_at DESC LIMIT 120`)]);
  const latest = hb[0] ?? (await rows<{ at: string; payload: HeartbeatPayload }>("SELECT received_at AS at, payload FROM helper_heartbeats WHERE host <> 'admin-eval' ORDER BY received_at DESC LIMIT 1"))[0] ?? null;
  const at = latest ? new Date(latest.at).toISOString() : null;
  return {
    tailscale: ts,
    latest: latest && at ? { at, payload: latest.payload } : null,
    stale: !at || Date.now() - Date.parse(at) > STALE_HEARTBEAT_MS,
    history: hb.slice().reverse().map((h) => {
      const p = h.payload, m = p.mem;
      return {
        at: new Date(h.at).toISOString(),
        load: p.load?.[0] ?? null,
        gpu: p.gpus?.[0]?.util ?? null,
        mem: m?.total_mb && m.available_mb != null ? Math.round((1 - m.available_mb / m.total_mb) * 100) : null,
      };
    }),
  };
});

async function tailscalePeer(): Promise<Helper["tailscale"]> {
  try {
    const { stdout } = await run(TAILSCALE, ["status", "--json"], { timeout: 3000, maxBuffer: 4 << 20 });
    const peers = Object.values((JSON.parse(stdout) as { Peer?: Record<string, { TailscaleIPs?: string[]; Online?: boolean; LastSeen?: string; HostName?: string; OS?: string }> }).Peer ?? {});
    const p = peers.find((x) => x.TailscaleIPs?.includes(HELPER_IP));
    if (!p) return { found: false, online: false, lastSeen: null, host: null, os: null, error: null };
    const seen = p.LastSeen && !p.LastSeen.startsWith("0001") ? p.LastSeen : null;
    return { found: true, online: !!p.Online, lastSeen: seen, host: p.HostName ?? null, os: p.OS ?? null, error: null };
  } catch (e) {
    return { found: false, online: false, lastSeen: null, host: null, os: null, error: (e as Error).message.slice(0, 120) };
  }
}

// ---------- 3. Data freshness and coverage ----------
type SourceDef = { key: string; name: string; table: string; loadedAt?: string; updates?: string[]; year?: string; staleDays: number };
const SOURCES: SourceDef[] = [
  { key: "bmf", name: "IRS master file (BMF)", table: "orgs", loadedAt: "loaded_at", staleDays: 45 },
  { key: "filings", name: "990 filings", table: "filing_text", year: "tax_year", staleDays: 120 },
  { key: "pf_grants", name: "990-PF grants", table: "grants", year: "tax_year", staleDays: 120 },
  { key: "schedule_i", name: "Schedule I grants", table: "charity_grants", year: "tax_year", staleDays: 120 },
  { key: "federal", name: "Federal awards", table: "federal_awards", year: "fiscal_year", staleDays: 120 },
  { key: "acs", name: "Census ACS", table: "county_acs", year: "acs_year", staleDays: 400 },
  { key: "soi", name: "SOI individual", table: "soi_individual_zip", year: "tax_year", staleDays: 400 },
  { key: "pf_finances", name: "Foundation finances", table: "foundation_finances", loadedAt: "loaded_at", year: "tax_year", staleDays: 120 },
  { key: "news", name: "News (GDELT)", table: "news_articles", loadedAt: "seen_at", updates: ["gdelt_gkg", "gdelt"], staleDays: 2 },
  { key: "congress", name: "Congress bills", table: "congress_bills", loadedAt: "updated_at", updates: ["congress"], staleDays: 7 },
  { key: "fr", name: "Federal Register", table: "federal_register_docs", updates: ["federal_register"], staleDays: 7 },
  { key: "cpi", name: "CPI-U", table: "cpi_u", loadedAt: "loaded_at", year: "year", staleDays: 45 },
  { key: "benchmarks", name: "Benchmarks", table: "benchmarks", loadedAt: "loaded_at", year: "year", staleDays: 400 },
  { key: "iog", name: "IoG guides", table: "iog_documents", loadedAt: "loaded_at", staleDays: 90 },
];
export type Source = { key: string; name: string; table: string; lastLoad: string | null; basis: string; rows: number | null; years: string | null; stale: boolean };
export type Freshness = { sources: Source[]; links: { name: string; rate: number | null; basis: string; exact?: boolean }[] };

export const dataFreshness = () => cached<Freshness>(slow, "freshness", async () => {
  const tables = SOURCES.map((s) => s.table);
  const yearPairs = SOURCES.filter((s) => s.year);
  const [stats, updates, yearStats, ...loaded] = await Promise.all([
    rows<{ relname: string; reltuples: number; analyzed: string | null }>(
      `SELECT c.relname, c.reltuples, greatest(s.last_analyze, s.last_autoanalyze) AS analyzed
       FROM pg_class c LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1)`, [tables]),
    rows<{ source: string; run_at: string }>("SELECT source, max(run_at) AS run_at FROM source_updates GROUP BY source"),
    rows<{ tablename: string; vals: string | null; bounds: string | null }>(
      `SELECT tablename, most_common_vals::text AS vals, histogram_bounds::text AS bounds FROM pg_stats
       WHERE schemaname = 'public' AND (tablename || '.' || attname) = ANY($1)`, [yearPairs.map((s) => `${s.table}.${s.year}`)]),
    ...SOURCES.map((s) => (s.loadedAt ? rows<{ at: string | null }>(`SELECT max(${s.loadedAt}) AS at FROM ${s.table}`).then((r) => r[0]?.at ?? null) : Promise.resolve(null))),
  ]);
  const small = stats.filter((s) => s.reltuples < 200_000).map((s) => s.relname);
  const exact = new Map(await Promise.all(small.map(async (t) => [t, Number((await rows<{ n: string }>(`SELECT count(*) AS n FROM ${t}`))[0].n)] as const)));
  const sources = SOURCES.map((s, i): Source => {
    const st = stats.find((x) => x.relname === s.table);
    const upd = s.updates?.map((u) => updates.find((x) => x.source === u)?.run_at).filter(Boolean).map((d) => new Date(d!).toISOString()).sort().at(-1);
    const col = loaded[i] ? new Date(loaded[i]!).toISOString() : null;
    const [lastLoad, basis] = upd ? [upd, "load log"] : col ? [col, s.loadedAt!] : st?.analyzed ? [new Date(st.analyzed).toISOString(), "table stats"] : [null, "unknown"];
    const ys = yearStats.find((y) => y.tablename === s.table);
    const nums = ys ? `${ys.vals ?? ""},${ys.bounds ?? ""}`.replace(/[{}"]/g, "").split(",").map(Number).filter((n) => n > 1900 && n < 2100) : [];
    const rowsN = exact.get(s.table) ?? (st && st.reltuples >= 0 ? Math.round(st.reltuples) : null);
    return {
      key: s.key, name: s.name, table: s.table, lastLoad, basis, rows: rowsN,
      years: nums.length ? `${Math.min(...nums)}-${Math.max(...nums)}` : null,
      stale: !lastLoad || Date.now() - Date.parse(lastLoad) > s.staleDays * 86400_000,
    };
  });
  // Link rates on a small random sample of pages (about 70,000 grants), not a full count.
  const sample = (sql: string) => rows<{ r: string | null }>(sql).then((r) => (r[0]?.r == null ? null : Number(r[0].r)));
  // Headline link rate (README "Linked share" definitions): 990-PF grant dollars to US organizations (grant_clean scope:
  // 2012-25, amount > 0, no individuals, placeholders, foreign addresses or transfers to other private foundations)
  // linked to an EIN, exact from grant_cube; and over dollars to nonprofits (leaving out governments, public
  // universities, international bodies and companies, generosity-data 079). All years and 2022-24.
  const whoYears = (from: number, to: number) => Promise.all([
    rows<{ k: string; usd: string; linked_usd: string }>(`SELECT recipient_kind AS k, sum(usd) AS usd, coalesce(sum(usd) FILTER (WHERE linked), 0) AS linked_usd FROM grant_cube WHERE tax_year BETWEEN ${from} AND ${to} GROUP BY 1`),
    whoTagged({ from, to, states: [], area: null, fb: null, ftype: null }),
  ]).then(([k, t]) => whoSplit(k.map((r) => ({ k: r.k, usd: Number(r.usd), linked_usd: Number(r.linked_usd) })), t)).catch(() => null);
  const [pf, ch, fed, who, who3] = await Promise.all([
    sample("SELECT avg((recipient_ein IS NOT NULL OR recipient_entity IS NOT NULL)::int) AS r FROM grants TABLESAMPLE SYSTEM (0.5)"),
    sample("SELECT avg((recipient_ein IS NOT NULL)::int) AS r FROM charity_grants TABLESAMPLE SYSTEM (0.3)"),
    sample("SELECT avg((recipient_ein IS NOT NULL)::int) AS r FROM federal_awards TABLESAMPLE SYSTEM (5)"),
    whoYears(2012, 2025),
    whoYears(2022, 2024),
  ]);
  return {
    sources,
    links: [
      { name: "Foundation $ linked, 2012-25 (headline)", rate: who?.all_link_rate ?? null, basis: "990-PF grant $ to US organizations linked to an EIN", exact: true },
      { name: "Foundation $ linked, 2022-24 (headline)", rate: who3?.all_link_rate ?? null, basis: "990-PF grant $ to US organizations linked to an EIN", exact: true },
      { name: "Foundation $ to nonprofits linked, 2012-25", rate: who?.nonprofit_link_rate ?? null, basis: "same, leaving out governments, public universities, international bodies and companies", exact: true },
      { name: "Foundation $ to nonprofits linked, 2022-24", rate: who3?.nonprofit_link_rate ?? null, basis: "same, leaving out governments, public universities, international bodies and companies", exact: true },
      { name: "Foundation grant lines linked, by count", rate: pf, basis: "every 990-PF line incl. individuals, placeholders, foreign; org, school district or college" },
      { name: "Schedule I lines linked, by count", rate: ch, basis: "every charity grant line, linked to an EIN" },
      { name: "Federal awards", rate: fed, basis: "linked to an EIN" },
    ],
  };
});

// ---------- 4. Cause labels ----------
export const BARS = { primary: 0.95, partial: 0.9 }; // primary exact, partial in the label (docs/labels/README.md)
export type LabelRow = { label: string; name: string; version: string; primary: number; partial: number; lastTopUp: string | null; gradePrimary: number | null; gradePartial: number | null; tag: string | null; recall: number | null };
export type Labels = { labels: LabelRow[]; pending: { key: string; name: string; version: string | null }[]; defsFound: boolean };

export const labels = () => cached<Labels>(minute, "labels", async () => {
  const [defs, counts] = await Promise.all([
    rows<{ label: string; name: string; version: string; grading: Record<string, unknown> | null }>("SELECT label, name, version, grading FROM cause_labels ORDER BY label"),
    rows<{ label: string; tier: string; n: string; at: string }>("SELECT label, tier, count(*) AS n, max(labeled_at) AS at FROM org_labels GROUP BY 1, 2"),
  ]);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const list = defs.map((d): LabelRow => {
    const g = (d.grading ?? {}) as { tag?: string; recall_est?: number; primary?: { exact_weighted?: number }; partial?: { in_label_weighted?: number } };
    const mine = counts.filter((c) => c.label === d.label);
    const at = mine.map((c) => new Date(c.at).toISOString()).sort().at(-1) ?? null;
    return {
      label: d.label, name: d.name, version: d.version,
      primary: Number(mine.find((c) => c.tier === "primary")?.n ?? 0), partial: Number(mine.find((c) => c.tier === "partial")?.n ?? 0),
      lastTopUp: at, gradePrimary: num(g.primary?.exact_weighted), gradePartial: num(g.partial?.in_label_weighted), tag: g.tag ?? null, recall: num(g.recall_est),
    };
  });
  // Label definitions waiting for Hunter's approval: generosity-data etl/labels/defs/*.json with approved false.
  let pending: Labels["pending"] = [], defsFound = false;
  try {
    const files = (await readdir(LABEL_DEFS)).filter((f) => f.endsWith(".json"));
    defsFound = true;
    pending = (await Promise.all(files.map(async (f) => {
      const j = JSON.parse(await readFile(join(LABEL_DEFS, f), "utf8")) as { name?: string; approved?: boolean; version?: string };
      return j.approved === false ? { key: f.replace(/\.json$/, ""), name: j.name ?? f, version: j.version ?? null } : null;
    }))).filter((x): x is NonNullable<typeof x> => !!x);
  } catch { /* defs folder not on this machine */ }
  return { labels: list, pending, defsFound };
});

// ---------- 5. API and MCP ----------
export type EndpointRow = { id: string; path: string; title: string; scope: string; status: "live" | "planned"; calls7: number; calls30: number; err4: number; err5: number; r429: number; avgMs: number | null; maxMs: number | null };
export type ApiStats = {
  endpoints: EndpointRow[];
  tools: { name: string; calls30: number; errors: number; avgMs: number | null }[];
  other: { route: string; calls30: number }[];
  daily: { day: string; kind: string; n: number }[];
  errors: { at: string; route: string; status: number; key: string | null; ms: number | null }[];
  totals: { calls7: number; calls30: number; errorRate: number | null };
};

// The Linux helper's nightly benchmark (key "benchmark", X-App nightly-benchmark, ~150 calls a night) is kept out of
// the usage charts and totals. The API calls tab hides it by default (bench=hide) with a toggle to show it.
export const BENCH_KEY = "benchmark", BENCH_APP = "nightly-benchmark";
const NOT_BENCH_KEY = `(key_id IS NULL OR key_id NOT IN (SELECT id FROM api_keys WHERE name = '${BENCH_KEY}'))`;
type UsageRow = { route: string; status: number; n: string; ms_sum: string; ms_max: number; recent: boolean };
export const apiStats = () => cached<ApiStats>(minute, "api", async () => {
  const [usage, daily, errors] = await Promise.all([
    rows<UsageRow>(`SELECT route, status, sum(n) AS n, sum(ms_sum) AS ms_sum, max(ms_max) AS ms_max, day > current_date - 7 AS recent
                    FROM api_usage WHERE day > current_date - 30 AND ${NOT_BENCH_KEY} GROUP BY route, status, recent`),
    rows<{ day: string; kind: string; n: string }>(`SELECT to_char(day, 'YYYY-MM-DD') AS day,
        CASE WHEN status >= 500 THEN '5xx' WHEN status = 429 THEN '429' WHEN status >= 400 THEN '4xx' ELSE 'OK' END AS kind, sum(n) AS n
      FROM api_usage WHERE day > current_date - 30 AND ${NOT_BENCH_KEY} GROUP BY 1, 2 ORDER BY 1`),
    rows<{ at: string; route: string; status: number; key: string | null; ms: number | null }>(
      "SELECT e.at, e.route, e.status, k.name AS key, e.ms FROM api_errors e LEFT JOIN api_keys k ON k.id = e.key_id ORDER BY e.id DESC LIMIT 12"),
  ]);
  // api_usage stores route templates (/api/v1/org, /api/v1/iog/guides/[slug]); match them to apiDocs paths.
  const owner = new Map<string, string>();
  for (const e of ENDPOINTS) owner.set(e.path.replace(/\{(\w+)\}/g, "[$1]"), e.id);
  for (const e of ENDPOINTS) { const k = e.path.replace(/\/\{\w+\}/g, ""); if (!owner.has(k)) owner.set(k, e.id); }
  const agg = () => ({ calls7: 0, calls30: 0, err4: 0, err5: 0, r429: 0, msSum: 0, msN: 0, maxMs: 0 });
  const by = new Map<string, ReturnType<typeof agg>>();
  for (const u of usage) {
    const a = by.get(u.route) ?? agg();
    const n = Number(u.n);
    a.calls30 += n; if (u.recent) a.calls7 += n;
    if (u.status === 429) a.r429 += n; else if (u.status >= 500) a.err5 += n; else if (u.status >= 400) a.err4 += n;
    if (Number(u.ms_sum) > 0) { a.msSum += Number(u.ms_sum); a.msN += n; }
    a.maxMs = Math.max(a.maxMs, u.ms_max);
    by.set(u.route, a);
  }
  const perEndpoint = new Map<string, ReturnType<typeof agg>>();
  const other: ApiStats["other"] = [];
  for (const [route, a] of by) {
    if (route.startsWith("mcp:")) continue;
    const id = owner.get(route);
    if (!id) { other.push({ route, calls30: a.calls30 }); continue; }
    const t = perEndpoint.get(id) ?? agg();
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = k === "maxMs" ? Math.max(t[k], a[k]) : t[k] + a[k];
    perEndpoint.set(id, t);
  }
  const endpoints = await Promise.all(ENDPOINTS.map(async (e): Promise<EndpointRow> => {
    const a = perEndpoint.get(e.id) ?? agg();
    return {
      id: e.id, path: e.path, title: e.title, scope: e.scope ?? "read", status: (await routeExists(e.path)) ? "live" : "planned",
      calls7: a.calls7, calls30: a.calls30, err4: a.err4, err5: a.err5, r429: a.r429,
      avgMs: a.msN ? Math.round(a.msSum / a.msN) : null, maxMs: a.maxMs || null,
    };
  }));
  const tools = MCP_TOOLS.map((t) => {
    const a = by.get(`mcp:${t.name}`) ?? agg();
    return { name: t.name, calls30: a.calls30, errors: a.err4 + a.err5 + a.r429, avgMs: a.msN ? Math.round(a.msSum / a.msN) : null };
  });
  const all = [...by.values()];
  const calls30 = all.reduce((s, a) => s + a.calls30, 0);
  return {
    endpoints, tools, other,
    daily: padDays(daily.map((d) => ({ day: d.day, kind: d.kind, n: Number(d.n) })), 30),
    errors: errors.map((e) => ({ ...e, at: new Date(e.at).toISOString() })),
    totals: { calls7: all.reduce((s, a) => s + a.calls7, 0), calls30, errorRate: calls30 ? all.reduce((s, a) => s + a.err4 + a.err5 + a.r429, 0) / calls30 : null },
  };
});

// One OK row of 0 for every day without calls, so the chart shows quiet days as gaps, not a stretched bar.
function padDays(list: ApiStats["daily"], days: number) {
  const have = new Set(list.map((d) => d.day));
  const pad: ApiStats["daily"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toLocaleDateString("en-CA"); // YYYY-MM-DD, local day
    if (!have.has(d)) pad.push({ day: d, kind: "OK", n: 0 });
  }
  return [...list, ...pad].sort((a, b) => a.day.localeCompare(b.day));
}

async function routeExists(path: string) {
  const file = join(process.cwd(), "app", ...path.split("/").filter(Boolean).map((p) => p.replace(/^\{(\w+)\}$/, "[$1]")), "route.ts");
  return stat(file).then(() => true, () => false);
}

// ---------- 5b. API calls (per-call log, lib/apiLog.ts, migration 062) ----------
// Live, not cached: the tab polls every 5 s while live tail is on. Every filter is a bound parameter.
export const CALL_RANGES = { "15m": "15 minutes", "1h": "1 hour", "24h": "24 hours", "7d": "7 days", "30d": "30 days", "90d": "90 days" } as const;
export type CallFilters = {
  key?: string; app?: string; route?: string; tool?: string; status?: string; bench?: string;
  range?: string; from?: string; to?: string; page?: number; size?: number;
};
export type CallRow = {
  id: number; at: string; key: string | null; app: string | null; route: string; path: string; method: string;
  tool: string | null; status: number; ms: number | null; rows: number | null; ua: string | null; ip: string | null;
};
export type CallSummary = { perMinute: { minute: string; n: number; errors: number }[]; topApps: { app: string; key: string | null; n: number }[]; today: number };
export type CallFacets = { keys: string[]; apps: string[]; routes: string[]; tools: string[] };

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
function callWhere(f: CallFilters) {
  const where: string[] = [], params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (f.key === "(none)") where.push("key_name IS NULL"); else if (f.key) add("key_name = ?", f.key);
  if (f.app === "(none)") where.push("app IS NULL"); else if (f.app) add("app = ?", f.app);
  if (f.route) add("route = ?", f.route);
  if (f.bench === "hide") where.push(`app IS DISTINCT FROM '${BENCH_APP}'`);
  if (f.tool) add("mcp_tool = ?", f.tool);
  if (f.status && /^[1-5]xx$/.test(f.status)) add("status / 100 = ?", Number(f.status[0]));
  // from / to: wall-clock time in New York (datetime-local inputs), converted by Postgres.
  if (f.from && LOCAL_TIME.test(f.from)) add(`at >= (?::timestamp AT TIME ZONE '${CALL_TZ}')`, f.from);
  if (f.to && LOCAL_TIME.test(f.to)) add(`at < (?::timestamp AT TIME ZONE '${CALL_TZ}')`, f.to);
  const range = CALL_RANGES[(f.range ?? "") as keyof typeof CALL_RANGES];
  if (range && !f.from && !f.to) where.push(`at > now() - interval '${range}'`);
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

type RawCall = { id: string; at: Date; key_name: string | null; app: string | null; route: string; path: string; method: string; mcp_tool: string | null; status: number; ms: number | null; rows_returned: number | null; user_agent: string | null; client_ip: string | null };
const toCall = (r: RawCall): CallRow => ({
  id: Number(r.id), at: new Date(r.at).toISOString(), key: r.key_name, app: r.app, route: r.route, path: r.path, method: r.method,
  tool: r.mcp_tool, status: r.status, ms: r.ms, rows: r.rows_returned, ua: r.user_agent, ip: r.client_ip,
});
const CALL_COLS = "id, at, key_name, app, route, path, method, mcp_tool, status, ms, rows_returned, user_agent, host(client_ip) AS client_ip";

export async function apiCalls(f: CallFilters) {
  const w = callWhere(f);
  const size = Math.min(200, Math.max(10, f.size ?? 50)), page = Math.max(0, f.page ?? 0);
  const [list, [{ n }]] = await Promise.all([
    rows<RawCall>(`SELECT ${CALL_COLS} FROM api_calls ${w.sql} ORDER BY at DESC, id DESC LIMIT ${size} OFFSET ${page * size}`, w.params),
    rows<{ n: string }>(`SELECT count(*) AS n FROM api_calls ${w.sql}`, w.params),
  ]);
  return { rows: list.map(toCall), total: Number(n), page, size };
}

// CSV export of the filtered view, newest first, up to 50,000 rows.
export async function apiCallsCsv(f: CallFilters) {
  const w = callWhere(f);
  const list = (await rows<RawCall>(`SELECT ${CALL_COLS} FROM api_calls ${w.sql} ORDER BY at DESC, id DESC LIMIT 50000`, w.params)).map(toCall);
  const cell = (v: unknown) => { const t = v == null ? "" : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = ["at_utc", "at_new_york", "key_name", "app", "method", "route", "mcp_tool", "status", "ms", "rows_returned", "path", "user_agent", "client_ip"];
  const lines = list.map((r) => [r.at, fmtCallTime(r.at), r.key, r.app, r.method, r.route, r.tool, r.status, r.ms, r.rows, r.path, r.ua, r.ip].map(cell).join(","));
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}

// Calls per minute over the last hour, and top apps today (New York day). hideBench leaves out the nightly benchmark.
export async function callSummary(hideBench = false): Promise<CallSummary> {
  const nb = hideBench ? `AND app IS DISTINCT FROM '${BENCH_APP}'` : "";
  const [perMinute, topApps] = await Promise.all([
    rows<{ minute: Date; n: string; errors: string }>(`SELECT date_trunc('minute', at) AS minute, count(*) AS n, count(*) FILTER (WHERE status >= 400) AS errors
      FROM api_calls WHERE at > now() - interval '60 minutes' ${nb} GROUP BY 1 ORDER BY 1`),
    rows<{ app: string; key: string | null; n: string }>(`SELECT coalesce(app, '(none)') AS app, key_name AS key, count(*) AS n FROM api_calls
      WHERE at >= date_trunc('day', now() AT TIME ZONE '${CALL_TZ}') AT TIME ZONE '${CALL_TZ}' ${nb} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`),
  ]);
  const top = topApps.map((r) => ({ app: r.app, key: r.key, n: Number(r.n) }));
  return {
    perMinute: perMinute.map((r) => ({ minute: new Date(r.minute).toISOString(), n: Number(r.n), errors: Number(r.errors) })),
    topApps: top, today: top.reduce((s, r) => s + r.n, 0),
  };
}

// Values for the filter menus, from the last 90 days.
export const callFacets = () => cached<CallFacets>(minute, "callFacets", async () => {
  const col = (c: string) => rows<{ v: string }>(`SELECT DISTINCT ${c} AS v FROM api_calls WHERE ${c} IS NOT NULL ORDER BY 1 LIMIT 200`).then((r) => r.map((x) => x.v));
  const [keys, apps, routes, tools] = await Promise.all([col("key_name"), col("app"), col("route"), col("mcp_tool")]);
  return { keys, apps, routes, tools };
});

// ---------- 6. Keys and connected apps ----------
export type KeyRow = { id: number; name: string; prefix: string; scopes: string[]; rate: number; created: string; lastUsed: string | null; calls30: number; revoked: boolean; unused: boolean };
export const keys = () => cached<KeyRow[]>(minute, "keys", async () => {
  // Column by column on purpose: key_hash never leaves the database.
  const r = await rows<{ id: number; name: string; key_prefix: string; scopes: string[]; rate_per_min: number; created_at: string; last_used_at: string | null; revoked_at: string | null; calls30: string | null }>(
    `SELECT k.id, k.name, k.key_prefix, k.scopes, k.rate_per_min, k.created_at, k.last_used_at, k.revoked_at,
            (SELECT sum(n) FROM api_usage u WHERE u.key_id = k.id AND u.day > current_date - 30) AS calls30
     FROM api_keys k ORDER BY k.revoked_at IS NOT NULL, k.last_used_at DESC NULLS LAST, k.id`);
  return r.map((k) => ({
    id: k.id, name: k.name, prefix: k.key_prefix, scopes: k.scopes, rate: k.rate_per_min,
    created: new Date(k.created_at).toISOString(), lastUsed: k.last_used_at ? new Date(k.last_used_at).toISOString() : null,
    calls30: Number(k.calls30 ?? 0), revoked: !!k.revoked_at,
    unused: !k.revoked_at && (!k.last_used_at || Date.now() - Date.parse(k.last_used_at) > 30 * 86400_000),
  }));
});

// ---------- 7. Backups ----------
export type Backups = {
  dumps: { file: string; at: string; bytes: number }[]; latest: { file: string; at: string; bytes: number } | null; lastLog: string | null; ok: boolean; level: Level;
  offsite: { file: string; at: string; bytes: number; kept: number | null; level: Level } | null; offsiteLog: string | null;
  restoreTest: (RestoreTest & { level: Level }) | null;
};
export const backups = () => cached<Backups>(minute, "backups", async () => {
  let dumps: Backups["dumps"] = [];
  try {
    const files = (await readdir(BACKUP_DIR)).filter((f) => /^nombot-.*\.dump$/.test(f));
    dumps = (await Promise.all(files.map(async (f) => { const s = await stat(join(BACKUP_DIR, f)); return { file: f, at: s.mtime.toISOString(), bytes: s.size }; })))
      .sort((a, b) => b.at.localeCompare(a.at));
  } catch { /* no folder */ }
  let lastLog: string | null = null;
  try {
    const text = await readFile(BACKUP_LOG, "utf8");
    lastLog = text.trim().split("\n").filter((l) => l.trim()).at(-1)?.slice(0, 200) ?? null;
  } catch { /* no log */ }
  const ok = !!lastLog && /backup ok/.test(lastLog);
  const age = dumps[0] ? Date.now() - Date.parse(dumps[0].at) : Infinity;
  let offsite: Backups["offsite"] = null, offsiteLog: string | null = null;
  try {
    const o = JSON.parse(await readFile(OFFSITE_JSON, "utf8"));
    offsite = { ...o, level: Date.now() - Date.parse(o.at) > 50 * 3600_000 ? "warn" : "ok" };
  } catch { /* never copied */ }
  try { offsiteLog = (await readFile(OFFSITE_LOG, "utf8")).trim().split("\n").filter((l) => l.trim()).at(-1)?.slice(0, 200) ?? null; } catch { /* no log */ }
  // Weekly restore test on the Linux helper, from its newest heartbeat. Warn when older than 9 days.
  const rt = (await rows<{ r: RestoreTest | null }>("SELECT payload->'restore_test' AS r FROM helper_heartbeats WHERE host <> 'admin-eval' ORDER BY received_at DESC LIMIT 1").catch(() => []))[0]?.r ?? null;
  const restoreTest = rt?.at ? { ...rt, level: (!rt.ok ? "bad" : Date.now() - Date.parse(rt.at) > 9 * 86400_000 ? "warn" : "ok") as Level } : null;
  return { dumps, latest: dumps[0] ?? null, lastLog, ok, offsite, offsiteLog, restoreTest, level: !ok || age > 50 * 3600_000 ? "bad" : age > 26 * 3600_000 ? "warn" : "ok" };
});

// ---------- formatting ----------
export function fmtBytes(n: number | null | undefined) {
  if (n == null) return "–";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = Math.abs(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${n < 0 ? "-" : ""}${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
export function agoText(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

// Claude token usage on NomBot's key (llm_usage, generosity-data migration 074, logged by lib/llm.ts): exact token
// counts from each API response. Dollars come from the Anthropic console (Spending), not from here.
export type TokenRow = { calls: number; input: number; output: number; cache_read: number; cache_write: number };
export type TokenUsage = { since: string | null; today: TokenRow; d7: TokenRow; d30: TokenRow; all: TokenRow;
  days: (TokenRow & { day: string })[]; byModel: (TokenRow & { model: string })[]; byFeature: (TokenRow & { feature: string; source: string })[] };
export async function tokenUsage(): Promise<TokenUsage> {
  const sums = `count(*)::int AS calls, coalesce(sum(input_tokens), 0)::bigint AS input, coalesce(sum(output_tokens), 0)::bigint AS output,
    coalesce(sum(cache_read), 0)::bigint AS cache_read, coalesce(sum(cache_write), 0)::bigint AS cache_write`;
  const num = <T extends Record<string, unknown>>(r: T) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v])) as T;
  const [tot, days, models, features] = await Promise.all([
    db.query(`SELECT min(at) AS since,
      ${["today", "d7", "d30", "all"].map((k, i) => `json_build_object('calls', count(*) FILTER (WHERE ${["at >= date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'", "at > now() - interval '7 days'", "at > now() - interval '30 days'", "true"][i]}),
        ${["input_tokens", "output_tokens", "cache_read", "cache_write"].map((c, j) => `'${["input", "output", "cache_read", "cache_write"][j]}', coalesce(sum(${c}) FILTER (WHERE ${["at >= date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'", "at > now() - interval '7 days'", "at > now() - interval '30 days'", "true"][i]}), 0)`).join(", ")}) AS ${k}`).join(",\n      ")}
      FROM llm_usage`),
    db.query(`SELECT (at AT TIME ZONE 'America/New_York')::date::text AS day, ${sums} FROM llm_usage WHERE at > now() - interval '30 days' GROUP BY 1 ORDER BY 1 DESC`),
    db.query(`SELECT model, ${sums} FROM llm_usage WHERE at > now() - interval '30 days' GROUP BY 1 ORDER BY sum(input_tokens + output_tokens + cache_read + cache_write) DESC`),
    db.query(`SELECT coalesce(feature, 'other') AS feature, source, ${sums} FROM llm_usage WHERE at > now() - interval '30 days' GROUP BY 1, 2 ORDER BY sum(input_tokens + output_tokens + cache_read + cache_write) DESC`),
  ]);
  const t = tot.rows[0];
  return { since: t.since ? new Date(t.since).toISOString() : null, today: t.today, d7: t.d7, d30: t.d30, all: t.all,
    days: days.rows.map(num), byModel: models.rows.map(num), byFeature: features.rows.map(num) };
}
