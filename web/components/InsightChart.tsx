"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { View } from "vega";

// One Vega-Lite chart, themed with the app's colors. vega + vega-lite + vega-embed (~1 MB) load only
// when the first chart scrolls near the screen, so the home page stays fast. Redraws on a light/dark switch.

// Categorical hues in fixed order (validated set: dataviz reference palette), stepped per mode.
const CATEGORY = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]; // one hue, light → dark
const DIVERGING = { light: ["#e34948", "#f0efec", "#2a78d6"], dark: ["#e66767", "#383835", "#3987e5"] };

function theme(dark: boolean) {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const ink = v("--ink"), mute = v("--mute"), line = v("--line"), accent = v("--g");
  const font = v("--sans") || "system-ui";
  const label = { labelColor: mute, titleColor: mute, labelFont: font, titleFont: font, labelFontSize: 11, titleFontSize: 11, titleFontWeight: 500 as const };
  return {
    background: "transparent",
    font,
    padding: { left: 0, right: 4, top: 6, bottom: 0 },
    view: { stroke: null },
    scale: { bandPaddingInner: 0.28, bandPaddingOuter: 0.1 },
    title: { color: ink, font, fontSize: 13, fontWeight: 600 as const, anchor: "start" as const, subtitleColor: mute },
    axis: { ...label, domainColor: line, tickColor: line, gridColor: line, gridDash: [], labelPadding: 6, titlePadding: 8, tickSize: 4, labelOverlap: "greedy" as const, labelFlush: true, tickCount: 6 },
    axisX: { grid: false },
    axisY: { domain: false, ticks: false },
    legend: { ...label, labelFontSize: 12, symbolType: "circle", orient: "bottom" as const, direction: "horizontal" as const },
    header: { labelColor: mute, titleColor: mute, labelFont: font, titleFont: font },
    mark: { color: accent },
    bar: { color: accent, cornerRadiusEnd: 3 },
    line: { color: accent, strokeWidth: 2 },
    point: { color: accent, size: 64, filled: true },
    circle: { color: accent, size: 64 },
    area: { color: accent, opacity: 0.85 },
    rule: { color: mute },
    text: { color: ink, font, fontSize: 11 },
    range: { category: dark ? CATEGORY.dark : CATEGORY.light, ramp: RAMP, heatmap: RAMP, diverging: dark ? DIVERGING.dark : DIVERGING.light, ordinal: RAMP.slice(2) },
  };
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");
const onScheme = (cb: () => void) => { const q = darkQuery(); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); };
let lib: Promise<typeof import("vega-embed")> | null = null;

export function InsightChart({ spec, label, onView }: { spec: Record<string, unknown>; label: string; onView?: (v: View | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const dark = useSyncExternalStore(onScheme, () => darkQuery().matches, () => false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !box.current) return;
    let view: View | null = null;
    let gone = false;
    const el = box.current;
    (lib ??= import("vega-embed")).then(async ({ default: embed }) => {
      if (gone) return;
      // Our vega-lite reads v5 specs; drop the $schema so it doesn't warn about the version.
      const { $schema: _s, ...rest } = spec; // eslint-disable-line @typescript-eslint/no-unused-vars
      const res = await embed(el, rest as never, { actions: false, renderer: "svg", config: theme(dark) as never, tooltip: { theme: dark ? "dark" : "light" } });
      if (gone) { res.finalize(); return; }
      view = res.view;
      onView?.(view);
    }).catch((e) => { console.error("chart failed", e); if (!gone) setError(true); });
    return () => { gone = true; view?.finalize(); onView?.(null); };
  }, [near, dark, spec, onView]);

  if (error) return <p className="ins-chart-err">This chart could not be drawn. The data is in the CSV.</p>;
  return <div ref={box} className="ins-chart" role="img" aria-label={label} />;
}

// Export: PNG (2x) or SVG, on the page's background so it reads in slides and documents.
export async function exportChart(view: View, kind: "png" | "svg"): Promise<string> {
  const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const before = view.background();
  view.background(bg);
  try { return await view.toImageURL(kind, kind === "png" ? 2 : 1); }
  finally { view.background(before); await view.runAsync(); }
}
