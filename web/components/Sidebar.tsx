"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { HISTORY_KEY, historyKey, type HistoryEntry } from "@/lib/history";
import { SAVED_KEY, type SavedOrg } from "@/lib/saved";
import { GR_HISTORY_EVENT, GR_HISTORY_KEY, GR_SAVED_EVENT, GR_SAVED_KEY, missionKey, type RecentMission, type SavedFunder } from "@/lib/grantStore";
import { MATCH_STEPS } from "@/lib/grantExamples";
import { historyTarget } from "./HistoryList";
import { NavLink } from "./NavLink";
import { RadarMark } from "./RadarMark";
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
  const question = params.get("question") ?? params.get("mission") ?? (back?.startsWith("/?") ? new URLSearchParams(back.slice(2)).get("question") : null) ?? "";
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
  const funders = useStoredList<SavedFunder>(GR_SAVED_KEY, GR_SAVED_EVENT);
  const missions = useStoredList<RecentMission>(GR_HISTORY_KEY, GR_HISTORY_EVENT);
  const [here, setHere] = useState<Here>({ path: "", question: "" });
  const item = (on: boolean) => `side-item${on ? " on" : ""}`;
  const grants = here.path.startsWith("/grants");

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
          {grants
            ? <Link href="/grants" className="brand"><span className="logo radar"><RadarMark size={16} /></span><span className="side-label">GrantRadar</span></Link>
            : <Link href="/" className="brand"><span className="logo">N</span><span className="side-label">NomBot</span></Link>}
          <button className="iconbtn side-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}><PanelIcon /></button>
        </div>
        {/* NomBot finds nonprofits; GrantRadar finds the foundations that fund work like yours */}
        <div className="side-apps" role="tablist" aria-label="App">
          <span className={`thumb${grants ? " right" : ""}`} aria-hidden />
          <Link href="/" className={grants ? "" : "on"} role="tab" aria-selected={!grants}><span className="logo mini">N</span>NomBot</Link>
          <Link href="/grants" className={grants ? "on" : ""} role="tab" aria-selected={grants}><RadarMark size={14} />GrantRadar</Link>
        </div>
        {grants
          ? <NavLink href="/grants" className={`side-new${here.path === "/grants" && !here.question ? " on" : ""}`} title="New match" current={here.path === "/grants" && !here.question}><PlusIcon /><span className="side-label">New match</span></NavLink>
          : <NavLink href="/" className={`side-new${here.path === "/" && !here.question ? " on" : ""}`} title="New search" current={here.path === "/" && !here.question}><PlusIcon /><span className="side-label">New search</span></NavLink>}

{grants ? (
        <nav className="side-scroll">
          <Section title="Starred" all="/grants/saved" active={here.path === "/grants/saved"} empty="Tap ☆ on any funder to keep it here.">
            {funders.slice(0, SHOWN).map((f) => (
              <NavLink key={f.ein} href={`/grants/funder/${f.ein}`} className={item(here.path === `/grants/funder/${f.ein}`)} current={here.path === `/grants/funder/${f.ein}`} title={titleCase(f.name)}>
                <span className="side-star">★</span>{titleCase(f.name)}
              </NavLink>
            ))}
          </Section>
          <Section title="Recents" all="/grants/history" active={here.path === "/grants/history"} empty="Your missions will show up here.">
            {missions.slice(0, SHOWN).map((m) => {
              const on = here.path === "/grants" && missionKey(here.question) === m.key;
              return <NavLink key={m.key} href={m.href} className={item(on)} current={on} title={m.mission} label="Reading your mission…" steps={MATCH_STEPS} search>{m.mission}</NavLink>;
            })}
          </Section>
        </nav>
        ) : (
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
              <NavLink key={e.key} href={historyTarget(e)} className={item(!!here.question && here.question === e.key)} current={here.path === "/" && here.question === e.key} title={e.question} label="Opening your results…" search>{e.question}</NavLink>
            ))}
          </Section>
        </nav>
        )}
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
