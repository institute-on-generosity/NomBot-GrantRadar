// Financial health types, wording and constants with no database import, so client components can use them
// (components/AnswerHealth.tsx). The queries and rules are in lib/financialHealth.ts.
export type HealthYear = {
  year: number; form: string; source: "filing" | "prior_year"; object_id: string;
  revenue: number; expenses: number; surplus: number; deficit: boolean;
  contributions: number | null; program_revenue: number | null; government_grants: number | null;
  cash: number | null; months_cash: number | null; unrestricted_net_assets: number | null; months_unrestricted: number | null;
  program_ratio: number | null; fundraising_per_dollar: number | null;
  contributions_share: number | null; program_revenue_share: number | null; government_share: number | null;
  total_assets: number | null; total_liabilities: number | null; liabilities_to_assets: number | null;
};
export type Peers = { scope: string; ntee: string; band: number; band_name: string; year: number; n: number; median_months_cash: number | null; median_program_ratio: number | null };
export type OrgHealth = {
  ein: string; name: string; state: string | null; ntee: string | null;
  window: { from: number; to: number }; latest_full: number;
  years: HealthYear[];                // oldest first, full years only
  partial_return: number | null;      // a tax year after latest_full with its own return, left out
  years_with_data: number; deficit_years: number; consecutive_deficits: number;
  flags: string[]; notes: string[]; peers: Peers | null;
};

export const R_BANDS = ["Under $100K", "$100K to $500K", "$500K to $1M", "$1M to $5M", "$5M to $10M", "$10M to $50M", "$50M to $100M", "$100M and up"];
const R_EDGES = [1e5, 5e5, 1e6, 5e6, 1e7, 5e7, 1e8];
export const bandOf = (rev: number) => 1 + R_EDGES.filter((e) => rev >= e).length;
export const HEALTH_NOTE = "Indicators from the org's own Form 990s, not a rating. A deficit can be planned, and one year rarely tells the story.";
export const HEALTH_METHOD = "Each tax year's own Form 990 or 990-EZ (newest return per year, so amendments count), else the next year's Form 990 prior-year column for revenue and expenses. Surplus = total revenue minus total expenses. Months of cash = cash and savings at year end divided by a month of expenses (investments aren't in our 990 data, so endowed orgs read low, and under 1 month is flagged only when unrestricted net assets also cover under 3 months). Unrestricted net assets per month of expenses include buildings and equipment. Program ratio = program service expenses over total expenses. Cost to raise $1 = fundraising expenses over contributions. Revenue mix = contributions, program service revenue and government grants (Part VIII line 1e, part of contributions) over total revenue. Liabilities to assets at year end. 990-EZ years have no cash line of their own, unrestricted net assets, fundraising column or government grants line, so those are left out for them.";
export const HEALTH_CAVEATS = [
  "Form 990 and 990-EZ differ. The 990-EZ reports cash together with investments and has no fundraising column, unrestricted net assets or government grants line, so those indicators are blank for 990-EZ years.",
  "Returns reach the IRS 1 to 2 years after the tax year ends, so the newest full year is usually 2 years old. Partial years are left out.",
  "A one-off capital campaign, endowment gift or large multi-year grant counted in one year can turn that year into a big surplus and the next into a deficit.",
  "Donated goods (food, supplies) count as revenue when received and as expenses when given out, so inventory swings can show up as a surplus or deficit.",
  "Our Form 990 data starts with tax year 2022 (from 2023 returns' prior-year column), so most orgs have 2 or 3 full years, not 5.",
];

const months = (m: number) => (m >= 24 ? `${(m / 12).toFixed(1)} years` : `${m.toFixed(1)} ${m.toFixed(1) === "1.0" ? "month" : "months"}`);
export const monthsText = (m: number | null) => (m == null ? "n/a" : months(Math.max(0, m)));
