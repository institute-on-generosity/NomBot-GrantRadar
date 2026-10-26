// User edits to the filters NomBot read from a question. They ride in the URL
// (?st=&city=&region=&max=&min=&cause=&label=&tier=&sub=&drop=) so results, "Show more", history and CSV export all agree.
import { isLabel, isLabelSub } from "./labels";
import { nteeLabel } from "./ntee";
import type { Filters } from "./parse";

// label: a graded cause label slug, or "none". tier: "all" adds partial-tier orgs, "primary" removes them.
// sub: a sub-type of a label that has them (immigrants_refugees: services, policy, all); a new label resets it.
// county: search a county of the question's state instead of its city ("Los Angeles County").
export type Overrides = { st?: string; city?: string; county?: string; region?: string; max?: string; min?: string; cause?: string; label?: string; tier?: string; sub?: string; drop?: string };
export const OVERRIDE_KEYS = ["st", "city", "county", "region", "max", "min", "cause", "label", "tier", "sub", "drop"] as const;

// Every state is loaded (plus DC and Puerto Rico), A–Z by name for the place chip.
export const LOADED_STATES: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
  ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"],
  ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["PR", "Puerto Rico"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];
export const BUDGETS = [100_000, 250_000, 500_000, 1_000_000, 5_000_000];
// "Or more" sizes: for a small gift, a larger, established organization usually needs less checking first.
export const MIN_BUDGETS = [1_000_000, 10_000_000];
export const CAUSES = ["A", "B", "C", "D", "E", "F", "I", "J", "K", "L", "N", "O", "P", "S", "T", "X"];

// Short dollars: $2.5M, $15K, and exact under $1K (a $350 typical grant isn't "$0K").
export const money = (n: number) => (n >= 999_500 ? `$${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);
export const reqSlug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const causeLabel = (code: string) => nteeLabel(code) ?? code;
const stateName = (code: string) => LOADED_STATES.find(([c]) => c === code)?.[1] ?? code;

export function applyOverrides(f: Filters, o: Overrides): Filters {
  const out: Filters = { ...f };
  if (o.st || o.city === "any") { out.cities = []; out.county = undefined; out.placeLabel = undefined; } // a new state or "anywhere in" drops the city
  if (o.st || o.region === "none") out.appalachia = undefined; // picking a state means the whole state
  if (o.region === "appalachia") { out.appalachia = true; out.states = []; out.cities = []; out.placeLabel = "Appalachia"; }
  if (o.st === "all") { out.states = []; out.placeLabel = undefined; }
  else if (o.st) {
    const codes = o.st.toUpperCase().split(",").filter((c) => LOADED_STATES.some(([s]) => s === c));
    if (codes.length) { out.states = codes; out.placeLabel = codes.map(stateName).join(", "); }
  }
  if (o.city && o.city !== "any") { // a city picked from the landscape bars
    out.cities = [o.city.toUpperCase()];
    out.county = undefined;
    out.placeLabel = o.city.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  if (o.county && out.states.length === 1 && !o.st) { // the city's county, offered when the city has too little
    out.county = o.county.slice(0, 60); out.cities = []; out.appalachia = undefined;
    out.placeLabel = `${out.county}, ${out.states[0]}`;
  }
  if (o.max === "none") out.maxRevenue = undefined;
  else if (o.max && /^\d+$/.test(o.max)) { out.maxRevenue = Number(o.max); out.minRevenue = undefined; }
  if (o.min === "none") out.minRevenue = undefined;
  else if (o.min && /^\d+$/.test(o.min)) { out.minRevenue = Number(o.min); out.maxRevenue = undefined; }
  if (o.cause === "any") { out.ntee = undefined; out.nteeHint = undefined; }
  else if (o.cause && /^[A-Z]$/.test(o.cause)) out.ntee = o.cause;
  if (o.label === "none") { out.label = undefined; out.labelPartial = undefined; }
  else if (isLabel(o.label)) { if (o.label !== f.label) out.labelSub = undefined; out.label = o.label; }
  if (isLabelSub(o.sub)) out.labelSub = o.sub;
  if (o.tier === "all") out.labelPartial = true;
  else if (o.tier === "primary") out.labelPartial = undefined;
  if (!out.label) { out.labelPartial = undefined; out.labelSub = undefined; }
  if (o.drop) {
    const dropped = new Set(o.drop.split(","));
    out.requirements = f.requirements.filter((r) => !dropped.has(reqSlug(r.label)));
  }
  return out;
}

export const hasOverrides = (o: Overrides) => Boolean(o.st || o.city || o.county || o.region || o.max || o.min || o.cause || o.label || o.tier || o.sub || o.drop);

// Short summary of the filters in effect, stored with feedback and shown in the eval report.
export const describeFilters = (f: Filters) => ({
  topic: f.topic, states: f.states, cities: f.cities, county: f.county ?? null, near: f.near ?? false, prefer: (f.prefer ?? []).map((r) => r.label), preferLabel: f.preferLabel ?? null, boostLabels: f.boostLabels ?? [], appalachia: f.appalachia ?? false, maxRevenue: f.maxRevenue ?? null, minRevenue: f.minRevenue ?? null, ntee: f.ntee ?? null, nteeHint: f.nteeHint ?? null,
  label: f.label ? `${f.label}${f.labelSub ? `:${f.labelSub}` : ""}${f.labelPartial ? "+partial" : ""}` : null, requirements: f.requirements.map((r) => r.label), parser: f.parser,
});
