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
  checks: Check[];                                                         // Part VI + IV, only answered ones
  people: Person[];
  rating: Rating;
};
// Overall financial health, Strong / Medium / Weak, by fixed rules (no AI): any "weak" signal makes it
// Weak; two or more "watch" signals make it Medium. RULES is shown on the page so the rating can be checked.
// ask: a question worth putting to the organization, for signals that need context rather than a verdict.
export type Signal = { key: "revenue" | "result" | "cash" | "debt" | "funding" | "board" | "insiders"; label: string; level: "ok" | "watch" | "weak"; note: string; ask?: string };
export type Rating = { level: "Strong" | "Medium" | "Weak"; signals: Signal[] };
// A governance answer as a plain sentence: label already says it passed or failed (ok).
export type Check = { key: string; label: string; ok: boolean; minor?: boolean };
export const RULES = [
  "Income: down 10%+ is watch, down 25%+ is weak",
  "Bottom line: a deficit is watch; a deficit two years in a row, over 10% of income this year, is weak",
  "Cash: under 3 months of spending is watch, under 1 month is weak",
  "Debts: over half of what it owns is watch, more than it owns is weak",
  "Donations: 90%+ of income from gifts and grants is watch",
  "Board: under half independent is watch",
  "Insiders: loans, excess benefits or business with leaders is watch; money used for the wrong purpose is weak",
];
export function diligence(r: FlagRow, url: string | null): Diligence {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  const pairs: [string, string, string][] = [["Income", "cy_revenue", "py_revenue"], ["Spending", "cy_expenses", "py_expenses"],
    ["Gifts and grants", "cy_contributions", "py_contributions"], ["Fees for services", "cy_program_revenue", "py_program_revenue"], ["Staff pay and benefits", "cy_salaries", "py_salaries"]];
  const exp = n("cy_expenses");
  // Each 990 yes/no answer in plain words: [990 field, answer that's good, sentence if good, sentence if not].
  const yes = (k: string, good: boolean, okText: string, badText: string): Check | null =>
    r[k] == null ? null : { key: k, ok: Boolean(r[k]) === good, label: Boolean(r[k]) === good ? okText : badText };
  const checks = [
    yes("audited", true, "Books checked by an outside auditor", "Books not checked by an outside auditor"),
    yes("conflict_policy", true, "Has a conflict-of-interest policy", "No conflict-of-interest policy"),
    yes("whistleblower_policy", true, "Protects staff who report problems", "No policy protecting staff who report problems"),
    yes("family_business_ties", false, "No family or business ties among leaders", "Family or business ties among leaders"),
    yes("insider_loan", false, "No loans to or from leaders", "Loans to or from leaders"),
    yes("excess_benefit", false, "No one paid more than fair value", "Someone was paid more than fair value"),
    yes("business_with_insiders", false, "No business deals with leaders", "Business deals with leaders"),
    yes("diversion_of_assets", false, "No money used for the wrong purpose", "Reports money used for the wrong purpose"),
  ].filter((c): c is Check => c !== null)
    // Audits are usually required only for larger budgets: not being audited under $1M isn't a red flag.
    .map((c) => (c.key === "audited" && !c.ok && (n("cy_revenue") ?? 0) < 1_000_000 ? { ...c, minor: true } : c));
  return {
    year: n("tax_year"), form: String(r.form), url,
    compare: pairs.map(([label, cy, py]) => ({ label, now: n(cy) ?? NaN, before: n(py), income: !/Spending|Staff pay/.test(label) })).filter((c) => !Number.isNaN(c.now) && (c.now !== 0 || (c.before ?? 0) !== 0)),
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
    s.push({ key: "revenue", label: "Income", level: c <= -0.25 ? "weak" : c <= -0.1 ? "watch" : "ok", note: c < 0 ? `down ${pct(c)} from last year` : `up ${pct(c)} from last year`,
      ...(c <= -0.1 && { ask: "Ask what changed: a one-time grant ending, or a lasting drop?" }) });
  }
  // One deficit year is often a choice (spending reserves on a crisis or a new program), so it's only
  // watch; deficits that repeat are the structural problem funders look for.
  if (rev && rev > 0 && exp != null) {
    const m = (rev - exp) / rev;
    const pexp = n("py_expenses");
    const pm = prev && prev > 0 && pexp != null ? (prev - pexp) / prev : null;
    const spentMore = pexp && pexp > 0 && (exp - pexp) / pexp >= 0.1 ? ` (its spending rose ${pct((exp - pexp) / pexp)})` : "";
    if (m >= 0) s.push({ key: "result", label: "Bottom line", level: "ok", note: m < 0.005 ? "broke even" : `took in ${pct(m)} more than it spent` });
    else if (pm != null && pm < 0) s.push({ key: "result", label: "Bottom line", level: m < -0.1 ? "weak" : "watch", note: `spent more than it took in two years in a row (${pct(m)} of income this year, ${pct(pm)} last year)`,
      ask: "Ask how they plan to close the gap, and what they would cut if it continues." });
    else s.push({ key: "result", label: "Bottom line", level: "watch", note: `spent ${pct(m)} more than it took in${spentMore}${pm != null ? ", after a surplus last year" : ""}`,
      ask: "A single deficit can be planned, like spending savings on a crisis. Ask what it paid for and how they'll cover it." });
  }
  const cash = n("cash");
  if (cash != null && exp && exp > 0) {
    const mo = cash / (exp / 12);
    s.push({ key: "cash", label: "Cash", level: mo < 1 ? "weak" : mo < 3 ? "watch" : "ok", note: `enough for ${mo >= 12 ? `${(mo / 12).toFixed(1)} years` : `${Math.max(0, Math.round(mo))} ${Math.round(mo) === 1 ? "month" : "months"}`} of spending`,
      ...(mo < 3 && { ask: "Ask how they would get through a few slow months." }) });
  }
  const assets = n("total_assets"), debt = n("total_liabilities");
  if (assets && assets > 0 && debt != null) {
    const d = debt / assets;
    s.push({ key: "debt", label: "Debts", level: d > 1 ? "weak" : d > 0.5 ? "watch" : "ok", note: d > 1 ? `owes more than it owns (${pct(d)})` : `owes ${pct(d)} of what it owns` });
  }
  const gifts = n("cy_contributions");
  if (gifts != null && rev && rev > 0) {
    const g = Math.min(1, gifts / rev);
    s.push({ key: "funding", label: "Donations", level: g >= 0.9 ? "watch" : "ok", note: `${pct(g)} of income is gifts and grants` });
  }
  const members = n("voting_members"), indep = n("independent_members");
  if (members && indep != null) s.push({ key: "board", label: "Board", level: indep < members / 2 ? "watch" : "ok", note: `${indep} of ${members} members are independent (no pay or family ties)` });
  const insider = ["insider_loan", "excess_benefit", "business_with_insiders"].filter((k) => r[k] === true);
  if (r.diversion_of_assets === true) s.push({ key: "insiders", label: "Insiders", level: "weak", note: "reports money used for the wrong purpose" });
  else if (insider.length) s.push({ key: "insiders", label: "Insiders", level: "watch", note: insider.map((k) => ({ insider_loan: "loans with its leaders", excess_benefit: "someone paid more than fair value", business_with_insiders: "business deals with its leaders" })[k]).join(", ") });
  else if (r.insider_loan === false) s.push({ key: "insiders", label: "Insiders", level: "ok", note: "no loans or deals with its leaders" });
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
