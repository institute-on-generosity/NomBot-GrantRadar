"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Each source viewer, named like the links that open it.
const TITLES: [prefix: string, title: string][] = [["/source/bmf/", "IRS master file"], ["/source/soi/", "IRS SOI extract"]];
const titleOf = (path: string) => TITLES.find(([p]) => path.startsWith(p))?.[1] ?? "Source";

type Tab = { title: string; href: string };

// Right-hand panel for source viewers, opened by an intercepted /source/... route.
// Closing goes back in history, so Back/Forward close and reopen it. Opening one source while
// another is showing replaces the history entry (see NavLink), so one Close always closes the
// panel. Every source opened since the panel appeared stays as a tab to flip between.
export function SidePanel({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const query = useSearchParams().toString();
  const href = query ? `${path}?${query}` : path;
  const title = titleOf(path);
  const [tabs, setTabs] = useState<Tab[]>([]);

  // Remember the source on screen (updated while rendering); a viewer's own year links update
  // its tab rather than add one.
  const known = tabs.find((t) => t.title === title);
  if (known?.href !== href) setTabs(known ? tabs.map((t) => (t === known ? { title, href } : t)) : [...tabs, { title, href }]);

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
          {tabs.length > 1 ? (
            <nav className="panel-tabs" aria-label="Open sources">
              {tabs.map((t) => (
                <Link key={t.title} href={t.href} replace scroll={false} className={t.title === title ? "on" : undefined} aria-current={t.title === title ? "page" : undefined}>{t.title}</Link>
              ))}
            </nav>
          ) : <span>{title}</span>}
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
