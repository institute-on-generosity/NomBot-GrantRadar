"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TrustLegend, TrustMark } from "./TrustMark";
import { topicsOf } from "@/lib/popoverTopics";
import { createPortal } from "react-dom";
import { NavLink } from "./NavLink";
import { Icon } from "./Icons";
import type { PromptGroup } from "./HeroFlip";
import { SDG_SHORT as SHORT } from "@/lib/sdg";
import { CauseIcon } from "./CauseIcon";

// The research goal grid (home Research tab, /research): 17 goals as one-word tiles (SDG color as a dot, the full name
// as the tooltip), then groups across causes. Picking a tile opens a popover anchored to it (Oct 27, Hunter): it floats
// over the page, so nothing moves. Step 1 lists the goal's topics ("All of …" first); step 2 shows one topic's
// questions as full sentences, each asking it on click, with "‹ Back". Groups across causes go straight to their
// questions. Outside click, Esc or ✕ closes it and focus returns to the tile; Tab stays inside while it's open.
// On phones it is a bottom sheet. onPick: tell the page which group is open (the ask box placeholder).

const clean = (q: string) => q.replace(/\s\(SDG \d+\)/, "");
// Topics and their questions, one per intent, short forms for the standard ones (lib/popoverTopics)

// The popover's state lives in the URL (?cause=3&topic=mental-health, replaceState so steps add no history), so the
// browser Back from Browse, and Browse's "Back to chat", reopen it on the same cause and topic. from: where Browse
// should say it returns to.
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const causeKey = (g: PromptGroup) => (g.sdg ? String(g.sdg.n) : slug(g.label));

