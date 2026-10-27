"use client";
import { useEffect, useRef, useState } from "react";
import { InsightChart } from "./InsightChart";
import type { Fact } from "@/lib/overviewFacts";

// "Did you know": 1-3 computed facts about the results (finances, income change, foundation funding, size), each
// with a small chart. Swipe on touch (scroll snap) or use the arrows. Lighter than the summary above it.
export function DidYouKnow({ facts }: { facts: Fact[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  // The track takes the current slide's height, so a short fact leaves no empty space under it.
  useEffect(() => {
    const el = track.current, slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    const fit = () => { el.style.height = `${slide.offsetHeight}px`; };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(slide);
    return () => ro.disconnect();
  }, [i, facts.length]);
  if (!facts.length) return null;
  const go = (k: number) => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(facts.length - 1, k));
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
    setI(n);
  };
  const onScroll = () => {
    const el = track.current;
    if (el) setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  return (
    <section className="dyk" aria-labelledby="dyk-h" aria-roledescription="carousel">
      <header className="dyk-head">
        <h2 id="dyk-h">Did you know</h2>
        {facts.length > 1 && (
          <div className="dyk-nav">
            <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous fact">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.5 6l-6 6 6 6" /></svg>
            </button>
            <span aria-live="polite">{i + 1} of {facts.length}</span>
            <button type="button" onClick={() => go(i + 1)} disabled={i === facts.length - 1} aria-label="Next fact">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9.5 6l6 6-6 6" /></svg>
            </button>
          </div>
        )}
      </header>
      <div className="dyk-track" ref={track} onScroll={onScroll}>
        {facts.map((f, k) => (
          <figure key={f.key} className="dyk-slide" aria-roledescription="slide" aria-label={`${k + 1} of ${facts.length}`}>
            <p className="dyk-fact">{f.takeaway}</p>
            <figcaption title={f.sub}>{f.title}</figcaption>
            <InsightChart spec={{ ...f.spec, height: Math.round(Number(f.spec.height ?? 90) * 0.72) }} label={`${f.title}: ${f.takeaway}`} />
          </figure>
        ))}
      </div>
    </section>
  );
}
