"use client";
import { useState } from "react";
import { GoalGrid } from "./GoalGrid";
import { SearchBox } from "./SearchBox";
import type { PromptGroup } from "./HeroFlip";

// /research's focal block: the big ask box, then the same goal grid and attached question panel as the home Research
// tab. Picking a goal changes the placeholder to that goal's first question.
export function ResearchAsk({ groups, placeholder }: { groups: PromptGroup[]; placeholder: string }) {
  const [g, setG] = useState<PromptGroup | null>(null);
  const first = g?.table?.find((r) => r.q)?.q?.total ?? g?.prompts[0];
  return (
    <div className="ins-ask">
      <SearchBox action="/research/ask" name="q" placeholder={first ? `e.g. ${first.replace(/\s\(SDG \d+\)/, "")}` : placeholder} big />
      <GoalGrid groups={groups} onPick={setG} from="research" />
    </div>
  );
}
