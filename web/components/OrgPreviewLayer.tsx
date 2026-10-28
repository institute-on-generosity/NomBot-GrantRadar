"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OrgPreview } from "@/lib/orgPreview";

// Org hover card, site-wide (Oct 27). Any element with data-org-ein (and data-org-name) shows a small card about that
// organization after ~300 ms of hover, or at once on keyboard focus; charts send the same request as an event
// ("org-preview" with { ein, name, rect }). On touch, the first tap opens the card and the second follows the link.
// Data only (lib/orgPreview, cached per EIN and prefetched on hover intent); Esc closes; never covers its label.
const cache = new Map<string, Promise<OrgPreview | null>>();
const load = (ein: string) => {
  if (!cache.has(ein)) cache.set(ein, fetch(`/api/org-preview/${ein}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(ein)!;
};
const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);

type Req = { ein: string | null; name: string; rect: DOMRect; el?: Element };

export function OrgPreviewLayer() {
  const [req, setReq] = useState<Req | null>(null);
  const [data, setData] = useState<OrgPreview | null | "loading">("loading");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const armed = useRef<Element | null>(null); // touch: the label tapped once
  const block = useRef<Element | null>(null); // touch: swallow the click of that first tap

  useEffect(() => {
    const open = (r: Req) => {
      if (hide.current) clearTimeout(hide.current);
      setReq(r); setData("loading");
      if (r.ein) load(r.ein).then((d) => setData(d)); else setData(null);
    };
    // Any org link counts (so every list of orgs gets the card), plus explicit data-org-ein labels (chart bars and axis
    // labels, names without a link). Back links, the sidebar and links to the page you're on opt out.
    const SEL = '[data-org-ein], a[href^="/org/"]:not(.back):not([data-no-preview]), a[href^="/preview/org/"]:not([data-no-preview])';
    const einOf = (el: Element) => {
      const d = (el as HTMLElement).dataset?.orgEin;
      if (d !== undefined) return d.replace(/\D/g, "") || null;
      const m = el.getAttribute("href")?.match(/^\/(?:preview\/)?org\/(\d{2}-?\d{7})(?:[?#]|$)/);
      return m ? m[1].replace("-", "") : undefined;
    };
    const target = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.(SEL) as HTMLElement | null;
      if (!el || el.closest("aside.side")) return null;
      const ein = einOf(el);
      if (ein === undefined || (ein && location.pathname.replace(/\D/g, "") === ein)) return null;
      if (el.title) { el.dataset.title = el.title; el.removeAttribute("title"); } // the card replaces the native tooltip
      return el;
    };
    const reqOf = (el: HTMLElement): Req => ({ ein: einOf(el) ?? null, name: el.dataset.orgName || el.querySelector("b")?.textContent || el.textContent || "", rect: el.getBoundingClientRect(), el });
    const over = (e: MouseEvent) => {
      const el = target(e);
      if (!el) return;
      const r = reqOf(el);
      if (r.ein) void load(r.ein); // prefetch on hover intent
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => open(r), 300);
    };
    const out = (e: MouseEvent) => {
      if (!target(e)) return;
      if (timer.current) clearTimeout(timer.current);
      const to = e.relatedTarget as Node | null;
      if (to && card.current?.contains(to)) return;
      hide.current = setTimeout(() => setReq(null), 200);
    };
    const focus = (e: FocusEvent) => { const el = target(e); if (el) open(reqOf(el)); };
    const blur = (e: FocusEvent) => { if (target(e) && !card.current?.contains(e.relatedTarget as Node)) hide.current = setTimeout(() => setReq(null), 150); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setReq(null); };
    const tap = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const el = target(e);
      if (!el) { if (!card.current?.contains(e.target as Node)) { setReq(null); armed.current = null; } return; }
      if (armed.current !== el) { armed.current = el; block.current = el; open(reqOf(el)); }
    };
    // The first tap only opens the card: swallow its click. A second tap on the same label follows the link.
    const clickGuard = (e: MouseEvent) => { const el = target(e); if (el && block.current === el) { e.preventDefault(); e.stopPropagation(); block.current = null; } };
    const chart = (e: Event) => { const d = (e as CustomEvent<Req | null>).detail; if (d) open(d); else hide.current = setTimeout(() => setReq(null), 200); };
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", tap, true);
    document.addEventListener("click", clickGuard, true);
    window.addEventListener("org-preview", chart);
    // Scrolling (also the scroll a keyboard focus causes) moves the card with its label; it closes once the label leaves the screen
    const gone = () => setReq((r) => {
      if (!r?.el?.isConnected) return null;
      const rect = r.el.getBoundingClientRect();
      return rect.bottom < 0 || rect.top > window.innerHeight ? null : { ...r, rect };
    });
    document.addEventListener("scroll", gone, { passive: true, capture: true });
    return () => {
      document.removeEventListener("mouseover", over); document.removeEventListener("mouseout", out);
      document.removeEventListener("focusin", focus); document.removeEventListener("focusout", blur);
      document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", tap, true);
      document.removeEventListener("click", clickGuard, true); window.removeEventListener("org-preview", chart);
      document.removeEventListener("scroll", gone, true);
    };
  }, []);

  if (!req || typeof document === "undefined") return null;
  // Below the label, or above it when there's no room; never over it
  const W = 320, vw = document.documentElement.clientWidth, below = window.innerHeight - req.rect.bottom > 230;
  const left = Math.max(8, Math.min(vw - W - 8, req.rect.left));
  const style: React.CSSProperties = below ? { top: req.rect.bottom + 8, left } : { top: req.rect.top - 8, left, transform: "translateY(-100%)" };
  const d = data === "loading" ? null : data;
  return createPortal(
    <div ref={card} className="opv" role="tooltip" style={style} onMouseLeave={() => { hide.current = setTimeout(() => setReq(null), 200); }} onMouseEnter={() => hide.current && clearTimeout(hide.current)}>
      {data === "loading" ? <p className="opv-wait">Loading…</p> : !d ? (
        <><p className="opv-name">{req.name.trim()}</p><p className="opv-meta">Not matched to an IRS record</p></>
      ) : (
        <>
          <p className="opv-name">{d.name}</p>
          <p className="opv-meta">{[d.type, d.place].filter(Boolean).join(" · ")}</p>
          <p className="opv-mission">{d.mission ?? <span className="opv-none">No mission on file</span>}</p>
          {d.stats.length > 0 && <ul className="opv-stats">{d.stats.map((s) => <li key={s.label}><b>{s.kind === "money" ? money(s.value) : s.value.toLocaleString("en-US")}</b> {s.label}</li>)}</ul>}
          {d.causes.length > 0 && <p className="opv-causes">{d.type === "Private foundation" ? "Funds" : "Cause"}: {d.causes.join(", ")}</p>}
          <p className="opv-foot">{d.latestYear && <span>Latest filing {d.latestYear}</span>}<a href={d.href}>Open profile →</a></p>
        </>
      )}
    </div>,
    document.body,
  );
}
