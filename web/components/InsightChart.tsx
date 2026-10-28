"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { View } from "vega";

// One Vega-Lite chart, themed with the app's colors. vega + vega-lite + vega-embed (~1 MB) load only
// when the first chart scrolls near the screen, so the home page stays fast. Redraws on a light/dark switch and in light colors for print.

// Categorical hues in fixed order (validated set: dataviz reference palette), stepped per mode.
// One calm palette for every chart (round-2 audit V10): brand green for the first or focus series, warm neutrals next,
// a light green and a sand tone only when a chart has more series. Sequential charts ramp in the same green; diverging
// charts run muted brick, neutral, green (the app's --bad and --g).
export const CHART = { focus: "#248a3d", rest: "#b4b4b0", bad: "#b5533f" };
const CATEGORY = {
  light: ["#248a3d", "#8a8a84", "#9ccaa8", "#4f4f4b", "#c8b98f", "#c4c4bf", "#1b5e2e", "#e0ddd3"],
  dark: ["#3fbf63", "#a3a39e", "#2f6e44", "#dadad4", "#b8a878", "#6f6f6a", "#8fd3a4", "#4a4a46"],
};
const RAMP = ["#e3f1e6", "#c2e1c9", "#97cba3", "#69b17c", "#3f945a", "#2a7442", "#1b542f"]; // one hue (brand green), light → dark
const DIVERGING = { light: ["#b5533f", "#f0efec", "#248a3d"], dark: ["#d07a66", "#383835", "#3fbf63"] };

// Specs stored with the findings (generosity-data) carry Vega's default blue and orange: map them onto the one palette.
// A chart with an orange highlight keeps it as the focus (green) and its blue bars become neutral; otherwise blue is green.
const TABLEAU: Record<string, string> = { "#f58518": "#8a8a84", "#e45756": CHART.bad, "#72b7b2": "#9ccaa8", "#54a24b": CHART.focus, "#eeca3b": "#c8b98f", "#b279a2": "#4f4f4b", "#ff9da6": "#c4c4bf", "#9d755d": "#8a8a84", "#bab0ac": "#c4c4bf", "#30a14e": CHART.focus, "#2563eb": CHART.focus, "#7c3aed": "#4f4f4b", "#dc2626": CHART.bad };
export function onePalette<T>(spec: T, dark: boolean): T {
  let t = JSON.stringify(spec);
  const focus = dark ? "#3fbf63" : CHART.focus;
  const hasHighlight = /#d97706/i.test(t);
  t = t.replace(/#d97706/gi, focus).replace(/#4c78a8/gi, hasHighlight ? (dark ? "#6f6f6a" : CHART.rest) : focus);
  t = t.replace(/#[0-9a-f]{6}/gi, (c) => (TABLEAU[c.toLowerCase()] === CHART.focus ? focus : TABLEAU[c.toLowerCase()] ?? c));
  return JSON.parse(t) as T;
}

export type Ink = { ink: string; mute: string; line: string; accent: string; font: string };
// Light colors for exports that ignore the app theme (the "Export slide" slide).
export const LIGHT: Ink = { ink: "#1d1d1f", mute: "#6e6e73", line: "#e5e5ea", accent: "#248a3d", font: "-apple-system, BlinkMacSystemFont, \"Helvetica Neue\", Helvetica, Arial, sans-serif" };

function theme(dark: boolean) {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return vegaConfig({ ink: v("--ink"), mute: v("--mute"), line: v("--line"), accent: v("--g"), font: v("--sans") || "system-ui" }, dark);
}

// size: axis label size (11 in the app; larger on a slide).
export function vegaConfig({ ink, mute, line, accent, font }: Ink, dark: boolean, size = 11) {
  const label = { labelColor: mute, titleColor: mute, labelFont: font, titleFont: font, labelFontSize: size, titleFontSize: size, titleFontWeight: 500 as const };
  return {
    background: "transparent",
    font,
    padding: { left: 0, right: 4, top: 6, bottom: 0 },
    view: { stroke: null },
    scale: { bandPaddingInner: 0.28, bandPaddingOuter: 0.1 },
    title: { color: ink, font, fontSize: size + 2, fontWeight: 600 as const, anchor: "start" as const, subtitleColor: mute },
    axis: { ...label, domainColor: line, tickColor: line, gridColor: line, gridDash: [], labelPadding: 6, titlePadding: 8, tickSize: 4, labelOverlap: "greedy" as const, labelFlush: true, tickCount: 6 },
    axisX: { grid: false },
    axisY: { domain: false, ticks: false },
    legend: { ...label, labelFontSize: size + 1, symbolType: "circle", orient: "bottom" as const, direction: "horizontal" as const },
    header: { labelColor: mute, titleColor: mute, labelFont: font, titleFont: font },
    mark: { color: accent },
    bar: { color: accent, cornerRadiusEnd: 3 },
    line: { color: accent, strokeWidth: 2 },
    point: { color: accent, size: 64, filled: true },
    circle: { color: accent, size: 64 },
    area: { color: accent, opacity: 0.85 },
    rule: { color: mute },
    text: { color: ink, font, fontSize: size },
    range: { category: dark ? CATEGORY.dark : CATEGORY.light, ramp: RAMP, heatmap: RAMP, diverging: dark ? DIVERGING.dark : DIVERGING.light, ordinal: RAMP.slice(2) },
  };
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");
const onScheme = (cb: () => void) => { const q = darkQuery(); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); };

// Paper is white, so while printing every chart draws (even ones not scrolled to yet) in light colors,
// then goes back after. Cmd+P flips this on beforeprint; PrintButton also waits for the redraw first.
let printing = false;
let drawing = 0; // charts mid-draw
const printSubs = new Set<() => void>();
const setPrinting = (on: boolean) => { if (printing !== on) { printing = on; printSubs.forEach((f) => f()); } };
const onPrint = (cb: () => void) => { printSubs.add(cb); return () => { printSubs.delete(cb); }; };
if (typeof window !== "undefined") {
  window.addEventListener("beforeprint", () => setPrinting(true));
  const paperMedia = window.matchMedia("print");
  // afterprint can fire while print media still applies (CSS colors still light): wait for it to end
  window.addEventListener("afterprint", () => { if (!paperMedia.matches) setPrinting(false); });
  paperMedia.addEventListener("change", (e) => setPrinting(e.matches));
}
const frame = () => new Promise((r) => requestAnimationFrame(r));
export async function readyForPrint(maxMs = 1500) {
  setPrinting(true);
  const end = Date.now() + maxMs;
  await frame(); await frame();
  while (drawing > 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 30));
}
let lib: Promise<typeof import("vega-embed")> | null = null;
export const vegaEmbed = () => (lib ??= import("vega-embed"));

// tall: the research detail page draws the same spec about 40% taller.
export function InsightChart({ spec, label, onView, tall = false }: { spec: Record<string, unknown>; label: string; onView?: (v: View | null) => void; tall?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const prefersDark = useSyncExternalStore(onScheme, () => darkQuery().matches, () => false);
  const print = useSyncExternalStore(onPrint, () => printing, () => false);
  const dark = prefersDark && !print;
  const paper = prefersDark && print; // the CSS colors are still dark on screen: use the fixed light set
  const draw = near || print;
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!draw || !box.current) return;
    let view: View | null = null;
    let gone = false;
    let busy = true;
    drawing++;
    const settle = () => { if (busy) { busy = false; drawing--; } };
    const el = box.current;
    vegaEmbed().then(async ({ default: embed }) => {
      if (gone) return;
      // Our vega-lite reads v5 specs; drop the $schema so it doesn't warn about the version.
      const { $schema: _s, ...rest } = onePalette(spec, dark); // eslint-disable-line @typescript-eslint/no-unused-vars
      if (tall && typeof rest.height === "number") rest.height = Math.round(rest.height * 1.4);
      // vega-tooltip reuses one tooltip element and only swaps its own theme class, so a dark class
      // left from before a dark to light switch would stick. Clear both before redrawing.
      document.getElementById("vg-tooltip-element")?.classList.remove("light-theme", "dark-theme");
      const config = paper ? vegaConfig(LIGHT, false) : theme(dark);
      const res = await embed(el, rest as never, { actions: false, renderer: "svg", config: config as never, tooltip: { theme: dark ? "dark" : "light" } });
      if (gone) { res.finalize(); return; }
      view = res.view;
      onView?.(view);
      linkOrgs(el, rest as { data?: { values?: Record<string, unknown>[] }; encoding?: { y?: { field?: string } } });
    }).catch((e) => { console.error("chart failed", e); if (!gone) setError(true); }).finally(settle);
    return () => { gone = true; settle(); view?.finalize(); onView?.(null); };
  }, [draw, dark, paper, spec, onView, tall]);

  if (error) return <p className="ins-chart-err">This chart could not be drawn. The data is in the CSV.</p>;
  return <div ref={box} className={`ins-chart${tall ? " tall" : ""}`} role="img" aria-label={label} />;
}

