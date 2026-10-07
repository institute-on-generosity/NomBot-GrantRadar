// The landscape behind a search: the 200 organizations closest to the question (same filters and
// hybrid ranking as the results), summarized so users can zoom out: sizes, places, causes, team
// sizes, counties (for the map), and the foundations that fund this field (from 990-PF grants).
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
  const [{ rows: team }, { rows: geo }, { rows: app }, { rows: funders }, { rows: [funded] }] = await Promise.all([
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
  ]);

  const revs = results.map((r) => r.revenue?.amount).filter((x): x is number => x != null);
  const t = team.filter((r) => r.employees != null);
  const teamBand = (staff: number, vols: number | null) => staff === 0 ? ((vols ?? 0) > 0 ? "vol" : null) : staff <= 10 ? "s" : staff <= 50 ? "m" : "l";
  const teamCounts = tally(t, (r) => teamBand(r.employees, r.volunteers));
  const TEAM: [string, string][] = [["vol", "All-volunteer"], ["s", "1–10 staff"], ["m", "11–50 staff"], ["l", "51+ staff"]];

  return {
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

const cached = memo<Landscape>("landscape:v4", 200, 3600_000);
export function landscape(filters: Filters, includeInactive = false) {
  return cached(JSON.stringify([filters, includeInactive]), () => build(filters, includeInactive));
}
