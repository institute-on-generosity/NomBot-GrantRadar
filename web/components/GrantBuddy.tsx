"use client";
import { GRANTS_BUDDY_KEY } from "@/lib/buddyHistory";
import { ResearchBuddy } from "./ResearchBuddy";

const SUGGESTIONS = ["Which accept applications and give over $10K?", "Compare the top 3", "Which fund general operating support?"];

// Research Buddy on /grants: same panel as NomBot's, reading the matched foundations.
// Citations open the funder sheet; conversations are stored apart from NomBot's.
export function GrantBuddy({ mission, filters, convKey, startOpen, state }: {
  mission: string; filters: Record<string, string | undefined>; convKey: string; startOpen: boolean; state: string;
}) {
  return (
    <ResearchBuddy question={mission} overrides={filters} all={false} convKey={convKey} startOpen={startOpen}
      endpoint="/api/grants/buddy" store={GRANTS_BUDDY_KEY} suggestions={SUGGESTIONS}
      intro={<>Ask about the top funders for <b>{mission}</b>. Answers come only from their 990-PF filings, each claim cited.</>}
      sourceHref={(s) => `/grants/funder/${s.ein}?${new URLSearchParams({ mission, ...(state ? { st: state } : {}), back: convKey })}`} />
  );
}
