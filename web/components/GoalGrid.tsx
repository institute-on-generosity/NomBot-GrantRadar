"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "./NavLink";
import { Icon } from "./Icons";
import type { PromptGroup } from "./HeroFlip";
import { SDG_SHORT as SHORT } from "@/lib/sdg";

// The research goal grid (home Research tab, /research): 17 goals as one-word tiles (SDG color as a dot, the full name
// as the tooltip), then groups across causes. Picking a tile opens a popover anchored to it (Oct 27, Hunter): it floats
// over the page, so nothing moves. Step 1 lists the goal's topics ("All of …" first); step 2 shows one topic's
// questions as full sentences, each asking it on click, with "‹ Back". Groups across causes go straight to their
// questions. Outside click, Esc or ✕ closes it and focus returns to the tile; Tab stays inside while it's open.
// On phones it is a bottom sheet. onPick: tell the page which group is open (the ask box placeholder).

const clean = (q: string) => q.replace(/\s\(SDG \d+\)/, "");
type Topic = { label: string; prompts: string[] };

// A goal's topics: the whole goal first, then each subcategory with data. Curated prompts for a topic come first,
// then its Browse questions (how much, growing, top funders, top states, under-funded), 5 at most.
function topicsOf(g: PromptGroup): Topic[] {
  if (!g.table) return [{ label: g.label, prompts: g.prompts }];
  const curated = new Map((g.subs ?? []).map((s) => [s.label, s.prompts]));
  const used = new Set<string>();
  const out = g.table.map((r) => {
    const mine = curated.get(r.label) ?? [];
    if (mine.length) used.add(r.label);
    const asks = r.q ? [r.q.total, r.q.trend, r.q.top_funders, r.q.by_state, r.q.underfunded] : [];
    return { label: r.label, prompts: [...new Set([...mine, ...asks])].slice(0, 5) };
  });
  // Curated prompts whose topic isn't a row (e.g. a goal-wide question) join the goal's own row
  const extra = (g.subs ?? []).filter((s) => !used.has(s.label)).flatMap((s) => s.prompts);
  if (extra.length && out[0]) out[0].prompts = [...new Set([...extra, ...out[0].prompts])].slice(0, 5);
  return out.filter((t) => t.prompts.length);
}

