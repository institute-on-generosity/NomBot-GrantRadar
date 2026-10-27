"use client";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { SearchBox } from "@/components/SearchBox";
import { Icon } from "@/components/Icons";

// A research group: an SDG block (sdg, its prompts by subcategory in subs) or a cross-cutting group (lib/examples.ts).
export type PromptGroup = { label: string; prompts: string[]; sdg?: { n: number; name: string; color: string; href: string }; subs?: { label: string; prompts: string[] }[] };
export type PromptSet = { word: string; placeholder: string; prompts: string[]; groups?: PromptGroup[] };

// Short tab names on phones (audit H2: the four tabs overflowed at 375px)
const TAB_SHORT: Record<string, string> = { nonprofits: "Orgs", "philanthropic leaders": "People", foundations: "Funders", research: "Research" };

// One-word tile names for the 17 goals (the full SDG name is the tooltip).
const SHORT: Record<number, string> = { 1: "Poverty", 2: "Hunger", 3: "Health", 4: "Education", 5: "Gender", 6: "Water", 7: "Energy", 8: "Work",
  9: "Industry", 10: "Inequality", 11: "Cities", 12: "Consumption", 13: "Climate", 14: "Oceans", 15: "Land", 16: "Justice", 17: "Partnerships" };

// Home heading "Look up <word>": the word flips between what NomBot can find (nonprofits, people,
// foundations, research answers) and the example prompts below the search box flip with it. Pauses while
// the pointer or keyboard is on it; with reduced motion it still changes, without the flip.
// ?tab=research opens on the research prompts (research questions go on to /research/ask).
export function HeroFlip({ sets, start = 0 }: { sets: PromptSet[]; start?: number }) {
  const [i, setI] = useState(start);
  // Example prompts show once a tab is picked (or ?tab= asks for one): above the fold is the box, one line, the tabs.
  const [shown, setShown] = useState(start !== 0);
  const [paused, setPaused] = useState(start !== 0);
  // Set once a prompt or search starts: the loading veil moves the pointer off the chips (un-pausing), and a
  // flip would remount the clicked chip and drop its loading state while the search still runs.
  const [chosen, setChosen] = useState(false);
  // No auto-rotation (UX audit H1, Oct 27): the set changes only when a tab is clicked, so the search box stays
  // the focal point. paused and chosen are kept for the loading state.
  void paused; void chosen;
  const set = sets[i];
  const [open, setOpen] = useState<string | null>(null); // the research block whose questions show
  const back = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  // Opening a goal swaps the grid for its prompts in the same place; focus moves to "All goals" so keyboard and
  // screen reader users land on the new content, and the block scrolls into view if it starts below the fold.
  useEffect(() => {
    if (!open) return;
    back.current?.focus({ preventScroll: true });
    const r = grid.current?.getBoundingClientRect();
    if (r && (r.top < 0 || r.top > window.innerHeight - 160)) grid.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open]);
  const openGroup = set.groups?.find((x) => x.label === open);
  const chip = (e: string) => (
    <NavLink key={e} href={`/?${new URLSearchParams({ question: e })}`} className="chip link" label="Reading your question…" search>
      {e.replace(/\s\(SDG \d+\)/, "")}
    </NavLink>
  );
  const hold = { onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false), onFocus: () => setPaused(true), onBlur: () => setPaused(false) };
  return (
    <>
      <h1 className="greet">
        <span className="flip-line">
          Look up{" "}
          <span className="flip" aria-live="polite">
            {/* key: a new word mounts and plays the flip-in */}
            <span key={set.word} className="flip-word">{set.word}</span>
          </span>
        </span>
      </h1>
      <div style={{ display: "contents" }} onSubmitCapture={() => setChosen(true)}><SearchBox value="" placeholder={openGroup?.prompts[0] ? `e.g. ${openGroup.prompts[0].replace(/\s\(SDG \d+\)/, "")}` : set.placeholder} big /></div>
      <div className="flip-tabs" role="tablist" aria-label="Example searches" {...hold}>
        {sets.map((s, k) => (
          <button key={s.word} type="button" role="tab" aria-label={s.word[0].toUpperCase() + s.word.slice(1)} aria-selected={shown && k === i} className={shown && k === i ? "on" : undefined} onClick={() => { setI(k); setPaused(true); setShown(true); }}>
            <span className="t-long">{s.word[0].toUpperCase() + s.word.slice(1)}</span>
            <span className="t-short" aria-hidden>{TAB_SHORT[s.word] ?? s.word}</span>
          </button>
        ))}
      </div>
      {!shown ? null : set.groups ? (
        // Grouped sets (research): a compact grid of goals (one word each, SDG color as a dot), then groups across
        // causes. Picking one swaps the grid for its prompts right here, with "All goals" to go back (Oct 27).
        <div key={set.word} ref={grid} className="prompt-groups flip-chips" {...hold}>
          {openGroup ? (
            <div key={open} className="prompt-list" onClickCapture={() => setChosen(true)}>
              <div className="prompt-list-head">
                <button ref={back} type="button" className="prompt-back" onClick={() => setOpen(null)}>← All goals</button>
                <span className="prompt-on" aria-live="polite">
                  {openGroup.sdg && <i className="sdg-dot" style={{ background: openGroup.sdg.color }} aria-hidden />}
                  {openGroup.sdg ? SHORT[openGroup.sdg.n] ?? openGroup.sdg.name : openGroup.label}
                </span>
              </div>
              {(openGroup.subs ?? [{ label: "", prompts: openGroup.prompts }]).map((sub) => (
                <div key={sub.label} className="prompt-sub">
                  {sub.label && <p className="prompt-sub-h">{sub.label}</p>}
                  <div className="chips suggest">{sub.prompts.map(chip)}</div>
                </div>
              ))}
              {openGroup.sdg && <NavLink href={openGroup.sdg.href} className="prompt-browse" label="Loading the goal…">Browse Goal {openGroup.sdg.n} figures →</NavLink>}
            </div>
          ) : [set.groups.filter((g) => g.sdg), set.groups.filter((g) => !g.sdg)].filter((gs) => gs.length).map((gs, k) => (
            <div key={k} className="prompt-blocks-wrap">
              <p className="prompt-blocks-h">
                {gs[0].sdg ? <>By goal <span className="prompt-help" tabIndex={0} title="The 17 UN Sustainable Development Goals: a shared list of causes (poverty, health, climate and more) that funders and researchers use to group their work." aria-label="About the goals"><Icon name="info" size={13} /></span></> : "Across causes"}
              </p>
              <div className={`prompt-blocks${gs[0].sdg ? " sdg" : ""}`}>
                {gs.map((g) => (
                  <button key={g.label} type="button" aria-expanded={false} onClick={() => setOpen(g.label)}
                    title={g.sdg ? `Goal ${g.sdg.n}: ${g.sdg.name}` : g.label}>
                    {g.sdg && <i className="sdg-dot" style={{ background: g.sdg.color }} aria-hidden />}
                    <em>{g.sdg ? SHORT[g.sdg.n] ?? g.sdg.name : g.label}</em>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div key={set.word} className="chips suggest flip-chips" {...hold} onClickCapture={() => setChosen(true)}>
          {set.prompts.map(chip)}
        </div>
      )}
    </>
  );
}
