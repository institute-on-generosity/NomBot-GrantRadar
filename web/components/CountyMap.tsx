"use client";
import { useId, useMemo, useRef, useState } from "react";
import geo from "@/lib/geo/counties.json";
import s from "./CountyMap.module.css";

type County = { fips: string; name: string; state: string; d: string };
type State = { state: string; d: string; bbox: number[] };
const GEO = geo as { viewBox: string; counties: County[]; states: State[]; borders: string };

type Props = {
  counts: Record<string, number>;          // county FIPS (5 digits) -> organizations matching the search
  appalachia?: string[];                   // county FIPS in Appalachia (hatched, outlined region)
  label?: string;                          // plural noun for tooltips/legend, e.g. "organizations"
  onSelect?: (fips: string, name: string) => void; // when absent, counties aren't clickable/focusable
  focusStates?: string[];                  // state abbrs to zoom to; default all 5
};

const STEPS = 5;
// Share of --g mixed into the empty-county fill per step (lightest -> darkest); works in light and dark.
const MIX = [20, 36, 54, 74, 94];
const fillFor = (step: number) => (step < 0 ? "var(--fill)" : `color-mix(in srgb, var(--g) ${MIX[step]}%, var(--fill))`);

// Virginia FIPS x5xx are independent cities, not counties.
export const countyLabel = (c: { fips: string; name: string; state: string }) =>
  `${c.name} ${c.state === "VA" && Number(c.fips.slice(2)) >= 500 ? "city" : "County"}, ${c.state}`;

const singular = (label: string) => label.replace(/ies$/, "y").replace(/s$/, "");
const fmt = (n: number) => n.toLocaleString("en-US");

