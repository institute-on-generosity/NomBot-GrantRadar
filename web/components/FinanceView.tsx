"use client";
import { useState } from "react";
import Link from "next/link";
import { money } from "./money";
import type { Signal } from "@/lib/landscape";

// Finances across the closest organizations, as four plain statements ("82 of 178 ran a deficit"),
// each with a one-color bar for its share. Pick one to list the organizations behind it, with the
// figure that put them there, closest matches first. Same rules as the Growing/Shrinking and Deficit tags on each result.
const TEXT: Record<Signal["key"], { label: string; says: string; tone: "good" | "bad" }> = {
  growing: { label: "Growing", says: "grew revenue 10% or more", tone: "good" },
  shrinking: { label: "Shrinking", says: "lost 10% or more of revenue", tone: "bad" },
  deficit: { label: "Deficit", says: "spent more than they took in", tone: "bad" },
  thin: { label: "Thin reserves", says: "have under 3 months of spending saved", tone: "bad" },
};
const show = (k: Signal["key"], v: number) =>
  k === "growing" || k === "shrinking" ? `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}%`
    : k === "deficit" ? `−${money(-v)}` : v < 1 ? "<1 mo" : `${Math.floor(v)} mo`;

export function FinanceView({ signals, orgs }: { signals: Signal[]; orgs: Record<string, { ein: string; name: string; place: string; rank: number }> }) {
  const [pick, setPick] = useState<Signal["key"]>("growing");
  const live = signals.filter((s) => s.of > 0);
  if (!live.length) return <p className="ls-note">No financial filings for these organizations.</p>;
  const sel = live.find((s) => s.key === pick) ?? live[0];
  // Closest matches first (not the most extreme figures, which are often tiny budgets).
  const list = sel.orgs.filter((o) => orgs[o.ein]).sort((a, b) => orgs[a.ein].rank - orgs[b.ein].rank).slice(0, 8);
  return (
    <div className="fin-view">
      <div className="fin-rows" role="radiogroup" aria-label="Financial signal">
        {live.map((s) => {
          const t = TEXT[s.key];
          return (
            <button key={s.key} type="button" role="radio" aria-checked={sel.key === s.key} className={sel.key === s.key ? "on" : undefined} onClick={() => setPick(s.key)}>
              <span className="fr-label">{t.label}</span>
              <span className="fr-bar"><i className={t.tone} style={{ width: `${(100 * s.orgs.length) / s.of}%` }} /></span>
              <span className="fr-n"><b>{s.orgs.length}</b> of {s.of}</span>
            </button>
          );
        })}
      </div>
      <div className="fin-list">
        <h3><span><b>{sel.orgs.length}</b> of {sel.of} {TEXT[sel.key].says}</span><small>closest matches first</small></h3>
        {list.length ? (
          <ul>{list.map((o) => (
            <li key={o.ein}>
              <Link href={`/org/${orgs[o.ein].ein}`}><span className="fl-name">{orgs[o.ein].name}</span><span className="fl-place">{orgs[o.ein].place}</span></Link>
              <b className={TEXT[sel.key].tone}>{show(sel.key, o.value)}</b>
            </li>
          ))}</ul>
        ) : <p className="ls-note">None of these organizations.</p>}
      </div>
      <p className="ls-note">From the newest IRS filings · same as the tags on each result</p>
    </div>
  );
}
