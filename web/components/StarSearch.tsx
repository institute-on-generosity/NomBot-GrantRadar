"use client";
import { useStoredList } from "./useStored";
import { historyKey, STARRED_KEY, toggleStar, type StarredSearch } from "@/lib/history";

// Star this search (results page header): it moves to Saved in the sidebar and never ages out of the list.
export function StarSearch({ question }: { question: string }) {
  const starred = useStoredList<StarredSearch>(STARRED_KEY, "nombot-history");
  const on = starred.some((x) => x.key === historyKey(question));
  return (
    <button type="button" className="star-search" aria-pressed={on} title={on ? "Unstar this search" : "Star this search to keep it under Saved"}
      onClick={() => toggleStar({ question, href: location.pathname + location.search })}>
      <span aria-hidden="true">{on ? "★" : "☆"}</span>{on ? "Starred" : "Star"}
    </button>
  );
}
