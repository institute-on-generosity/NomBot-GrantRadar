"use client";
import { useEffect } from "react";

// One behavior for every expandable on the site (Oct 27, Hunter: people didn't notice things expanding). For each
// <details> that opens, and for the Insights panel toggle: a short flash on the new content (CSS .just-opened), scroll
// it into view only when it starts below the fold or 40%+ of it is off screen, move focus to its first item for
// keyboard users, and announce it ("Details expanded") in a polite live region. Height animation and the chevron
// are CSS (globals.css, shared disclosure pattern).
export function Disclosures() {
  useEffect(() => {
    let live = document.getElementById("sr-live");
    if (!live) { live = document.createElement("div"); live.id = "sr-live"; live.className = "sr-live"; live.setAttribute("aria-live", "polite"); document.body.appendChild(live); }
    const keyboard = { on: false };
    const onKey = () => { keyboard.on = true; };
    const onPointer = () => { keyboard.on = false; };
    const reveal = (el: HTMLElement, label: string) => {
      el.classList.remove("just-opened"); void el.offsetWidth; el.classList.add("just-opened");
      setTimeout(() => el.classList.remove("just-opened"), 1200);
      requestAnimationFrame(() => setTimeout(() => {
        const r = el.getBoundingClientRect(), vh = window.innerHeight;
        const hidden = r.height ? Math.max(0, r.bottom - vh) / r.height : 0;
        if (r.top > vh - 40 || hidden > 0.4) el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
      }, 200));
      if (keyboard.on) el.querySelector<HTMLElement>(":scope > :not(summary) a, :scope > :not(summary) button, :scope a:not(summary a), :scope button:not(summary button)")?.focus({ preventScroll: true });
      if (live) live.textContent = `${label} expanded`;
    };
    const onToggle = (e: Event) => {
      const d = e.target as HTMLDetailsElement;
      if (!(d instanceof HTMLDetailsElement) || !d.open) return;
      const label = d.querySelector(":scope > summary")?.textContent?.replace(/[▸▾›]/g, "").trim() || "Section";
      reveal(d, label);
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.id !== "insights") return;
      const rail = document.querySelector<HTMLElement>(".serp-rail");
      if (t.checked && rail) reveal(rail, "Insights");
      else if (live) live.textContent = "Insights collapsed";
    };
    document.addEventListener("toggle", onToggle, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("toggle", onToggle, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  return null;
}