export function GoalGrid({ groups, onPick }: { groups: PromptGroup[]; onPick?: (g: PromptGroup | null) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; notch: number; above: boolean } | null>(null);
  const tiles = useRef<Record<string, HTMLButtonElement | null>>({});
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const sdg = groups.filter((g) => g.sdg), cross = groups.filter((g) => !g.sdg);
  // Phones: a bottom sheet, rendered on <body> so no ancestor's transform can trap position: fixed
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const m = matchMedia("(max-width: 640px)");
    const on = () => setSheet(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const group = groups.find((g) => g.label === open) ?? null;
  const topics = group ? topicsOf(group) : [];
  const step2 = group && (!group.table ? topics[0] : topics.find((t) => t.label === topic));

  // Place the popover under its tile (or above it when there's no room), inside the wrapper's width.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = tiles.current[open], w = wrap.current, p = pop.current;
      if (!t || !w || !p) return;
      if (matchMedia("(max-width: 640px)").matches) { setPos({ left: 0, top: 0, notch: 0, above: false }); return; }
      const W = w.clientWidth, pw = Math.min(420, W), tl = t.offsetLeft + t.offsetWidth / 2;
      const left = Math.max(0, Math.min(W - pw, tl - pw / 2));
      const r = t.getBoundingClientRect(), below = window.innerHeight - r.bottom;
      const above = below < p.offsetHeight + 24 && r.top > p.offsetHeight + 24;
      setPos({ left, top: above ? t.offsetTop - p.offsetHeight - 10 : t.offsetTop + t.offsetHeight + 10, notch: tl - left, above });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, topic]);

  // Focus into the popover on open and on each step.
  useEffect(() => {
    if (open) pop.current?.querySelector<HTMLElement>(".pp-row, .pp-q, .pp-back, .pp-close")?.focus({ preventScroll: true });
  }, [open, topic]);

  // Outside click closes.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const n = e.target as Node;
      if (pop.current?.contains(n) || tiles.current[open]?.contains(n) || (n as HTMLElement).classList?.contains("pp-scrim")) return;
      close();
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  });

  function close() {
    const was = open;
    setOpen(null); setTopic(null); setPos(null); onPick?.(null);
    if (was) requestAnimationFrame(() => tiles.current[was]?.focus());
  }
  const pick = (g: PromptGroup) => {
    if (open === g.label) return close();
    setOpen(g.label); setTopic(null); setPos(null); onPick?.(g);
  };
  // Esc closes; Tab cycles inside the popover.
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab" || !pop.current) return;
    const f = [...pop.current.querySelectorAll<HTMLElement>("a, button")];
    if (!f.length) return;
    const i = f.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  };

  const title = group ? (group.sdg ? group.sdg.name : group.label) : "";
  const popover = group && (
    <div ref={pop} className={`pp${pos?.above ? " above" : ""}`} role="dialog" aria-modal="false" aria-label={title} onKeyDown={keys}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden", "--notch": `${pos?.notch ?? 40}px` } as React.CSSProperties}>
      <div className="pp-head">
        {step2 && group.table
          ? <button type="button" className="pp-back" onClick={() => setTopic(null)}>‹ Back</button>
          : <b>{title}</b>}
        {group.sdg && <NavLink href={group.sdg.href} className="pp-browse" label="Loading the goal…">Browse figures →</NavLink>}
        <button type="button" className="pp-close" onClick={close} aria-label="Close" title="Close (Esc)">✕</button>
      </div>
      {!step2 ? (
        <div key="topics" className="pp-step">
          <p className="pp-sub">Pick a topic</p>
          <ul className="pp-list">
            {topics.map((t) => (
              <li key={t.label}><button type="button" className="pp-row" onClick={() => setTopic(t.label)}><span>{t.label}</span><Icon name="chevronRight" size={15} /></button></li>
            ))}
          </ul>
        </div>
      ) : (
        <div key={step2.label} className="pp-step">
          {group.table && <p className="pp-sub">{step2.label}</p>}
          <ul className="pp-list">
            {step2.prompts.map((q) => (
              <li key={q}><NavLink href={`/?${new URLSearchParams({ question: q })}`} className="pp-q" label="Working out the answer…" search>
                <span>{clean(q)}</span><Icon name="arrowUpRight" size={15} />
              </NavLink></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const grid = (key: string, gs: PromptGroup[], head: React.ReactNode) => (
    <div className="gg-wrap">
      <p className="prompt-blocks-h">{head}</p>
      <div className={`gg${key === "sdg" ? " sdg" : ""}`}>
        {gs.map((g) => (
          <button key={g.label} ref={(el) => { tiles.current[g.label] = el; }} type="button" className={`gg-tile${open === g.label ? " on" : ""}`}
            aria-pressed={open === g.label} aria-expanded={open === g.label} aria-haspopup="dialog"
            onClick={() => pick(g)} title={g.sdg ? `Goal ${g.sdg.n}: ${g.sdg.name}` : g.label}>
            {g.sdg && <i className="sdg-dot" style={{ background: g.sdg.color }} aria-hidden />}
            <em>{g.sdg ? SHORT[g.sdg.n] ?? g.sdg.name : g.label}</em>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={wrap} className="prompt-groups gg-root">
      {sdg.length > 0 && grid("sdg", sdg, <>By goal <span className="prompt-help" tabIndex={0} title="The 17 UN Sustainable Development Goals: a shared list of causes (poverty, health, climate and more) that funders and researchers use to group their work." aria-label="About the goals"><Icon name="info" size={13} /></span></>)}
      {cross.length > 0 && grid("cross", cross, "Across causes")}
      {sheet && group ? createPortal(<>{<div className="pp-scrim" onClick={close} aria-hidden />}{popover}</>, document.body) : popover}
    </div>
  );
}
