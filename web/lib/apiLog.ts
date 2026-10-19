// Per-call log of partner API and MCP requests (generosity-data migration 062: api_calls), for the /admin
// "API calls" tab. Only requests that send an Authorization header to /api/v1/* or /mcp are logged; NomBot's own
// pages call lib functions in-process and never reach here, and the dashboard's keyless health probes are skipped.
//
// Never stored: the API key or its hash, passwords, the Authorization header. Query parameters whose name looks
// like a secret (token, key, password...) and any nb_live_ value are redacted from the logged path.
// Writes never slow or fail a call: rows wait in memory and go out as one INSERT about once a second, errors
// are swallowed. Rows older than 90 days are deleted about once an hour (and nightly by ~/iog-host/backup-db.sh).
import { isIP } from "node:net";
import { db } from "./db";

export type CallKey = { id: number; name: string };
export type Call = {
  at: Date; key: CallKey | null; app: string | null; route: string; path: string; method: string;
  mcpTool: string | null; status: number; ms: number; rows: number | null; userAgent: string | null; clientIp: string | null;
};

export const RETENTION_DAYS = 90;
const FLUSH_MS = 1000, MAX_BUFFER = 5000, BATCH = 500;

// Key found for a request during authenticate(), so failed calls (403, 429) still log which key sent them.
export const requestKey = new WeakMap<Request, CallKey>();
// Rows a handler returned, set by list routes; read when the call is logged.
const responseRows = new WeakMap<Response, number>();
export function withRows(res: Response, rows: number | null) {
  if (rows != null) responseRows.set(res, rows);
  return res;
}
export const rowsOf = (res: Response) => responseRows.get(res) ?? null;

// Rows in a JSON result: an array, a results list, or a count. null when the shape has none.
export function countRows(out: unknown): number | null {
  if (Array.isArray(out)) return out.length;
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;
    if (Array.isArray(o.results)) return o.results.length;
    if (typeof o.count === "number") return o.count;
    for (const k of ["guides", "labels", "findings", "questions", "passages", "orgs"]) if (Array.isArray(o[k])) return (o[k] as unknown[]).length;
  }
  return null;
}

// ---------- request details ----------
const SECRET_PARAM = /(token|key|secret|pass|auth|sig|session|cookie|credential)/i;
export function safePath(url: string) {
  const u = new URL(url);
  const parts: string[] = [];
  for (const [k, v] of u.searchParams) {
    const hide = SECRET_PARAM.test(k) || /nb_live_|bearer\s/i.test(v);
    parts.push(`${encodeURIComponent(k)}=${hide ? "[redacted]" : encodeURIComponent(v)}`);
  }
  return (u.pathname + (parts.length ? `?${parts.join("&")}` : "")).slice(0, 1000);
}

export function clientIp(request: Request) {
  const first = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || (request.headers.get("x-real-ip") ?? "").trim();
  const ip = first.replace(/^\[|\]$/g, "").replace(/^::ffff:(?=\d+\.)/, "");
  return isIP(ip) ? ip : null;
}

// "Which application": the X-App header the caller names itself with, else the MCP client's name (initialize
// clientInfo, remembered per key and IP for the calls after it), else the user-agent family.
const cleanApp = (s: string | null | undefined) => (s ?? "").replace(/[^\w .:/@+()-]/g, "").trim().slice(0, 60) || null;
export function uaFamily(ua: string | null) {
  if (!ua) return null;
  const known: [RegExp, string][] = [
    [/^curl\//i, "curl"], [/python-requests/i, "python-requests"], [/python-httpx/i, "python-httpx"], [/aiohttp/i, "python-aiohttp"],
    [/python-urllib/i, "python-urllib"], [/^node$|undici|node-fetch/i, "node"], [/axios/i, "axios"], [/Go-http-client/i, "go"],
    [/PostmanRuntime/i, "postman"], [/insomnia/i, "insomnia"], [/^Wget/i, "wget"], [/claude/i, "claude"], [/openai|chatgpt/i, "openai"],
    [/Mozilla\/5\.0/, "browser"],
  ];
  for (const [re, name] of known) if (re.test(ua)) return name;
  return cleanApp(ua.split(/[\s/]/)[0]);
}
const mcpClients = new Map<string, { name: string; at: number }>();
export function rememberMcpClient(keyId: number, ip: string | null, name: string | null | undefined) {
  const n = cleanApp(name);
  if (!n) return;
  if (mcpClients.size > 2000) mcpClients.clear();
  mcpClients.set(`${keyId}|${ip ?? ""}`, { name: n, at: Date.now() });
}
export function appOf(request: Request, keyId: number | null, ip: string | null) {
  const header = cleanApp(request.headers.get("x-app"));
  if (header) return header;
  if (keyId != null) {
    const m = mcpClients.get(`${keyId}|${ip ?? ""}`);
    if (m && Date.now() - m.at < 24 * 3600_000) return m.name;
  }
  return uaFamily(request.headers.get("user-agent"));
}

// Everything about a call that comes from the request itself.
export function describe(request: Request, key: CallKey | null) {
  const ip = clientIp(request);
  return {
    key, clientIp: ip, app: appOf(request, key?.id ?? null, ip), path: safePath(request.url), method: request.method,
    userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
  };
}

// ---------- writing ----------
const g = globalThis as unknown as { apiCallBuffer?: Call[]; apiCallTimer?: ReturnType<typeof setTimeout> | null; apiCallPruned?: number };
const buffer = (g.apiCallBuffer ??= []);

export function logCall(c: Call) {
  if (buffer.length >= MAX_BUFFER) return; // database down for a while: drop rather than grow
  buffer.push(c);
  if (!g.apiCallTimer) {
    g.apiCallTimer = setTimeout(() => { g.apiCallTimer = null; void flush(); }, FLUSH_MS);
    g.apiCallTimer.unref?.();
  }
}

export async function flush() {
  while (buffer.length) {
    const batch = buffer.splice(0, BATCH);
    const cols = 13, vals: unknown[] = [];
    const tuples = batch.map((c, i) => {
      vals.push(c.at.toISOString(), c.key?.id ?? null, c.key?.name ?? null, c.app, c.route.slice(0, 200), c.path, c.method.slice(0, 10),
        c.mcpTool?.slice(0, 100) ?? null, c.status, Math.max(0, Math.round(c.ms)), c.rows, c.userAgent, c.clientIp);
      return `(${Array.from({ length: cols }, (_, j) => `$${i * cols + j + 1}`).join(", ")})`;
    });
    try {
      await db.query(
        `INSERT INTO api_calls (at, key_id, key_name, app, route, path, method, mcp_tool, status, ms, rows_returned, user_agent, client_ip)
         VALUES ${tuples.join(", ")}`, vals);
    } catch (e) {
      console.error("api call log failed", (e as Error).message);
      return;
    }
  }
  if (Date.now() - (g.apiCallPruned ?? 0) > 3600_000) {
    g.apiCallPruned = Date.now();
    db.query(`DELETE FROM api_calls WHERE at < now() - interval '${RETENTION_DAYS} days'`).catch((e) => console.error("api call prune failed", e.message));
  }
}
