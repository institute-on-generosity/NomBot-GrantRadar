// The IRS SOI annual extract (Form 990 / 990-EZ financial data), as loaded by
// generosity-data/etl/load_soi.py: each organization's full record (financials.raw)
// plus the IRS field dictionary (soi_fields) that explains every column.
import { db } from "./db";

export const SOI_YY = "24"; // processing year of the loaded extract
export const soiZipUrl = (form: string) => `https://www.irs.gov/pub/irs-soi/${SOI_YY}eoextract${form === "990EZ" ? "990EZ" : "990"}.zip`;
export const SOI_DICTIONARY = `https://www.irs.gov/pub/irs-soi/${SOI_YY}eofinextractdoc.xlsx`;
export const soiViewerUrl = (ein: string, year: number, form: string) => `/source/soi/${ein.replace(/\D/g, "")}?year=${year}&form=${form}`;

// Columns NomBot reads (revenue, expenses, assets), per form.
export const USED: Record<string, string[]> = { "990": ["totrevenue", "totfuncexpns", "totassetsend"], "990EZ": ["totrevnue", "totexpns", "totassetsend"] };

export type SoiField = { col: string; position: number; description: string; location: string; codes: Record<string, string> | null };
export type SoiRecord = { year: number; form: string; revenue: number | null; expenses: number | null; assets: number | null; raw: Record<string, string> };

export async function getSoi(einParam: string) {
  const ein = einParam.replace(/\D/g, "");
  if (ein.length !== 9) return null;
  const [{ rows: [org] }, { rows: recs }] = await Promise.all([
    db.query("SELECT name, city, state FROM orgs WHERE ein = $1", [ein]),
    db.query("SELECT tax_year, form, revenue, expenses, assets, raw FROM financials WHERE ein = $1 ORDER BY tax_year DESC, form", [ein]),
  ]);
  if (!org) return null;
  const forms = [...new Set(recs.map((r) => r.form as string))];
  const { rows: fields } = await db.query(
    "SELECT form, col, position, description, location, codes FROM soi_fields WHERE form = ANY($1) ORDER BY form, position", [forms]);
  const byForm = new Map<string, SoiField[]>();
  for (const f of fields) byForm.set(f.form, [...(byForm.get(f.form) ?? []), f]);
  return {
    ein,
    org: { name: org.name as string, city: org.city as string | null, state: org.state as string | null },
    records: recs.map((r): SoiRecord => ({
      year: r.tax_year, form: r.form, raw: r.raw ?? {},
      revenue: r.revenue == null ? null : Number(r.revenue), expenses: r.expenses == null ? null : Number(r.expenses), assets: r.assets == null ? null : Number(r.assets),
    })),
    fields: byForm,
  };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const dollars = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US")}`;

// A raw extract value in plain English, using the field's description and code table.
export function readValue(f: SoiField | undefined, v: string): { text: string; link?: string } {
  const codes = f?.codes ?? null;
  if (codes?.[v]) return { text: codes[v] };
  if (codes?._link) return { text: `Industry code ${v}`, link: codes._link };
  const d = f?.description ?? "";
  if (d.trim().endsWith("?") && /^[YN]$/.test(v)) return { text: v === "Y" ? "Yes" : "No" };
  if (/^tax_?pd$/.test(f?.col ?? "") && /^\d{6}$/.test(v)) return { text: `${MONTHS[Number(v.slice(4)) - 1] ?? v.slice(4)} ${v.slice(0, 4)}` };
  if (f?.col === "ein" && /^\d{9}$/.test(v)) return { text: `${v.slice(0, 2)}-${v.slice(2)}` };
  if (/^subs(ection)?cd$|^subseccd$/.test(f?.col ?? "") && /^\d+$/.test(v)) return { text: `501(c)(${Number(v)})` };
  if (/cd$/.test(f?.col ?? "") || /\bcode\b/i.test(d)) return { text: v }; // codes without a published meaning
  if (/^-?\d+$/.test(v)) {
    const n = Number(v);
    if (/cnt$/.test(f?.col ?? "") || /^number/i.test(d)) return { text: n.toLocaleString("en-US") };
    if (/percent|pct/i.test(d)) return { text: `${n}%` };
    return { text: dollars(n) };
  }
  return { text: v };
}

// "990 Core_Pt VIII-12(A)" -> "Part VIII · Revenue"; "990 Sch A_Pt I-1-11" -> "Schedule A · Part I".
const PARTS: Record<string, Record<string, string>> = {
  "990": { I: "Summary", III: "Program service accomplishments", IV: "Checklist of required schedules", V: "Statements regarding other IRS filings", VI: "Governance", VII: "Compensation", VIII: "Revenue", IX: "Functional expenses", X: "Balance sheet", XI: "Net assets", XII: "Financial statements" },
  "990EZ": { I: "Revenue, expenses and changes in net assets", II: "Balance sheet", III: "Program service accomplishments", IV: "Officers, directors, trustees", V: "Other information", VI: "Section 501(c)(3) organizations" },
};
export function section(form: string, location: string) {
  const sch = location.match(/Sch(?:edule)?\s+([A-Z])/i)?.[1];
  const part = location.match(/Pt\s+([IVX]+)/)?.[1];
  if (sch) return part ? `Schedule ${sch} · Part ${part}` : `Schedule ${sch}`;
  if (part) return `Part ${part}${PARTS[form]?.[part] ? ` · ${PARTS[form][part]}` : ""}`;
  return "Header";
}
