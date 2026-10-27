// The visual part of the AI overview, computed from the landscape without Claude, so it renders as
// soon as the landscape does: a fallback headline, 3-4 key-number tiles and the one chart that best
// tells this result set's story (deficits, growth vs shrinking, or income sizes). The same numbers
// and chart go on the "Export slide" slide (lib/slide).
import { money } from "../components/money";
import type { Landscape } from "./landscape";

export type Tile = { value: string; label: string; note?: string };
export type OverviewChart = { title: string; sub: string; takeaway: string; spec: Record<string, unknown> };
export type OverviewFacts = { headline: string; tiles: Tile[]; chart: OverviewChart | null; basis: string };

// Fixed colors read on light and dark backgrounds (and on the light slide).
const HI = "#248a3d", BAD = "#b5533f", REST = "#b4b4b0"; // muted brick for the alert bars, neutral rest (eye comfort, Oct 27)
const pct = (n: number, of: number) => `${Math.round((100 * n) / Math.max(1, of))}%`;
const num = (n: number) => n.toLocaleString("en-US");

// Horizontal bars, one row per band, each labeled with its share; width "container" like the research charts.
function bars(rows: { label: string; count: number; color: string }[]): Record<string, unknown> {
  const total = rows.reduce((a, r) => a + r.count, 0);
  const values = rows.map((r) => ({ label: r.label, count: r.count, color: r.color, share: pct(r.count, total) }));
  const y = { field: "label", type: "nominal", sort: null, title: null, axis: { labelLimit: 150, labelPadding: 8 } };
  const x = { field: "count", type: "quantitative", title: null, axis: null, scale: { domainMax: Math.max(1, ...rows.map((r) => r.count)) * 1.18 } };
  return {
    data: { values },
    width: "container",
    height: rows.length * 30,
    layer: [
      { mark: { type: "bar", cornerRadiusEnd: 3 }, encoding: { y, x, color: { field: "color", type: "nominal", scale: null, legend: null },
        tooltip: [{ field: "label", title: "Group" }, { field: "count", title: "Organizations" }, { field: "share", title: "Share" }] } },
      { mark: { type: "text", align: "left", dx: 6, fontWeight: 600 }, encoding: { y, x, text: { field: "share" } } },
    ],
  };
}

function pickChart(l: Landscape): OverviewChart | null {
  const of = (n: number) => n === l.size ? `the ${num(l.size)} shown` : `${num(n)} of the ${num(l.size)} shown report`;
  const sig = (k: string) => l.health.signals.find((s) => s.key === k);
  const def = sig("deficit"), grow = sig("growing"), shrink = sig("shrinking");
  const defShare = def && def.of ? def.orgs.length / def.of : 0;
  // 1. Deficits stand out: most telling for a field under strain.
  if (def && def.of >= 20 && defShare >= 0.4) {
    const total = l.health.margin.reduce((a, b) => a + b.count, 0);
    return {
      title: "Last year's finances", sub: of(total), takeaway: `${pct(def.orgs.length, def.of)} overspent last year`,
      spec: bars(l.health.margin.map((b) => ({ label: b.label === "Deficit" ? "Overspent" : b.label.replace(/\s*\(.*\)$/, ""), count: b.count, color: b.label === "Deficit" ? BAD : REST }))),
    };
  }
  // 2. A clear tilt toward growing or shrinking income.
  if (grow && shrink && l.health.trendReported >= 20 && Math.abs(grow.orgs.length - shrink.orgs.length) / l.health.trendReported >= 0.2) {
    const up = grow.orgs.length > shrink.orgs.length;
    const [a, b] = up ? [grow, shrink] : [shrink, grow];
    return {
      title: "Income change", sub: `${num(l.health.trendReported)} of the ${num(l.size)} shown, two filings`,
      takeaway: `${pct(a.orgs.length, a.of)} ${up ? "grew" : "shrank"} their income by 10% or more, ${pct(b.orgs.length, b.of)} ${up ? "shrank" : "grew"}`,
      spec: bars(l.health.trend.map((t) => ({ label: t.label.replace(/^Steady.*/, "Steady"), count: t.count, color: t.label.startsWith("Growing") ? HI : t.label.startsWith("Shrinking") ? BAD : REST }))),
    };
  }
  // 3. Otherwise: how big they are.
  const total = l.sizes.reduce((a, b) => a + b.count, 0);
  if (total < 5) return null;
  const under1m = l.sizes[0].count + l.sizes[1].count, big = l.sizes[3].count;
  const top = [...l.sizes].sort((a, b) => b.count - a.count)[0];
  const takeaway = under1m / total >= 0.6 ? `${pct(under1m, total)} take in under $1M a year`
    : big / total >= 0.4 ? `${pct(big, total)} take in $10M or more a year`
    : `The largest group, ${pct(top.count, total)}, takes in ${top.label.replace("Under", "under")} a year`;
  const hi = under1m / total >= 0.6 ? new Set([l.sizes[0].key, l.sizes[1].key]) : new Set([big / total >= 0.4 ? l.sizes[3].key : top.key]);
  return {
    title: "Yearly income", sub: of(total), takeaway,
    spec: bars(l.sizes.map((b) => ({ label: b.label, count: b.count, color: hi.has(b.key) ? HI : REST }))),
  };
}

