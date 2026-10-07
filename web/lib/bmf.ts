// The IRS Exempt Organizations Business Master File (BMF), read straight from irs.gov,
// with every column explained in plain English. Definitions follow the IRS field guide:
// https://www.irs.gov/pub/foia/ig/tege/eo-info.pdf
import { nteeLabel } from "./ntee";

export const BMF_GUIDE = "https://www.irs.gov/pub/foia/ig/tege/eo-info.pdf";
export const bmfFileUrl = (state: string) => `https://www.irs.gov/pub/irs-soi/eo_${state.toLowerCase()}.csv`;

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const yyyymm = (v: string) => (/^\d{6}$/.test(v) && Number(v.slice(4)) >= 1 && Number(v.slice(4)) <= 12 ? `${MONTHS[Number(v.slice(4)) - 1]} ${v.slice(0, 4)}` : v);
const dollars = (v: string) => (v === "" ? "" : /^-?\d+$/.test(v) ? `$${Number(v).toLocaleString("en-US")}` : v);
const pick = (table: Record<string, string>) => (v: string) => table[v] ?? (v ? `Code ${v}` : "");

const RANGE: Record<string, string> = {
  "0": "$0", "1": "$1 to $9,999", "2": "$10,000 to $24,999", "3": "$25,000 to $99,999", "4": "$100,000 to $499,999",
  "5": "$500,000 to $999,999", "6": "$1,000,000 to $4,999,999", "7": "$5,000,000 to $9,999,999", "8": "$10,000,000 to $49,999,999", "9": "$50,000,000 or more",
};

