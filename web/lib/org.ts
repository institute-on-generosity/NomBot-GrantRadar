// Everything NomBot knows about one organization, with sources.
import { db } from "./db";
import { nteeLabel } from "./ntee";
import { soiViewerUrl } from "./soi";
import { propublicaOrg, sources, type Source } from "./sources";

export async function getOrg(einParam: string) {
  const ein = einParam.replace(/\D/g, "");
  if (ein.length !== 9) return null;
  const { rows: [o] } = await db.query("SELECT * FROM orgs WHERE ein = $1", [ein]);
  if (!o) return null;
  const { rows: [t] } = await db.query(
    "SELECT object_id, tax_year, form, mission, programs, employees, volunteers FROM filing_text WHERE ein = $1 ORDER BY tax_year DESC NULLS LAST LIMIT 1", [ein]);
  const { rows: fin } = await db.query(
    "SELECT tax_year, form, revenue, expenses, assets, raw FROM financials WHERE ein = $1 ORDER BY tax_year DESC", [ein]);
  const { rows: [flagRow] } = await db.query("SELECT * FROM filing_flag WHERE ein = $1 ORDER BY tax_year DESC NULLS LAST LIMIT 1", [ein]);
  const bmfYear = o.tax_period ? Number(String(o.tax_period).slice(0, 4)) : null;
  const latestSoi = fin[0];
  const revSrc = o.revenue_amt != null && (!latestSoi || (bmfYear ?? 0) > latestSoi.tax_year) ? "bmf" : latestSoi ? "soi" : null;

  const src = sources({ ein, state: o.state, revSrc, finForm: latestSoi?.form ?? null, finYear: latestSoi?.tax_year ?? null, objectId: t?.object_id ?? null, textYear: t?.tax_year ?? null, textForm: t?.form ?? null });
  const bmfUrl = src.find((s) => s.label === "IRS master file")?.url ?? "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf";
  const soiExtra: Source[] = latestSoi && !src.some((x) => x.label === "IRS SOI extract")
    ? [{ label: "IRS SOI extract", detail: `Past revenue, expenses, assets (Form ${latestSoi.form}, ${latestSoi.tax_year})`, url: soiViewerUrl(ein, latestSoi.tax_year, latestSoi.form), internal: true }]
    : [];
  const allSources: Source[] = [...src, ...soiExtra, { label: "All filings on ProPublica", detail: "Every return this organization has e-filed", url: propublicaOrg(ein) }];

  const years = [
    ...(o.revenue_amt != null && bmfYear && (!latestSoi || bmfYear > latestSoi.tax_year)
      ? [{ year: bmfYear, revenue: Number(o.revenue_amt), expenses: null as number | null, assets: o.asset_amt != null ? Number(o.asset_amt) : null, source: "IRS master file", url: bmfUrl }]
      : []),
    ...fin.map((f) => ({ year: f.tax_year as number, revenue: Number(f.revenue), expenses: Number(f.expenses), assets: Number(f.assets), source: `IRS SOI (Form ${f.form})`, url: soiViewerUrl(ein, f.tax_year, f.form) })),
  ];

  return {
    ein: `${ein.slice(0, 2)}-${ein.slice(2)}`,
    name: o.name as string,
    careOf: o.care_of as string | null,
    street: o.street as string | null,
    city: o.city as string | null,
    state: o.state as string | null,
    zip: o.zip as string | null,
    subsection: o.subsection as string | null,
    ruling: o.ruling ? String(o.ruling).slice(0, 4) : null,
    ntee: o.ntee_cd ? { code: o.ntee_cd as string, label: nteeLabel(o.ntee_cd) } : null,
    mission: t?.mission as string | null ?? null,
    programs: t?.programs as string | null ?? null,
    filing: t ? { year: t.tax_year as number, form: t.form as string, url: src[0]?.url } : null,
    // Team size from Form 990 Part I lines 5-6 (not reported on 990-EZ).
    team: t && (t.employees != null || t.volunteers != null) ? { staff: t.employees as number | null, volunteers: t.volunteers as number | null, year: t.tax_year as number } : null,
    years,
    income: latestSoi ? income(latestSoi) : null,
    status: status(o.status, o.foundation, o.subsection),
    flag: flagRow ? diligence(flagRow, t?.object_id ? `https://projects.propublica.org/nonprofits/organizations/${ein}/${flagRow.object_id}/full` : null) : null,
    bmfUrl,
    sources: allSources,
  };
}

