// Financial health indicators for one organization over its last full filing years (Joshua Elder, Oct 19:
// diligence from 990s). Indicators, not a rating: each figure comes straight from the org's own e-filed returns
// (generosity-data filing_flag), each flag is a plain fact ("Deficits 3 years in a row"), and nothing is scored.
//
// Years: the newest full tax year is read from filings per tax year (lib/answer partialYears, the same rule as the
// recency note), and the window is the 5 tax years up to it. A partial year (returns still arriving) is never
// counted, even when this org's own return for it is in. A year with no return of its own takes revenue and
// expenses from the next year's Form 990 prior-year column (as generosity-data org_finance_year does), so most
// orgs have 2 to 3 years today: 990s here start with tax year 2022 (from 2023 returns' prior-year column).
//
// Formulas (Form 990 line numbers, 2023 form):
//   surplus            Part I line 12 (total revenue) minus line 18 (total expenses)
//   months of cash     Part X lines 1 + 2 (cash, savings and temporary cash investments), end of year, divided by a
//                      month of total expenses. Our 990 rows don't hold investments (lines 11-13), so this is the
//                      liquid floor: hospitals, universities and endowed orgs read low.
//   months of unrestricted net assets   Part X line 27 (net assets without donor restrictions) per month of
//                      expenses. Includes buildings and equipment, so it overstates what an org could spend.
//   program ratio      Part IX line 25 column B (program services) / column A (total expenses). 990-EZ: Part III
//                      line 32 / line 17.
//   cost to raise $1   Part IX line 25 column D (fundraising) / Part VIII line 1h (contributions, gifts, grants).
//   revenue mix        contributions (Part I line 8), program service revenue (line 9), government grants
//                      (Part VIII line 1e, blank = 0, part of contributions), each over line 12.
//   liabilities to assets  Part X line 26 / line 16, end of year (990-EZ Part II lines 26 / 25).
// 990-EZ: no cash line of its own (line 22 lumps cash, savings and investments), no unrestricted net assets, no
// fundraising column and no government grants line, so those indicators are left out for 990-EZ years, never mixed.
import { db } from "./db";

export * from "./healthText";
import { R_BANDS, bandOf, HEALTH_CAVEATS, HEALTH_METHOD, HEALTH_NOTE, type HealthYear, type OrgHealth, type Peers } from "./healthText";

const num = (v: unknown) => (v == null ? null : Number(v));
const ratio = (a: number | null, b: number | null, minB = 0) => (a == null || b == null || !(b > minB) ? null : a / b);

