"use client";
import { useSyncExternalStore } from "react";

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
