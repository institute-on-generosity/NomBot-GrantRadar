// /admin dashboard checks against a running server (default the dev server on :3000):
// 401 without ADMIN_PASSWORD, wrong password and forged cookie refused, 200 with it, every section renders,
// no API key secret or hash in the page, and the heartbeat endpoint rejects bad tokens and accepts the right one.
// API calls tab: a temporary key ("admin-eval", revoked at the end, its logged calls deleted) makes REST and MCP
// calls with an X-App header; each must appear in api_calls and /api/admin/calls with its second, key, app,
// route, MCP tool and status, and never the key itself.
// Secrets come from ~/.config/iog-host/site.env (or the environment) and are never printed.
//   npm run test:admin                      against http://localhost:3000
//   npm run test:admin -- --base=http://localhost:4000
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { db } = await import("../lib/db");

const BASE = (process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? process.env.API_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const envFile = (() => { try { return readFileSync(join(homedir(), ".config", "iog-host", "site.env"), "utf8"); } catch { return ""; } })();
const secret = (name: string) => process.env[name] || new RegExp(`^${name}=(.*)$`, "m").exec(envFile)?.[1]?.trim() || "";
const ADMIN = secret("ADMIN_PASSWORD"), TOKEN = secret("HEARTBEAT_TOKEN"), SITE = secret("SITE_PASSWORD");
if (!ADMIN || !TOKEN) throw new Error("ADMIN_PASSWORD and HEARTBEAT_TOKEN must be set (site.env or environment).");

let fails = 0, passes = 0;
const check = (ok: boolean, what: string) => { if (ok) passes++; else { fails++; console.log(`FAIL  ${what}`); } };
// The live service also has the site password (HTTP Basic). Sent only when the server asks for it.
const site: Record<string, string> = SITE ? { Authorization: `Basic ${Buffer.from(`admin:${SITE}`).toString("base64")}` } : {};
const go = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  fetch(BASE + path, { redirect: "manual", ...init, headers: { ...site, ...init.headers } });
const login = (password: string) => go("/api/admin/login", { method: "POST", body: new URLSearchParams({ password }) });

const HOST = "admin-eval";
let testKeyId: string | undefined;
try {
  // ---------- gate ----------
  const anon = await go("/admin");
  check(anon.status === 401, `/admin without admin password -> 401 (got ${anon.status})`);
  check((await anon.text()).includes('name="password"'), "/admin 401 shows the sign-in form");
  check((await go("/api/admin/anything")).status === 401, "/api/admin/* without admin cookie -> 401");
  const wrong = await login("not-the-password");
  check(wrong.status === 303 && (wrong.headers.get("location") ?? "").includes("wrong"), `wrong password -> 303 back with a note (got ${wrong.status})`);
  check(!wrong.headers.get("set-cookie"), "wrong password sets no cookie");
  const forged = await go("/admin", { headers: { Cookie: `nb_admin=${Math.floor(Date.now() / 1000) + 3600}.forged` } });
  check(forged.status === 401, `forged admin cookie -> 401 (got ${forged.status})`);
  const expired = await go("/admin", { headers: { Cookie: "nb_admin=1000.x" } });
  check(expired.status === 401, "expired admin cookie -> 401");

  const ok = await login(ADMIN);
  const cookie = /nb_admin=[^;]+/.exec(ok.headers.get("set-cookie") ?? "")?.[0];
  check(ok.status === 303 && !!cookie, `right password -> 303 with cookie (got ${ok.status})`);
  check(/HttpOnly/i.test(ok.headers.get("set-cookie") ?? ""), "admin cookie is HttpOnly");

  // ---------- page ----------
  const t0 = performance.now();
  const page = await go("/admin", { headers: { Cookie: cookie ?? "" } });
  const html = await page.text();
  const ms = Math.round(performance.now() - t0);
  check(page.status === 200, `/admin with admin cookie -> 200 (got ${page.status})`);
  for (const id of ["health", "helper", "data", "labels", "api", "calls", "keys", "backups"]) check(html.includes(`data-section="${id}"`), `section ${id} renders`);
  for (const text of ["Database", "Live site", "Public link", "Last backup", "Tailscale", "Heartbeat", "990-PF grants", "Pending approvals", "/api/v1/search", "MCP tools", "No off-machine copy"]) {
    check(html.includes(text), `page shows "${text}"`);
  }
  check(!/nb_live_[A-Za-z0-9_-]{7,}/.test(html), "no full API key in the page (prefixes only)");
  check(!/\b[0-9a-f]{64}\b/.test(html), "no key hash in the page");
  check(html.includes("noindex"), "page is noindex");
  const t1 = performance.now();
  await go("/admin", { headers: { Cookie: cookie ?? "" } }).then((r) => r.text());
  const warm = Math.round(performance.now() - t1);
  check(warm < 1500, `cached /admin under 1.5 s (got ${warm} ms)`);
  console.log(`/admin: first ${ms} ms, cached ${warm} ms`);

  // ---------- heartbeat ----------
  const beat = (auth: string | null, body: unknown = { host: HOST, load: [0.1, 0.1, 0.1], cpus: 1 }) =>
    fetch(`${BASE}/api/admin/heartbeat`, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) });
  check((await beat(null)).status === 401, "heartbeat without token -> 401");
  check((await beat("Bearer wrong-token")).status === 401, "heartbeat with a wrong token -> 401");
  check((await beat(`Bearer ${ADMIN}`)).status === 401, "heartbeat with the admin password -> 401");
  const good = await beat(`Bearer ${TOKEN}`);
  check(good.status === 200, `heartbeat with the right token -> 200 (got ${good.status})`);
  const bad = await fetch(`${BASE}/api/admin/heartbeat`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: "not json" });
  check(bad.status === 400, "heartbeat with bad JSON -> 400");
  const { rows } = await db.query("SELECT count(*)::int AS n FROM helper_heartbeats WHERE host = $1 AND received_at > now() - interval '1 minute'", [HOST]);
  check(rows[0].n >= 1, "heartbeat stored in helper_heartbeats");

  // ---------- API calls log ----------
  const made = execFileSync("npm", ["run", "-s", "api-key", "--", "create", HOST, "--rate=1000"], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
  const KEY = /nb_live_[A-Za-z0-9_-]+/.exec(made)?.[0];
  testKeyId = /Key (\d+)/.exec(made)?.[1];
  if (!KEY || !testKeyId) throw new Error("Could not create the test key.");
  const APP = "admin-eval-app";
  type Sent = { at: number; route: string; tool: string | null; status: number; app: string };
  const sent: Sent[] = [];
  const call = async (path: string, init: RequestInit & { headers?: Record<string, string> }, expect: Omit<Sent, "at">) => {
    const at = Date.now();
    const r = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${KEY}`, ...init.headers } });
    await r.text();
    check(r.status === (expect.route === "/mcp" ? 200 : expect.status), `${expect.tool ?? path} -> ${r.status}`);
    sent.push({ at, ...expect });
  };
  const rpc = (body: unknown, app?: string) => ({
    method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(app ? { "X-App": app } : {}) },
  });
  await call("/api/v1/grants?limit=3&api_key=should-not-be-kept", { headers: { "X-App": APP } }, { route: "/api/v1/grants", tool: null, status: 200, app: APP });
  await call("/api/v1/org/123", { headers: { "X-App": APP } }, { route: "/api/v1/org", tool: null, status: 400, app: APP });
  await call("/mcp", rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "admin-eval-mcp", version: "1" } } }, APP),
    { route: "/mcp", tool: "initialize", status: 200, app: APP });
  await call("/mcp", rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_cause_labels", arguments: {} } }, APP),
    { route: "/mcp", tool: "list_cause_labels", status: 200, app: APP });
  // No X-App: the app falls back to the MCP client's name from initialize.
  await call("/mcp", rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_organization", arguments: { ein: "12" } } }),
    { route: "/mcp", tool: "get_organization", status: 400, app: "admin-eval-mcp" });
  await new Promise((r) => setTimeout(r, 2500)); // the log flushes about once a second

  const logged = (await db.query<{ at: Date; key_name: string; app: string; route: string; mcp_tool: string | null; status: number; path: string; ms: number; rows_returned: number | null }>(
    "SELECT at, key_name, app, route, mcp_tool, status, path, ms, rows_returned FROM api_calls WHERE key_id = $1 ORDER BY at, id", [testKeyId])).rows;
  check(logged.length === sent.length, `api_calls has every test call (${logged.length}/${sent.length})`);
  sent.forEach((x, i) => {
    const r = logged[i];
    if (!r) return;
    const what = `call ${i + 1} (${x.tool ?? x.route})`;
    check(Math.abs(r.at.getTime() - x.at) < 1000 && Math.floor(r.at.getTime() / 1000) >= Math.floor(x.at / 1000) - 1, `${what}: logged time within the second (${r.at.toISOString()} vs ${new Date(x.at).toISOString()})`);
    check(r.key_name === HOST, `${what}: key name ${r.key_name}`);
    check(r.app === x.app, `${what}: app ${r.app} (want ${x.app})`);
    check(r.route === x.route, `${what}: route ${r.route}`);
    check(r.mcp_tool === x.tool, `${what}: MCP tool ${r.mcp_tool}`);
    check(r.status === x.status, `${what}: status ${r.status} (want ${x.status})`);
    check(Number.isInteger(r.ms) && r.ms >= 0, `${what}: ms recorded`);
  });
  check(logged[0]?.rows_returned === 3, `grants call: rows_returned 3 (got ${logged[0]?.rows_returned})`);
  check(!!logged[0] && logged[0].path.includes("api_key=[redacted]") && !logged[0].path.includes("should-not-be-kept"), "token-like query params redacted");
  const leaked = await db.query("SELECT count(*)::int AS n FROM api_calls WHERE key_id = $1 AND (path LIKE '%nb_live_%' OR user_agent LIKE '%nb_live_%')", [testKeyId]);
  check(leaked.rows[0].n === 0, "no API key stored in api_calls");

  const view = await go(`/api/admin/calls?key=${HOST}&range=1h`, { headers: { Cookie: cookie ?? "" } });
  const v = await view.json() as { rows: { at: string; app: string; tool: string | null; status: number }[]; total: number; summary: { perMinute: unknown[]; topApps: { app: string }[] } };
  check(view.status === 200 && v.total === sent.length, `/api/admin/calls filtered by key -> ${v.total} rows`);
  check(v.rows[0]?.tool === "get_organization" && v.rows.at(-1)?.tool === null, "/api/admin/calls newest first");
  check(/\.\d{3}Z$/.test(v.rows[0]?.at ?? ""), "/api/admin/calls times carry milliseconds");
  check(v.summary.perMinute.length > 0 && v.summary.topApps.some((a) => a.app === APP), "summary: calls per minute and top apps today");
  const tool = await (await go(`/api/admin/calls?key=${HOST}&tool=list_cause_labels&status=2xx`, { headers: { Cookie: cookie ?? "" } })).json() as { total: number };
  check(tool.total === 1, `filter by MCP tool and 2xx -> 1 (got ${tool.total})`);
  const err = await (await go(`/api/admin/calls?key=${HOST}&status=4xx`, { headers: { Cookie: cookie ?? "" } })).json() as { total: number };
  check(err.total === 2, `filter by 4xx -> 2 (got ${err.total})`);
  const csv = await go(`/api/admin/calls?key=${HOST}&app=${APP}&format=csv`, { headers: { Cookie: cookie ?? "" } });
  const csvText = await csv.text();
  check(csv.status === 200 && (csv.headers.get("content-type") ?? "").includes("text/csv") && csvText.trim().split("\n").length === 5, "CSV export of the filtered view (header + 4 rows)");
  check((await go(`/api/admin/calls`)).status === 401, "/api/admin/calls without admin cookie -> 401");
} finally {
  if (testKeyId) {
    await db.query("UPDATE api_keys SET revoked_at = now() WHERE id = $1", [testKeyId]).catch(() => {});
    await db.query("DELETE FROM api_calls WHERE key_id = $1", [testKeyId]).catch(() => {});
  }
  await db.query("DELETE FROM helper_heartbeats WHERE host = $1", [HOST]).catch(() => {});
  await db.end();
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
