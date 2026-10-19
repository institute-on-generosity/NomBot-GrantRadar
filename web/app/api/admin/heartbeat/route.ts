// Heartbeats from helper machines: the Linux GPU laptop's ~/iog-embed/heartbeat.py posts one a minute
// (cron) with Authorization: Bearer <HEARTBEAT_TOKEN>. proxy.ts lets this path past both sign-in gates.
// Stores the JSON as is (size capped) in helper_heartbeats and keeps 7 days.
import { db } from "@/lib/db";
import { isHeartbeatToken } from "@/lib/adminAuth";

const MAX_BYTES = 32_000;
let lastTrim = 0;

export async function POST(request: Request) {
  if (!isHeartbeatToken(request.headers.get("authorization"))) return Response.json({ error: "bad_token" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "bad_json" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "bad_json" }, { status: 400 });
  const host = String((body as { host?: unknown }).host ?? "unknown").slice(0, 100);
  await db.query("INSERT INTO helper_heartbeats (host, payload) VALUES ($1, $2)", [host, body]);
  if (Date.now() - lastTrim > 3600_000) {
    lastTrim = Date.now();
    db.query("DELETE FROM helper_heartbeats WHERE received_at < now() - interval '7 days'").catch(() => {});
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
