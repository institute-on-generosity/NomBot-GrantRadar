// The landscape behind a search: the 200 organizations closest to the question (same filters and
// hybrid ranking as the results), summarized so users can zoom out: sizes, places, causes, team
// sizes, counties (for the map), the foundations that fund this field (from 990-PF grants), and
// financial health: revenue trend, surplus or deficit, reserves and where the money comes from.
import { titleCase } from "../components/text";
import { db } from "./db";
import { memo } from "./memo";
import { nteeLabel } from "./ntee";
import type { Filters } from "./parse";
import { searchCandidates } from "./rerank";

export const LANDSCAPE = 200;

export type Bar = { key: string; label: string; count: number };
export type Funder = { ein: string; name: string; city: string | null; state: string | null; orgs: number; amount: number; inviteOnly: boolean; grantees: string[] };
export type Landscape = {
  size: number;
  sizes: Bar[];      // revenue bands
  cities: Bar[];     // key = city (upper case), label "Louisville, KY"
  causes: Bar[];     // key = NTEE major letter
  team: Bar[];       // all-volunteer, 1-10, 11-50, 51+ staff
  teamReported: number;
  counties: Record<string, number>;
  appalachia: string[];
  funders: Funder[];
  funded: number;    // organizations in the landscape that received at least one foundation grant
  orgs: { ein: string; name: string; city: string | null; state: string | null; text: string }[];
  health: Health;
};
// Financial health, from the newest SOI extract year (and the IRS master file for a newer revenue figure).
// signals: the organizations behind each plain statement ("82 of 178 ran a deficit"), for the Finances tab.
export type Signal = { key: "growing" | "shrinking" | "deficit" | "thin"; of: number; orgs: { ein: string; value: number }[] };
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

async function build(filters: Filters, includeInactive: boolean): Promise<Landscape> {
  const { results } = await searchCandidates(filters, { limit: LANDSCAPE, includeInactive });
  const eins = results.map((r) => r.ein.replace("-", ""));
  const [{ rows: team }, { rows: geo }, { rows: app }, { rows: funders }, { rows: [funded] }, health] = await Promise.all([
    db.query(`SELECT DISTINCT ON (ein) ein, employees, volunteers FROM filing_text WHERE ein = ANY($1) ORDER BY ein, tax_year DESC`, [eins]),
    db.query(`SELECT z.county_fips, count(*)::int AS n FROM orgs o JOIN zip_regions z ON z.zip5 = left(o.zip, 5) WHERE o.ein = ANY($1) GROUP BY 1`, [eins]),
    db.query(`SELECT DISTINCT county_fips FROM zip_regions WHERE appalachia`),
    db.query(`SELECT g.funder_ein AS ein, f.name, f.city, f.state, f.invite_only,
                     count(DISTINCT g.recipient_ein)::int AS orgs, coalesce(sum(g.amount), 0)::bigint AS amount,
                     (array_agg(DISTINCT o.name))[1:3] AS grantees
              FROM grants g JOIN funders f ON f.ein = g.funder_ein JOIN orgs o ON o.ein = g.recipient_ein
              WHERE g.recipient_ein = ANY($1)
              GROUP BY 1, 2, 3, 4, 5 ORDER BY orgs DESC, amount DESC LIMIT 6`, [eins]),
    db.query(`SELECT count(DISTINCT recipient_ein)::int AS n FROM grants WHERE recipient_ein = ANY($1)`, [eins]),
    healthOf(eins),
  ]);

  const revs = results.map((r) => r.revenue?.amount).filter((x): x is number => x != null);
  const t = team.filter((r) => r.employees != null);
  const teamBand = (staff: number, vols: number | null) => staff === 0 ? ((vols ?? 0) > 0 ? "vol" : null) : staff <= 10 ? "s" : staff <= 50 ? "m" : "l";
  const teamCounts = tally(t, (r) => teamBand(r.employees, r.volunteers));
  const TEAM: [string, string][] = [["vol", "All-volunteer"], ["s", "1–10 staff"], ["m", "11–50 staff"], ["l", "51+ staff"]];

  return {
    health,
    size: results.length,
    sizes: BANDS.map(([key, label, lo, hi]) => ({ key, label, count: revs.filter((x) => x >= lo && x < hi).length })),
    cities: tally(results, (r) => (r.city ? `${r.city.toUpperCase()}|${r.state ?? ""}` : null)).filter(([, n]) => n >= 2).slice(0, 6)
      .map(([k, count]) => { const [c, st] = k.split("|"); return { key: c, label: `${title(c)}, ${st}`, count }; }),
    causes: tally(results, (r) => (r.ntee?.code?.[0] && r.ntee.code[0] !== "Z" ? r.ntee.code[0] : null)).filter(([, n]) => n >= 2).slice(0, 6).map(([k, count]) => ({ key: k, label: nteeLabel(k) ?? k, count })),
    team: TEAM.map(([key, label]) => ({ key, label, count: teamCounts.find(([k]) => k === key)?.[1] ?? 0 })),
    teamReported: t.length,
    counties: Object.fromEntries(geo.map((r) => [r.county_fips, r.n])),
    appalachia: app.map((r) => r.county_fips),
    funders: funders.map((f) => ({ ein: f.ein, name: title(f.name), city: f.city ? title(f.city) : null, state: f.state, orgs: f.orgs, amount: Number(f.amount), inviteOnly: f.invite_only, grantees: (f.grantees ?? []).map(title) })),
    funded: funded?.n ?? 0,
    orgs: results.map((r) => ({ ein: r.ein, name: title(r.name), city: r.city ? title(r.city) : null, state: r.state, text: [r.mission, r.programs].filter(Boolean).join(" ").slice(0, 220) })),
  };
}

