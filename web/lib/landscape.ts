// The landscape behind a search: the 200 organizations closest to the question (same filters and
// hybrid ranking as the results), summarized so users can zoom out: sizes, places, causes, team
// sizes, counties (for the map), the foundations that fund this field (from 990-PF grants), and
// financial health: revenue trend, surplus or deficit, reserves and where the money comes from; each
// organization's age (track record) and its foundation grants in the newest years (funding by theme).
import { titleCase } from "../components/text";
import { db } from "./db";
import { LOADED_STATES } from "./filters";
import { memo } from "./memo";
import { nteeLabel } from "./ntee";
import type { Filters } from "./parse";
import { searchCandidates } from "./rerank";
import { orgAge } from "./org";
import { orgHealth, type Health as OrgHealth } from "./search";

export const LANDSCAPE = 200;

export type Bar = { key: string; label: string; count: number; orgs?: number[] }; // orgs: indexes into Landscape.orgs, closest first (Breakdown bars)
export type Underserved = { fips: string; name: string; state: string; poverty: number; low: number | null; high: number | null; poor: number | null; population: number | null };
export type Funder = { ein: string; name: string; city: string | null; state: string | null; orgs: number; amount: number; inviteOnly: boolean; grantees: { ein: string; name: string }[] };
export type Landscape = {
  size: number;
  sizes: Bar[];      // revenue bands
  cities: Bar[];     // key = city (upper case), label "Louisville, KY"
  causes: Bar[];     // key = NTEE major letter
  team: Bar[];       // all-volunteer, 1-10, 11-50, 51+ staff
  teamReported: number;
  ages: Bar[];       // years since the IRS ruling: under 5, 5-15, 15-30, 30+
  medianAge: number | null; // median years tax-exempt, for the Overview tab
  medianIncome: number | null; incomeReported: number; // newest yearly income (revenue), for the Overview tiles
  grantYears: [number, number]; // tax years summed in orgs[].grants (the newest three loaded)
  counties: Record<string, number>;
  countyOrgs: Record<string, { ein: string; name: string; city: string | null }[]>; // per county, closest matches first
  appalachia: string[];
  // Need vs supply (Census SAIPE + population, generosity-data county_need), for the states in play
  // (Appalachian counties only when the search is limited to Appalachia).
  mapStates: string[];
  need: Record<string, { poverty: number | null; population: number | null }>;
  underserved: Underserved[]; // high poverty (at or above povertyCut), none of these orgs
  highNeed: number; // counties at or above povertyCut in the area
  povertyCut: number; // "high poverty" here: the poorest quarter of the area's counties, capped at 20%
  usPoverty: number | null; // national poverty rate, for comparison
  funders: Funder[];
  funded: number;    // organizations in the landscape that received at least one foundation grant
  // grants: linked 990-PF grants in grantYears; local: the part from foundations in the org's own state
  // since: year of the IRS ruling (track record)
  orgs: { ein: string; name: string; city: string | null; state: string | null; text: string; grants: number; local: number; since: number | null }[];
  health: Health;
};
// Financial health, from the newest SOI extract year (and the IRS master file for a newer revenue figure).
// signals: the organizations behind each plain statement ("82 of 178 ran a deficit"), for the Finances tab.
export type Signal = { key: "growing" | "shrinking" | "deficit" | "thin" | "reliant"; of: number; orgs: { ein: string; value: number }[] };
export type Health = {
  trend: Bar[]; trendReported: number;   // revenue change since the previous filing, shrinking → growing
  margin: Bar[]; reserves: Bar[]; mix: Bar[]; reported: number;
  signals: Signal[];
};

const BANDS: [string, string, number, number][] = [
  ["100000", "Under $100K", 0, 100_000], ["1000000", "$100K–$1M", 100_000, 1_000_000],
  ["10000000", "$1M–$10M", 1_000_000, 10_000_000], ["", "$10M+", 10_000_000, Infinity],
];
const title = titleCase;
const tally = <T,>(xs: T[], key: (x: T) => string | null) => {
  const m = new Map<string, number>();
  for (const x of xs) { const k = key(x); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]);
};

