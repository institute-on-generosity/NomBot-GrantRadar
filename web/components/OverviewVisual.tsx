"use client";
import { useEffect, useSyncExternalStore } from "react";
import { NavLink } from "./NavLink";
import { SlideButton } from "./SlideButton";
import type { OverviewFacts } from "@/lib/overviewFacts";

// The Overview tab as a knowledge panel of soft grey section cards:
//   Key facts    label → value rows (lib/overviewFacts tiles), no Claude
// The headline fact and its chart moved to "Did you know" under the search summary (components/DidYouKnow), and
// the AI text to the search summary (components/SearchSummary), Oct 26. The summary publishes its sentences and
// related searches here; the "⋯" menu (OverviewMenu) puts them on the slide, and Related lists the searches.

type Ai = { key: string; headline: string; bullets: string[]; explore: string[] };
let ai: Ai | null = null;
const subs = new Set<() => void>();
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

export function usePublishOverview(key: string, headline: string, bullets: string[], explore: string[] = []) {
  useEffect(() => {
    ai = { key, headline, bullets, explore };
    subs.forEach((cb) => cb());
  }, [key, headline, bullets, explore]);
}
const useOverviewAi = (key: string) => useSyncExternalStore(subscribe, () => (ai?.key === key ? ai : null), () => null);

export const Spark = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M12 3.5c.6 4.4 2.9 6.9 8 8.5-5.1 1.6-7.4 4.1-8 8.5-.6-4.4-2.9-6.9-8-8.5 5.1-1.6 7.4-4.1 8-8.5Z" /></svg>;
export const Chevron = ({ right = false }: { right?: boolean }) => <svg className="kp-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{right ? <path d="M9.5 6l6 6-6 6" /> : <path d="M6 9.5l6 6 6-6" />}</svg>;

// "from foundations, 2023–2025" → "From foundations 2023–2025"
const label = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`.replace(/,\s+/g, " ");

export function OverviewVisual({ facts }: { facts: OverviewFacts }) {
  if (!facts.tiles.length) return null;
  return (
    <section className="kp-card" aria-label="Key facts">
      <h3 className="kp-h">Key facts</h3>
      <dl className="kp-facts">
        {facts.tiles.map((t) => (
          <div key={t.label}>
            <dt>{label(t.label)}{t.note && <small>{t.note}</small>}</dt>
            <dd>{t.value}</dd>
          </div>
        ))}
      </dl>
      <p className="kp-foot">{facts.basis}</p>
    </section>
  );
}

// "⋯" on the panel header: Export slide (PNG or PowerPoint) with the headline, key numbers, chart and bullets.
export function OverviewMenu({ facts, question }: { facts: OverviewFacts; question: string }) {
  const now = useOverviewAi(question);
  const headline = now?.headline || facts.headline;
  const slide = () => ({
    kicker: `${question} · NomBot search`,
    headline,
    // The match count stays on screen; the slide leads with the numbers about the field itself.
    // The hero number is the one the headline quotes, when it quotes one.
    numbers: (facts.tiles.length >= 4 ? facts.tiles.slice(1) : facts.tiles).slice(0, 3)
      .sort((a, b) => Number(headline.includes(b.value)) - Number(headline.includes(a.value)))
      .map((t) => ({ value: t.value, label: t.label })),
    chart: facts.chart && { spec: facts.chart.spec, caption: facts.chart.title, sub: facts.chart.sub },
    bullets: now?.bullets ?? [],
    link: location.href,
    file: `nombot-${question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "search"}-slide`,
  });
  return <SlideButton data={slide} more />;
}

// Related searches as a list of rows; each runs the search.
export function RelatedList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="kp-card kp-related" aria-label="People also search for">
      <h3 className="kp-h">People also search for</h3>
      <ul>
        {items.map((q) => (
          <li key={q}><NavLink href={`/?question=${encodeURIComponent(q)}`} className="kp-q" label="Searching…" search>{q}<Chevron right /></NavLink></li>
        ))}
      </ul>
    </section>
  );
}

// The AI overview's related searches, once it has streamed in.
export function Related({ question }: { question: string }) {
  const now = useOverviewAi(question);
  return <RelatedList items={now?.explore ?? []} />;
}