export function GoalGrid({ groups, onPick, from = "home" }: { groups: PromptGroup[]; onPick?: (g: PromptGroup | null) => void; from?: "home" | "research" }) {
  const [open, setOpen] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; notch: number; above: boolean } | null>(null);
  const tiles = useRef<Record<string, HTMLButtonElement | null>>({});
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
  // Reopen from the URL on arrival (back from Browse, or a shared link)
  useEffect(() => {
    const p = new URLSearchParams(location.search), c = p.get("cause");
    const g = c ? groups.find((x) => causeKey(x) === c) : null;
    if (!g) return;
    setOpen(g.label); onPick?.(g);
    const t = p.get("topic");
    if (t) setTopic(topicsOf(g).find((x) => slug(x.label) === t)?.label ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keep the URL in step with the popover, without adding history entries
  useEffect(() => {
    const u = new URL(location.href);
    const g = groups.find((x) => x.label === open);
    if (g) u.searchParams.set("cause", causeKey(g)); else u.searchParams.delete("cause");
    if (g && topic) u.searchParams.set("topic", slug(topic)); else u.searchParams.delete("topic");
    if (u.href !== location.href) history.replaceState(history.state, "", u.href);
  }, [open, topic, groups]);
  const group = groups.find((g) => g.label === open) ?? null;
  const topics = group ? topicsOf(group) : [];
  const step2 = group && (!group.table ? topics[0] : topics.find((t) => t.label === topic));

  // Placement is decided once when it opens and kept for both steps: always below the tile. When there isn't room
  // below, the page scrolls so the tile sits near the top first. Step 2 may grow downward (max-height, scrolls inside).
  useLayoutEffect(() => {
    if (!open) return;
    const place = (scroll: boolean) => {
      const t = tiles.current[open];
      if (!t) return;
      if (matchMedia("(max-width: 640px)").matches) { setPos({ left: 0, top: 0, notch: 0, above: false }); return; }
      let r = t.getBoundingClientRect();
      if (scroll && window.innerHeight - r.bottom < 380) {
        window.scrollBy({ top: r.top - 90, behavior: "instant" as ScrollBehavior });
        r = t.getBoundingClientRect();
      }
      const vw = document.documentElement.clientWidth, pw = Math.min(440, vw - 16), center = r.left + r.width / 2;
      const left = Math.max(8, Math.min(vw - pw - 8, center - pw / 2));
      setPos({ left: left + window.scrollX, top: r.bottom + 10 + window.scrollY, notch: center - left, above: false });
    };
    place(true);
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

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
        <b className="pp-title"><CauseIcon n={group.sdg?.n} label={group.sdg ? undefined : group.label} color={group.sdg?.color} size={30} />{title}{group.sdg && <TrustMark trust={group.sdg.trust} tip={group.sdg.tip} />}</b>
        {group.sdg && <NavLink href={`${group.sdg.href}?${new URLSearchParams({ from, back: typeof location === "undefined" ? "" : location.pathname + location.search })}`} className="pp-browse" label="Loading the cause…">Browse figures →</NavLink>}
        <button type="button" className="pp-close" onClick={close} aria-label="Close" title="Close (Esc)">✕</button>
      </div>
      {/* Step line: "Pick a topic", or a breadcrumb back to the topics */}
      {group.table && (step2
        ? <p className="pp-crumb"><button type="button" className="pp-back" onClick={() => setTopic(null)}>‹ {title}</button><span aria-hidden> / </span><span>{step2.label}</span></p>
        : <p className="pp-crumb">Pick a topic</p>)}
      <div className="pp-body">
        {!step2 ? (
          <ul key="topics" className="pp-list pp-step">
            {topics.map((t) => (
              <li key={t.label}><button type="button" className="pp-row" onClick={() => setTopic(t.label)}><span>{t.label}{t.trust && t.tip && <TrustMark trust={t.trust} tip={t.tip} />}</span><Icon name="chevronRight" size={15} /></button></li>
            ))}
          </ul>
        ) : (
          <ul key={step2.label} className="pp-list pp-step">
            {step2.prompts.map((a) => (
              <li key={a.q}><NavLink href={`/?${new URLSearchParams({ question: a.q })}`} className="pp-q" title={clean(a.q)} aria-label={clean(a.q)} label="Working out the answer…" search>
                <span>{a.label}</span><Icon name="arrowUpRight" size={15} />
              </NavLink></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const grid = (key: string, gs: PromptGroup[], head: React.ReactNode) => (
    <div className="gg-wrap">
      <p className="prompt-blocks-h">{head}</p>
      <div className={`gg${key === "sdg" ? " sdg" : ""}`}>
        {gs.map((g) => (
          <button key={g.label} ref={(el) => { tiles.current[g.label] = el; }} type="button" className={`gg-tile${open === g.label ? " on" : ""}`}
            aria-pressed={open === g.label} aria-expanded={open === g.label} aria-haspopup="dialog"
            onClick={() => pick(g)}>
            <CauseIcon n={g.sdg?.n} label={g.sdg ? undefined : g.label} color={g.sdg?.color} size={32} />
            <em>{g.sdg ? SHORT[g.sdg.n] ?? g.sdg.name : g.label}{g.sdg && <TrustMark trust={g.sdg.trust} tip={g.sdg.tip} />}</em>
          </button>
        ))}
      </div>
      {key === "sdg" && <TrustLegend limited={gs.some((g) => g.sdg?.trust === "limited")} />}
    </div>
  );

  return (
    <div className="prompt-groups gg-root">
      {sdg.length > 0 && grid("sdg", sdg, <>By cause <a className="prompt-help" href="https://sdgs.un.org/goals" target="_blank" rel="noreferrer" title="Causes follow the 17 UN Sustainable Development Goals" aria-label="About the 17 UN Sustainable Development Goals"><Icon name="info" size={13} /></a></>)}
      {cross.length > 0 && grid("cross", cross, "Across causes")}
      {group && typeof document !== "undefined" && createPortal(<>{sheet && <div className="pp-scrim" onClick={close} aria-hidden />}{popover}</>, document.body)}
    </div>
  );
}
