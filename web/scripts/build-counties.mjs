// Build-time: county + state geometry for the 5 NomBot states -> lib/geo/counties.json.
// Run: npm run build:counties
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { geoConicConformal, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("us-atlas/counties-10m.json"), "utf8"));

const STATES = { "54": "WV", "21": "KY", "47": "TN", "51": "VA", "39": "OH" };
const W = 960;
const PAD = 8;

const countyGeoms = topo.objects.counties.geometries.filter((g) => String(g.id).slice(0, 2) in STATES);
const stateGeoms = topo.objects.states.geometries.filter((g) => String(g.id) in STATES);

const region = { type: "FeatureCollection", features: stateGeoms.map((g) => feature(topo, g)) };
// Lambert conformal conic centred on the region (standard parallels hug 35°–42°N).
const projection = geoConicConformal().parallels([36, 41]).rotate([83.5, 0]);
projection.fitWidth(W - 2 * PAD, region);
const [[, y0], [, y1]] = geoPath(projection).bounds(region);
const H = Math.ceil(y1 - y0 + 2 * PAD);
projection.fitExtent([[PAD, PAD], [W - PAD, H - PAD]], region);

const path = geoPath(projection).digits(1);
const r1 = (n) => Math.round(n * 10) / 10;

const counties = countyGeoms
  .map((g) => {
    const fips = String(g.id).padStart(5, "0");
    return { fips, name: g.properties.name, state: STATES[fips.slice(0, 2)], d: path(feature(topo, g)) };
  })
  .filter((c) => c.d)
  .sort((a, b) => a.fips.localeCompare(b.fips));

const states = stateGeoms.map((g) => {
  const f = feature(topo, g);
  const [[a, b], [c, d]] = path.bounds(f);
  return { state: STATES[String(g.id)], d: path(f), bbox: [r1(a), r1(b), r1(c), r1(d)] };
});

// Every state border in the region drawn once (no doubled strokes on shared borders).
const borders = path(mesh(topo, { type: "GeometryCollection", geometries: stateGeoms }));

const out = { viewBox: `0 0 ${W} ${H}`, counties, states, borders };
const file = fileURLToPath(new URL("../lib/geo/counties.json", import.meta.url));
writeFileSync(file, JSON.stringify(out));
console.log(`wrote ${file}: ${counties.length} counties, viewBox ${out.viewBox}, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
