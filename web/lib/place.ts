// Place scopes for city searches (generosity-data 083 zip_places, 084 grant purpose word indexes).
// A city question ("youth sports in Inglewood, CA") is answered in tiers, each with its evidence:
//   in      HQ address in the city (mailing city or a city ZIP), or the city in the org's name with mail sent from
//           elsewhere ("Inglewood Little League", Los Angeles 90065): flagged "mailed from elsewhere"
//   serves  HQ elsewhere in the state, but a 990 (tax year 2021 on) or a grant purpose line names the city
//   nearby  HQ ZIP within NEAR_MILES of one of the city's ZIPs (Census ZCTA points)
// A county question ("in Los Angeles County") is one tier: every ZIP in the county (zip_regions).
// org_service_places (generosity-data 066/068) is not used: its v3 grade missed the 90% bar.
import { db } from "./db";
import { memo } from "./memo";

export const NEAR_MILES = 3.5; // from the nearest city ZIP point: Inglewood -> Hawthorne, Lawndale, Westchester, Baldwin Hills
// wider: the rest of the city's county, when the question names both ("in Los Angeles County that serve Inglewood").
export type Tier = "in" | "serves" | "nearby" | "county" | "wider";
export const TIER_ORDER: Tier[] = ["in", "county", "serves", "nearby", "wider"];
export type PlaceEvidence = {
  tier: Tier;
  basis: "hq" | "zip" | "name" | "text" | "grant" | "nearby" | "county" | "wider";
  note: string;          // plain words: "HQ in Inglewood", "Named for Inglewood, mailed from Los Angeles"
  quote?: string;        // the words that name the city (990 text or grant purpose)
  year?: number;         // tax year of that filing or grant
  miles?: number;        // nearby: miles from the nearest city ZIP
};
export type CityScope = {
  kind: "city"; city: string; state: string; label: string;  // label: "Inglewood, CA"
  zips: string[];        // ZIPs whose most common org mailing city is the city
  near: { zip: string; miles: number; city: string | null }[]; // ZIPs within NEAR_MILES, outside the city
  county: { fips: string; name: string } | null;               // the county holding most of the city's ZIPs
};
export type CountyScope = { kind: "county"; fips: string; name: string; state: string; label: string; zips: string[] };
export type Scope = CityScope | CountyScope;

const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const cityCache = memo<CityScope | null>("city-scope:v1", 500, 24 * 3600_000);
export function cityScope(city: string, state: string): Promise<CityScope | null> {
  const c = city.trim().toUpperCase(), st = state.trim().toUpperCase();
  return cityCache(`${c}|${st}`, async () => {
    const { rows: zips } = await db.query(`SELECT zip5, lat, lon, point FROM zip_places WHERE state = $1 AND city = $2`, [st, c]);
    if (!zips.length) return null;
    const pts = zips.filter((z) => z.point === "zcta");
    // Nearby: ZCTA points within NEAR_MILES of a city ZCTA point, plus PO-box ZIPs whose city's mean point is that close.
    const { rows: near } = pts.length ? await db.query(
      `WITH c AS (SELECT unnest($1::float8[]) AS lat, unnest($2::float8[]) AS lon)
       SELECT p.zip5 AS zip, p.city, min(3959 * acos(least(1, cos(radians(c.lat)) * cos(radians(p.lat)) * cos(radians(p.lon) - radians(c.lon))
                                       + sin(radians(c.lat)) * sin(radians(p.lat))))) AS miles
       FROM zip_places p, c
       WHERE p.point IN ('zcta', 'city') AND coalesce(p.city, '') <> $3 AND p.state = $4
         AND abs(p.lat - c.lat) < 0.1 AND abs(p.lon - c.lon) < 0.12
       GROUP BY 1, 2 HAVING min(3959 * acos(least(1, cos(radians(c.lat)) * cos(radians(p.lat)) * cos(radians(p.lon) - radians(c.lon))
                                       + sin(radians(c.lat)) * sin(radians(p.lat))))) <= $5
       ORDER BY 3`, [pts.map((z) => z.lat), pts.map((z) => z.lon), c, st, NEAR_MILES]) : { rows: [] };
    const { rows: [county] } = await db.query(
      `SELECT r.county_fips AS fips, n.name FROM zip_regions r JOIN county_need n USING (county_fips)
       WHERE r.zip5 = ANY($1::char(5)[]) GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 1`, [zips.map((z) => z.zip5)]);
    return {
      kind: "city", city: c, state: st, label: `${title(c)}, ${st}`, zips: zips.map((z) => z.zip5 as string),
      near: near.map((r) => ({ zip: r.zip as string, miles: Math.round(Number(r.miles) * 10) / 10, city: r.city as string | null })),
      county: county ? { fips: county.fips, name: county.name } : null,
    };
  });
}