// The newest three tax years of 990-PF grants loaded (the newest is partial while the IRS releases it).
const newestYear = memo<number>("grant-year", 1, 24 * 3600_000);
const grantYears = async (): Promise<[number, number]> => {
  const to = await newestYear("", async () => Number((await db.query(`SELECT max(tax_year) AS y FROM funders`)).rows[0]?.y ?? new Date().getFullYear() - 1));
  return [to - 2, to];
};

async function build(filters: Filters, includeInactive: boolean): Promise<Landscape> {
  const { results } = await searchCandidates(filters, { limit: LANDSCAPE, includeInactive });
  const eins = results.map((r) => r.ein.replace("-", ""));
  // Only states whose nonprofits are loaded: elsewhere every county would look like a gap.
  const loaded = new Set(LOADED_STATES.map(([c]) => c));
  const mapStates = (filters.states.length ? filters.states : [...new Set(results.map((r) => r.state).filter((x): x is string => Boolean(x)))]).filter((st) => loaded.has(st));
  const years = await grantYears();
  const [{ rows: team }, { rows: geo }, { rows: app }, { rows: funders }, { rows: [funded] }, health, { rows: need }, { rows: track }] = await Promise.all([
    db.query(`SELECT DISTINCT ON (ein) ein, employees, volunteers FROM filing_text WHERE ein = ANY($1) ORDER BY ein, tax_year DESC`, [eins]),
    db.query(`SELECT z.county_fips, o.ein FROM orgs o JOIN zip_regions z ON z.zip5 = left(o.zip, 5)::char(5) WHERE o.ein = ANY($1)`, [eins]),
    db.query(`SELECT DISTINCT county_fips FROM zip_regions WHERE appalachia`),
    db.query(`SELECT g.funder_ein AS ein, f.name, f.city, f.state, f.invite_only,
                     count(DISTINCT g.recipient_ein)::int AS orgs, coalesce(sum(g.amount), 0)::bigint AS amount,
                     json_agg(DISTINCT jsonb_build_object('ein', o.ein, 'name', o.name)) AS grantees
              FROM grants g JOIN funders f ON f.ein = g.funder_ein JOIN orgs o ON o.ein = g.recipient_ein
              WHERE g.recipient_ein = ANY($1)
              GROUP BY 1, 2, 3, 4, 5 ORDER BY orgs DESC, amount DESC LIMIT 6`, [eins]),
    db.query(`SELECT count(DISTINCT recipient_ein)::int AS n FROM grants WHERE recipient_ein = ANY($1)`, [eins]),
    healthOf(eins),
    db.query(`SELECT c.county_fips, c.name, c.state, c.population, c.poverty_rate, c.poverty_low, c.poverty_high, c.people_in_poverty,
                     (SELECT poverty_rate FROM county_need WHERE county_fips = '00000') AS us_rate FROM county_need c
              WHERE c.state = ANY($1) AND (NOT $2 OR EXISTS (SELECT 1 FROM zip_regions z WHERE z.county_fips = c.county_fips AND z.appalachia))`,
      [mapStates, Boolean(filters.appalachia)]),
    // Age and recent foundation money per org (grants_recipient_idx, ~0.1s for 200 orgs)
    db.query(`SELECT o.ein, o.ruling, coalesce(g.amount, 0)::bigint AS grants, coalesce(g.local, 0)::bigint AS local FROM orgs o
              LEFT JOIN LATERAL (SELECT sum(g.amount) AS amount, sum(g.amount) FILTER (WHERE f.state = o.state) AS local
                                 FROM grants g JOIN funders f ON f.ein = g.funder_ein
                                 WHERE g.recipient_ein = o.ein AND g.tax_year BETWEEN $2 AND $3) g ON true
              WHERE o.ein = ANY($1)`, [eins, ...years]),
  ]);
  const trackOf = new Map(track.map((r) => [r.ein as string, { age: orgAge(r.ruling), since: orgAge(r.ruling) == null ? null : Number(String(r.ruling).slice(0, 4)), grants: Number(r.grants), local: Number(r.local) }]));
  const AGES: [string, string, number, number][] = [["0", "Under 5 years", 0, 5], ["5", "5–15 years", 5, 15], ["15", "15–30 years", 15, 30], ["30", "30+ years", 30, Infinity]];

  const t = team.filter((r) => r.employees != null);
  const teamBand = (staff: number, vols: number | null) => staff === 0 ? ((vols ?? 0) > 0 ? "vol" : null) : staff <= 10 ? "s" : staff <= 50 ? "m" : "l";
  const bandOf = new Map(t.map((r) => [r.ein, teamBand(r.employees, r.volunteers)]));
  // Indexes of the results in one bar, closest first, so a bar opens to the organizations behind it.
  const pick = (test: (r: (typeof results)[number]) => boolean) => results.flatMap((r, i) => (test(r) ? [i] : []));
  const TEAM: [string, string][] = [["vol", "All-volunteer"], ["s", "1–10 staff"], ["m", "11–50 staff"], ["l", "51+ staff"]];

  // "High poverty" relative to this map: the poorest quarter of its counties (75th percentile), capped
  // at 20% so a high-poverty region like Appalachia keeps the absolute bar.
  const rates = need.map((r) => Number(r.poverty_rate)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  const cut = rates.length ? Math.min(20, rates[Math.floor(rates.length * 0.75)]) : 20;
  // Each county's organizations, in the search's order (closest first).
  const byEin = new Map(results.map((r, i) => [r.ein.replace("-", ""), { i, r }]));
  const countyOrgs: Record<string, { ein: string; name: string; city: string | null }[]> = {};
  for (const g of [...geo].sort((a, b) => (byEin.get(a.ein)?.i ?? 0) - (byEin.get(b.ein)?.i ?? 0))) {
    const r = byEin.get(g.ein)?.r;
    if (r) (countyOrgs[g.county_fips] ??= []).push({ ein: r.ein, name: title(r.name), city: r.city ? title(r.city) : null });
  }
  return {
    health,
    size: results.length,
    sizes: BANDS.map(([key, label, lo, hi]) => {
      const orgs = pick((r) => r.revenue?.amount != null && r.revenue.amount >= lo && r.revenue.amount < hi);
      return { key, label, count: orgs.length, orgs };
    }),
    cities: tally(results, (r) => (r.city ? `${r.city.toUpperCase()}|${r.state ?? ""}` : null)).filter(([, n]) => n >= 2).slice(0, 6)
      .map(([k, count]) => { const [c, st] = k.split("|"); return { key: c, label: `${title(c)}, ${st}`, count, orgs: pick((r) => r.city?.toUpperCase() === c && (r.state ?? "") === st) }; }),
    causes: tally(results, (r) => (r.ntee?.code?.[0] && r.ntee.code[0] !== "Z" ? r.ntee.code[0] : null)).filter(([, n]) => n >= 2).slice(0, 6)
      .map(([k, count]) => ({ key: k, label: nteeLabel(k) ?? k, count, orgs: pick((r) => r.ntee?.code?.[0] === k) })),
    team: TEAM.map(([key, label]) => {
      const orgs = pick((r) => bandOf.get(r.ein.replace("-", "")) === key);
      return { key, label, count: orgs.length, orgs };
    }),
    teamReported: t.length,
    ages: AGES.map(([key, label, lo, hi]) => {
      const orgs = pick((r) => { const a = trackOf.get(r.ein.replace("-", ""))?.age; return a != null && a >= lo && a < hi; });
      return { key, label, count: orgs.length, orgs };
    }),
    grantYears: years,
    ...(() => {
      const xs = results.map((r) => r.revenue?.amount).filter((x): x is number => x != null).sort((a, b) => a - b);
      return { medianIncome: xs.length ? xs[Math.floor(xs.length / 2)] : null, incomeReported: xs.length };
    })(),
    medianAge: (() => {
      const xs = [...trackOf.values()].map((t) => t.age).filter((a): a is number => a != null).sort((a, b) => a - b);
      return xs.length ? xs[Math.floor(xs.length / 2)] : null;
    })(),
    counties: Object.fromEntries(Object.entries(countyOrgs).map(([f, os]) => [f, os.length])),
    countyOrgs,
    mapStates,
    need: Object.fromEntries(need.map((r) => [r.county_fips, { poverty: r.poverty_rate == null ? null : Number(r.poverty_rate), population: r.population }])),
    povertyCut: cut,
    underserved: need.filter((r) => Number(r.poverty_rate) >= cut && !countyOrgs[r.county_fips])
      .sort((a, b) => Number(b.poverty_rate) - Number(a.poverty_rate))
      .map((r) => ({ fips: r.county_fips, name: r.name, state: r.state, poverty: Number(r.poverty_rate), low: r.poverty_low == null ? null : Number(r.poverty_low),
        high: r.poverty_high == null ? null : Number(r.poverty_high), poor: r.people_in_poverty, population: r.population })),
    usPoverty: need[0]?.us_rate == null ? null : Number(need[0].us_rate),
    highNeed: need.filter((r) => Number(r.poverty_rate) >= cut).length,
    appalachia: app.map((r) => r.county_fips),
    funders: funders.map((f) => ({ ein: f.ein, name: title(f.name), city: f.city ? title(f.city) : null, state: f.state, orgs: f.orgs, amount: Number(f.amount), inviteOnly: f.invite_only, grantees: ((f.grantees ?? []) as { ein: string; name: string }[]).map((g) => ({ ein: g.ein, name: title(g.name) })).sort((a, b) => a.name.localeCompare(b.name)) })),
    funded: funded?.n ?? 0,
    orgs: results.map((r) => ({ ein: r.ein, name: title(r.name), city: r.city ? title(r.city) : null, state: r.state, text: [r.mission, r.programs].filter(Boolean).join(" ").slice(0, 220),
      grants: trackOf.get(r.ein.replace("-", ""))?.grants ?? 0, local: trackOf.get(r.ein.replace("-", ""))?.local ?? 0, since: trackOf.get(r.ein.replace("-", ""))?.since ?? null })),
  };
}

// Financial health of a set of organizations (eins without the dash), by the same rules as the tags on
// each result (lib/search orgHealth): the newest e-filed 990 when there is one, else SOI + master file.
export async function healthOf(eins: string[]): Promise<Health> {
  const { rows } = await db.query(`
    SELECT o.ein, o.revenue_amt, left(o.tax_period, 4)::int AS rev_year,
           f.tax_year AS fin_year, f.revenue AS fin_rev, f.expenses, f.net_assets, f.gifts,
           x.x_year, x.x_rev, x.x_prev, x.x_exp, x.x_cash, x.x_gifts
    FROM orgs o
    LEFT JOIN LATERAL (SELECT tax_year, revenue, expenses, coalesce(raw->>'totnetassetend', raw->>'totnetassetsend')::numeric AS net_assets,
                              coalesce(raw->>'totcntrbgfts', raw->>'totcntrbs')::numeric AS gifts
                       FROM financials WHERE ein = o.ein ORDER BY tax_year DESC LIMIT 1) f ON true
    LEFT JOIN LATERAL (SELECT tax_year AS x_year, cy_revenue AS x_rev, py_revenue AS x_prev, cy_expenses AS x_exp, cash AS x_cash, cy_contributions AS x_gifts
                       FROM filing_flag WHERE ein = o.ein ORDER BY tax_year DESC NULLS LAST LIMIT 1) x ON true
    WHERE o.ein = ANY($1)`, [eins]);
  const orgs = rows.map((r) => {
    const h = orgHealth({ ...r, has_fin: r.fin_year != null, rev_src: r.revenue_amt != null && (r.fin_year == null || r.rev_year > r.fin_year) ? "bmf" : "soi" });
    const gifts = r.x_year != null && Number(r.x_rev) > 0 ? (r.x_gifts == null ? null : Number(r.x_gifts) / Number(r.x_rev))
      : r.fin_rev > 0 && r.gifts != null ? Number(r.gifts) / Number(r.fin_rev) : null;
    return { ein: r.ein as string, h, gifts: gifts == null ? null : Math.min(1, Math.max(0, gifts)) };
  });
  return health(orgs);
}

function health(orgs: { ein: string; h: OrgHealth | null; gifts: number | null }[]): Health {
  const changes = orgs.filter((o) => o.h?.trend).map((o) => ({ ein: o.ein, change: o.h!.trend!.change }));
  const marginOf = orgs.filter((o) => o.h?.margin != null).map((o) => ({ ein: o.ein, value: o.h!.revenue - o.h!.expenses, share: o.h!.margin! }));
  const reserveOf = orgs.filter((o) => o.h?.reserveMonths != null).map((o) => ({ ein: o.ein, value: o.h!.reserveMonths! }));
  const giftOf = orgs.filter((o) => o.gifts != null).map((o) => ({ ein: o.ein, value: o.gifts! }));
  const band = (xs: number[], cuts: [string, (x: number) => boolean][]) => cuts.map(([label, f]) => ({ key: label, label, count: xs.filter(f).length }));
  const ch = changes.map((c) => c.change), margins = marginOf.map((m) => m.share), reserves = reserveOf.map((r) => r.value), gifts = giftOf.map((g) => g.value);
  return {
    trend: band(ch, [["Shrinking 25%+", (x) => x <= -0.25], ["Shrinking 10–25%", (x) => x > -0.25 && x <= -0.1], ["Steady (±10%)", (x) => x > -0.1 && x < 0.1], ["Growing 10–25%", (x) => x >= 0.1 && x < 0.25], ["Growing 25%+", (x) => x >= 0.25]]),
    trendReported: changes.length,
    margin: band(margins, [["Deficit", (x) => x < 0], ["Break-even (0–5%)", (x) => x >= 0 && x < 0.05], ["Surplus (5%+)", (x) => x >= 0.05]]),
    reserves: band(reserves, [["Under 1 month", (x) => x < 1], ["1–3 months", (x) => x >= 1 && x < 3], ["3–6 months", (x) => x >= 3 && x < 6], ["6–12 months", (x) => x >= 6 && x < 12], ["1 year+", (x) => x >= 12]]),
    mix: band(gifts, [["Mostly donations (70%+)", (x) => x >= 0.7], ["Mixed", (x) => x >= 0.3 && x < 0.7], ["Mostly earned (<30% gifts)", (x) => x < 0.3]]),
    reported: marginOf.length,
    signals: [
      { key: "growing", of: changes.length, orgs: changes.filter((c) => c.change >= 0.1).sort((x, y) => y.change - x.change).map((c) => ({ ein: c.ein, value: c.change })) },
      { key: "shrinking", of: changes.length, orgs: changes.filter((c) => c.change <= -0.1).sort((x, y) => x.change - y.change).map((c) => ({ ein: c.ein, value: c.change })) },
      { key: "deficit", of: marginOf.length, orgs: marginOf.filter((m) => m.value < 0).sort((x, y) => x.value - y.value).map((m) => ({ ein: m.ein, value: m.value })) },
      { key: "thin", of: reserveOf.length, orgs: reserveOf.filter((r) => r.value < 3).sort((x, y) => x.value - y.value) },
      { key: "reliant", of: giftOf.length, orgs: giftOf.filter((g) => g.value >= 0.9).sort((x, y) => y.value - x.value) },
    ],
  };
}

const cached = memo<Landscape>("landscape:v24", 200, 3600_000); // v24: median income; v23: ruling year per org; v22: themes ranked by median grants; v21: median age; v20: org ages (track record) and recent grants per org (funding by theme)
export function landscape(filters: Filters, includeInactive = false) {
  return cached(JSON.stringify([filters, includeInactive]), () => build(filters, includeInactive));
}
