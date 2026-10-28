// One-page memos (Oct 28, advisor research brief sections 12 and 13): the data for a one-org brief and a 2 to 4 org
// options memo. Facts and fixed-rule text only, no AI. Rendered as a print page (app/memo, US Letter) and as an
// editable Word file (lib/briefDocx). Every figure carries its year.
import { readable, orgTitle, titleCase } from "../components/text";
import { loadCompare, type Compared } from "./compare";
import { db } from "./db";
import { prettyTitle } from "./flag";
import { formName, getOrg } from "./org";
import { GRANT_YEARS } from "./placeReport";
import { vetting, type Question } from "./vetting";

const money = (n: number) => { const a = Math.abs(n); return `${n < 0 ? "−" : ""}$${a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}K` : Math.round(a)}`; };
const yy = (a: number, b: number) => (a === b ? String(a) : `${a}–${String(b).slice(2)}`);
const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`);
export const MEMO_FOOTER = "Prepared with NomBot by the Institute on Generosity, from public IRS filings.";
// "Prepared by": what the user typed, trimmed to a short plain line
export const preparedBy = (raw: string | null | undefined) => (raw ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80) || null;

export type KeyNumber = { label: string; value: string; year: string };
export type OrgBrief = {
  ein: string; name: string; place: string; type: string; track: string; mission: string | null;
  numbers: KeyNumber[];
  funders: { name: string; usd: string }[]; fundersYears: string;
  leaders: { name: string; title: string; pay: string | null }[]; leadersYear: number | null;
  signals: string[]; signalsYear: number | null; signalsForm: string | null;
  questions: Question[];
  sources: string[];
};