// "Did you know" (the card under the search summary): 1-3 facts from the same landscape, each with its small chart.
// The first is the overview's story chart (pickChart); then finances, income change, foundation funding and size,
// whichever have enough organizations reporting and aren't already shown.
export type Fact = OverviewChart & { key: string };
export function didYouKnow(l: Landscape): Fact[] {
  const of = (n: number) => n === l.size ? `the ${num(l.size)} shown` : `${num(n)} of the ${num(l.size)} shown report`;
  const cap = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  const out: Fact[] = [];
  const story = pickChart(l);
  const keyOf = (c: OverviewChart) => c.title === "Last year's finances" ? "finances" : c.title.startsWith("Income change") ? "growth" : "size";
  if (story) out.push({ ...story, key: keyOf(story), takeaway: cap(story.takeaway) });
  const has = (k: string) => out.some((f) => f.key === k);
  const def = l.health.signals.find((s) => s.key === "deficit");
  if (!has("finances") && def && def.of >= 10) {
    const total = l.health.margin.reduce((a, b) => a + b.count, 0);
    out.push({ key: "finances", title: "Last year's finances", sub: of(total), takeaway: `${pct(def.orgs.length, def.of)} overspent last year`,
      spec: bars(l.health.margin.map((b) => ({ label: b.label === "Deficit" ? "Overspent" : b.label.replace(/\s*\(.*\)$/, ""), count: b.count, color: b.label === "Deficit" ? BAD : REST }))) });
  }
  const grow = l.health.signals.find((s) => s.key === "growing"), shrink = l.health.signals.find((s) => s.key === "shrinking");
  if (!has("growth") && grow && shrink && l.health.trendReported >= 10) {
    out.push({ key: "growth", title: "Income change", sub: `${num(l.health.trendReported)} of the ${num(l.size)} shown, two filings`,
      takeaway: `${pct(grow.orgs.length, grow.of)} grew income, ${pct(shrink.orgs.length, shrink.of)} shrank`,
      spec: bars(l.health.trend.map((t) => ({ label: t.label.replace(/^Steady.*/, "Steady"), count: t.count, color: t.label.startsWith("Growing") ? HI : t.label.startsWith("Shrinking") ? BAD : REST }))) });
  }
  // No foundation-grant fact: Key facts give the grant figures (same set, grant_clean, GRANT_YEARS).
  return out.slice(0, 3);
}

// total: every organization the search matched (the results count); the tiles describe the closest l.size.
export function overviewFacts(l: Landscape, total: number): OverviewFacts {
  const chart = pickChart(l);
  const def = l.health.signals.find((s) => s.key === "deficit");
  const grants = l.orgs.reduce((a, o) => a + o.grants, 0);
  const tiles: Tile[] = [{ value: num(total), label: total === 1 ? "related organization" : "related organizations" }];
  if (l.medianIncome != null) tiles.push({ value: money(l.medianIncome), label: "median yearly income" });
  if (def && def.of >= 10) tiles.push({ value: pct(def.orgs.length, def.of), label: "spent more than they took in", note: `of ${num(def.of)} reporting` });
  if (grants > 0) tiles.push({ value: money(grants), label: `from foundations, ${l.grantYears[0]}–${l.grantYears[1]}`, note: l.funders[0] ? `Top funder: ${l.funders[0].name}` : undefined });
  if (tiles.length < 4 && l.medianAge != null) tiles.push({ value: `${l.medianAge} yrs`, label: "median time tax-exempt" });
  return {
    headline: chart ? `${chart.takeaway.charAt(0).toUpperCase()}${chart.takeaway.slice(1)}` : `${num(total)} organizations match this search`,
    tiles: tiles.slice(0, 4),
    chart,
    basis: `Figures from the ${num(l.size)} organizations shown`,
  };
}