type Raw = Record<string, unknown>;
// The years for one org from its filing_flag rows (newest object_id per tax year), oldest first.
export function healthYears(rows: Raw[], window: { from: number; to: number }): HealthYear[] {
  const own = new Map<number, Raw>();
  for (const r of rows) {
    const y = num(r.tax_year);
    if (y == null) continue;
    const cur = own.get(y);
    if (!cur || String(r.object_id) > String(cur.object_id)) own.set(y, r);
  }
  const out: HealthYear[] = [];
  for (let y = window.from; y <= window.to; y++) {
    const r = own.get(y);
    if (r) {
      const rev = num(r.cy_revenue), exp = num(r.cy_expenses);
      if (rev == null || exp == null) continue;
      const is990 = r.form === "990";
      const contrib = num(r.cy_contributions);
      const gov = is990 ? (contrib == null ? null : num(r.government_grants) ?? 0) : null;
      const cash = is990 ? num(r.cash) : null, una = is990 ? num(r.unrestricted_net_assets) : null;
      const assets = num(r.total_assets), liab = num(r.total_liabilities);
      out.push({
        year: y, form: String(r.form), source: "filing", object_id: String(r.object_id),
        revenue: rev, expenses: exp, surplus: rev - exp, deficit: exp > rev,
        contributions: contrib, program_revenue: num(r.cy_program_revenue), government_grants: gov,
        cash, months_cash: ratio(cash, exp / 12), unrestricted_net_assets: una, months_unrestricted: ratio(una, exp / 12),
        program_ratio: ratio(num(r.program_expenses), exp),
        fundraising_per_dollar: is990 ? ratio(num(r.fundraising_expenses), contrib) : null,
        contributions_share: ratio(contrib, rev), program_revenue_share: ratio(num(r.cy_program_revenue), rev), government_share: ratio(gov, rev),
        total_assets: assets, total_liabilities: liab, liabilities_to_assets: ratio(liab, assets),
      });
      continue;
    }
    // No return of its own: the next year's Form 990 prior-year column (990-EZ has none).
    const n = own.get(y + 1);
    if (!n || n.form !== "990") continue;
    const rev = num(n.py_revenue), exp = num(n.py_expenses);
    if (rev == null || exp == null) continue;
    const contrib = num(n.py_contributions), assets = num(n.total_assets_boy), liab = num(n.total_liabilities_boy);
    out.push({
      year: y, form: "990", source: "prior_year", object_id: String(n.object_id),
      revenue: rev, expenses: exp, surplus: rev - exp, deficit: exp > rev,
      contributions: contrib, program_revenue: num(n.py_program_revenue), government_grants: null,
      cash: null, months_cash: null, unrestricted_net_assets: null, months_unrestricted: null, program_ratio: null, fundraising_per_dollar: null,
      contributions_share: ratio(contrib, rev), program_revenue_share: ratio(num(n.py_program_revenue), rev), government_share: null,
      total_assets: assets, total_liabilities: liab, liabilities_to_assets: ratio(liab, assets),
    });
  }
  return out;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

// Plain flags and notes from the years. Never a score.
export function healthFlags(years: HealthYear[]): { flags: string[]; notes: string[]; deficitYears: number; consecutive: number } {
  const flags: string[] = [], notes: string[] = [];
  const n = years.length;
  const deficitYears = years.filter((y) => y.deficit).length;
  // Consecutive deficits ending with the newest year shown, broken by a missing year.
  let consecutive = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (!years[i].deficit || (i < n - 1 && years[i + 1].year !== years[i].year + 1)) break;
    consecutive++;
  }
  if (consecutive >= 2) flags.push(`Deficits ${consecutive} years in a row (${years[n - consecutive].year} to ${years[n - 1].year})`);
  else if (deficitYears >= 2) flags.push(`Deficits in ${deficitYears} of the last ${n} years`);
  else if (deficitYears === 1 && n >= 1) notes.push(`One deficit year (${years.find((y) => y.deficit)!.year}) in ${n} ${n === 1 ? "year" : "years"}`);
  const own = years.filter((y) => y.source === "filing");
  const last = own.at(-1);
  // Thin cash is flagged only when unrestricted net assets don't cover 3 months either: endowed orgs and hospitals
  // hold reserves in investments, which our 990 rows don't have.
  if (last?.months_cash != null && last.months_cash < 1 && (last.months_unrestricted == null || last.months_unrestricted < 3)) flags.push(`Under 1 month of cash (${last.year})`);
  if (last?.liabilities_to_assets != null && last.liabilities_to_assets > 1) flags.push(`Liabilities above assets (${last.year})`);
  if (last?.unrestricted_net_assets != null && last.unrestricted_net_assets < 0) flags.push(`Negative unrestricted net assets (${last.year})`);
  if (last?.government_share != null && last.government_share >= 0.5) flags.push(`${pct(last.government_share)} of revenue from government grants (${last.year})`);
  if (n >= 2 && years[0].revenue > 0) {
    const ch = (years[n - 1].revenue - years[0].revenue) / years[0].revenue;
    if (ch <= -0.25) flags.push(`Revenue down ${pct(-ch)} from ${years[0].year} to ${years[n - 1].year}`);
  }
  // A one-off year: contributions 3x or more the other years' median.
  const gifts = years.filter((y) => (y.contributions ?? 0) > 0);
  if (gifts.length >= 3) {
    for (const y of gifts) {
      const others = gifts.filter((x) => x !== y).map((x) => x.contributions!).sort((a, z) => a - z);
      const med = others.length % 2 ? others[(others.length - 1) / 2] : (others[others.length / 2 - 1] + others[others.length / 2]) / 2;
      if (med > 0 && y.contributions! >= 3 * med) notes.push(`${y.year} gifts and grants were ${(y.contributions! / med).toFixed(1)} times the other years' median, possibly a one-off campaign or endowment gift`);
    }
  }
  return { flags, notes, deficitYears, consecutive };
}

// Peers: the same NTEE code (3 characters, else the major group) and revenue band, same tax year, own Form 990s of
// 501(c)(3) public charities (private foundations left out). 20 orgs at least, else the broader group, else none.
// log: records each query for "How we got this" (lib/answer Ctx).
export type QueryLog = (title: string, sql: string, vals: unknown[]) => void;
export const PEERS_SQL = `SELECT count(*)::int AS n,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY f.cash * 12.0 / f.expenses) FILTER (WHERE f.cash IS NOT NULL))::float8 AS mc,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY ff.program_expenses::float8 / f.expenses) FILTER (WHERE ff.program_expenses IS NOT NULL))::float8 AS mp
FROM org_finance_year f JOIN filing_flag ff ON ff.object_id = f.object_id
WHERE f.tax_year = $1 AND f.source = 'filing' AND f.form = '990' AND f.revenue_band = $2 AND f.ntee_cd LIKE $3 AND f.expenses > 0
  AND f.subsection = '03' AND coalesce(f.foundation, '') NOT IN ('02', '03', '04')`;
