"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Right-hand panel for source viewers, opened by an intercepted /source/... route.
// Closing goes back in history, so Back/Forward close and reopen it.
export function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.back(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <>
      <div className="panel-scrim" onClick={() => router.back()} />
      <aside className="side-panel" aria-label={title}>
        <header className="panel-head">
          <span>{title}</span>
          <button type="button" className="iconbtn" onClick={() => router.back()} aria-label="Close panel" title="Close (Esc)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </aside>
    </>
  );
}
