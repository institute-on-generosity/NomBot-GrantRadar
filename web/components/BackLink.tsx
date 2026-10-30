"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { backTarget, withFocus } from "@/lib/back";

// "← Back to results": to the search the user came from (?back=, lib/back), scrolled to the org they opened (focus).
// back: from the server when the page has it; undefined reads this page's own ?back= after load. No search known:
// "← Back" (or children) to fallback, the home search unless the page says otherwise. Never browser history, which
// could leave the site or land on another org (Oct 29, Hunter).
export function BackLink({ back, fallback = "/", focus, children }: { back?: string | null; fallback?: string; focus?: string; children?: React.ReactNode }) {
  const [fromUrl, setFromUrl] = useState<string | null>(null);
  useEffect(() => { if (back === undefined) setFromUrl(new URLSearchParams(location.search).get("back")); }, [back]);
  const t = backTarget(back === undefined ? fromUrl : back, fallback);
  const known = t.href !== fallback || t.label !== "← Back";
  const href = known && focus && !/[?&]focus=/.test(t.href) ? withFocus(t.href, focus) : t.href;
  return <Link href={href} className="back" data-no-preview>{known ? t.label : (children ?? t.label)}</Link>;
}
