"use client";
import { useMemo, useSyncExternalStore } from "react";

// Re-render when a localStorage key changes (this tab or another).
export function useStored(key: string, event: string) {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(event, cb);
      window.addEventListener("storage", cb);
      return () => { window.removeEventListener(event, cb); window.removeEventListener("storage", cb); };
    },
    () => { try { return localStorage.getItem(key) ?? "[]"; } catch { return "[]"; } },
    () => "[]",
  );
}

// The stored JSON list, parsed from the hook's snapshot (not localStorage directly)
// so hydration matches the server's empty render.
export function useStoredList<T>(key: string, event: string): T[] {
  const raw = useStored(key, event);
  return useMemo(() => { try { return JSON.parse(raw); } catch { return []; } }, [raw]);
}
