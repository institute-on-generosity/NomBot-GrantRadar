// Everything NomBot knows about one organization, with sources.
import { db } from "./db";
import { nteeLabel } from "./ntee";
import { soiViewerUrl } from "./soi";
import { diligence } from "./flag";
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
