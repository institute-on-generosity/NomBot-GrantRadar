"use client";
import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { SearchBox } from "@/components/SearchBox";
import { inkOn } from "@/lib/sdg";

// A research group: an SDG block (sdg, its prompts by subcategory in subs) or a cross-cutting group (lib/examples.ts).
export type PromptGroup = { label: string; prompts: string[]; sdg?: { n: number; name: string; color: string; href: string }; subs?: { label: string; prompts: string[] }[] };
export type PromptSet = { word: string; placeholder: string; prompts: string[]; groups?: PromptGroup[] };

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
  const chip = (e: string) => (
    <NavLink key={e} href={`/?${new URLSearchParams({ question: e })}`} className="chip link" label="Reading your question…" search>
      {e}
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
      <div style={{ display: "contents" }} onSubmitCapture={() => setChosen(true)}><SearchBox value="" placeholder={set.placeholder} big /></div>
      <div className="flip-tabs" role="tablist" aria-label="Example searches" {...hold}>
        {sets.map((s, k) => (
          <button key={s.word} type="button" role="tab" aria-selected={shown && k === i} className={shown && k === i ? "on" : undefined} onClick={() => { setI(k); setPaused(true); setShown(true); }}>
            {s.word[0].toUpperCase() + s.word.slice(1)}
          </button>
        ))}
      </div>
      {!shown ? null : set.groups ? (
        // Grouped sets (research): progressive disclosure. The 17 SDG blocks (number, short name, prompt count), then
        // groups that cut across causes. One block's prompts on tap, by subcategory, with a link to its Browse page.
        <div key={set.word} className="prompt-groups flip-chips" {...hold}>
          {[set.groups.filter((g) => g.sdg), set.groups.filter((g) => !g.sdg)].filter((gs) => gs.length).map((gs, k) => (
            <div key={k} className="prompt-blocks-wrap">
              <p className="prompt-blocks-h">{gs[0].sdg ? "By UN Sustainable Development Goal" : "Across causes"}</p>
              <div className={`prompt-blocks${gs[0].sdg ? " sdg" : ""}`} role="tablist" aria-label={gs[0].sdg ? "Research by Sustainable Development Goal" : "Research across causes"}>
                {gs.map((g) => (
                  <button key={g.label} type="button" role="tab" aria-selected={open === g.label} className={open === g.label ? "on" : undefined}
                    onClick={() => setOpen(open === g.label ? null : g.label)} title={g.sdg ? `SDG ${g.sdg.n}: ${g.sdg.name}` : undefined}>
                    {g.sdg ? <><b className="sdg-n" style={{ background: g.sdg.color, color: inkOn(g.sdg.color) }}>{g.sdg.n}</b><em>{g.sdg.name}</em></> : g.label}<span>{g.prompts.length}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {open && (() => {
            const g = set.groups.find((x) => x.label === open);
            if (!g) return null;
            return (
              <div key={open} className="prompt-list" onClickCapture={() => setChosen(true)}>
                {(g.subs ?? [{ label: "", prompts: g.prompts }]).map((sub) => (
                  <div key={sub.label} className="prompt-sub">
                    {sub.label && <p className="prompt-sub-h">{sub.label}</p>}
                    <div className="chips suggest">{sub.prompts.map(chip)}</div>
                  </div>
                ))}
                {g.sdg && <NavLink href={g.sdg.href} className="prompt-browse" label="Loading the goal…">Browse Goal {g.sdg.n} figures →</NavLink>}
              </div>
            );
          })()}
        </div>
      ) : (
        <div key={set.word} className="chips suggest flip-chips" {...hold} onClickCapture={() => setChosen(true)}>
          {set.prompts.map(chip)}
        </div>
      )}
    </>
  );
}