type FinRow = { ein: string; tax_year: number; revenue: string | null; expenses: string | null; assets: string | null; net_assets: string | null; gifts: string | null; revenue_amt: string | null; bmf_year: number | null; k: string };
const num = (v: string | null) => (v == null ? null : Number(v));

// Financial health of a set of organizations (eins without the dash).
export async function healthOf(eins: string[]): Promise<Health> {
  // Newest two SOI years per org, plus the master file's revenue when its tax period is newer.
  const { rows } = await db.query<FinRow>(`SELECT f.ein, f.tax_year, f.revenue, f.expenses, f.assets,
                     coalesce(f.raw->>'totnetassetend', f.raw->>'totnetassetsend')::numeric AS net_assets,
                     coalesce(f.raw->>'totcntrbgfts', f.raw->>'totcntrbs')::numeric AS gifts,
                     o.revenue_amt, left(o.tax_period, 4)::int AS bmf_year,
                     row_number() OVER (PARTITION BY f.ein ORDER BY f.tax_year DESC) AS k
              FROM financials f JOIN orgs o USING (ein) WHERE f.ein = ANY($1)`, [eins]);
  return health(rows);
}

function health(rows: FinRow[]): Health {
  const by = new Map<string, FinRow[]>();
  for (const r of rows) by.set(r.ein, [...(by.get(r.ein) ?? []), r].sort((a, b) => Number(a.k) - Number(b.k)));
  const changes: { ein: string; change: number }[] = [];
  const margins: number[] = [], reserves: number[] = [], gifts: number[] = [];
  const marginOf: { ein: string; value: number }[] = [], reserveOf: { ein: string; value: number }[] = [];
  for (const [ein, [now]] of by) {
    const rev = num(now.revenue), exp = num(now.expenses);
    // Trend: the master file's newer revenue vs. the newest SOI year (same rule as the row tags).
    const [a, b] = now.bmf_year && now.bmf_year > now.tax_year && num(now.revenue_amt) ? [num(now.revenue_amt)!, rev] : [null, null];
    if (a != null && b != null && b > 10_000) changes.push({ ein, change: (a - b) / b });
    if (rev && rev > 0 && exp != null) { margins.push((rev - exp) / rev); marginOf.push({ ein, value: rev - exp }); }
    const net = num(now.net_assets) ?? num(now.assets);
    if (exp && exp > 0 && net != null) { reserves.push(net / (exp / 12)); reserveOf.push({ ein, value: net / (exp / 12) }); }
    if (rev && rev > 0 && now.gifts != null) gifts.push(Math.min(1, Math.max(0, num(now.gifts)! / rev)));
  }
  const band = (xs: number[], cuts: [string, (x: number) => boolean][]) => cuts.map(([label, f]) => ({ key: label, label, count: xs.filter(f).length }));
  const ch = changes.map((c) => c.change);
  return {
    trend: band(ch, [["Shrinking 25%+", (x) => x <= -0.25], ["Shrinking 10–25%", (x) => x > -0.25 && x <= -0.1], ["Steady (±10%)", (x) => x > -0.1 && x < 0.1], ["Growing 10–25%", (x) => x >= 0.1 && x < 0.25], ["Growing 25%+", (x) => x >= 0.25]]),
    trendReported: changes.length,
    margin: band(margins, [["Deficit", (x) => x < 0], ["Break-even (0–5%)", (x) => x >= 0 && x < 0.05], ["Surplus (5%+)", (x) => x >= 0.05]]),
    reserves: band(reserves, [["Under 1 month", (x) => x < 1], ["1–3 months", (x) => x >= 1 && x < 3], ["3–6 months", (x) => x >= 3 && x < 6], ["6–12 months", (x) => x >= 6 && x < 12], ["1 year+", (x) => x >= 12]]),
    mix: band(gifts, [["Mostly donations (70%+)", (x) => x >= 0.7], ["Mixed", (x) => x >= 0.3 && x < 0.7], ["Mostly earned (<30% gifts)", (x) => x < 0.3]]),
    reported: margins.length,
    signals: [
      { key: "growing", of: changes.length, orgs: changes.filter((c) => c.change >= 0.1).sort((x, y) => y.change - x.change).map((c) => ({ ein: c.ein, value: c.change })) },
      { key: "shrinking", of: changes.length, orgs: changes.filter((c) => c.change <= -0.1).sort((x, y) => x.change - y.change).map((c) => ({ ein: c.ein, value: c.change })) },
      { key: "deficit", of: marginOf.length, orgs: marginOf.filter((m) => m.value < 0).sort((x, y) => x.value - y.value) },
      { key: "thin", of: reserveOf.length, orgs: reserveOf.filter((r) => r.value < 3).sort((x, y) => x.value - y.value) },
    ],
  };
}

const cached = memo<Landscape>("landscape:v7", 200, 3600_000);
export function landscape(filters: Filters, includeInactive = false) {
  return cached(JSON.stringify([filters, includeInactive]), () => build(filters, includeInactive));
}