// Export: PNG (2x) or SVG, on the page's background so it reads in slides and documents.
// Org charts (values carry an ein): each bar and y-axis label becomes a focusable link to the org page, with
// data-org-ein so the site-wide hover card (OrgPreviewLayer) shows on hover or focus. Bars render in data order.
function linkOrgs(el: HTMLElement, spec: { data?: { values?: Record<string, unknown>[] }; encoding?: { y?: { field?: string } } }) {
  const vals = spec.data?.values, y = spec.encoding?.y?.field;
  if (!vals?.length || !y || !vals.some((v) => v.ein)) return;
  const mark = (node: Element, v: Record<string, unknown>) => {
    if (!v.ein) return;
    node.setAttribute("data-org-ein", String(v.ein));
    node.setAttribute("data-org-name", String(v[y]));
    node.setAttribute("data-org-href", `/org/${v.ein}`);
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "link");
    node.setAttribute("aria-label", `${v[y]}, open profile`);
    (node as SVGElement).style.cursor = "pointer";
    (node as SVGElement).style.pointerEvents = "auto"; // vega draws axis labels non-interactive
  };
  el.querySelectorAll(".mark-rect.role-mark path").forEach((p, i) => vals[i] && mark(p, vals[i]));
  el.querySelectorAll(".role-axis-label text").forEach((t) => {
    const s = (t.textContent ?? "").replace(/…$/, "");
    const v = s && vals.find((v) => String(v[y]).startsWith(s));
    if (v) mark(t, v);
  });
  if (el.dataset.orgLinked) return;
  el.dataset.orgLinked = "1";
  const go = (t: EventTarget | null) => { const h = (t as Element | null)?.closest?.("[data-org-href]")?.getAttribute("data-org-href"); if (h) window.location.assign(h); };
  el.addEventListener("click", (e) => go(e.target));
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") go(e.target); });
}

export async function exportChart(view: View, kind: "png" | "svg"): Promise<string> {
  const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const before = view.background();
  view.background(bg);
  try { return await view.toImageURL(kind, kind === "png" ? 2 : 1); }
  finally { view.background(before); await view.runAsync(); }
}
