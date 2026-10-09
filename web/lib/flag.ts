// FLAG diligence (Financial, Legal and Governance) from one e-filed 990 / 990-EZ row of generosity-data's
// filing_flag table, by fixed rules. Shared by NomBot's org page and GrantRadar's "How funders see you".
// This year vs last year (Part I), liquidity and spending (Parts X, IX), where the money comes from
// (Part I + VIII), board and policies (Part VI), insider flags (Part IV) and the people who lead it (Part VII).
export type FlagRow = Record<string, string | number | boolean | null | Person[]>;
export type Person = { name: string; title: string; hours: number; pay: number; other: number; role: string };
export type Diligence = {
  year: number | null; form: string; url: string | null;
  compare: { label: string; now: number; before: number | null; income: boolean }[]; // Part I CY vs PY
  cashMonths: number | null; programShare: number | null; debtShare: number | null;
  spending: { program: number; admin: number; fundraising: number } | null;  // Part IX shares of total expenses
  income: { year: number | null; total: number; parts: { key: string; label: string; amount: number }[]; gifts: number } | null; // Part I + VIII 1e
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
export function diligence(r: FlagRow, url: string | null): Diligence {
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
    spending: exp && exp > 0 && n("program_expenses") != null && n("management_expenses") != null
      ? { program: n("program_expenses")! / exp, admin: n("management_expenses")! / exp, fundraising: (n("fundraising_expenses") ?? 0) / exp } : null,
    income: incomeOf(r),
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

// Where the money comes from, from the 990 itself: government grants (Part VIII 1e) split out of
// gifts and grants, program fees, and the rest (investments, events, sales, other).
function incomeOf(r: FlagRow) {
  const n = (k: string) => Math.max(0, Number(r[k] ?? 0) || 0);
  const total = Number(r.cy_revenue ?? 0);
  if (!(total > 0) || r.cy_contributions == null) return null;
  const gov = Math.min(n("government_grants"), n("cy_contributions"));
  const known = [
    { key: "gov", label: "Government grants", amount: gov },
    { key: "gifts", label: "Gifts and private grants", amount: n("cy_contributions") - gov },
    { key: "program", label: "Program fees and contracts", amount: n("cy_program_revenue") },
  ];
  const other = Math.max(0, total - known.reduce((a, p) => a + p.amount, 0));
  return { year: r.tax_year == null ? null : Number(r.tax_year), total, parts: [...known, { key: "other", label: "Investments and other", amount: other }].filter((p) => p.amount > 0), gifts: Math.min(1, n("cy_contributions") / total) };
}

// Officer titles as filers type them: e-file software often cuts them at 12 characters ("CHIEF EXEC O",
// "VICE-PRESIDE") and they're full of abbreviations ("ASST. TREAS/"). Expand both for display.
const ABBR: Record<string, string> = {
  EXEC: "Executive", EXECUTIVE: "Executive", DIR: "Director", ASST: "Assistant", TREAS: "Treasurer", SEC: "Secretary", SECY: "Secretary",
  PRES: "President", VP: "Vice President", MGR: "Manager", ADMIN: "Administrator", COORD: "Coordinator", DEV: "Development",
  OFF: "Officer", OFCR: "Officer", CHMN: "Chairman", BD: "Board", MBR: "Member", MEM: "Member", OPS: "Operations", FIN: "Finance",
};
const WORDS = ["Officer", "Executive", "Director", "President", "Treasurer", "Secretary", "Assistant", "Chairman", "Chair", "Member",
  "Trustee", "Manager", "Coordinator", "Administrator", "Operating", "Operations", "Financial", "Finance", "Development", "Program", "Vice", "Board", "Former"];
const KEEP = new Set(["CEO", "CFO", "COO", "CIO", "CTO", "CDO", "ED", "II", "III"]);
export function prettyTitle(raw: string) {
  const t = raw.trim();
  if (!t) return t;
  const cut = t.length >= 11; // likely truncated at the e-file limit: complete the last word
  const parts = t.split(/([\s/&,-]+)/);
  const lastWord = parts.map((p, i) => (/\w/.test(p) ? i : -1)).filter((i) => i >= 0).pop();
  return parts.map((p, i) => {
    if (!/\w/.test(p)) return p.replace(/\s*\/\s*/g, " / ").replace(/\s*&\s*/g, " & ");
    const w = p.replace(/\.$/, "").toUpperCase();
    if (KEEP.has(w)) return w;
    if (ABBR[w]) return ABBR[w];
    if (cut && i === lastWord && !WORDS.some((x) => x.toUpperCase() === w)) { const full = WORDS.find((x) => x.toUpperCase().startsWith(w)); if (full) return full; }
    if (i > 0 && ["OF", "AND", "THE", "FOR"].includes(w)) return w.toLowerCase();
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join("").replace(/\s*\/\s*$/, "").trim();
}
