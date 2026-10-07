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
          {/* Pushes the panel away to the right */}
          <button type="button" className="panel-close" onClick={() => router.back()} aria-label="Close panel" title="Close (Esc)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12h12M11 7l5 5-5 5M20 5v14" /></svg>
            Close
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </aside>
    </>
  );
}
