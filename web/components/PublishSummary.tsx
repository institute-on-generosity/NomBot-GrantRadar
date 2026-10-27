"use client";
import { useMemo } from "react";
import { usePublishOverview } from "./OverviewVisual";

// Hands the summary to the analysis panel: its sentences go on the "Export slide" slide and its related searches
// to "People also search for" (components/OverviewVisual's shared store).
export function PublishSummary({ question, text, explore }: { question: string; text: string; explore: string[] }) {
  const bullets = useMemo(() => text.split(/(?<=[.!?])\s+(?=[A-Z0-9"$])/).filter(Boolean), [text]);
  usePublishOverview(question, "", bullets, explore);
  return null;
}
