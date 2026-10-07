"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clearSaved, deleteFolder, FOLDERS_KEY, renameFolder, SAVED_KEY, type SavedOrg } from "@/lib/saved";
import { FolderPicker } from "./FolderPicker";
import { NavLink } from "./NavLink";
import { money } from "./money";
import { StarButton } from "./StarButton";
import { titleCase } from "./text";
import { useStoredList } from "./useStored";

// Starred organizations, with folder tabs (?folder=<name>, or ?folder= for unfiled).
export function SavedList() {
  return <Suspense fallback={null}><List /></Suspense>;
}

function List() {
  const list = useStoredList<SavedOrg>(SAVED_KEY, "nombot-saved");
  const folders = useStoredList<string>(FOLDERS_KEY, "nombot-saved");
  const params = useSearchParams();
  const router = useRouter();
  const current = params.has("folder") ? params.get("folder") ?? "" : null; // null = All, "" = No folder
  const [renaming, setRenaming] = useState<string | null>(null);

  if (!list.length && !folders.length) return <p className="empty-note">Nothing starred yet. Tap ☆ on any organization to keep it here.</p>;
  const unfiled = list.filter((o) => !o.folder).length;
  const shown = current === null ? list : list.filter((o) => (o.folder ?? "") === current);
  const back = encodeURIComponent(current === null ? "/saved" : `/saved?${new URLSearchParams({ folder: current })}`); // org pages return to this tab
  const tab = (label: string, href: string, on: boolean, n: number) => (
    <Link key={label} href={href} className={`tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined} scroll={false}>{label}<small>{n}</small></Link>
  );

  return (
    <>
      <nav className="tabs folder-tabs" aria-label="Folders">
        {tab("All", "/saved", current === null, list.length)}
        {folders.map((f) => tab(f, `/saved?${new URLSearchParams({ folder: f })}`, current === f, list.filter((o) => o.folder === f).length))}
        {unfiled > 0 && folders.length > 0 && tab("No folder", "/saved?folder=", current === "", unfiled)}
      </nav>

      {current && folders.includes(current) && (
        <div className="folder-tools">
          {renaming !== null ? (
            <form onSubmit={(e) => { e.preventDefault(); renameFolder(current, renaming); router.replace(`/saved?${new URLSearchParams({ folder: renaming.trim() || current })}`, { scroll: false }); setRenaming(null); }}>
              <input value={renaming} onChange={(e) => setRenaming(e.target.value)} aria-label="Folder name" autoFocus maxLength={40} />
              <button type="submit">Save</button>
              <button type="button" onClick={() => setRenaming(null)}>Cancel</button>
            </form>
          ) : (
            <>
              <button type="button" onClick={() => setRenaming(current)}>Rename</button>
              <button type="button" onClick={() => { deleteFolder(current); router.replace("/saved", { scroll: false }); }}>Delete folder</button>
            </>
          )}
        </div>
      )}

      {!shown.length && <p className="empty-note">No organizations here yet. Use the folder button on a starred organization to add it.</p>}
      {shown.map((o) => (
        <div className="row" key={o.ein}>
          <div className="row-main">
            <div className="name-line"><StarButton org={o} /><NavLink href={`/org/${o.ein}?back=${back}`} className="name">{titleCase(o.name)}</NavLink></div>
            <div className="sub">{[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ")}{o.cause && <> · {o.cause}</>}</div>
            <FolderPicker ein={o.ein} />
          </div>
          {o.revenue != null && <div className="rev"><b>{money(o.revenue)}</b><span>revenue{o.year ? ` · ${o.year}` : ""}</span></div>}
        </div>
      ))}
      {list.length > 0 && current === null && <button className="h-clear" onClick={() => clearSaved()}>Clear starred</button>}
    </>
  );
}