export async function peerMedians(ntee: string | null, band: number, year: number, log?: QueryLog): Promise<Peers | null> {
  if (!ntee) return null;
  for (const code of [...new Set([ntee.slice(0, 3), ntee.slice(0, 1)])]) {
    const vals = [year, band, `${code}%`];
    log?.(`Peers: own Form 990s, NTEE ${code}, ${R_BANDS[band - 1]} in revenue, tax year ${year}`, PEERS_SQL, vals);
    const { rows: [r] } = await db.query(PEERS_SQL, vals);
    if (r && r.n >= 20) return { scope: code.length === 1 ? "NTEE major group" : "NTEE code", ntee: code, band, band_name: R_BANDS[band - 1], year, n: r.n, median_months_cash: r.mc, median_program_ratio: r.mp };
  }
  return null;
}

// One org: its full years in the window, flags and peers. latestFull: from lib/answer partialYears("f990").
export const ORG_ROWS_SQL = `SELECT object_id, tax_year, form, cy_revenue, cy_expenses, py_revenue, py_expenses, cy_contributions, py_contributions, cy_program_revenue, py_program_revenue,
  government_grants, cash, unrestricted_net_assets, program_expenses, fundraising_expenses, total_assets, total_assets_boy, total_liabilities, total_liabilities_boy
FROM filing_flag WHERE ein = $1 AND tax_year BETWEEN $2 AND $3`;
export async function orgFinancialHealth(einRaw: string, latestFull: number, opts: { peers?: boolean; log?: QueryLog } = {}): Promise<OrgHealth | null> {
  const ein = einRaw.replace(/\D/g, "");
  if (ein.length !== 9) return null;
  const window = { from: latestFull - 4, to: latestFull };
  opts.log?.("The organization's Form 990 and 990-EZ rows, tax years around the window (filing_flag)", ORG_ROWS_SQL, [ein, window.from - 1, window.to + 1]);
  const [{ rows }, { rows: [o] }] = await Promise.all([
    db.query(ORG_ROWS_SQL, [ein, window.from - 1, window.to + 1]),
    db.query(`SELECT name, state, ntee_cd FROM orgs WHERE ein = $1`, [ein]),
  ]);
  if (!o) return null;
  const years = healthYears(rows, window);
  const partial = rows.map((r) => Number(r.tax_year)).filter((y) => y > latestFull);
  if (!years.length) return { ein, name: o.name, state: o.state, ntee: o.ntee_cd, window, latest_full: latestFull, years, partial_return: partial.length ? Math.max(...partial) : null, years_with_data: 0, deficit_years: 0, consecutive_deficits: 0, flags: [], notes: [], peers: null };
  const { flags, notes, deficitYears, consecutive } = healthFlags(years);
  const lastOwn = [...years].reverse().find((y) => y.source === "filing" && y.form === "990");
  const peers = opts.peers === false || !lastOwn || !(lastOwn.revenue > 0) ? null : await peerMedians(o.ntee_cd, bandOf(lastOwn.revenue), lastOwn.year, opts.log).catch(() => null);
  return { ein, name: o.name, state: o.state, ntee: o.ntee_cd, window, latest_full: latestFull, years, partial_return: partial.length ? Math.max(...partial) : null,
    years_with_data: years.length, deficit_years: deficitYears, consecutive_deficits: consecutive, flags, notes, peers };
}

// For the API: plain numbers, rounded ratios.
export function healthJson(h: OrgHealth) {
  const r = (x: number | null, d = 3) => (x == null ? null : +x.toFixed(d));
  return {
    window: h.window, latest_full_year: h.latest_full, partial_year_left_out: h.partial_return,
    years: h.years.map((y) => ({ tax_year: y.year, form: y.form, source: y.source, object_id: y.object_id, revenue: y.revenue, expenses: y.expenses, surplus: y.surplus, deficit: y.deficit,
      months_cash: r(y.months_cash, 2), months_unrestricted_net_assets: r(y.months_unrestricted, 2), program_ratio: r(y.program_ratio), fundraising_cost_per_dollar: r(y.fundraising_per_dollar),
      contributions_share: r(y.contributions_share), program_revenue_share: r(y.program_revenue_share), government_share: r(y.government_share), liabilities_to_assets: r(y.liabilities_to_assets),
      cash: y.cash, unrestricted_net_assets: y.unrestricted_net_assets, total_assets: y.total_assets, total_liabilities: y.total_liabilities })),
    years_with_data: h.years_with_data, deficit_years: h.deficit_years, consecutive_deficits: h.consecutive_deficits,
    flags: h.flags, notes: h.notes,
    peers: h.peers ? { ...h.peers, median_months_cash: r(h.peers.median_months_cash, 2), median_program_ratio: r(h.peers.median_program_ratio) } : null,
    method: HEALTH_METHOD, caveats: HEALTH_CAVEATS, note: HEALTH_NOTE,
  };
}
