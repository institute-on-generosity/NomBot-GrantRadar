"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// After the first step (the caller's label), a search walks through what the server is doing.
const SEARCH_STEPS = ["Searching nonprofits…", "Scoring relevance…", "Almost there…"];
const STEP_AT = [0, 2000, 4500, 9000]; // ms; a new question takes ~3–10s (parse, search, scoring)

// Loading popup + progress bar. Portaled to <body>: a frosted (backdrop-filter) ancestor such as
// the search bar would otherwise trap position: fixed and pin the popup on top of the input.
// Appears after a short delay (CSS) so instant navigations don't flash it.
export function Loading({ label = "Loading…", search = false }: { label?: string; search?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - start), 200);
    const root = document.documentElement;
    root.dataset.loading = "";
    return () => { clearInterval(id); delete root.dataset.loading; };
  }, []);

  const steps = search ? [label, ...SEARCH_STEPS] : [label];
  const step = search ? Math.max(0, STEP_AT.filter((t) => elapsed >= t).length - 1) : 0;
  const progress = 0.92 * (1 - Math.exp(-elapsed / (search ? 4000 : 1200))); // eases toward the end, never claims done

  return createPortal(
    <div className="loading" role="status" aria-live="polite">
      <div className="loading-bar" style={{ transform: `scaleX(${progress})` }} />
      <div className="loading-pill">
        <span className="spinner" />
        <span key={step} className="loading-text">{steps[step]}</span>
        {search && (
          <span className="loading-steps" aria-hidden>
            {steps.map((s, i) => <i key={s} className={i < step ? "done" : i === step ? "now" : ""} />)}
          </span>
        )}
      </div>
    </div>,
    document.body,
  );
}
