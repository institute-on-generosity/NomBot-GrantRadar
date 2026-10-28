"use client";
import { useEffect, useState } from "react";

// Memo toolbar (screen only): an optional "Prepared by" line, then PDF (the browser's print to PDF, one US Letter
// page) or an editable Word file with the same content. The name stays in this browser for the next memo.
const KEY = "nombot.memo.by";
export function MemoTools({ docx }: { docx: string }) {
  const [by, setBy] = useState("");
  // A name in the link (?by=) wins over the one remembered in this browser
  useEffect(() => { const u = new URLSearchParams(location.search).get("by"); if (u) { setBy(u.slice(0, 80)); return; } try { setBy(localStorage.getItem(KEY) ?? ""); } catch { /* storage blocked */ } }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, by); } catch { /* storage blocked */ }
    document.querySelectorAll<HTMLElement>("[data-memo-by]").forEach((el) => { el.textContent = by.trim() ? `Prepared by ${by.trim()}` : ""; el.hidden = !by.trim(); });
  }, [by]);
  const q = by.trim() ? `?${new URLSearchParams({ by: by.trim() })}` : "";
  return (
    <div className="memo-tools" role="toolbar" aria-label="Memo">
      <label>Prepared by <input value={by} onChange={(e) => setBy(e.target.value.slice(0, 80))} placeholder="Your name or firm (optional)" /></label>
      <button type="button" onClick={() => window.print()}>Save as PDF</button>
      <a href={`${docx}${q}`} download>Word (.docx)</a>
    </div>
  );
}
