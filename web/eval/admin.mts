// /admin dashboard checks against a running server (default the dev server on :3000):
// 401 without ADMIN_PASSWORD, wrong password and forged cookie refused, 200 with it, every section renders,
// no API key secret or hash in the page, and the heartbeat endpoint rejects bad tokens and accepts the right one.
// Secrets come from ~/.config/iog-host/site.env (or the environment) and are never printed.
//   npm run test:admin                      against http://localhost:3000
//   npm run test:admin -- --base=http://localhost:4000
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
  for (const id of ["health", "helper", "data", "labels", "api", "keys", "backups"]) check(html.includes(`data-section="${id}"`), `section ${id} renders`);
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
} finally {
  await db.query("DELETE FROM helper_heartbeats WHERE host = $1", [HOST]).catch(() => {});
  await db.end();
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
