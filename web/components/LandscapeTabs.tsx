"use client";
import { useState } from "react";

const Spark = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M12 3.5c.6 4.4 2.9 6.9 8 8.5-5.1 1.6-7.4 4.1-8 8.5-.6-4.4-2.9-6.9-8-8.5 5.1-1.6 7.4-4.1 8-8.5Z" /></svg>;

// Segmented control over the landscape views; each view is rendered on the server and passed in.
export function LandscapeTabs({ size, views }: { size: number; views: { key: string; label: string; node: React.ReactNode }[] }) {
  const [on, setOn] = useState(views[0]?.key);
  const i = Math.max(0, views.findIndex((v) => v.key === on));
  return (
    <section className="landscape" aria-label="Landscape">
      <header>
        <h2><Spark />Landscape {size > 0 && <span>the {size} closest organizations</span>}</h2>
        <div className="seg" role="tablist" style={{ "--n": views.length, "--i": i } as React.CSSProperties}>
          <span className="seg-thumb" aria-hidden />
          {views.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={v.key === on} className={v.key === on ? "on" : ""} onClick={() => setOn(v.key)}>{v.label}</button>
          ))}
        </div>
      </header>
      {views.map((v) => <div key={v.key} role="tabpanel" hidden={v.key !== on} className="ls-view">{v.node}</div>)}
    </section>
  );
}
