import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
// Small in-memory cache with a size cap and time-to-live (per server process).
// Stored on globalThis so pages and route handlers (separate module graphs in
// Next.js) share one cache, and dev hot-reloads don't empty it.
type Store<T> = Map<string, { at: number; value: Promise<T> }>;
const registry = ((globalThis as { __nombotMemo?: Map<string, Store<unknown>> }).__nombotMemo ??= new Map());

export function memo<T>(name: string, max: number, ttlMs: number) {
  if (!registry.has(name)) registry.set(name, new Map());
  const store = registry.get(name) as Store<T>;
  return (key: string, make: () => Promise<T>): Promise<T> => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = make();
    store.set(key, { at: Date.now(), value });
    value.catch(() => store.delete(key)); // don't keep failures
    if (store.size > max) store.delete(store.keys().next().value!); // drop oldest
    return value;
  };
}

// memo plus a disk copy (Oct 27, UX audit S2): the same question gives the same relevance scores and summary after a
// server restart, so a shared link shows what the tester saw. One small JSON file per key under
// ~/Library/Caches/nombot/<name>/ (NOMBOT_CACHE_DIR to move it). Only plain JSON values; Maps go through toJSON/fromJSON.

export function diskMemo<T>(name: string, max: number, ttlMs: number, io: { toJSON: (v: T) => unknown; fromJSON: (j: unknown) => T; keep?: (v: T) => boolean } = { toJSON: (v) => v, fromJSON: (j) => j as T }) {
  const mem = memo<T>(name, max, ttlMs);
  const dir = join(process.env.NOMBOT_CACHE_DIR ?? join(homedir(), "Library", "Caches", "nombot"), name.replace(/[^a-z0-9:._-]/gi, "_"));
  return (key: string, make: () => Promise<T>): Promise<T> => mem(key, async () => {
    const file = join(dir, `${createHash("sha256").update(key).digest("hex").slice(0, 40)}.json`);
    try {
      const j = JSON.parse(await readFile(file, "utf8")) as { at: number; key: string; v: unknown };
      if (j.key === key && Date.now() - j.at < ttlMs) return io.fromJSON(j.v);
    } catch { /* no copy yet */ }
    const v = await make();
    if (io.keep ? io.keep(v) : v != null) {
      mkdir(dir, { recursive: true }).then(() => writeFile(file, JSON.stringify({ at: Date.now(), key, v: io.toJSON(v) }))).catch(() => {});
    }
    return v;
  });
}