// Where the money comes from, Form 990 Part VIII (or 990-EZ Part I) as loaded in the SOI extract.
// Government grants are counted with contributions there; "other" is what's left of total revenue.
export type Income = { year: number; form: string; total: number; parts: { key: string; label: string; amount: number }[]; gifts: number };
function income(f: { tax_year: number; form: string; revenue: string | null; raw: Record<string, string> | null }): Income | null {
  const r = f.raw ?? {};
  const n = (k: string) => Math.max(0, Number(r[k] ?? 0) || 0);
  const total = Number(f.revenue ?? 0);
  if (!(total > 0)) return null;
  const ez = f.form === "990EZ";
  const known = [
    { key: "gifts", label: "Gifts and grants", amount: n(ez ? "totcntrbs" : "totcntrbgfts") },
    { key: "program", label: "Program fees and contracts", amount: n(ez ? "prgmservrev" : "totprgmrevnue") },
    { key: "invest", label: "Investments", amount: n(ez ? "othrinvstinc" : "invstmntinc") },
    { key: "events", label: "Fundraising events", amount: n("netincfndrsng") },
  ];
  const other = Math.max(0, total - known.reduce((a, p) => a + p.amount, 0));
  const parts = [...known, { key: "other", label: "Other", amount: other }].filter((p) => p.amount > 0);
  return { year: f.tax_year, form: f.form, total, parts, gifts: Math.min(1, known[0].amount / total) };
}

// IRS master file codes in plain words (EO BMF documentation: status, foundation and subsection codes).
const STATUS: Record<string, string> = { "01": "Recognized as tax-exempt", "02": "Conditionally exempt", "12": "Charitable trust (4947(a)(2))", "25": "Ending private-foundation status" };
const FOUNDATION: Record<string, string> = {
  "02": "Private operating foundation", "03": "Private operating foundation", "04": "Private foundation",
  "10": "Church", "11": "School", "12": "Hospital or medical research", "13": "Supports a public college", "14": "Government unit",
  "15": "Public charity, supported by the public", "16": "Public charity, supported by fees and gifts",
  "17": "Supporting organization", "18": "Public safety testing", "21": "Supporting organization (Type I)",
  "22": "Supporting organization (Type II)", "23": "Supporting organization (Type III)", "24": "Supporting organization (Type III)",
};
function status(code: string | null, foundation: string | null, subsection: string | null) {
  return {
    standing: (code && STATUS[code]) ?? "In the IRS master file",
    kind: foundation && foundation !== "00" ? FOUNDATION[foundation] ?? null : subsection && subsection !== "03" ? `501(c)(${Number(subsection)}) organization` : null,
  };
}

// FLAG diligence from the newest e-filed 990 / 990-EZ (generosity-data filing_flag): this year vs last
// year (Part I), liquidity and program spending (Parts X, IX), board and policies (Part VI), insider
// flags (Part IV) and the people who lead it (Part VII). Fixed rules, shown with their figures.
type FlagRow = Record<string, string | number | boolean | null | Person[]>;
export type Person = { name: string; title: string; hours: number; pay: number; other: number; role: string };
export type Diligence = {
  year: number | null; form: string; url: string | null;
  compare: { label: string; now: number; before: number | null; income: boolean }[]; // Part I CY vs PY
  cashMonths: number | null; programShare: number | null; debtShare: number | null;
  board: { members: number; independent: number } | null;
  checks: { label: string; ok: boolean; minor?: boolean }[];               // Part VI + IV, only answered ones
  people: Person[];
  rating: Rating;
};
// Overall financial health, Strong / Medium / Weak, by fixed rules (no AI): any "weak" signal makes it
// Weak; two or more "watch" signals make it Medium. RULES is shown on the page so the rating can be checked.
export type Signal = { label: string; level: "ok" | "watch" | "weak"; note: string };
export type Rating = { level: "Strong" | "Medium" | "Weak"; signals: Signal[] };
export const RULES = [
  "Revenue: down 10%+ is watch, down 25%+ is weak",
  "Result: any deficit is watch, a deficit over 10% of revenue is weak",
  "Cash: under 3 months of spending is watch, under 1 month is weak",
  "Liabilities: over half of assets is watch, more than assets is weak",
  "Funding: 90%+ from gifts and grants is watch",
  "Board: under half independent is watch",
  "Insiders: loans, excess benefits or business with insiders is watch; diversion of assets is weak",
];
function diligence(r: FlagRow, url: string | null): Diligence {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  const pairs: [string, string, string][] = [["Revenue", "cy_revenue", "py_revenue"], ["Expenses", "cy_expenses", "py_expenses"],
    ["Gifts and grants", "cy_contributions", "py_contributions"], ["Program revenue", "cy_program_revenue", "py_program_revenue"], ["Salaries and benefits", "cy_salaries", "py_salaries"]];
  const exp = n("cy_expenses");
  const yes = (k: string, label: string, good: boolean) => (r[k] == null ? null : { label, ok: Boolean(r[k]) === good });
  const checks = [
    yes("audited", "Financial statements audited", true),
    yes("conflict_policy", "Conflict-of-interest policy", true),
    yes("whistleblower_policy", "Whistleblower policy", true),
    yes("family_business_ties", "No family or business ties among leaders", false),
    yes("insider_loan", "No loans to or from insiders", false),
    yes("excess_benefit", "No excess-benefit transactions", false),
    yes("business_with_insiders", "No business deals with insiders", false),
    yes("diversion_of_assets", "No diversion of assets reported", false),
  ].filter((c): c is { label: string; ok: boolean } => c !== null)
    // Audits are usually required only for larger budgets: not being audited under $1M isn't a red flag.
    .map((c) => (c.label.startsWith("Financial statements") && !c.ok && (n("cy_revenue") ?? 0) < 1_000_000 ? { ...c, minor: true } : c));
  return {
    year: n("tax_year"), form: String(r.form), url,
    compare: pairs.map(([label, cy, py]) => ({ label, now: n(cy) ?? NaN, before: n(py), income: !/Expenses|Salaries/.test(label) })).filter((c) => !Number.isNaN(c.now) && (c.now !== 0 || (c.before ?? 0) !== 0)),
    cashMonths: exp && exp > 0 && n("cash") != null ? n("cash")! / (exp / 12) : null,
    programShare: exp && exp > 0 && n("program_expenses") != null ? n("program_expenses")! / exp : null,
    debtShare: n("total_assets") && n("total_assets")! > 0 && n("total_liabilities") != null ? n("total_liabilities")! / n("total_assets")! : null,
    board: n("voting_members") ? { members: n("voting_members")!, independent: n("independent_members") ?? 0 } : null,
    checks,
    people: (r.people as Person[] | null) ?? [],
    rating: rate(r),
  };
}

