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
