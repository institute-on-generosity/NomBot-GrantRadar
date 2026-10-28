// Side-by-side comparison of 2–4 organizations (server side).
// The picked list itself lives in the browser: see components/CompareButton.tsx
// (kept there so client code never imports this file's database access).
import { getOrg } from "./org";
import { partialYears } from "./answer";
import { db } from "./db";
import { orgFinancialHealth } from "./financialHealth";
import { GRANT_YEARS } from "./placeReport";

export const COMPARE_MAX = 4;

// "?ein=a,b,c" → up to 4 unique 9-digit EINs.
export function parseEins(param: string | string[] | undefined): string[] {
  const raw = (Array.isArray(param) ? param.join(",") : param ?? "").split(",").map((e) => e.replace(/\D/g, ""));
  return [...new Set(raw.filter((e) => e.length === 9))].slice(0, COMPARE_MAX);
}

// Vetting figures from ONE filing year per org (round-2 audit V7: no mixing 2024 income with 2023 spending): its newest
// full Form 990 or 990-EZ year from the financial health data, and foundation grants received over GRANT_YEARS.
export type Vet = {
  year: number | null; form: string | null; revenue: number | null; expenses: number | null; surplus: number | null;
  monthsCash: number | null; programRatio: number | null; assets: number | null; foundationGrants: number; foundationFunders: number;
};
export type Compared = NonNullable<Awaited<ReturnType<typeof getOrg>>> & { vet: Vet };

type Yr = { year: number; revenue: number | null; expenses: number | null; assets: number | null };
async function vetOf(ein: string, latestFull: number, grants: Map<string, { usd: number; funders: number }>, years: Yr[]): Promise<Vet> {
  const h = latestFull ? await orgFinancialHealth(ein, latestFull).catch(() => null) : null;
  const y = h ? [...h.years].reverse().find((r) => r.source === "filing") ?? h.years.at(-1) ?? null : null;
  const g = grants.get(ein) ?? { usd: 0, funders: 0 };
  // No full Form 990 year in the health data (small 990-EZ filers, a year still arriving): the newest year the org
  // page shows, every figure from that same year
  if (!y) {
    const f = years.find((r) => r.revenue != null) ?? null;
    return { year: f?.year ?? null, form: null, revenue: f?.revenue ?? null, expenses: f?.expenses ?? null,
      surplus: f?.revenue != null && f.expenses != null ? f.revenue - f.expenses : null, monthsCash: null, programRatio: null,
      assets: f?.assets ?? null, foundationGrants: g.usd, foundationFunders: g.funders };
  }
  return {
    year: y?.year ?? null, form: y?.form ?? null, revenue: y?.revenue ?? null, expenses: y?.expenses ?? null, surplus: y?.surplus ?? null,
    monthsCash: y?.months_cash ?? null, programRatio: y?.program_ratio ?? null, assets: y?.total_assets ?? null,
    foundationGrants: g.usd, foundationFunders: g.funders,
  };
}

// Call after `await connection()`. Fetches in parallel; unknown EINs are dropped.
export async function loadCompare(eins: string[]): Promise<Compared[]> {
  const list = eins.slice(0, COMPARE_MAX);
  const [orgs, { latestFull }, grantRows] = await Promise.all([
    Promise.all(list.map((e) => getOrg(e).catch(() => null))),
    partialYears("f990").catch(() => ({ latestFull: 0 })),
    db.query(`SELECT recipient_ein AS ein, sum(amount)::float8 AS usd, count(DISTINCT funder_ein)::int AS funders FROM grant_clean
      WHERE recipient_ein = ANY($1) AND tax_year BETWEEN $2 AND $3 GROUP BY 1`, [list, ...GRANT_YEARS]).then((r) => r.rows).catch(() => []),
  ]);
  const grants = new Map(grantRows.map((r) => [String(r.ein), { usd: Number(r.usd), funders: Number(r.funders) }]));
  const found = orgs.filter((o): o is NonNullable<typeof o> => o != null);
  const vets = await Promise.all(found.map((o) => vetOf(o.ein.replace(/\D/g, ""), latestFull, grants, o.years)));
  return found.map((o, i) => ({ ...o, vet: vets[i] }));
}
