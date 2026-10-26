// Facts for the search export (CSV) and the downloadable report (/report): each org's foundation grants in the
// newest three full tax years with its top funder, the funders most active among the matches, and plain caveats.
// 990-PF grants as research answers count them (generosity-data grant_clean), placed at the recipient's HQ.
import { db } from "./db";
import { memo } from "./memo";
import { isLabel, labelName } from "./labels";
import { placeEins, type Scope } from "./place";

export const GRANT_YEARS: [number, number] = [2022, 2024]; // the newest full years (2025 returns are still arriving)
export type Funding = { total: number; grants: number; top: { ein: string; name: string; amount: number } | null };

// Per org (EINs without the dash): 990-PF grant dollars 2022-24 and the largest funder.
export async function fundingOf(eins: string[]): Promise<Map<string, Funding>> {
  const out = new Map<string, Funding>();
  if (!eins.length) return out;
  const { rows } = await db.query(
    `WITH g AS (SELECT recipient_ein AS ein, funder_ein, sum(amount)::float8 AS usd, count(*)::int AS n FROM grant_clean
                WHERE recipient_ein = ANY($1::char(9)[]) AND tax_year BETWEEN $2 AND $3 GROUP BY 1, 2),
          r AS (SELECT g.*, row_number() OVER (PARTITION BY ein ORDER BY usd DESC) AS rk, sum(usd) OVER (PARTITION BY ein) AS total, sum(n) OVER (PARTITION BY ein) AS grants FROM g)
     SELECT r.ein, r.total, r.grants, r.funder_ein, f.name, r.usd FROM r LEFT JOIN funders f ON f.ein = r.funder_ein WHERE rk = 1`,
    [eins.map((e) => e.replace("-", "")), ...GRANT_YEARS]);
  for (const r of rows) out.set(r.ein, { total: Number(r.total), grants: Number(r.grants), top: { ein: r.funder_ein, name: r.name ?? r.funder_ein, amount: Number(r.usd) } });
  return out;
}

// Foundations giving the most to these orgs, 2022-24 (990-PF).
export async function fundersOf(eins: string[], k = 10) {
  if (!eins.length) return [];
  const { rows } = await db.query(
    `SELECT g.funder_ein AS ein, f.name, f.city, f.state, count(DISTINCT g.recipient_ein)::int AS orgs, sum(g.amount)::float8 AS usd
     FROM grant_clean g LEFT JOIN funders f ON f.ein = g.funder_ein
     WHERE g.recipient_ein = ANY($1::char(9)[]) AND g.tax_year BETWEEN $2 AND $3
     GROUP BY 1, 2, 3, 4 ORDER BY usd DESC LIMIT $4`, [eins.map((e) => e.replace("-", "")), ...GRANT_YEARS, k]);
  return rows.map((r) => ({ ein: r.ein as string, name: (r.name ?? r.ein) as string, city: r.city as string | null, state: r.state as string | null, orgs: r.orgs as number, usd: Number(r.usd) }));
}

// Coverage of the place itself: how many of its orgs have any 990 text (most small orgs file a 990-N postcard).
const coverageMemo = memo<{ orgs: number; withText: number }>("place-coverage:v1", 200, 3600_000);
export function placeCoverage(scope: Scope) {
  return coverageMemo(scope.kind === "city" ? `${scope.city}|${scope.state}` : `county:${scope.fips}`, async () => {
    const eins = scope.kind === "city" ? await placeEins(scope.state, scope.city, scope.zips) : await placeEins(scope.state, null, scope.zips);
    const { rows: [t] } = await db.query(`SELECT count(DISTINCT ein)::int AS n FROM filing_text WHERE ein = ANY($1::char(9)[]) AND tax_year >= 2021`, [eins]);
    return { orgs: eins.length, withText: t.n as number };
  });
}

// Every graded cause label an org carries ("Women and girls (main focus)"), for the report's label column.
export async function labelsOf(eins: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!eins.length) return out;
  const { rows } = await db.query(`SELECT ein, label, tier FROM org_labels WHERE ein = ANY($1::char(9)[]) ORDER BY ein, tier DESC, label`, [eins.map((e) => e.replace("-", ""))]);
  for (const r of rows) (out.get(r.ein) ?? out.set(r.ein, []).get(r.ein)!).push(`${isLabel(r.label) ? labelName(r.label) : String(r.label).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} (${r.tier === "primary" ? "main focus" : "partial"})`);
  return out;
}
