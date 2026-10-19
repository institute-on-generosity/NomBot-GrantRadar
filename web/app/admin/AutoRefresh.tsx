"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Reloads the dashboard's server data every minute while the tab is visible (the loaders cache 30-60 s).
export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  const [at, setAt] = useState<string | null>(null);
  useEffect(() => {
    const stamp = () => setAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    stamp();
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      stamp();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return <span>{at ? `Updated ${at}, refreshes every minute` : "Refreshes every minute"}</span>;
}