// Field, plain-English label, what it means, how to decode the value, whether NomBot uses it.
type Field = { col: string; label: string; help: string; decode?: (v: string) => string; used?: boolean };
export const FIELDS: Field[] = [
  { col: "EIN", label: "EIN", help: "The IRS's nine-digit ID for the organization", decode: (v) => (v.length === 9 ? `${v.slice(0, 2)}-${v.slice(2)}` : v), used: true },
  { col: "NAME", label: "Name", help: "Primary legal name", used: true },
  { col: "ICO", label: "In care of", help: "Person to whom IRS mail is addressed" },
  { col: "STREET", label: "Street", help: "Mailing address", used: true },
  { col: "CITY", label: "City", help: "Headquarters city (not necessarily where programs run)", used: true },
  { col: "STATE", label: "State", help: "Headquarters state", decode: (v) => STATE_NAMES[v] ?? v, used: true },
  { col: "ZIP", label: "ZIP code", help: "Mailing ZIP", used: true },
  { col: "GROUP", label: "Group exemption number", help: "Set when exempt under a parent organization's group ruling", decode: (v) => (v === "0000" || v === "" ? "None" : v) },
  { col: "SUBSECTION", label: "Tax-exempt type", help: "The section 501(c) category it is exempt under", decode: (v) => (/^\d+$/.test(v) ? `501(c)(${Number(v)})` : v), used: true },
  { col: "AFFILIATION", label: "Affiliation", help: "How it fits in a larger organization", decode: pick({ "1": "Central (no group exemption)", "2": "Intermediate (no group exemption)", "3": "Independent", "6": "Central, parent of a group ruling", "7": "Intermediate in a group ruling", "8": "Central, parent of a group ruling (church)", "9": "Subordinate in a group ruling" }) },
  { col: "CLASSIFICATION", label: "Classification", help: "Finer breakdown of the 501(c) type (IRS table)" },
  { col: "RULING", label: "Tax-exempt since", help: "Date of the IRS letter recognizing its exemption", decode: yyyymm, used: true },
  { col: "DEDUCTIBILITY", label: "Donations deductible?", help: "Whether gifts to it are tax-deductible", decode: pick({ "1": "Yes, contributions are deductible", "2": "No, contributions are not deductible", "4": "Yes, by treaty (foreign organization)" }) },
  { col: "FOUNDATION", label: "Charity type", help: "Public charity or private foundation, and which kind", decode: pick({
    "00": "Not a 501(c)(3)", "02": "Private operating foundation (exempt from excise tax)", "03": "Private operating foundation", "04": "Private non-operating foundation",
    "09": "Suspense", "10": "Church", "11": "School", "12": "Hospital or medical research organization", "13": "Supports a government-owned college or university",
    "14": "Governmental unit", "15": "Public charity supported by the public or government", "16": "Public charity supported by fees and contributions (509(a)(2))",
    "17": "Supporting organization (509(a)(3))", "18": "Public safety testing organization", "21": "Supporting organization, Type I", "22": "Supporting organization, Type II",
    "23": "Supporting organization, Type III (functionally integrated)", "24": "Supporting organization, Type III (not functionally integrated)", "25": "Agricultural research organization",
  }) },
  { col: "ACTIVITY", label: "Activity codes", help: "Older IRS activity codes (replaced by NTEE)" },
  { col: "ORGANIZATION", label: "Legal form", help: "Corporation, trust, association…", decode: pick({ "1": "Corporation", "2": "Trust", "3": "Co-operative", "4": "Partnership", "5": "Association" }) },
  { col: "STATUS", label: "Exemption status", help: "The kind of exemption it holds", decode: pick({ "01": "Unconditional exemption", "02": "Conditional exemption", "12": "Trust described in section 4947(a)(2)", "25": "Terminating its private foundation status" }), used: true },
  { col: "TAX_PERIOD", label: "Latest return covers", help: "Tax period of the most recent return filed", decode: yyyymm, used: true },
  { col: "ASSET_CD", label: "Asset range", help: "Assets on the latest return, as a range", decode: pick(RANGE) },
  { col: "INCOME_CD", label: "Income range", help: "Income on the latest return, as a range", decode: pick(RANGE) },
  { col: "FILING_REQ_CD", label: "Return it must file", help: "Which Form 990 it is required to file", decode: pick({
    "01": "Form 990 or 990-EZ", "02": "Form 990-N (income under $50,000 a year)", "03": "Group return", "04": "Form 990-BL (black lung trust)",
    "06": "Not required (church)", "07": "Government 501(c)(1)", "13": "Not required (religious organization)", "14": "Not required (state or local instrumentality)", "00": "Not required",
  }) },
  { col: "PF_FILING_REQ_CD", label: "Files 990-PF?", help: "Whether it files the private foundation return", decode: pick({ "1": "Yes", "0": "No" }) },
  { col: "ACCT_PD", label: "Fiscal year ends", help: "Month its accounting year ends", decode: (v) => (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 12 ? MONTHS[Number(v) - 1] : v) },
  { col: "ASSET_AMT", label: "Total assets", help: "Book value of assets at year end, latest return", decode: dollars, used: true },
  { col: "INCOME_AMT", label: "Income", help: "IRS-computed gross income, latest return", decode: dollars },
  { col: "REVENUE_AMT", label: "Revenue", help: "Total revenue, latest Form 990 / 990-EZ", decode: dollars, used: true },
  { col: "NTEE_CD", label: "Cause (NTEE)", help: "National Taxonomy of Exempt Entities code", decode: (v) => (v ? `${nteeLabel(v) ?? "Other"} (${v})` : "Not assigned"), used: true },
  { col: "SORT_NAME", label: "Also known as", help: "Secondary name, chapter or trade name" },
];

// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

type File = { header: string[]; rows: string[][]; lines: string[]; fetchedAt: Date };
const cache = new Map<string, Promise<File>>();
const TTL = 24 * 3600_000;

// Fetch and parse one state's file from irs.gov; cached in memory for a day.
export function loadBmf(state: string): Promise<File> {
  const key = state.toUpperCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const res = await fetch(bmfFileUrl(key), { headers: { "User-Agent": "NomBot (Institute on Generosity)" }, cache: "no-store" });
    if (!res.ok) throw new Error(`IRS returned ${res.status} for eo_${key.toLowerCase()}.csv`);
    const text = await res.text();
    const [header, ...rows] = parseCsv(text).filter((r) => r.length > 1);
    const lines = text.split(/\r?\n/).slice(1);
    return { header, rows, lines, fetchedAt: new Date() };
  })();
  cache.set(key, p);
  p.then(() => setTimeout(() => cache.delete(key), TTL).unref?.(), () => cache.delete(key));
  return p;
}
