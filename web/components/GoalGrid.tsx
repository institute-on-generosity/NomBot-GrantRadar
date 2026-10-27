"use client";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink } from "./NavLink";
import { Icon } from "./Icons";
import type { PromptGroup } from "./HeroFlip";
import { SDG_SHORT as SHORT } from "@/lib/sdg";

// The research goal grid (home Research tab, /research): 17 goals as one-word tiles (SDG color as a dot, the full name
// as the tooltip), then groups across causes. Picking a tile opens its prompts in a panel attached right under that
// tile's row, with a notch pointing at it. The grid itself never moves; only the rows below shift down. Another tile
// moves the panel to its row; the same tile, Esc or ✕ closes it (Oct 27, Hunter).
// Inside: a table with the whole goal first, then each subcategory, and the same five columns on every row (How much,
// Growing?, Top funders, Top states, Under-funded orgs); each cell asks the full question (its tooltip). Other curated
// questions follow as full sentences. Groups across causes list their questions as full sentences. onPick: tell the page which group is open (the ask box placeholder).


// The panel's columns, always in this order.
const COLS = [["total", "How much"], ["trend", "Growing?"], ["top_funders", "Top funders"], ["by_state", "Top states"], ["underfunded", "Under-funded orgs"]] as const;

const clean = (q: string) => q.replace(/\s\(SDG \d+\)/, "");

export function GoalGrid({ groups, onPick }: { groups: PromptGroup[]; onPick?: (g: PromptGroup | null) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [cols, setCols] = useState<Record<string, number>>({ sdg: 6, cross: 4 });
  const grids = useRef<Record<string, HTMLDivElement | null>>({});
  const tiles = useRef<Record<string, HTMLButtonElement | null>>({});
  const panel = useRef<HTMLDivElement>(null);
  const [notch, setNotch] = useState(0);
  const sdg = groups.filter((g) => g.sdg), cross = groups.filter((g) => !g.sdg);

  // Columns per grid as laid out (6 or 3 for goals, 4 or 2 across causes), so the panel goes after the right tile.
  useLayoutEffect(() => {
    const measure = () => setCols(Object.fromEntries(Object.entries(grids.current).map(([k, el]) =>
      [k, el ? getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length || 1 : 1])));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Notch under the picked tile; focus into the panel; scroll just enough to show it.
  useLayoutEffect(() => {
    if (!open) return;
    const t = tiles.current[open], p = panel.current;
    if (t && p) setNotch(t.offsetLeft + t.offsetWidth / 2 - p.offsetLeft);
  }, [open, cols]);
  useEffect(() => {
    if (!open) return;
    const p = panel.current;
    if (!p) return;
    p.querySelector<HTMLElement>(".gp-chip, .gp-q, .gp-close")?.focus({ preventScroll: true });
    const r = p.getBoundingClientRect(), over = r.bottom - window.innerHeight + 16;
    if (over > 0) window.scrollBy({ top: Math.min(over, r.top - 80), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [open]);

  const close = () => {
    const was = open;
    setOpen(null); onPick?.(null);
    if (was) requestAnimationFrame(() => tiles.current[was]?.focus());
  };
  const pick = (g: PromptGroup) => {
    if (open === g.label) return close();
    setOpen(g.label); onPick?.(g);
  };

  const panelFor = (g: PromptGroup) => (
    <div ref={panel} id="goal-panel" className="gp" role="region" aria-label={`${g.sdg ? `Goal ${g.sdg.n}: ${g.sdg.name}` : g.label} questions`}
      style={{ "--notch": `${notch}px` } as React.CSSProperties} onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <div className="gp-head">
        <b>{g.sdg ? `${g.sdg.n} · ${g.sdg.name}` : g.label}</b>
        {g.sdg && <NavLink href={g.sdg.href} className="gp-browse" label="Loading the goal…">Browse figures →</NavLink>}
        <button type="button" className="gp-close" onClick={close} aria-label="Close" title="Close (Esc)">✕</button>
      </div>
      {g.table ? (
        // One table: the whole goal, then each subcategory; a column per question, in the same order on every row.
        <div className="gp-table" role="table" aria-label="Questions by subcategory">
          <div className="gp-tr gp-th" role="row"><span role="columnheader" />{COLS.map(([, h]) => <span key={h} role="columnheader">{h}</span>)}</div>
          {g.table.map((r) => (
            <div key={r.label} className="gp-tr" role="row">
              <span className="gp-name" role="rowheader">{r.label}</span>
              {COLS.map(([k, h]) => (
                <span key={k} role="cell" className="gp-td">
                  {r.q ? (
                    <NavLink href={`/?${new URLSearchParams({ question: r.q[k] })}`} className="gp-chip" title={r.q[k]} aria-label={`${h}: ${r.q[k]}`} label="Working out the answer…" search>
                      <Icon name="arrowUpRight" size={14} /><span className="gp-chip-l">{h}</span>
                    </NavLink>
                  ) : <span className="gp-none" title="Not in our data yet">—</span>}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {(g.table ? g.more ?? [] : g.prompts).length > 0 && (
        <div className="gp-more">
          {g.table && <p className="gp-more-h">More questions</p>}
          <ul>{(g.table ? g.more ?? [] : g.prompts).map((q) => <li key={q}><NavLink href={`/?${new URLSearchParams({ question: q })}`} className="gp-q" label="Working out the answer…" search>{clean(q)}</NavLink></li>)}</ul>
        </div>
      )}
    </div>
  );

  const grid = (key: string, gs: PromptGroup[], title: React.ReactNode) => {
    const n = cols[key] ?? 1;
    const at = gs.findIndex((g) => g.label === open);
    const after = at < 0 ? -1 : Math.min(gs.length - 1, Math.floor(at / n) * n + n - 1); // last tile of the picked row
    return (
      <div className="gg-wrap">
        <p className="prompt-blocks-h">{title}</p>
        <div ref={(el) => { grids.current[key] = el; }} className={`gg${key === "sdg" ? " sdg" : ""}`}>
          {gs.map((g, i) => (
            <Fragment key={g.label}>
              <button ref={(el) => { tiles.current[g.label] = el; }} type="button" className={`gg-tile${open === g.label ? " on" : ""}`}
                aria-pressed={open === g.label} aria-expanded={open === g.label} aria-controls={open === g.label ? "goal-panel" : undefined}
                onClick={() => pick(g)} title={g.sdg ? `Goal ${g.sdg.n}: ${g.sdg.name}` : g.label}>
                {g.sdg && <i className="sdg-dot" style={{ background: g.sdg.color }} aria-hidden />}
                <em>{g.sdg ? SHORT[g.sdg.n] ?? g.sdg.name : g.label}</em>
              </button>
              {i === after && panelFor(gs[at])}
            </Fragment>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="prompt-groups">
      {sdg.length > 0 && grid("sdg", sdg, <>By goal <span className="prompt-help" tabIndex={0} title="The 17 UN Sustainable Development Goals: a shared list of causes (poverty, health, climate and more) that funders and researchers use to group their work." aria-label="About the goals"><Icon name="info" size={13} /></span></>)}
      {cross.length > 0 && grid("cross", cross, "Across causes")}
    </div>
  );
}
