// Gate for the internal /admin dashboard and /api/admin/*, on top of SITE_PASSWORD (proxy.ts).
// Demo viewers may know the site password, so admin needs its own: ADMIN_PASSWORD. Signing in at /admin sets
// an HttpOnly cookie that holds an expiry and an HMAC of it keyed by the password (changing the password signs
// everyone out). HEARTBEAT_TOKEN is the Bearer token the Linux helper posts heartbeats with.
//
// Both come from the environment, else from ~/.config/iog-host/site.env (the file the live service loads), so
// the dev server works without a copy. Only these two names are ever read from that file.
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type SecretName = "ADMIN_PASSWORD" | "HEARTBEAT_TOKEN";
const SITE_ENV = join(homedir(), ".config", "iog-host", "site.env");
let fileCache: { at: number; vals: Partial<Record<SecretName, string>> } | null = null;

export function secret(name: SecretName): string | null {
  const env = process.env[name];
  if (env) return env;
  if (!fileCache || Date.now() - fileCache.at > 30_000) {
    const vals: Partial<Record<SecretName, string>> = {};
    try {
      for (const line of readFileSync(SITE_ENV, "utf8").split("\n")) {
        const m = /^(ADMIN_PASSWORD|HEARTBEAT_TOKEN)=(.*)$/.exec(line.trim());
        if (m) vals[m[1] as SecretName] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* no file: admin stays locked */ }
    fileCache = { at: Date.now(), vals };
  }
  return fileCache.vals[name] || null;
}

export const ADMIN_COOKIE = "nb_admin";
const TTL_S = 12 * 3600;

export function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const sign = (exp: number, password: string) => createHmac("sha256", password).update(`nombot-admin:${exp}`).digest("base64url");

// Cookie value for a fresh sign-in, or null when ADMIN_PASSWORD is unset.
export function adminCookie(): { value: string; maxAge: number } | null {
  const pw = secret("ADMIN_PASSWORD");
  if (!pw) return null;
  const exp = Math.floor(Date.now() / 1000) + TTL_S;
  return { value: `${exp}.${sign(exp, pw)}`, maxAge: TTL_S };
}

export function isAdminCookie(value: string | undefined | null): boolean {
  const pw = secret("ADMIN_PASSWORD");
  if (!pw || !value) return false;
  const [exp, mac] = value.split(".");
  const n = Number(exp);
  if (!Number.isInteger(n) || n * 1000 < Date.now() || !mac) return false;
  return sameSecret(mac, sign(n, pw));
}

export function isAdminPassword(given: string) {
  const pw = secret("ADMIN_PASSWORD");
  return !!pw && sameSecret(given, pw);
}

export function isHeartbeatToken(header: string | null) {
  const token = secret("HEARTBEAT_TOKEN");
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return !!token && !!m && sameSecret(m[1], token);
}

// Sign-in attempts per client per minute (in memory): slows password guessing through the public link.
const tries = new Map<string, { n: number; reset: number }>();
export function loginAllowed(client: string) {
  const now = Date.now();
  let t = tries.get(client);
  if (!t || t.reset <= now) tries.set(client, (t = { n: 0, reset: now + 60_000 }));
  if (tries.size > 1000) tries.clear();
  return ++t.n <= 10;
}

// The 401 page /admin shows until you sign in. Plain HTML from the proxy, styled like the app.
export function signInPage(error: boolean) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Admin sign in · NomBot</title><style>
:root{--ink:#1d1d1f;--mute:#6e6e73;--bg:#fff;--fill:#f5f5f7;--line:rgba(0,0,0,.08);--g:#248a3d;--red:#d70015;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--ink:#f5f5f7;--mute:#98989d;--bg:#000;--fill:#1c1c1e;--line:rgba(255,255,255,.1);--g:#30d158;--red:#ff453a}}
*{box-sizing:border-box;margin:0}body{font:15px/1.47 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;display:grid;place-items:center;padding:16px}
form{width:100%;max-width:340px;display:flex;flex-direction:column;gap:12px;padding:28px;border-radius:20px;background:var(--fill)}
h1{font-size:20px;font-weight:600;letter-spacing:-.02em}p{color:var(--mute);font-size:13px}.err{color:var(--red)}
input{font:inherit;padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
button{font:inherit;font-weight:600;padding:10px;border:0;border-radius:999px;background:#248a3d;color:#fff;cursor:pointer}
</style></head><body><form method="post" action="/api/admin/login"><h1>NomBot admin</h1><p>Internal dashboard. Enter the admin password.</p>
${error ? '<p class="err">That password is not right.</p>' : ""}<input type="password" name="password" autocomplete="current-password" aria-label="Admin password" autofocus required>
<button type="submit">Sign in</button></form></body></html>`;
}
