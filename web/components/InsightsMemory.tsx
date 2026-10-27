"use client";
import { useEffect } from "react";

// Remembers the search page's Insights toggle (the #insights checkbox: slim panel vs full panel) per browser.
export function InsightsMemory() {
  useEffect(() => {
    const box = document.getElementById("insights") as HTMLInputElement | null;
    if (!box) return;
    try { box.checked = localStorage.getItem("nombot:insights") === "open"; } catch { /* private mode */ }
    const save = () => { try { localStorage.setItem("nombot:insights", box.checked ? "open" : "slim"); } catch { /* ignore */ } };
    box.addEventListener("change", save);
    return () => box.removeEventListener("change", save);
  }, []);
  return null;
}
