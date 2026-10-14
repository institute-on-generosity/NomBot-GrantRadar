// Build-time: county + state geometry for every US state, DC and Puerto Rico -> lib/geo/counties.json.
// The map zooms to the states in each search (CountyMap focusStates), so one national file serves all.
// Run: npm run build:counties
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("us-atlas/counties-10m.json"), "utf8"));

const STATES = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY", "72": "PR",
};
const W = 960;
const PAD = 8;

const countyGeoms = topo.objects.counties.geometries.filter((g) => String(g.id).slice(0, 2) in STATES);
const stateGeoms = topo.objects.states.geometries.filter((g) => String(g.id) in STATES);

const region = { type: "FeatureCollection", features: stateGeoms.map((g) => feature(topo, g)) };
// Albers USA: the lower 48 in an equal-area conic, Alaska and Hawaii as insets (Puerto Rico has no inset and drops out).
const projection = geoAlbersUsa();
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