// "Los Angeles County" or "Los Angeles" + CA -> the county and its ZIPs.
const countyCache = memo<CountyScope | null>("county-scope:v1", 200, 24 * 3600_000);
export function countyScope(name: string, state: string): Promise<CountyScope | null> {
  const base = name.replace(/\s+(county|parish|borough)$/i, "").trim();
  return countyCache(`${base.toUpperCase()}|${state.toUpperCase()}`, async () => {
    const { rows: [c] } = await db.query(
      `SELECT county_fips AS fips, name, state FROM county_need WHERE county_fips <> '00000' AND state = $2
         AND (lower(name) = lower($1) OR lower(name) = lower($1 || ' County') OR lower(name) = lower($1 || ' Parish')) LIMIT 1`, [base, state.toUpperCase()]);
    if (!c) return null;
    const { rows } = await db.query(`SELECT zip5 FROM zip_regions WHERE county_fips = $1`, [c.fips]);
    return { kind: "county", fips: c.fips, name: c.name, state: c.state, label: `${c.name}, ${c.state}`, zips: rows.map((r) => r.zip5 as string) };
  });
}

// The words around the place name in a text, for the evidence column ("…health center for South Los Angeles, Inglewood, Fontana…").
export function quoteAround(text: string, place: string, width = 90): string | null {
  const m = new RegExp(`(?<![a-z0-9])${place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(?![a-z0-9])`, "i").exec(text);
  if (!m) return null;
  const a = Math.max(0, m.index - width), b = Math.min(text.length, m.index + m[0].length + width);
  const cut = text.slice(a, b).replace(/\s+/g, " ").trim();
  return `${a > 0 ? "…" : ""}${cut}${b < text.length ? "…" : ""}`;
}