export async function orgBrief(einRaw: string): Promise<OrgBrief | null> {
  const o = await getOrg(einRaw);
  if (!o) return null;
  const ein = o.ein.replace(/\D/g, "");
  const [v, { rows: funders }, { rows: leaders }, { rows: [given] }, { rows: [pf] }] = await Promise.all([
    vetting(o),
    db.query(`SELECT max(f.name) AS name, sum(g.amount)::float8 AS usd FROM grant_clean g LEFT JOIN funders f ON f.ein = g.funder_ein
      WHERE g.recipient_ein = $1 AND g.tax_year BETWEEN $2 AND $3 GROUP BY g.funder_ein ORDER BY 2 DESC LIMIT 3`, [ein, ...GRANT_YEARS]),
    db.query(`SELECT name, title, pay, tax_year FROM board_members WHERE ein = $1 AND tax_year = (SELECT max(tax_year) FROM board_members WHERE ein = $1)
      ORDER BY pay DESC NULLS LAST, name LIMIT 3`, [ein]),
    db.query(`SELECT coalesce(sum(amount), 0)::float8 AS usd, count(DISTINCT funder_ein)::int AS n FROM grant_clean WHERE recipient_ein = $1 AND tax_year BETWEEN $2 AND $3`, [ein, ...GRANT_YEARS]),
    // A private foundation: its own giving (Form 990-PF), the figures a grantee or co-funder asks about
    db.query(`SELECT f.assets::float8 AS assets, f.grants_paid::float8 AS paid, f.tax_year, (SELECT coalesce(sum(amount), 0)::float8 FROM grant_clean WHERE funder_ein = $1 AND tax_year BETWEEN $2 AND $3) AS given,
        (SELECT count(DISTINCT recipient_ein)::int FROM grant_clean WHERE funder_ein = $1 AND tax_year BETWEEN $2 AND $3) AS grantees FROM funders f WHERE f.ein = $1`, [ein, ...GRANT_YEARS]),
  ]);
  const d = o.flag;
  const y0 = o.years[0];
  // Income and spending from one return (the newest 990 Part I) when there is one, so the two never mix years
  const cy = (label: string) => d?.compare.find((c) => c.label === label)?.now;
  const inc = cy("Income"), spend = cy("Spending");
  const same = inc != null && spend != null && d?.year;
  const withExp = o.years.find((y) => y.expenses != null);
  const numbers: KeyNumber[] = pf ? [
    pf.assets != null ? { label: "Assets", value: money(Number(pf.assets)), year: `990-PF ${pf.tax_year}` } : null,
    pf.paid != null ? { label: "Grants paid", value: money(Number(pf.paid)), year: `990-PF ${pf.tax_year}` } : null,
    { label: "Grants given", value: money(Number(pf.given)), year: yy(...GRANT_YEARS) },
    { label: "Grantees", value: Number(pf.grantees).toLocaleString("en-US"), year: yy(...GRANT_YEARS) },
  ].filter((x): x is KeyNumber => !!x) : [
    same ? { label: "Income", value: money(inc!), year: `${formName(d!.form)} ${d!.year}` } : y0 ? { label: "Income", value: money(y0.revenue), year: String(y0.year) } : null,
    same ? { label: "Spending", value: money(spend!), year: `${formName(d!.form)} ${d!.year}` } : withExp ? { label: "Spending", value: money(withExp.expenses!), year: String(withExp.year) } : null,
    d?.cashMonths != null && d.year ? { label: "Cash on hand", value: d.cashMonths >= 12 ? `${(d.cashMonths / 12).toFixed(1)} years` : `${d.cashMonths < 1 ? "<1" : Math.round(d.cashMonths)} months`, year: `${formName(d.form)} ${d.year}` } : (y0?.assets != null ? { label: "Assets", value: money(y0.assets), year: String(y0.year) } : null),
    { label: "Foundation grants received", value: Number(given?.usd) > 0 ? money(Number(given.usd)) : "None found", year: Number(given?.usd) > 0 ? `${yy(...GRANT_YEARS)} · ${given.n} funder${given.n === 1 ? "" : "s"}` : yy(...GRANT_YEARS) },
  ].filter((x): x is KeyNumber => !!x);
  const signals = (d?.rating.signals ?? []).filter((s) => s.level !== "ok").map((s) => `${s.label}: ${s.note}`)
    // Governance "no" answers, unless the Insiders signal already says them
    .concat((d?.checks ?? []).filter((c) => !c.ok && !c.minor && !(["insider_loan", "excess_benefit", "business_with_insiders", "diversion_of_assets"].includes(c.key) && d?.rating.signals.some((x) => x.key === "insiders" && x.level !== "ok"))).map((c) => c.label)).slice(0, 5);
  return {
    ein: o.ein, name: orgTitle(o.name),
    place: [o.city && titleCase(o.city), o.state].filter(Boolean).join(", "),
    type: [o.status.kind ?? "Public charity", o.ntee?.label].filter(Boolean).join(" · "),
    track: v.track.text,
    mission: o.mission ? clip(readable(o.mission, [o.name]).replace(/\s+/g, " "), 320) : null,
    numbers,
    funders: funders.filter((r) => r.name).map((r) => ({ name: orgTitle(String(r.name)), usd: money(Number(r.usd)) })),
    fundersYears: yy(...GRANT_YEARS),
    leaders: leaders.map((r) => ({ name: titleCase(String(r.name)), title: r.title ? prettyTitle(String(r.title)) : "", pay: Number(r.pay) > 0 ? money(Number(r.pay)) : null })),
    leadersYear: leaders[0]?.tax_year ?? null,
    signals: signals.length ? signals : d ? [`No warning signs in its newest Form ${formName(d.form)}`] : pf ? ["Files Form 990-PF, which has no governance checklist like the Form 990's"] : ["No e-filed Form 990 with these checks on record"],
    signalsYear: d?.year ?? null, signalsForm: d ? formName(d.form) : null,
    questions: v.questions,
    sources: [
      d?.year ? `Form ${formName(d.form)} for tax year ${d.year} (finances, board, policies)` : null,
      y0 ? `Income by year from the ${y0.source} and IRS SOI extracts` : null,
      pf ? `Assets, grants paid and grants given from its Form 990-PF filings` : null,
      `Foundation grants from Form 990-PF filings, ${yy(...GRANT_YEARS)}`,
      o.age != null ? "Tax-exempt since: the IRS ruling date in the exempt organization master file" : null,
    ].filter((x): x is string => !!x),
  };
}

