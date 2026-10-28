"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Browse's back link: back to the chat or Research page the visitor came from (its URL carries the open popover's
// cause and topic, so it reopens there), else the normal "All causes".
export function BrowseBack() {
  const p = useSearchParams();
  const from = p.get("from"), back = p.get("back") ?? "";
  if ((from === "home" || from === "research") && back.startsWith("/") && !back.startsWith("//"))
    return <Link href={back} className="back">‹ Back to {from === "home" ? "chat" : "Research"}</Link>;
  return <Link href="/browse" className="back">← All causes</Link>;
}
