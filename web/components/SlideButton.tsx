"use client";
import { useEffect, useRef, useState } from "react";
import type { SlideData } from "@/lib/slide";

const SlideIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M12 16.5V20M8.5 20h7" /></svg>;

// "Export slide": a small menu (PNG or PowerPoint) that builds one 16:9 slide (lib/slide, loaded on
// click with Vega and pptxgenjs, so pages don't carry them). quiet: a text link for feed cards.
export function SlideButton({ data, quiet = false, label = "Export slide" }: { data: () => SlideData; quiet?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"png" | "pptx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  const go = async (kind: "png" | "pptx") => {
    setBusy(kind); setError(null);
    try {
      const { exportSlide } = await import("@/lib/slide");
      await exportSlide(data(), kind);
      setOpen(false);
    } catch (e) {
      console.error("slide export failed", e);
      setError("The slide could not be made. Try again.");
    } finally { setBusy(null); }
  };
  return (
    <span className="slide-x" ref={box}>
      <button type="button" className={quiet ? "ins-link" : `ins-btn${open ? " on" : ""}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}
        title="One 16:9 slide: headline, key numbers, the chart and a source line">
        {!quiet && <SlideIcon />}{label}
      </button>
      {open && (
        <span className="slide-menu" role="menu">
          <button type="button" role="menuitem" disabled={busy != null} onClick={() => go("png")}>{busy === "png" ? <span className="spinner" /> : null}PNG image<small>1920 × 1080</small></button>
          <button type="button" role="menuitem" disabled={busy != null} onClick={() => go("pptx")}>{busy === "pptx" ? <span className="spinner" /> : null}PowerPoint<small>Editable text</small></button>
          {error && <span className="slide-err" role="alert">{error}</span>}
        </span>
      )}
    </span>
  );
}
