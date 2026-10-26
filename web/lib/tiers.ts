// Tiered place search: a city question runs the hybrid search once per tier (lib/place.ts) and labels every
// result with the tier and its evidence. A county question is one tier over the county's ZIPs.
//   in       HQ city or a city ZIP, plus orgs named for the city mailed from elsewhere (flagged)
//   serves   HQ elsewhere in the state, a 990 or grant purpose names the city (quote kept)
//   nearby   HQ ZIP within NEAR_MILES of a city ZIP
// Each tier is ranked on its own, so a busy neighbor never crowds out the city itself.
import type { Filters } from "./parse";
import { cityPointers, cityScope, countyScope, placeEins, tierNote, tierTitle, type PlaceEvidence, type Scope, type Tier } from "./place";
import { search, type Result } from "./search";
import { topicHints } from "./topicHints";

export type TierBlock = { tier: Tier; title: string; note: string; total: number; exact_total: number | null; results: Result[] };
export type TieredFound = {
  total: number; exact_total: number | null; semantic: boolean; model: string | null; results: Result[];
  scope: Scope; tiers: TierBlock[];
};

// The place scope a question's filters name: a county ("in Los Angeles County"), or one city in one state.
// A city and its county both named ("in Los Angeles County that serve Inglewood"): the city's tiers, then the rest of the county.
export async function placeScope(f: Filters): Promise<Scope | null> {
  if (f.cities.length === 1 && f.states.length === 1 && !f.appalachia) {
    const c = await cityScope(f.cities[0], f.states[0]);
    if (c) return c;
  }
  if (f.county && f.states.length === 1) return countyScope(f.county, f.states[0]);
  return null;
}

const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

export async function tieredSearch(f: Filters, scope: Scope, { includeInactive = false, limit }: { includeInactive?: boolean; limit: number }): Promise<TieredFound> {
  const base = { ...f, includeInactive, limit, cities: [] as string[], states: [scope.state] };
  let semantic = false, model: string | null = null;
  const run = (tier: Tier, place: { cities?: string[]; zips?: string[]; eins?: string[]; keep?: string[] }, ev: (r: Result) => PlaceEvidence) =>
    search({ ...base, ...place }).then((res): TierBlock => (semantic ||= res.semantic, model ??= res.model, {
      tier, title: tierTitle(tier, scope), note: tierNote(tier, scope), total: res.total, exact_total: res.exact_total,
      results: res.results.map((r) => ({ ...r, place: ev(r) })),
    }));
  let blocks: TierBlock[];
  if (scope.kind === "county") {
    blocks = [await run("county", { zips: scope.zips }, () => ({ tier: "county", basis: "county", note: `HQ in ${scope.label}` }))];
  } else {
    const [pointers, cityEins, nearEins] = await Promise.all([cityPointers(scope), placeEins(scope.state, scope.city, scope.zips),
      scope.near.length ? placeEins(scope.state, null, scope.near.map((n) => n.zip)) : Promise.resolve([])]);
    const named = [...pointers].filter(([, e]) => e.tier === "in").map(([ein]) => ein);
    const serves = [...pointers].filter(([, e]) => e.tier === "serves").map(([ein]) => ein);
    const zipSet = new Set(scope.zips), near = new Map(scope.near.map((n) => [n.zip, n]));
    const city = title(scope.city);
    const county = f.county && scope.county ? await countyScope(scope.county.name, scope.state) : null;
    const [inT, servesT, nearT, widerT] = await Promise.all([
      run("in", { eins: [...cityEins, ...named], keep: named }, (r) => {
        const p = pointers.get(r.ein.replace("-", ""));
        if (p && (r.city ?? "").toUpperCase() !== scope.city && !zipSet.has((r.zip ?? "").slice(0, 5))) return p;
        return (r.city ?? "").toUpperCase() === scope.city
          ? { tier: "in", basis: "hq", note: `HQ in ${city}` }
          : { tier: "in", basis: "zip", note: `HQ ZIP ${(r.zip ?? "").slice(0, 5)} is in ${city} (mailing city ${r.city ? title(r.city) : "not given"})` };
      }),
      serves.length ? run("serves", { eins: serves, keep: serves }, (r) => pointers.get(r.ein.replace("-", ""))!) : null,
      nearEins.length ? run("nearby", { eins: nearEins }, (r) => {
        const n = near.get((r.zip ?? "").slice(0, 5));
        return { tier: "nearby", basis: "nearby", note: `HQ in ${r.city ? title(r.city) : "a nearby ZIP"} ${(r.zip ?? "").slice(0, 5)}, ${n?.miles ?? "?"} miles from ${city}`, miles: n?.miles };
      }) : null,
      county ? run("wider", { zips: county.zips.filter((z) => !zipSet.has(z) && !near.has(z)) }, (r) =>
        ({ tier: "wider", basis: "wider", note: `HQ in ${r.city ? title(r.city) : "the county"} ${(r.zip ?? "").slice(0, 5)}, ${county.name}` })) : null,
    ]);
    // An org found by evidence (named, serves) never shows twice: the "in" tier wins, then serves.
    const seen = new Set(inT.results.map((r) => r.ein));
    const dedupe = (b: TierBlock | null) => {
      if (!b) return null;
      const results = b.results.filter((r) => !seen.has(r.ein));
      results.forEach((r) => seen.add(r.ein));
      return { ...b, results, total: b.total - (b.results.length - results.length) };
    };
    // Serves: evidence that names the topic too ("prenatal care at ... Inglewood Health Center") ranks first.
    if (servesT) {
      const topic = new Set([...words(`${f.topic} ${(f.prefer ?? []).map((p) => p.label).join(" ")}`), ...topicHints(`${f.topic} ${f.semantic}`).names].filter((w) => w.length > 2));
      const hit = (r: Result) => words(r.place?.quote ?? "").some((w) => topic.has(w) || [...topic].some((t) => w.startsWith(t) && t.length > 4));
      servesT.results.sort((a, b) => Number(hit(b)) - Number(hit(a)) || b.score - a.score);
    }
    blocks = [inT, dedupe(servesT), dedupe(nearT), dedupe(widerT)].filter((b): b is TierBlock => Boolean(b));
  }
  const exact = blocks.some((b) => b.exact_total != null) ? blocks.reduce((s, b) => s + (b.exact_total ?? 0), 0) : null;
  return {
    total: blocks.reduce((s, b) => s + b.total, 0), exact_total: exact, semantic, model,
    results: blocks.flatMap((b) => b.results), scope, tiers: blocks,
  };
}
