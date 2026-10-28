"use client";
import { useState } from "react";
import type { Trust } from "@/lib/sdg";
import { NavLink } from "@/components/NavLink";
import { SearchBox } from "@/components/SearchBox";
import { GoalGrid } from "@/components/GoalGrid";

// A research group: an SDG block (sdg, its prompts by subcategory in subs) or a cross-cutting group (lib/examples.ts).
export type PromptGroup = { label: string; prompts: string[]; sdg?: { n: number; name: string; color: string; href: string; trust: Trust; tip: string }; subs?: { label: string; prompts: string[] }[];
  table?: { label: string; q: Record<"total" | "trend" | "top_funders" | "by_state" | "underfunded", string> | null; trust?: Trust; tip?: string }[]; more?: string[] };
export type PromptSet = { word: string; placeholder: string; prompts: string[]; groups?: PromptGroup[] };

// Short tab names on phones (audit H2: the four tabs overflowed at 375px)
const TAB_SHORT: Record<string, string> = { nonprofits: "Orgs", "philanthropic leaders": "People", foundations: "Funders", research: "Research" };


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
  const [openGroup, setOpenGroup] = useState<PromptGroup | null>(null); // the goal whose prompts show (ask box placeholder)

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
      {/* What NomBot is, for a first-time visitor (round-2 audit V9) */}
      <p className="greet-sub">Find and vet US nonprofits and foundations by cause and place, from public IRS filings.</p>
      <div style={{ display: "contents" }} onSubmitCapture={() => setChosen(true)}><SearchBox value="" placeholder={openGroup?.prompts[0] ? `e.g. ${openGroup.prompts[0].replace(/\s\(SDG \d+\)/, "")}` : set.placeholder} big /></div>
      <div className="flip-tabs" role="tablist" aria-label="Example searches" {...hold}>
        {sets.map((s, k) => (
          <button key={s.word} type="button" role="tab" aria-label={s.word[0].toUpperCase() + s.word.slice(1)} aria-selected={shown && k === i} className={shown && k === i ? "on" : undefined} onClick={() => {
            setI(k); setPaused(true); setShown(true); setOpenGroup(null);
            // The research tab is in the URL (?tab=research), so coming back from Browse lands on it again
            const u = new URL(location.href);
            if (s.groups) u.searchParams.set("tab", "research"); else u.searchParams.delete("tab");
            u.searchParams.delete("cause"); u.searchParams.delete("topic");
            history.replaceState(history.state, "", u.href);
          }}>
            <span className="t-long">{s.word[0].toUpperCase() + s.word.slice(1)}</span>
            <span className="t-short" aria-hidden>{TAB_SHORT[s.word] ?? s.word}</span>
          </button>
        ))}
      </div>
      {!shown ? null : set.groups ? (
        // Grouped sets (research): the goal grid with its attached prompt panel (components/GoalGrid)
        <div key={set.word} className="flip-chips" {...hold} onClickCapture={(e) => { if ((e.target as HTMLElement).closest(".gp-chip")) setChosen(true); }}>
          <GoalGrid groups={set.groups} onPick={setOpenGroup} />
          <NavLink href="/research/reports" className="read-reports" label="Loading reports…">Read reports →</NavLink>
        </div>
      ) : (
        <div key={set.word} className="chips suggest flip-chips" {...hold} onClickCapture={() => setChosen(true)}>
          {set.prompts.map(chip)}
        </div>
      )}
    </>
  );
}
