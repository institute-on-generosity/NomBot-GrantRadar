// Partner API keys (api_keys table, generosity-data migration 031). The secret is printed once, at creation;
// only its sha256 is stored, so a lost key can't be recovered: revoke it and make a new one.
//
//   npm run api-key -- create "Candid research team" [--rate=60] [--scopes=read]
//   npm run api-key -- list
//   npm run api-key -- usage [id]          daily calls per route and status, newest 14 days
//   npm run api-key -- revoke <id|prefix>
//   npm run api-key -- delete <id|prefix>  removes the key and its usage (for test keys)
import { join } from "node:path";

try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }

const { db } = await import("../lib/db");
const { newSecret } = await import("../lib/apiAuth");

const [cmd, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=") as [string, string]));
const args = rest.filter((a) => !a.startsWith("--"));
const which = (v: string | undefined) => {
  if (!v) throw new Error("Give a key id or prefix.");
  return /^\d+$/.test(v) ? { where: "id = $1", value: Number(v) } : { where: "key_prefix = $1", value: v };
};

try {
  if (cmd === "create") {
    const name = args.join(" ").trim();
    if (!name) throw new Error('Name the partner: npm run api-key -- create "Partner name"');
    const rate = Number(flags.rate ?? 60);
    if (!Number.isInteger(rate) || rate < 1) throw new Error("--rate must be a whole number of requests per minute");
    const scopes = (flags.scopes ?? "read").split(",").map((s) => s.trim()).filter(Boolean);
    const k = newSecret();
    const { rows: [r] } = await db.query(
      "INSERT INTO api_keys (name, key_prefix, key_hash, scopes, rate_per_min) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [name, k.prefix, k.hash, scopes, rate]);
    console.log(`Key ${r.id} for ${name} (${scopes.join(",")}, ${rate}/min).`);
    console.log(`\n  ${k.secret}\n`);
    console.log("Shown once. Send it to the partner over a private channel; it can't be shown again.");
  } else if (cmd === "list") {
    const { rows } = await db.query(
      `SELECT k.id, k.name, k.key_prefix, k.scopes, k.rate_per_min, k.created_at::date AS created, k.last_used_at, k.revoked_at,
              coalesce((SELECT sum(n) FROM api_usage u WHERE u.key_id = k.id AND u.day > current_date - 30), 0)::int AS calls_30d
         FROM api_keys k ORDER BY k.id`);
    if (!rows.length) console.log("No API keys yet.");
    for (const r of rows)
      console.log([`#${r.id}`, r.revoked_at ? "REVOKED" : "active", `${r.key_prefix}…`, r.name, r.scopes.join(","), `${r.rate_per_min}/min`,
        `created ${r.created.toISOString().slice(0, 10)}`, `last used ${r.last_used_at ? r.last_used_at.toISOString().slice(0, 16).replace("T", " ") : "never"}`,
        `${r.calls_30d} calls/30d`].join("  "));
  } else if (cmd === "usage") {
    const { rows } = await db.query(
      `SELECT u.key_id, k.name, u.day, u.route, u.status, u.n FROM api_usage u JOIN api_keys k ON k.id = u.key_id
        WHERE ($1::int IS NULL OR u.key_id = $1) AND u.day > current_date - 14 ORDER BY u.day DESC, u.key_id, u.route, u.status`,
      [args[0] ? Number(args[0]) : null]);
    if (!rows.length) console.log("No usage in the last 14 days.");
    for (const r of rows) console.log(`${r.day.toISOString().slice(0, 10)}  #${r.key_id} ${r.name}  ${r.route}  ${r.status}  ${r.n}`);
  } else if (cmd === "revoke" || cmd === "delete") {
    const w = which(args[0]);
    const sql = cmd === "revoke"
      ? `UPDATE api_keys SET revoked_at = coalesce(revoked_at, now()) WHERE ${w.where} RETURNING id, name`
      : `DELETE FROM api_keys WHERE ${w.where} RETURNING id, name`;
    const { rows } = await db.query(sql, [w.value]);
    if (!rows.length) throw new Error("No such key.");
    for (const r of rows) console.log(`${cmd === "revoke" ? "Revoked" : "Deleted"} key ${r.id} (${r.name}). Running servers stop accepting it within 10 seconds.`);
  } else {
    console.log("Usage: npm run api-key -- create <name> [--rate=60] [--scopes=read] | list | usage [id] | revoke <id|prefix> | delete <id|prefix>");
    process.exitCode = cmd ? 1 : 0;
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
