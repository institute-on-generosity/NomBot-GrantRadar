"use client";
import { useEffect, useRef, useState } from "react";
import { FOLDERS_KEY, SAVED_KEY, setFolder, type SavedOrg } from "@/lib/saved";
import { useStoredList } from "./useStored";

const FolderIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /></svg>;
const Check = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5 9-10" /></svg>;

// Pick the folder for a starred organization, or make a new one. Shown only once it's starred.
export function FolderPicker({ ein }: { ein: string }) {
  const saved = useStoredList<SavedOrg>(SAVED_KEY, "nombot-saved");
  const folders = useStoredList<string>(FOLDERS_KEY, "nombot-saved");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const root = useRef<HTMLSpanElement>(null);
  const org = saved.find((o) => o.ein === ein);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  if (!org) return null;
  const pick = (f: string | null) => { setFolder(ein, f); setOpen(false); setDraft(""); };
  return (
    <span className="folder-pick" ref={root}>
      <button type="button" className={`folder-btn${org.folder ? " set" : ""}`} aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.preventDefault(); setOpen(!open); }} title="Folder">
        <FolderIcon />{org.folder ?? "Add to folder"}
      </button>
      {open && (
        <span className="fmenu" role="menu">
          {folders.map((f) => (
            <button key={f} type="button" className={`fmenu-item${org.folder === f ? " on" : ""}`} onClick={() => pick(f)}>
              <span>{f}</span>{org.folder === f && <Check />}
            </button>
          ))}
          {org.folder && <button type="button" className="fmenu-item muted" onClick={() => pick(null)}><span>Remove from folder</span></button>}
          <form className="fmenu-new" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) pick(draft); }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New folder" aria-label="New folder name" autoFocus={!folders.length} maxLength={40} />
            <button type="submit" disabled={!draft.trim()}>Add</button>
          </form>
        </span>
      )}
    </span>
  );
}