export function CountyMap({ counts, appalachia, label = "organizations", onSelect, focusStates }: Props) {
  const uid = useId().replace(/:/g, "");
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ c: County; x: number; y: number; flip: boolean } | null>(null);

  const max = useMemo(() => Object.values(counts).reduce((m, n) => Math.max(m, n), 0), [counts]);
  // Log scale: step = floor(STEPS * ln(n) / ln(max + 1)); thresholds = smallest n landing in each step.
  const stepOf = useMemo(() => {
    const L = Math.log(max + 1);
    return (n: number) => (n > 0 ? Math.min(STEPS - 1, Math.floor((STEPS * Math.log(n)) / L)) : -1);
  }, [max]);
  const thresholds = useMemo(() => {
    const t: (number | null)[] = [];
    for (let i = 0; i < STEPS; i++) {
      const lo = Math.max(1, Math.ceil(Math.exp((i * Math.log(max + 1)) / STEPS) - 1e-9));
      t.push(lo <= max && stepOf(lo) === i ? lo : null); // null: no integer count falls in this step
    }
    return t;
  }, [max, stepOf]);

  const viewBox = useMemo(() => {
    const pick = focusStates?.length ? GEO.states.filter((st) => focusStates.includes(st.state)) : [];
    if (!pick.length) return GEO.viewBox;
    const x0 = Math.min(...pick.map((p) => p.bbox[0])), y0 = Math.min(...pick.map((p) => p.bbox[1]));
    const x1 = Math.max(...pick.map((p) => p.bbox[2])), y1 = Math.max(...pick.map((p) => p.bbox[3]));
    const pad = Math.max(x1 - x0, y1 - y0) * 0.03;
    return `${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + 2 * pad).toFixed(1)} ${(y1 - y0 + 2 * pad).toFixed(1)}`;
  }, [focusStates]);

  const focus = useMemo(() => (focusStates?.length ? new Set(focusStates) : null), [focusStates]);
  const appSet = useMemo(() => new Set(appalachia ?? []), [appalachia]);
  const appCounties = useMemo(() => GEO.counties.filter((c) => appSet.has(c.fips)), [appSet]);

  const summary = useMemo(() => {
    let total = 0, n = 0, top: County | null = null, topN = 0;
    for (const c of GEO.counties) {
      const v = counts[c.fips] ?? 0;
      if (!v) continue;
      total += v; n++;
      if (v > topN) { topN = v; top = c; }
    }
    if (!n) return `Map: no ${label} in any county`;
    return `Map: ${fmt(total)} ${total === 1 ? singular(label) : label} in ${fmt(n)} ${n === 1 ? "county" : "counties"}; most in ${countyLabel(top!)} (${fmt(topN)})`;
  }, [counts, label]);

  const place = (c: County, clientX: number, clientY: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setHover({ c, x: clientX - r.left, y: clientY - r.top, flip: clientX - r.left > r.width * 0.62 });
  };
  const placeAtEl = (c: County, el: Element) => {
    const b = el.getBoundingClientRect();
    place(c, b.left + b.width / 2, b.top + b.height / 2);
  };

  const n = hover ? counts[hover.c.fips] ?? 0 : 0;

  return (
    <div className={s.wrap} ref={wrap}>
      <svg
        className={`${s.map}${onSelect ? ` ${s.clickable}` : ""}`}
        viewBox={viewBox}
        role="img"
        aria-label={summary}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <pattern id={`${uid}h`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" className={s.hatchLine} />
          </pattern>
          <mask id={`${uid}m`} maskUnits="userSpaceOnUse">
            <rect x="-50" y="-50" width="2000" height="2000" fill="#fff" />
            {appCounties.map((c) => <path key={c.fips} d={c.d} fill="#000" />)}
          </mask>
        </defs>

        <g>
          {GEO.counties.map((c) => {
            const v = counts[c.fips] ?? 0;
            return (
              <path
                key={c.fips}
                d={c.d}
                className={focus && !focus.has(c.state) ? `${s.county} ${s.dim}` : s.county}
                style={{ fill: fillFor(stepOf(v)) }}
                tabIndex={onSelect ? 0 : undefined}
                role={onSelect ? "button" : undefined}
                aria-label={onSelect ? `${countyLabel(c)}: ${v ? `${fmt(v)} ${v === 1 ? singular(label) : label}` : "no matches"}` : undefined}
                onPointerMove={(e) => place(c, e.clientX, e.clientY)}
                onFocus={(e) => placeAtEl(c, e.currentTarget)}
                onBlur={() => setHover(null)}
                onClick={onSelect ? () => onSelect(c.fips, c.name) : undefined}
                onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c.fips, c.name); } } : undefined}
              />
            );
          })}
        </g>

        {appCounties.length > 0 && (
          <g className={s.appalachia} aria-hidden>
            {appCounties.map((c) => <path key={c.fips} d={c.d} fill={`url(#${uid}h)`} />)}
            {/* Region outline: thick strokes masked to outside the region -> only the outer edge survives. */}
            <g mask={`url(#${uid}m)`} className={s.appOutline}>
              {appCounties.map((c) => <path key={c.fips} d={c.d} />)}
            </g>
          </g>
        )}

        <path d={GEO.borders} className={s.states} aria-hidden />
        {hover && <path d={hover.c.d} className={s.lift} aria-hidden />}
      </svg>

      {hover && (
        <div
          className={s.tip}
          style={{ left: hover.x, top: hover.y, transform: `translate(${hover.flip ? "calc(-100% - 12px)" : "12px"}, calc(-100% - 8px))` }}
          role="presentation"
        >
          <strong>{countyLabel(hover.c)}</strong>
          <span>{n ? `${fmt(n)} ${n === 1 ? singular(label) : label}` : "No matches"}</span>
        </div>
      )}

      <div className={s.legend} aria-hidden>
        <span className={s.key}><i className={s.sw} style={{ background: fillFor(-1) }} />0</span>
        {max > 0 && (
          <span className={s.key}>
            {fmt(thresholds.find((t) => t != null) ?? 1)}
            <span className={s.ramp}>
              {MIX.map((_, i) => <i key={i} className={s.sw} style={{ background: fillFor(i), opacity: thresholds[i] == null ? 0.25 : 1 }} />)}
            </span>
            {fmt(max)} {label}
          </span>
        )}
        {appCounties.length > 0 && (
          <span className={s.key}>
            <svg className={s.sw} viewBox="0 0 12 12"><rect width="12" height="12" fill={`url(#${uid}h)`} className={s.appSwatch} /></svg>
            Appalachia
          </span>
        )}
      </div>
    </div>
  );
}

export default CountyMap;