// ------------------------------------------------------------------ options memo (Compare)
export type OptionsMemo = {
  orgs: { ein: string; name: string; place: string; year: string }[];
  rows: { label: string; cells: string[] }[];
  takeaways: string[];
  grantYears: string;
};
const months = (v: number) => (v >= 12 ? `${(v / 12).toFixed(1)} years` : `${v < 1 ? "<1" : Math.round(v)} months`);
export async function optionsMemo(eins: string[]): Promise<OptionsMemo | null> {
  const orgs = await loadCompare(eins);
  if (orgs.length < 2) return null;
  const g = yy(...GRANT_YEARS);
  const v = (o: Compared) => o.vet;
  const rows: OptionsMemo["rows"] = [
    { label: "Place", cells: orgs.map((o) => [o.city && titleCase(o.city), o.state].filter(Boolean).join(", ") || "Not reported") },
    { label: "Tax-exempt since", cells: orgs.map((o) => o.ruling ?? "Not reported") },
    { label: "Income", cells: orgs.map((o) => (v(o).revenue != null ? money(v(o).revenue!) : "Not reported")) },
    { label: "Spending", cells: orgs.map((o) => (v(o).expenses != null ? money(v(o).expenses!) : "Not reported")) },
    { label: "Surplus or deficit", cells: orgs.map((o) => (v(o).surplus != null ? `${v(o).surplus! < 0 ? "−" : "+"}${money(Math.abs(v(o).surplus!))}` : "Not reported")) },
    { label: "Cash on hand", cells: orgs.map((o) => (v(o).monthsCash != null ? months(v(o).monthsCash!) : "Not reported")) },
    { label: "Spent on programs", cells: orgs.map((o) => (v(o).programRatio != null ? `${Math.round(v(o).programRatio! * 100)}%` : "Not reported")) },
    { label: `Foundation grants, ${g}`, cells: orgs.map((o) => (v(o).foundationGrants > 0 ? `${money(v(o).foundationGrants)} from ${v(o).foundationFunders}` : "None found")) },
    { label: "Staff", cells: orgs.map((o) => (o.team?.staff != null ? o.team.staff.toLocaleString("en-US") : "Not reported")) },
  ];
  return {
    orgs: orgs.map((o) => ({ ein: o.ein, name: orgTitle(o.name), place: [o.city && titleCase(o.city), o.state].filter(Boolean).join(", "), year: v(o).year ? `Figures from ${v(o).year}${v(o).form ? ` (${formName(v(o).form!)})` : ""}` : "No filing figures" })),
    rows, takeaways: takeaways(orgs), grantYears: g,
  };
}
// 2 or 3 lines computed from the numbers (no claims beyond them)
export function takeaways(orgs: Compared[]): string[] {
  const n = (o: Compared) => orgTitle(o.name);
  const out: string[] = [];
  const withRev = orgs.filter((o) => o.vet.revenue != null).sort((a, b) => b.vet.revenue! - a.vet.revenue!);
  if (withRev.length >= 2) out.push(`${n(withRev[0])} is the largest by income (${money(withRev[0].vet.revenue!)}, ${withRev[0].vet.year}), ${n(withRev.at(-1)!)} the smallest (${money(withRev.at(-1)!.vet.revenue!)}).`);
  // One clause per org with a watch item, so a name is never repeated
  const watch = orgs.map((o) => {
    const w = [(o.vet.surplus ?? 0) < 0 ? "ran a deficit" : null, o.vet.monthsCash != null && o.vet.monthsCash < 3 ? "had under 3 months of cash" : null].filter(Boolean);
    return w.length ? `${n(o)} ${w.join(" and ")}` : null;
  }).filter((x): x is string => !!x);
  if (watch.length) out.push(`In the latest full year, ${watch.join(", and ")}.`.replace(/, The /g, ", the ").replace(/^In the latest full year, The /, "In the latest full year, the "));
  else if (orgs.some((o) => o.vet.surplus != null)) out.push("None ran a deficit in its latest full year.");
  const funded = [...orgs].sort((a, b) => b.vet.foundationFunders - a.vet.foundationFunders);
  if (funded[0].vet.foundationFunders > 0) out.push(`${n(funded[0])} has the most foundation funders (${funded[0].vet.foundationFunders}, ${yy(...GRANT_YEARS)})${funded.some((o) => o.vet.foundationFunders === 0) ? `, ${funded.filter((o) => o.vet.foundationFunders === 0).map(n).join(" and ")} none found` : ""}.`);
  return out.slice(0, 3);
}
