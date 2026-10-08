"use client";
import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

// What a citation [n] points to: a tooltip and, when there is a page for it, a link.
export type Cite = (n: number) => { title: string; href?: string; lines?: string[] } | null | undefined;

// Minimal, safe rendering of a cited answer: paragraphs, "- " bullets, **bold**, and [n] citations.
// Shared by Research Buddy and GrantRadar's "Why this funder?".
export function Answer({ text, cite }: { text: string; cite: Cite }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const item = /^\s*[-*]\s+/.test(line);
    if (!line.trim()) { blocks.push({ list: false, lines: [] }); continue; }
    const last = blocks.at(-1);
    if (last && last.list === item && (item || last.lines.length)) last.lines.push(line.replace(/^\s*[-*]\s+/, ""));
    else blocks.push({ list: item, lines: [line.replace(/^\s*[-*]\s+/, "")] });
  }
  return (
    <div className="buddy-answer">
      {blocks.filter((b) => b.lines.length).map((b, i) => (b.list
        ? <ul key={i}>{b.lines.map((l, j) => <li key={j}><Inline text={l} cite={cite} /></li>)}</ul>
        : <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && " "}<Inline text={l} cite={cite} /></Fragment>)}</p>))}
    </div>
  );
}

function Inline({ text, cite }: { text: string; cite: Cite }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\[\d+(?:,\s*\d+)*\])/).map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={i}><Inline text={part.slice(2, -2)} cite={cite} /></b>;
        const m = part.match(/^\[(\d+(?:,\s*\d+)*)\]$/);
        if (!m) return <Fragment key={i}>{part}</Fragment>;
        return (
          <span key={i} className="cites">
            {m[1].split(/,\s*/).map((n) => {
              const s = cite(Number(n));
              return s?.href
                ? <Link key={n} href={s.href} scroll={false} className="cite-n" title={s.title}>{n}</Link>
                : s ? <CiteTip key={n} n={Number(n)} title={s.title} lines={s.lines} /> : <span key={n} className="cite-n">{n}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}


// A citation that isn't a link: hovering (or focusing) shows a small card right away. Portaled to
// <body> with fixed positioning so scrolling panels can't clip it.
function CiteTip({ n, title, lines = [] }: { n: number; title: string; lines?: string[] }) {
  const [at, setAt] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const below = r.top < 170; // not enough room above: open below
    setAt({ x: Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150), y: below ? r.bottom + 8 : r.top - 8, below });
  };
  return (
    <>
      <span className="cite-n" tabIndex={0} aria-label={`${n}: ${title}`}
        onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={() => setAt(null)}
        onFocus={(e) => show(e.currentTarget)} onBlur={() => setAt(null)}>{n}</span>
      {at && createPortal(
        <span className={`cite-tip${at.below ? " below" : ""}`} role="tooltip" style={{ left: at.x, top: at.y }}>
          <b>{title}</b>
          {lines.filter(Boolean).map((l, i) => <span key={i}>{l}</span>)}
        </span>,
        document.body,
      )}
    </>
  );
}
