"use client";
import { useEffect, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { SearchBox } from "@/components/SearchBox";

export type PromptSet = { word: string; placeholder: string; prompts: string[] };

// Home heading "Look up <word>": the word flips between what NomBot can find (nonprofits, people,
// foundations) and the example prompts below the search box flip with it. Pauses while the pointer
// or keyboard is on it; with reduced motion it still changes, without the flip.
export function HeroFlip({ sets }: { sets: PromptSet[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % sets.length), 3600);
    return () => clearInterval(t);
  }, [paused, sets.length]);
  const set = sets[i];
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
      <SearchBox value="" placeholder={set.placeholder} big />
      <div className="flip-tabs" role="tablist" aria-label="Example searches" {...hold}>
        {sets.map((s, k) => (
          <button key={s.word} type="button" role="tab" aria-selected={k === i} className={k === i ? "on" : undefined} onClick={() => { setI(k); setPaused(true); }}>
            {s.word[0].toUpperCase() + s.word.slice(1)}
          </button>
        ))}
      </div>
      <div key={set.word} className="chips suggest flip-chips" {...hold}>
        {set.prompts.map((e) => (
          <NavLink key={e} href={`/?${new URLSearchParams({ question: e })}`} className="chip link" label="Reading your question…" search>
            {e}
          </NavLink>
        ))}
      </div>
    </>
  );
}
