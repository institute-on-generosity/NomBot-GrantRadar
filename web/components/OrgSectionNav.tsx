"use client";
import { useEffect, useState } from "react";

// Org page section nav (round-2 audit V1, round-1 O5): one row of short links under the key numbers, sticky on wide
// screens, built from the page's own h2s as they stream in, the current section marked as you scroll.
const LABEL: [RegExp, string][] = [
  [/^Mission/, "About"], [/^Financial health/, "Health"], [/^Finances/, "Money"], [/^Grants received/, "Funders"],
  [/^Grants given/, "Grants given"], [/^Questions to ask/, "Ask"], [/^Leadership/, "People"], [/^Similar/, "Similar"], [/^In the news/, "News"], [/^Sources/, "Sources"],
];
type Item = { id: string; label: string };

export function OrgSectionNav() {
  const [items, setItems] = useState<Item[]>([]);
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const root = document.querySelector("article.org");
    if (!root) return;
    const scan = () => {
      const found: Item[] = [];
      root.querySelectorAll("h2").forEach((h) => {
        const text = (h.childNodes[0]?.textContent ?? h.textContent ?? "").trim();
        const hit = LABEL.find(([re]) => re.test(text));
        if (!hit || found.some((f) => f.label === hit[1])) return;
        const sec = (h.closest("section") ?? h) as HTMLElement;
        if (!sec.id) sec.id = `s-${hit[1].toLowerCase().replace(/\W+/g, "-")}`;
        found.push({ id: sec.id, label: hit[1] });
      });
      setItems((old) => (old.map((o) => o.id).join() === found.map((f) => f.id).join() ? old : found));
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    if (!items.length) return;
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setNow(vis.target.id);
    }, { rootMargin: "-80px 0px -60% 0px" });
    items.forEach((i) => { const el = document.getElementById(i.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [items]);
  if (items.length < 3) return null;
  return (
    <nav className="org-nav" aria-label="Sections">
      {items.map((i) => <a key={i.id} href={`#${i.id}`} className={now === i.id ? "on" : undefined} aria-current={now === i.id ? "location" : undefined}>{i.label}</a>)}
    </nav>
  );
}