function rate(r: FlagRow): Rating {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
  const s: Signal[] = [];
  const rev = n("cy_revenue"), prev = n("py_revenue"), exp = n("cy_expenses");
  if (rev != null && prev && prev > 10_000) {
    const c = (rev - prev) / prev;
    s.push({ label: "Revenue", level: c <= -0.25 ? "weak" : c <= -0.1 ? "watch" : "ok", note: c < 0 ? `down ${pct(c)} from last year` : `up ${pct(c)} from last year` });
  }
  if (rev && rev > 0 && exp != null) {
    const m = (rev - exp) / rev;
    s.push({ label: "Result", level: m < -0.1 ? "weak" : m < 0 ? "watch" : "ok", note: m < 0 ? `deficit of ${pct(m)} of revenue` : `surplus of ${pct(m)} of revenue` });
  }
  const cash = n("cash");
  if (cash != null && exp && exp > 0) {
    const mo = cash / (exp / 12);
    s.push({ label: "Cash", level: mo < 1 ? "weak" : mo < 3 ? "watch" : "ok", note: mo >= 12 ? `${(mo / 12).toFixed(1)} years of spending` : `${Math.max(0, Math.round(mo))} ${Math.round(mo) === 1 ? "month" : "months"} of spending` });
  }
  const assets = n("total_assets"), debt = n("total_liabilities");
  if (assets && assets > 0 && debt != null) {
    const d = debt / assets;
    s.push({ label: "Liabilities", level: d > 1 ? "weak" : d > 0.5 ? "watch" : "ok", note: `${pct(d)} of assets` });
  }
  const gifts = n("cy_contributions");
  if (gifts != null && rev && rev > 0) {
    const g = Math.min(1, gifts / rev);
    s.push({ label: "Funding", level: g >= 0.9 ? "watch" : "ok", note: `${pct(g)} from gifts and grants` });
  }
  const members = n("voting_members"), indep = n("independent_members");
  if (members && indep != null) s.push({ label: "Board", level: indep < members / 2 ? "watch" : "ok", note: `${indep} of ${members} independent` });
  const insider = ["insider_loan", "excess_benefit", "business_with_insiders"].filter((k) => r[k] === true);
  if (r.diversion_of_assets === true) s.push({ label: "Insiders", level: "weak", note: "reports a diversion of assets" });
  else if (insider.length) s.push({ label: "Insiders", level: "watch", note: insider.map((k) => ({ insider_loan: "loans with insiders", excess_benefit: "an excess-benefit transaction", business_with_insiders: "business with insiders" })[k]).join(", ") });
  else if (r.insider_loan === false) s.push({ label: "Insiders", level: "ok", note: "no insider loans or deals reported" });
  const weak = s.some((x) => x.level === "weak"), watch = s.filter((x) => x.level === "watch").length;
  return { level: weak ? "Weak" : watch >= 2 ? "Medium" : "Strong", signals: s };
}
