// Partner API keys for /api/v1/* and /mcp (generosity-data migration 031: api_keys, api_usage).
// proxy.ts lets these paths past the SITE_PASSWORD gate; every route checks the Bearer key here instead.
// Secrets look like nb_live_<43 chars>; only their sha256 is stored. Keys are made with `npm run api-key`.
//
// Rate limit: per key, per minute, counted in memory in each server process (the MacBook runs one process
// per app, so it is exact there; behind several processes each one counts on its own).
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

export type ApiKey = { id: number; name: string; scopes: string[]; rate_per_min: number };
// Read-only scopes a key can hold: "read" (public data, /api/v1/* and the MCP data tools) and "iog_internal"
// (IoG internal documents, /api/v1/iog/* and the MCP IoG tools). There are no write or admin scopes.
export const SCOPES = ["read", "iog_internal"] as const;

export const KEY_PREFIX = "nb_live_";
export const hashKey = (secret: string) => createHash("sha256").update(secret).digest("hex");
export function newSecret() {
  const secret = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { secret, prefix: secret.slice(0, KEY_PREFIX.length + 6), hash: hashKey(secret) };
}

const DOCS = "/api/docs";
export function apiError(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: { code, message, docs: DOCS } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

// Short cache so a burst of calls doesn't hit the database for each one; a revoked key stops within 10 s.
const CACHE_MS = 10_000;
const cache = new Map<string, { key: (ApiKey & { revoked: boolean }) | null; at: number }>();
async function lookup(hash: string) {
  const hit = cache.get(hash);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.key;
  const { rows: [r] } = await db.query<ApiKey & { revoked: boolean }>(
    "SELECT id, name, scopes, rate_per_min, revoked_at IS NOT NULL AS revoked FROM api_keys WHERE key_hash = $1", [hash]);
  if (cache.size > 1000) cache.clear();
  cache.set(hash, { key: r ?? null, at: Date.now() });
  return r ?? null;
}

const windows = new Map<number, { n: number; reset: number }>();
function rate(key: ApiKey) {
  const now = Date.now();
  let w = windows.get(key.id);
  if (!w || w.reset <= now) windows.set(key.id, (w = { n: 0, reset: now + 60_000 }));
  w.n++;
  return { ok: w.n <= key.rate_per_min, remaining: Math.max(0, key.rate_per_min - w.n), resetIn: Math.ceil((w.reset - now) / 1000) };
}

export type Auth = { key: ApiKey; headers: Record<string, string> };

// Checks the Bearer key, its scope and its rate. Returns the key, or a JSON error Response (401/403/429).
export async function authenticate(request: Request, scope = "read"): Promise<Auth | Response> {
  const challenge = { "WWW-Authenticate": 'Bearer realm="NomBot API"' };
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m) return apiError(401, "missing_key", "Send your API key as: Authorization: Bearer nb_live_...", challenge);
  if (!m[1].startsWith(KEY_PREFIX)) return apiError(401, "invalid_key", "This is not a NomBot API key.", challenge);
  let key;
  try {
    key = await lookup(hashKey(m[1]));
  } catch (e) {
    console.error("api key lookup failed", (e as Error).message);
    return apiError(503, "unavailable", "The API is unavailable right now. Try again shortly.");
  }
  if (!key) return apiError(401, "invalid_key", "This API key is not recognized.", challenge);
  if (key.revoked) return apiError(403, "revoked_key", "This API key has been revoked.");
  if (!key.scopes.includes(scope)) return apiError(403, "insufficient_scope", `This API key lacks the "${scope}" scope.`);
  const r = rate(key);
  const headers = { "X-RateLimit-Limit": String(key.rate_per_min), "X-RateLimit-Remaining": String(r.remaining), "X-RateLimit-Reset": String(r.resetIn) };
  if (!r.ok) {
    record(key.id, new URL(request.url).pathname, 429);
    return apiError(429, "rate_limited", `Rate limit: ${key.rate_per_min} requests per minute for this key.`, { ...headers, "Retry-After": String(r.resetIn) });
  }
  return { key: { id: key.id, name: key.name, scopes: key.scopes, rate_per_min: key.rate_per_min }, headers };
}

// Daily counts per key, route and status, plus last_used_at. Fire and forget: never slows or fails a call.
// ms: handler time, summed and maxed per row (migration 061) for the /admin dashboard. Status 400 and up also
// goes to api_errors (newest 1,000 kept).
let errorWrites = 0;
export function record(keyId: number, route: string, status: number, ms = 0) {
  const r = route.slice(0, 100), t = Math.max(0, Math.round(ms));
  db.query(
    `WITH u AS (UPDATE api_keys SET last_used_at = now() WHERE id = $1)
     INSERT INTO api_usage (key_id, day, route, status, ms_sum, ms_max) VALUES ($1, current_date, $2, $3, $4, $4)
     ON CONFLICT (key_id, day, route, status) DO UPDATE SET n = api_usage.n + 1, ms_sum = api_usage.ms_sum + $4, ms_max = greatest(api_usage.ms_max, $4)`,
    [keyId, r, status, t],
  ).catch((e) => console.error("api usage write failed", e.message));
  if (status >= 400) {
    db.query("INSERT INTO api_errors (key_id, route, status, ms) VALUES ($1, $2, $3, $4)", [keyId, r, status, t])
      .then(() => { if (++errorWrites % 100 === 0) return db.query("DELETE FROM api_errors WHERE id < (SELECT min(id) FROM (SELECT id FROM api_errors ORDER BY id DESC LIMIT 1000) k)"); })
      .catch((e) => console.error("api error log failed", e.message));
  }
}

// Wraps a read-only REST handler: auth, rate limit, usage, rate headers, JSON 500 on a crash.
// scope: what the key must hold ("read" for the public-data API, "iog_internal" for /api/v1/iog/*).
export function keyed<R extends Request, C>(route: string, handler: (request: R, ctx: C, auth: Auth) => Promise<Response>, scope = "read") {
  return async (request: R, ctx: C) => {
    const auth = await authenticate(request, scope);
    if (auth instanceof Response) return auth;
    let res: Response;
    const t0 = performance.now();
    try {
      res = await handler(request, ctx, auth);
    } catch (e) {
      console.error(`${route} failed`, e);
      res = apiError(500, "server_error", "Something went wrong on our side.");
    }
    record(auth.key.id, route, res.status, performance.now() - t0);
    for (const [k, v] of Object.entries(auth.headers)) res.headers.set(k, v);
    if (!res.headers.has("Cache-Control")) res.headers.set("Cache-Control", "no-store");
    return res;
  };
}

// Public origin for absolute links: PUBLIC_BASE_URL, else the forwarded host (Cloudflare tunnel), else the request.
export function baseUrl(request: Request) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
