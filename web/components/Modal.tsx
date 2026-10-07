"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Centered popover over everything, background grayed out. Closing goes back in
// history (button, Esc, or a click on the background), so the page underneath is untouched.
export function Modal({ label, children }: { label: string; children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.back(); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden"; // keep the page behind from scrolling
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [router]);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) router.back(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        <button type="button" className="iconbtn modal-close" onClick={() => router.back()} aria-label="Close" title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