// Organizations the city's name points to, outside the HQ tier: named for it (mailed from elsewhere in the state),
// or with a 990 (2021 on) or a grant purpose line (linked grants, 2021 on, 990-PF and Schedule I) that names it.
// All three are word-index lookups (orgs.search, filing_text.search, 084's purpose indexes), well under 100 ms.
const pointsCache = memo<Map<string, PlaceEvidence>>("city-points:v2", 300, 3600_000);
export function cityPointers(scope: CityScope): Promise<Map<string, PlaceEvidence>> {
  return pointsCache(`${scope.city}|${scope.state}`, async () => {
    const word = scope.city.toLowerCase();
    const re = `(?<![a-z0-9])${word.replace(/\s+/g, "\\s+")}(?![a-z0-9])`;
    const out = new Map<string, PlaceEvidence>();
    const inCity = `(upper(o.city) = $2 OR left(o.zip, 5) = ANY($4::text[]))`;
    const [named, text, pf, ci] = await Promise.all([
      db.query(`SELECT o.ein, o.name, o.city, o.zip FROM orgs o
                WHERE o.search @@ phraseto_tsquery('english', $1) AND o.state = $3 AND o.name ~* $5 AND NOT ${inCity}`, [word, scope.city, scope.state, scope.zips, re]),
      db.query(`SELECT DISTINCT ON (t.ein) t.ein, t.tax_year, coalesce(t.mission, '') || ' ' || coalesce(t.programs, '') AS text FROM filing_text t JOIN orgs o USING (ein)
                WHERE t.search @@ phraseto_tsquery('english', $1) AND t.tax_year >= 2021 AND o.state = $3 AND NOT ${inCity}
                  AND coalesce(t.mission, '') || ' ' || coalesce(t.programs, '') ~* $5
                ORDER BY t.ein, t.tax_year DESC`, [word, scope.city, scope.state, scope.zips, re]),
      db.query(`SELECT g.recipient_ein AS ein, g.tax_year, g.purpose, g.amount FROM grants g JOIN orgs o ON o.ein = g.recipient_ein
                WHERE to_tsvector('simple', g.purpose) @@ phraseto_tsquery('simple', $1) AND g.tax_year >= 2021 AND g.recipient_ein IS NOT NULL
                  AND o.state = $3 AND NOT ${inCity} AND g.purpose ~* $5
                ORDER BY g.tax_year DESC, g.amount DESC NULLS LAST`, [word, scope.city, scope.state, scope.zips, re]),
      db.query(`SELECT g.recipient_ein AS ein, g.tax_year, g.purpose, g.amount FROM charity_grants g JOIN orgs o ON o.ein = g.recipient_ein
                WHERE to_tsvector('simple', g.purpose) @@ phraseto_tsquery('simple', $1) AND g.tax_year >= 2021 AND g.recipient_ein IS NOT NULL
                  AND o.state = $3 AND NOT ${inCity} AND g.purpose ~* $5
                ORDER BY g.tax_year DESC, g.amount DESC NULLS LAST`, [word, scope.city, scope.state, scope.zips, re]),
    ]);
    const place = title(scope.city);
    for (const r of named.rows) out.set(r.ein, { tier: "in", basis: "name", note: `Named for ${place}, mailed from ${r.city ? title(r.city) : "elsewhere"}${r.zip ? ` ${String(r.zip).slice(0, 5)}` : ""}` });
    for (const r of text.rows) if (!out.has(r.ein)) out.set(r.ein, { tier: "serves", basis: "text", note: `Its ${r.tax_year} Form 990 names ${place}`, quote: quoteAround(r.text, scope.city) ?? undefined, year: r.tax_year });
    // Grant purposes are short: keep the sentence before the place ("creative writing and mentoring for teen girls ... Inglewood").
    for (const r of [...pf.rows, ...ci.rows]) if (!out.has(r.ein)) out.set(r.ein, { tier: "serves", basis: "grant", note: `A ${r.tax_year} grant to it names ${place}`, quote: quoteAround(r.purpose, scope.city, 220) ?? undefined, year: r.tax_year });
    return out;
  });
}

export const tierTitle = (t: Tier, s: Scope) =>
  t === "wider" ? `Elsewhere in ${s.kind === "city" && s.county ? s.county.name : "the county"}` : t === "in" ? `In ${s.kind === "city" ? title(s.city) : s.name}` : t === "county" ? `In ${s.label}`
  : t === "serves" ? `Serving ${s.kind === "city" ? title(s.city) : s.name}, based elsewhere` : `Nearby, within ${NEAR_MILES} miles`;
export const tierNote = (t: Tier, s: Scope) =>
  t === "wider" ? `HQ elsewhere in ${s.kind === "city" && s.county ? s.county.name : "the county"}` : t === "in" ? "HQ address in the city, or the city in the name" : t === "county" ? `HQ address in ${s.label}`
  : t === "serves" ? "A recent Form 990 or grant purpose names the city" : `HQ ZIP within ${NEAR_MILES} miles of a ZIP in ${s.kind === "city" ? title(s.city) : "the place"}`;

// Every org with an HQ in the city (mailing city or a city ZIP), or in a ring of nearby ZIPs: lists that let the
// search read each filing by key (lib/search.ts TINY) instead of walking the vector index with a place filter.
const einsCache = memo<string[]>("place-eins:v1", 500, 3600_000);
export function placeEins(state: string, city: string | null, zips: string[]): Promise<string[]> {
  return einsCache(`${state}|${city ?? ""}|${zips.join(",")}`, async () => (await db.query(
    `SELECT ein FROM orgs WHERE state = $1 AND (upper(city) = $2 OR left(zip, 5) = ANY($3::text[]))`, [state, city ?? "", zips])).rows.map((r) => r.ein as string));
}
