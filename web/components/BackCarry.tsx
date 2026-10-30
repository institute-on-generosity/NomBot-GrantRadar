"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CARRY_PATHS, contextOf, einOf, withBack, withFocus } from "@/lib/back";

// Keeps the search with the user (Oct 29, Hunter): a link to an org, memo, source viewer or compare gets ?back=<the
// search>, taken from this page (the search itself, or the ?back= it carries), so search -> org -> memo -> Back and
// org -> another org -> Back both end at the results. One listener for every such link on the site (results,
// hover cards, similar orgs, board links). New-tab clicks get the updated href too.
export function BackCarry() {
  const router = useRouter();
  useEffect(() => {
    const target = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      // The link's own href, before mark() added the search (unless React has since given it a new one)
      const cur = a?.getAttribute("href");
      const href = a && a.dataset.carryTo === cur ? a.dataset.carryFrom : cur;
      if (!a || !href || !href.startsWith("/") || href.startsWith("//") || /[?&]back=/.test(href) || !CARRY_PATHS.test(href)) return null;
      if (location.pathname.startsWith("/preview/")) return null; // a modal over the page swaps its own panes
      const ctx = contextOf(location.pathname, location.search);
      if (!ctx) return null;
      // focus: the org opened from the results (from the search page, the link's org; from an org page, that org,
      // unless the search already names one), so Back scrolls to the row the user started from
      const focus = location.pathname === "/" ? einOf(href) : /[?&]focus=/.test(ctx) ? null : einOf(location.pathname);
      return { a, next: withBack(href, withFocus(ctx, focus)) };
    };
    // Hover, focus, middle or modified clicks: the link itself, so a new tab opens with the search too
    const mark = (t: { a: HTMLAnchorElement; next: string }) => {
      if (t.a.getAttribute("href") === t.next) return;
      t.a.dataset.carryFrom = t.a.getAttribute("href") ?? ""; t.a.dataset.carryTo = t.next; t.a.setAttribute("href", t.next);
    };
    const prime = (e: Event) => { const t = target(e); if (t) mark(t); };
    const click = (e: MouseEvent) => {
      const t = target(e);
      if (!t) return;
      mark(t);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || t.a.target === "_blank" || t.a.hasAttribute("download")) return;
      e.preventDefault();
      e.stopPropagation(); // before the Link's own handler, which would go to the old href
      const sourceHop = location.pathname.startsWith("/source/") && t.next.startsWith("/source/");
      if (sourceHop) router.replace(t.next, { scroll: false }); else router.push(t.next);
    };
    window.addEventListener("pointerover", prime, true);
    window.addEventListener("focusin", prime, true);
    window.addEventListener("click", click, true);
    return () => { window.removeEventListener("pointerover", prime, true); window.removeEventListener("focusin", prime, true); window.removeEventListener("click", click, true); };
  }, [router]);
  return null;
}
