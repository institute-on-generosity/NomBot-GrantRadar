"use client";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "./NavLink";

export type ChipOption = { label: string; href: string; on: boolean; group?: string; note?: string }; // group: heading shown above its first option; note: small right-hand detail
export type Chip = {
  key: string;
  label: string;
  kind: "topic" | "set" | "unset" | "must"; // unset: no filter yet, shown as a dashed "Any …" chip
  options?: ChipOption[];                    // tap the chip to pick one
  removeHref?: string;                       // × clears this filter
};

// The filters NomBot read from the question, as chips the user can change or remove.
export function FilterChips({ chips, resetHref }: { chips: Chip[]; resetHref?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div className="chips filters" ref={root}>
      {chips.map((c) => (
        <span key={c.key} className={`fchip ${c.kind}${open === c.key ? " open" : ""}`}>
          {c.options ? (
            <button type="button" className="fchip-main" aria-haspopup="menu" aria-expanded={open === c.key} onClick={() => setOpen(open === c.key ? null : c.key)}>
              {c.label}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            </button>
          ) : <span className="fchip-main">{c.label}</span>}
          {c.removeHref && (
            <NavLink href={c.removeHref} className="fchip-x" title={`Remove ${c.label}`} label="Updating results…" search>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-label={`Remove ${c.label}`}><path d="M6 6l12 12M18 6 6 18" /></svg>
            </NavLink>
          )}
          {open === c.key && c.options && (
            <span className="fmenu" role="menu" onClick={() => setOpen(null)}>
              {c.options.map((o, i) => [
                o.group && o.group !== c.options![i - 1]?.group && <span key={`g-${o.group}`} className="fmenu-group" role="presentation">{o.group}</span>,
                <NavLink key={o.label} href={o.href} className={`fmenu-item${o.on ? " on" : ""}`} current={o.on} label="Updating results…" search>
                  <span>{o.label}</span>
                  {o.note && !o.on && <small className="fmenu-note">{o.note}</small>}
                  {o.on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5 9-10" /></svg>}
                </NavLink>,
              ])}
            </span>
          )}
        </span>
      ))}
      {resetHref && <NavLink href={resetHref} className="freset" label="Updating results…" search>Reset filters</NavLink>}
    </div>
  );
}
