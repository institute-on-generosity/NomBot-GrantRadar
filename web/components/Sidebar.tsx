"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { HISTORY_KEY, historyKey, type HistoryEntry } from "@/lib/history";
import { FOLDERS_KEY, SAVED_KEY, type SavedOrg } from "@/lib/saved";
import { historyTarget } from "./HistoryList";
import { NavLink } from "./NavLink";
import { titleCase } from "./text";
import { useStoredList } from "./useStored";

// Line icons in the spirit of SF Symbols.
const PanelIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="3" y="4.5" width="18" height="15" rx="3.5" /><path d="M9 4.5v15" /></svg>;
const FolderIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /></svg>;
const ChartIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 20V11M12 20V5M19 20v-6" /></svg>;
const GridIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" /></svg>;
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
  const folders = useStoredList<string>(FOLDERS_KEY, "nombot-saved");
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
        <NavLink href="/" className={`side-new${here.path === "/" && !here.question ? " on" : ""}`} title="New search" current={here.path === "/" && !here.question}><PlusIcon /><span className="side-label">Search</span></NavLink>
        <NavLink href="/research" className={`side-new${here.path.startsWith("/research") ? " on" : ""}`} title="Research" current={here.path === "/research"} label="Loading research…"><ChartIcon /><span className="side-label">Research</span></NavLink>
        <NavLink href="/browse" className={`side-new${here.path.startsWith("/browse") ? " on" : ""}`} title="Browse by cause" current={here.path === "/browse"} label="Loading causes…"><GridIcon /><span className="side-label">Browse</span></NavLink>

        <nav className="side-scroll">
          <Section title="Saved" all="/saved" active={here.path === "/saved"}
            empty="Tap ☆ on any organization to keep it here.">
            {[
              ...folders.map((f) => (
                <NavLink key={`f-${f}`} href={`/saved?${new URLSearchParams({ folder: f })}`} className="side-item side-folder" title={f}>
                  <FolderIcon />{f}<small>{saved.filter((o) => o.folder === f).length}</small>
                </NavLink>
              )),
              ...saved.filter((o) => !o.folder).slice(0, SHOWN).map((o) => (
              <NavLink key={o.ein} href={`/org/${o.ein}?back=%2Fsaved`} className={item(here.path === `/org/${o.ein}`)} current={here.path === `/org/${o.ein}`} title={titleCase(o.name)}>
                <span className="side-star">★</span>{titleCase(o.name)}
              </NavLink>
            ))]}
          </Section>
          <Section title="Recents" all="/history" active={here.path === "/history"}
            empty="Your questions will show up here.">
            {history.slice(0, SHOWN).map((e) => (
              <NavLink key={e.key} href={historyTarget(e)} className={item(!!here.question && here.question === e.key)} current={here.path === "/" && here.question === e.key} title={e.question} label="Opening your results…" search>{e.question}</NavLink>
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
      {children.length ? children : <p className="side-empty" hidden>{empty}</p>}
    </section>
  );
}
