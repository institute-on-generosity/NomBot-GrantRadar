"use client";
import { useState } from "react";
import Link from "next/link";
import { HISTORY_KEY, type HistoryEntry } from "@/lib/history";
import { SAVED_KEY, type SavedOrg } from "@/lib/saved";
import { historyTarget } from "./HistoryList";
import { NavLink } from "./NavLink";
import { titleCase } from "./text";
import { useStoredList } from "./useStored";

const SHOWN = 8; // items per section before "See all"

// Left navigation, like Claude's: new search, starred organizations, recent questions.
// Collapses to a rail on desktop; slides in as a drawer on phones.
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const saved = useStoredList<SavedOrg>(SAVED_KEY, "nombot-saved");
  const history = useStoredList<HistoryEntry>(HISTORY_KEY, "nombot-history");

  return (
    <>
      <div className="mobilebar">
        <button className="iconbtn" onClick={() => setOpen(true)} aria-label="Open sidebar">☰</button>
        <Link href="/" className="brand"><span className="logo">N</span>NomBot</Link>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      {/* Any link tap closes the phone drawer. */}
      <aside className={`side${collapsed ? " collapsed" : ""}${open ? " open" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
        <div className="side-top">
          <Link href="/" className="brand"><span className="logo">N</span><span className="side-label">NomBot</span></Link>
          <button className="iconbtn side-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? "»" : "«"}</button>
        </div>
        <NavLink href="/" className="side-new" title="New search">＋<span className="side-label">New search</span></NavLink>

        <nav className="side-scroll">
          <Section title="Starred" all="/saved"
            empty="Tap ☆ on any organization to keep it here.">
            {saved.slice(0, SHOWN).map((o) => (
              <NavLink key={o.ein} href={`/org/${o.ein}`} className="side-item" title={titleCase(o.name)}>
                <span className="side-star">★</span>{titleCase(o.name)}
              </NavLink>
            ))}
          </Section>
          <Section title="Recents" all="/history"
            empty="Your questions will show up here.">
            {history.slice(0, SHOWN).map((e) => (
              <NavLink key={e.key} href={historyTarget(e)} className="side-item" title={e.question} label="Opening your results…">{e.question}</NavLink>
            ))}
          </Section>
        </nav>
      </aside>
    </>
  );
}

function Section({ title, all, empty, children }: { title: string; all: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="side-sec">
      <div className="side-h">
        <span>{title}</span>
        <Link href={all}>See all</Link>
      </div>
      {children.length ? children : <p className="side-empty">{empty}</p>}
    </section>
  );
}
