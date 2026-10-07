"use client";
import { useEffect } from "react";
import { recordSearch, recordViewed } from "@/lib/history";

// On a results page: remember the question and this exact view.
export function RecordSearch({ question, href, total }: { question: string; href: string; total: number }) {
  useEffect(() => { recordSearch({ question, href, total }); }, [question, href, total]);
  return null;
}

// On an organization page opened from results: remember it as "last viewed" for that search.
export function RecordViewed({ back, ein, name }: { back: string; ein: string; name: string }) {
  useEffect(() => { recordViewed(back, ein, name); }, [back, ein, name]);
  return null;
}
