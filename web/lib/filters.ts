// User edits to the filters NomBot read from a question. They ride in the URL
// (?st=&city=&region=&max=&cause=&drop=) so results, "Show more", history and CSV export all agree.
import { nteeLabel } from "./ntee";
import type { Filters } from "./parse";

export type Overrides = { st?: string; city?: string; region?: string; max?: string; cause?: string; drop?: string };

// Only these states are loaded for now.
export const LOADED_STATES: [string, string][] = [["WV", "West Virginia"], ["KY", "Kentucky"], ["TN", "Tennessee"], ["VA", "Virginia"], ["OH", "Ohio"]];
export const BUDGETS = [100_000, 250_000, 500_000, 1_000_000, 5_000_000];
export const CAUSES = ["A", "B", "C", "D", "E", "F", "I", "J", "K", "L", "N", "O", "P", "S", "T", "X"];

export const money = (n: number) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);
export const reqSlug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const causeLabel = (code: string) => nteeLabel(code) ?? code;
const stateName = (code: string) => LOADED_STATES.find(([c]) => c === code)?.[1] ?? code;

export function applyOverrides(f: Filters, o: Overrides): Filters {
  const out: Filters = { ...f };
  if (o.st || o.city === "any") { out.cities = []; out.placeLabel = undefined; } // a new state or "anywhere in" drops the city
  if (o.st || o.region === "none") out.appalachia = undefined; // picking a state means the whole state
  if (o.region === "appalachia") { out.appalachia = true; out.states = []; out.cities = []; out.placeLabel = "Appalachia"; }
  if (o.st === "all") { out.states = []; out.placeLabel = undefined; }
  else if (o.st) {
    const codes = o.st.toUpperCase().split(",").filter((c) => LOADED_STATES.some(([s]) => s === c));
    if (codes.length) { out.states = codes; out.placeLabel = codes.map(stateName).join(", "); }
  }
  if (o.max === "none") out.maxRevenue = undefined;
  else if (o.max && /^\d+$/.test(o.max)) out.maxRevenue = Number(o.max);
  if (o.cause === "any") { out.ntee = undefined; out.nteeHint = undefined; }
  else if (o.cause && /^[A-Z]$/.test(o.cause)) out.ntee = o.cause;
  if (o.drop) {
    const dropped = new Set(o.drop.split(","));
    out.requirements = f.requirements.filter((r) => !dropped.has(reqSlug(r.label)));
  }
  return out;
}

export const hasOverrides = (o: Overrides) => Boolean(o.st || o.city || o.region || o.max || o.cause || o.drop);

// Short summary of the filters in effect, stored with feedback and shown in the eval report.
export const describeFilters = (f: Filters) => ({
  topic: f.topic, states: f.states, cities: f.cities, appalachia: f.appalachia ?? false, maxRevenue: f.maxRevenue ?? null, ntee: f.ntee ?? null, nteeHint: f.nteeHint ?? null,
  requirements: f.requirements.map((r) => r.label), parser: f.parser,
});
