"use client";
import { useEffect, useSyncExternalStore } from "react";
import { InsightChart } from "./InsightChart";
import { SlideButton } from "./SlideButton";
import type { OverviewFacts } from "@/lib/overviewFacts";

// The top of the Overview tab: headline, key-number tiles and one chart, all computed from the
// landscape (lib/overviewFacts), so they show before the AI text streams in. When the AI overview
// arrives (AiOverview publishes it here) its headline replaces the computed one, and both go on the
// exported slide.

type Ai = { key: string; headline: string; bullets: string[] };
let ai: Ai | null = null;
const subs = new Set<() => void>();
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

export function usePublishOverview(key: string, headline: string, bullets: string[]) {
  useEffect(() => {
    ai = { key, headline, bullets };
    subs.forEach((cb) => cb());
  }, [key, headline, bullets]);
}

export function OverviewVisual({ facts, question }: { facts: OverviewFacts; question: string }) {
  const now = useSyncExternalStore(subscribe, () => (ai?.key === question ? ai : null), () => null);
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
  return (
    <div className="ovv">
      <p className={`ovv-head${now ? " ai" : ""}`}>{headline}</p>
      <div className="ovv-tiles" aria-label="Key numbers">
        {facts.tiles.map((t) => (
          <div key={t.label} className="ovv-tile" title={t.note}>
            <b>{t.value}</b><span>{t.label}</span>{t.note && <small>{t.note}</small>}
          </div>
        ))}
      </div>
      {facts.chart && (
        <figure className="ovv-chart">
          <figcaption><b>{facts.chart.title}</b><span>{facts.chart.sub}</span></figcaption>
          <InsightChart spec={facts.chart.spec} label={`${facts.chart.title}: ${facts.chart.takeaway}`} />
        </figure>
      )}
      <div className="ovv-foot">
        <span>{facts.basis}</span>
        <SlideButton data={slide} />
      </div>
    </div>
  );
}
