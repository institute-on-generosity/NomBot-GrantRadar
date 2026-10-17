"use client";
import { useState } from "react";

// Text tabs with an underline (like a search engine's top tabs) over the landscape views; each view
// is rendered on the server and passed in. Overview is a stack of its own section cards; every other
// view sits in one card titled with what it shows (title + short context). menu: an optional control
// for the header's right end while that view is open (the Overview's "⋯" Export slide menu).
export type View = { key: string; label: string; title: string; sub?: string; node: React.ReactNode; menu?: React.ReactNode };
export function LandscapeTabs({ views }: { views: View[] }) {
  const [on, setOn] = useState(views[0]?.key);
  const i = Math.max(0, views.findIndex((v) => v.key === on));
  return (
    <section className="landscape" aria-label={views[i]?.title ?? "Landscape"}>
      <header className="kp-head">
        <div className="kp-tabs" role="tablist" aria-label="Analysis views">
          {views.map((v) => (
            <button key={v.key} id={`kp-tab-${v.key}`} type="button" role="tab" aria-selected={v.key === on} aria-controls={`kp-view-${v.key}`}
              className={v.key === on ? "on" : ""} onClick={() => setOn(v.key)}>{v.label}</button>
          ))}
        </div>
        {views[i]?.menu}
      </header>
      {views.map((v) => (
        <div key={v.key} id={`kp-view-${v.key}`} role="tabpanel" aria-labelledby={`kp-tab-${v.key}`} hidden={v.key !== on} className="ls-view kp-stack">
          {v.key === "overview" ? v.node : (
            <div className="kp-card">
              <h2 className="kp-h">{v.title}{v.sub && <span>{v.sub}</span>}</h2>
              {v.node}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
