// Vetting card helpers (Oct 28, advisor research brief section 12): the track record line and "Questions to ask" for
// the follow-up call. Fixed rules over the org's own filings and grants, no AI. Each question carries the reason it was
// asked ("because deficits in 3 of the last 4 years"). Shared by the org page, the memo and /api/v1/org/{ein}.
import { partialYears } from "./answer";
import { db } from "./db";
import { orgFinancialHealth } from "./financialHealth";
import type { HealthYear } from "./healthText";
import { memo } from "./memo";
import type { getOrg } from "./org";
import { GRANT_YEARS } from "./placeReport";
import { orgTitle } from "../components/text";

type Org = NonNullable<Awaited<ReturnType<typeof getOrg>>>;
const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const yy = (a: number, b: number) => (a === b ? String(a) : `${a}–${String(b).slice(2)}`);
const money = (n: number) => { const a = Math.abs(n); return `$${a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}K` : Math.round(a)}`; };

// ------------------------------------------------------------------ track record
export type TrackRecord = {
  since: number | null; age: number | null;            // IRS ruling year (tax-exempt since) and whole years since
  filings: number; firstFiling: number | null;         // tax years with a return on record (990, 990-EZ, 990-PF)
  revenue: { fromYear: number; toYear: number; from: number; to: number; change: number } | null;
  text: string;                                        // "Tax-exempt since 1998 · 28 years · 5 filings since 2020 · income up 18% (2020–24)"
};
export function trackText(t: Omit<TrackRecord, "text">): string {
  const parts = [
    t.since ? `Tax-exempt since ${t.since}` : null,
    t.age != null ? `${t.age} year${t.age === 1 ? "" : "s"}` : null,
    t.filings ? `${t.filings} return${t.filings === 1 ? "" : "s"} on record${t.firstFiling ? ` since ${t.firstFiling}` : ""}` : "No e-filed returns on record",
    t.revenue ? (Math.abs(t.revenue.change) < 0.05 ? `income steady (${yy(t.revenue.fromYear, t.revenue.toYear)})` : `income ${t.revenue.change > 0 ? "up" : "down"} ${pct(t.revenue.change)} (${yy(t.revenue.fromYear, t.revenue.toYear)})`) : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

// ------------------------------------------------------------------ questions to ask
export type Question = { key: string; q: string; because: string; weight: number };
export type Signals = {
  years: HealthYear[];                                  // full Form 990 years, oldest first (lib/financialHealth)
  checks: { key: string; ok: boolean }[];               // 990 Part IV and VI answers (lib/flag)
  board: { members: number; independent: number } | null;
  revoked: boolean;
  funders: { name: string; usd: number }[];             // foundation grants received over GRANT_YEARS, largest first
  revenueInGrantYears: number | null;                   // the org's total income over the same years
  grantYears: [number, number];
};
// Every rule that fires, strongest first. Pure, so eval/vetting.mts can test each rule.
export function questionsFrom(s: Signals): Question[] {
  const out: Question[] = [];
  const ys = s.years, last = ys.at(-1), own = [...ys].reverse().find((y) => y.source === "filing");
  if (s.revoked) out.push({ key: "status", weight: 100, q: "Can you confirm your tax-exempt status with the IRS?", because: "the IRS lists an automatic revocation for not filing" });
  const deficits = ys.filter((y) => y.deficit);
  if (deficits.length >= 2) out.push({ key: "deficits", weight: 90, q: "How will you close the gap between income and spending, and what would you cut if it continues?", because: `deficits in ${deficits.length} of the last ${ys.length} years (${yy(ys[0].year, last!.year)})` });
  else if (last?.deficit) out.push({ key: "deficit", weight: 60, q: `What did the ${last.year} deficit pay for, and how will you cover it?`, because: `spent ${money(-last.surplus)} more than it took in, ${last.year}` });
  if (own?.months_cash != null && own.months_cash < 3) out.push({ key: "cash", weight: own.months_cash < 1 ? 85 : 70, q: "How would you get through a few slow months?", because: `cash covers ${own.months_cash < 1 ? "under 1 month" : `about ${Math.round(own.months_cash)} months`} of spending (${own.year})` });
  // Dependence on the top one or two foundation funders, as a share of all income over the grant years
  const [f1, f2] = s.funders;
  if (f1 && s.revenueInGrantYears && s.revenueInGrantYears > 0) {
    const top2 = (f1.usd + (f2?.usd ?? 0)) / s.revenueInGrantYears;
    if (f1.usd / s.revenueInGrantYears >= 0.2 || top2 >= 0.3) {
      const names = [f1, f2].filter(Boolean).map((f) => orgTitle(f!.name));
      out.push({ key: "concentration", weight: 75, q: f2 ? "How are you diversifying beyond your two largest funders?" : "How would you replace your largest funder's support if it ended?", because: `${names.join(" and ")} gave ${pct(Math.min(1, f2 ? top2 : f1.usd / s.revenueInGrantYears))} of its income, ${yy(...s.grantYears)}` });
    }
  }
  const check = (k: string) => s.checks.find((c) => c.key === k);
  if (check("diversion_of_assets")?.ok === false) out.push({ key: "diversion", weight: 95, q: "What happened with the money reported as used for the wrong purpose, and what has changed since?", because: "its 990 reports a diversion of assets" });
  if (check("business_with_insiders")?.ok === false || check("insider_loan")?.ok === false || check("excess_benefit")?.ok === false)
    out.push({ key: "insiders", weight: 65, q: "Who approved the deals with leaders or their families, and on what terms?", because: `its 990 reports ${check("insider_loan")?.ok === false ? "loans to or from leaders" : check("excess_benefit")?.ok === false ? "someone paid more than fair value" : "business with leaders or their families"} (Schedule L)` });
  // Income change between the last two full years
  if (ys.length >= 2) {
    const a = ys.at(-2)!, b = ys.at(-1)!;
    const ch = a.revenue > 0 ? (b.revenue - a.revenue) / a.revenue : null;
    if (ch != null && ch <= -0.15) out.push({ key: "drop", weight: 72, q: "What changed: a one-time grant ending, or a lasting drop in income?", because: `income fell ${pct(ch)} (${a.year} to ${b.year})` });
  }
  if (ys.length >= 3) {
    const a = ys.at(-3)!, b = ys.at(-1)!;
    const ch = a.revenue > 0 ? (b.revenue - a.revenue) / a.revenue : null;
    if (ch != null && ch >= 0.5 && b.revenue >= 250_000) out.push({ key: "growth", weight: 40, q: "How are you building staff and systems to keep up with fast growth?", because: `income grew ${pct(ch)} (${a.year} to ${b.year})` });
  }
  const rev = own?.revenue ?? last?.revenue ?? 0;
  if (check("audited")?.ok === false && rev >= 1_000_000) out.push({ key: "audit", weight: 55, q: "Can you share audited or reviewed financial statements?", because: `no outside audit reported on ${money(rev)} of income (${own?.year ?? last?.year})` });
  if (own?.liabilities_to_assets != null && own.liabilities_to_assets > 0.5) out.push({ key: "debt", weight: own.liabilities_to_assets > 1 ? 68 : 45, q: "What are the main debts, and how are they being paid down?", because: `it owes ${pct(own.liabilities_to_assets)} of what it owns (${own.year})` });
  if (s.board && s.board.members >= 3 && s.board.independent / s.board.members < 0.5) out.push({ key: "board", weight: 50, q: "How does the board oversee pay and big decisions?", because: `${s.board.independent} of ${s.board.members} board members are independent` });
  if (check("family_business_ties")?.ok === false) out.push({ key: "ties", weight: 35, q: "How are decisions handled when board members have family or business ties?", because: "its 990 reports family or business ties among leaders" });
  if (own?.contributions_share != null && own.contributions_share >= 0.9 && !out.some((x) => x.key === "concentration")) out.push({ key: "donations", weight: 30, q: "How many donors give most of your income, and how steady are they?", because: `gifts and grants are ${pct(own.contributions_share)} of income (${own.year})` });
  return out.sort((a, b) => b.weight - a.weight);
}
// 3 to 5 questions: the rules that fired, then standard first questions when fewer than 3 did (said as such)
const STANDARD: Question[] = [
  { key: "use", weight: 0, q: "What would a gift of this size make possible in the next year?", because: "a standard first question" },
  { key: "results", weight: 0, q: "How do you know your programs are working, and what do you track?", because: "a standard first question" },
  { key: "next", weight: 0, q: "What is the biggest risk to your work in the next two years?", because: "a standard first question" },
];
export const pickQuestions = (fired: Question[]): Question[] => {
  const out = [...fired.slice(0, 5), ...STANDARD].slice(0, Math.max(3, Math.min(5, fired.length)));
  return fired.length ? out : out.map((q, i) => (i === 0 ? { ...q, because: "a standard first question, no warning signs in its filings" } : q));
};

// ------------------------------------------------------------------ both, for one org
export type Vetting = { track: TrackRecord; questions: Question[]; asOf: { health: string | null; grants: string } };
const cached = memo<Vetting>("vetting:v1", 2000, 3600_000);
export function vetting(o: Org): Promise<Vetting> {
  const ein = o.ein.replace(/\D/g, "");
  return cached(ein, async () => {
    const { latestFull } = await partialYears("f990").catch(() => ({ latestFull: 0 }));
    const [h, { rows: [f] }, { rows: funders }] = await Promise.all([
      latestFull ? orgFinancialHealth(ein, latestFull, { peers: false }).catch(() => null) : null,
      db.query(`SELECT count(DISTINCT tax_year)::int AS n, min(tax_year)::int AS first FROM (
          SELECT tax_year FROM filing_text WHERE ein = $1 UNION SELECT tax_year FROM filing_flag WHERE ein = $1
          UNION SELECT tax_year FROM financials WHERE ein = $1 UNION SELECT tax_year FROM foundation_finances WHERE ein = $1) x WHERE tax_year IS NOT NULL`, [ein]),
      db.query(`SELECT max(f.name) AS name, sum(g.amount)::float8 AS usd FROM grant_clean g LEFT JOIN funders f ON f.ein = g.funder_ein
          WHERE g.recipient_ein = $1 AND g.tax_year BETWEEN $2 AND $3 GROUP BY g.funder_ein ORDER BY 2 DESC LIMIT 2`, [ein, ...GRANT_YEARS]),
    ]);
    const years = h?.years ?? [];
    // Income trend: the org page's own years (master file and SOI) plus the health years, oldest to newest with income
    const byYear = new Map<number, number>();
    for (const y of o.years) if (y.revenue != null && y.revenue > 0) byYear.set(y.year, y.revenue);
    for (const y of years) if (y.revenue > 0) byYear.set(y.year, y.revenue);
    const ry = [...byYear.entries()].sort((a, b) => a[0] - b[0]).filter(([y]) => y >= Math.max(...byYear.keys()) - 4);
    const revenue = ry.length >= 2 ? { fromYear: ry[0][0], toYear: ry.at(-1)![0], from: ry[0][1], to: ry.at(-1)![1], change: (ry.at(-1)![1] - ry[0][1]) / ry[0][1] } : null;
    const tr = { since: o.ruling ? Number(o.ruling) : null, age: o.age, filings: Number(f?.n ?? 0), firstFiling: f?.first ?? null, revenue };
    const inGrantYears = [...byYear.entries()].filter(([y]) => y >= GRANT_YEARS[0] && y <= GRANT_YEARS[1]).map(([, v]) => v);
    const fired = questionsFrom({
      years, checks: o.flag?.checks ?? [], board: o.flag?.board ?? null, revoked: o.tax?.status === "revoked",
      funders: funders.filter((r) => r.name).map((r) => ({ name: String(r.name), usd: Number(r.usd) })),
      // Income over the grant years, scaled up when a year is missing so the share isn't inflated
      revenueInGrantYears: inGrantYears.length ? (inGrantYears.reduce((t, v) => t + v, 0) / inGrantYears.length) * (GRANT_YEARS[1] - GRANT_YEARS[0] + 1) : null,
      grantYears: [GRANT_YEARS[0], GRANT_YEARS[1]],
    });
    return {
      track: { ...tr, text: trackText(tr) },
      questions: pickQuestions(fired),
      asOf: { health: years.length ? yy(years[0].year, years.at(-1)!.year) : null, grants: yy(GRANT_YEARS[0], GRANT_YEARS[1]) },
    };
  });
}
