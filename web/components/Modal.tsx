"use client";
import { Children, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const X = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>;

// Centered popover over everything, background grayed out. Closing goes back in history
// (×, Esc, or a click on the background), so the page underneath is untouched.
// source: a second child shown beside the first (split view). One × in the top-right corner:
// the first click closes the source pane, the next closes the popover.
export function Modal({ label, source, children }: { label: string; source?: { title: string; closeHref: string } | null; children: React.ReactNode }) {
  const router = useRouter();
  const [main, side] = Children.toArray(children);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (source) router.replace(source.closeHref, { scroll: false }); // Esc closes the source pane first
      else router.back();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden"; // keep the page behind from scrolling
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [router, source]);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) router.back(); }}>
      <div className={`modal${source ? " split" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        {!source && <button type="button" className="iconbtn modal-close" onClick={() => router.back()} aria-label="Close" title="Close (Esc)"><X /></button>}
        <div className="modal-body">{main}</div>
        {source && side && (
          <section className="modal-source" aria-label={source.title}>
            <header className="panel-head">
              <span>{source.title}</span>
              <Link href={source.closeHref} replace scroll={false} className="iconbtn" aria-label={`Close ${source.title}`} title="Close source"><X /></Link>
            </header>
            <div className="panel-body">{side}</div>
          </section>
        )}
      </div>
    </div>
  );
}
