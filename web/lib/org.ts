// Everything NomBot knows about one organization, with sources.
import { db } from "./db";
import { nteeLabel } from "./ntee";
import { propublicaOrg, sources, type Source } from "./sources";

export async function getOrg(einParam: string) {
  const ein = einParam.replace(/\D/g, "");
  if (ein.length !== 9) return null;
  const { rows: [o] } = await db.query("SELECT * FROM orgs WHERE ein = $1", [ein]);
  if (!o) return null;
  const { rows: [t] } = await db.query(
    "SELECT object_id, tax_year, form, mission, programs FROM filing_text WHERE ein = $1 ORDER BY tax_year DESC NULLS LAST LIMIT 1", [ein]);
  const { rows: fin } = await db.query(
    "SELECT tax_year, form, revenue, expenses, assets FROM financials WHERE ein = $1 ORDER BY tax_year DESC", [ein]);
  const bmfYear = o.tax_period ? Number(String(o.tax_period).slice(0, 4)) : null;
  const latestSoi = fin[0];
  const revSrc = o.revenue_amt != null && (!latestSoi || (bmfYear ?? 0) > latestSoi.tax_year) ? "bmf" : latestSoi ? "soi" : null;

  const soiZip = (form: string) => `https://www.irs.gov/pub/irs-soi/24eoextract${form === "990EZ" ? "990EZ" : "990"}.zip`;
  const src = sources({ ein, state: o.state, revSrc, finForm: latestSoi?.form ?? null, objectId: t?.object_id ?? null, textYear: t?.tax_year ?? null, textForm: t?.form ?? null });
  const bmfUrl = src.find((s) => s.label === "IRS master file")?.url ?? "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf";
  const soiExtra: Source[] = latestSoi && !src.some((x) => x.label === "IRS SOI extract")
    ? [{ label: "IRS SOI extract", detail: `Past revenue, expenses, assets (${soiZip(latestSoi.form).split("/").pop()})`, url: soiZip(latestSoi.form) }]
    : [];
  const allSources: Source[] = [...src, ...soiExtra, { label: "All filings on ProPublica", detail: "Every return this organization has e-filed", url: propublicaOrg(ein) }];

  const years = [
    ...(o.revenue_amt != null && bmfYear && (!latestSoi || bmfYear > latestSoi.tax_year)
      ? [{ year: bmfYear, revenue: Number(o.revenue_amt), expenses: null as number | null, assets: o.asset_amt != null ? Number(o.asset_amt) : null, source: "IRS master file", url: bmfUrl }]
      : []),
    ...fin.map((f) => ({ year: f.tax_year as number, revenue: Number(f.revenue), expenses: Number(f.expenses), assets: Number(f.assets), source: `IRS SOI (Form ${f.form})`, url: soiZip(f.form) })),
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
    years,
    bmfUrl,
    sources: allSources,
  };
}
