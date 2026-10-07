"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { HISTORY_KEY, historyKey, type HistoryEntry } from "@/lib/history";
import { SAVED_KEY, type SavedOrg } from "@/lib/saved";
import { historyTarget } from "./HistoryList";
import { NavLink } from "./NavLink";
import { titleCase } from "./text";
import { useStoredList } from "./useStored";

// Line icons in the spirit of SF Symbols.
const PanelIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="3" y="4.5" width="18" height="15" rx="3.5" /><path d="M9 4.5v15" /></svg>;
const PlusIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>;

const SHOWN = 8; // items per section before "See all"

type Here = { path: string; question: string };

// Reports the current URL. URL hooks can't run while the layout prerenders,
// so this lives in its own <Suspense> and the sidebar shell stays static.
function TrackHere({ onChange }: { onChange: (h: Here) => void }) {
  const path = usePathname();
  const params = useSearchParams();
  // On an org page opened from results, the results question is in ?back=/?question=…
  const back = params.get("back");
  const question = params.get("question") ?? (back?.startsWith("/?") ? new URLSearchParams(back.slice(2)).get("question") : null) ?? "";
  useEffect(() => { onChange({ path, question: historyKey(question) }); }, [path, question, onChange]);
  return null;
}

// Left navigation, like Claude's: new search, starred organizations, recent questions.
// Collapses to a rail on desktop; slides in as a drawer on phones.
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const saved = useStoredList<SavedOrg>(SAVED_KEY, "nombot-saved");
  const history = useStoredList<HistoryEntry>(HISTORY_KEY, "nombot-history");
  const [here, setHere] = useState<Here>({ path: "", question: "" });
  const item = (on: boolean) => `side-item${on ? " on" : ""}`;

  return (
    <>
      <div className="mobilebar">
        <button className="iconbtn" onClick={() => setOpen(true)} aria-label="Open sidebar"><PanelIcon /></button>
        <Link href="/" className="brand"><span className="logo">N</span>NomBot</Link>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      {/* Any link tap closes the phone drawer. */}
      <Suspense fallback={null}><TrackHere onChange={setHere} /></Suspense>
      <aside className={`side${collapsed ? " collapsed" : ""}${open ? " open" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
        <div className="side-top">
          <Link href="/" className="brand"><span className="logo">N</span><span className="side-label">NomBot</span></Link>
          <button className="iconbtn side-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}><PanelIcon /></button>
        </div>
        <NavLink href="/" className={`side-new${here.path === "/" && !here.question ? " on" : ""}`} title="New search" current={here.path === "/" && !here.question}><PlusIcon /><span className="side-label">New search</span></NavLink>

        <nav className="side-scroll">
          <Section title="Starred" all="/saved" active={here.path === "/saved"}
            empty="Tap ☆ on any organization to keep it here.">
            {saved.slice(0, SHOWN).map((o) => (
              <NavLink key={o.ein} href={`/org/${o.ein}`} className={item(here.path === `/org/${o.ein}`)} current={here.path === `/org/${o.ein}`} title={titleCase(o.name)}>
                <span className="side-star">★</span>{titleCase(o.name)}
              </NavLink>
            ))}
          </Section>
          <Section title="Recents" all="/history" active={here.path === "/history"}
            empty="Your questions will show up here.">
            {history.slice(0, SHOWN).map((e) => (
              <NavLink key={e.key} href={historyTarget(e)} className={item(!!here.question && here.question === e.key)} current={here.path === "/" && here.question === e.key} title={e.question} label="Opening your results…">{e.question}</NavLink>
            ))}
          </Section>
        </nav>
      </aside>
    </>
  );
}

function Section({ title, all, active, empty, children }: { title: string; all: string; active: boolean; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="side-sec">
      <div className="side-h">
        <span>{title}</span>
        <Link href={all} className={active ? "on" : ""} aria-current={active ? "page" : undefined}>See all</Link>
      </div>
      {children.length ? children : <p className="side-empty">{empty}</p>}
    </section>
  );
}
