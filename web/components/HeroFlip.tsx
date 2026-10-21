"use client";
import { useEffect, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { SearchBox } from "@/components/SearchBox";

export type PromptSet = { word: string; placeholder: string; prompts: string[]; groups?: { label: string; prompts: string[] }[] };

// Home heading "Look up <word>": the word flips between what NomBot can find (nonprofits, people,
// foundations, research answers) and the example prompts below the search box flip with it. Pauses while
// the pointer or keyboard is on it; with reduced motion it still changes, without the flip.
// ?tab=research opens on the research prompts (research questions go on to /research/ask).
export function HeroFlip({ sets, start = 0 }: { sets: PromptSet[]; start?: number }) {
  const [i, setI] = useState(start);
  const [paused, setPaused] = useState(start !== 0);
  // Set once a prompt or search starts: the loading veil moves the pointer off the chips (un-pausing), and a
  // flip would remount the clicked chip and drop its loading state while the search still runs.
  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    if (paused || chosen) return;
    const t = setInterval(() => setI((x) => (x + 1) % sets.length), 3600);
    return () => clearInterval(t);
  }, [paused, chosen, sets.length]);
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
        <span className="logo">N</span>
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
          <button key={s.word} type="button" role="tab" aria-selected={k === i} className={k === i ? "on" : undefined} onClick={() => { setI(k); setPaused(true); }}>
            {s.word[0].toUpperCase() + s.word.slice(1)}
          </button>
        ))}
      </div>
      {set.groups ? (
        // Grouped sets (research): progressive disclosure, cause blocks first, one block's questions on tap
        <div key={set.word} className="prompt-groups flip-chips" {...hold}>
          <div className="prompt-blocks" role="tablist" aria-label="Research topics">
            {set.groups.map((g) => (
              <button key={g.label} type="button" role="tab" aria-selected={open === g.label} className={open === g.label ? "on" : undefined}
                onClick={() => setOpen(open === g.label ? null : g.label)}>
                {g.label}<span>{g.prompts.length}</span>
              </button>
            ))}
          </div>
          {open && (
            <div key={open} className="chips suggest prompt-list" onClickCapture={() => setChosen(true)}>
              {set.groups.find((g) => g.label === open)?.prompts.map(chip)}
            </div>
          )}
        </div>
      ) : (
        <div key={set.word} className="chips suggest flip-chips" {...hold} onClickCapture={() => setChosen(true)}>
          {set.prompts.map(chip)}
        </div>
      )}
    </>
  );
}
