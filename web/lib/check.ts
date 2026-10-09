// "How funders will see you": a nonprofit looks itself up (name or EIN) and sees the FLAG diligence a
// foundation would run on its newest e-filed 990 (lib/flag, same rules as NomBot's org page), plus
// what to prepare for each concern.
import { titleCase } from "../components/text";
import { db } from "./db";
import { diligence, type Diligence, type FlagRow, type Signal } from "./flag";

export type Found = { ein: string; name: string; place: string; filed: boolean };

// Name search (trigram on the normalized name) or an exact EIN; filers of an e-filed 990 first.
export async function findOrgs(q: string): Promise<Found[]> {
  const digits = q.replace(/\D/g, "");
  const { rows } = digits.length === 9
    ? await db.query(`SELECT ein, name, city, state FROM orgs WHERE ein = $1`, [digits])
    : await db.query(
      `SELECT o.ein, o.name, o.city, o.state FROM orgs o
       WHERE org_norm(o.name) % org_norm($1) OR o.name ILIKE '%' || $1 || '%'
       ORDER BY (EXISTS (SELECT 1 FROM filing_flag f WHERE f.ein = o.ein)) DESC, similarity(org_norm(o.name), org_norm($1)) DESC LIMIT 8`, [q.trim()]);
  const { rows: filed } = await db.query(`SELECT DISTINCT ein FROM filing_flag WHERE ein = ANY($1)`, [rows.map((r) => r.ein)]);
  const has = new Set(filed.map((r) => r.ein as string));
  return rows.map((r) => ({ ein: r.ein, name: titleCase(r.name), place: [r.city && titleCase(r.city), r.state].filter(Boolean).join(", "), filed: has.has(r.ein) }));
}

export type Check = { ein: string; name: string; place: string; d: Diligence; prepare: { topic: string; ask: string }[] };

// What a program officer will likely ask about each concern, and what to have ready.
const PREPARE: Record<string, string> = {
  Revenue: "Explain the drop in revenue and what replaces it this year.",
  Result: "Show how next year's budget closes the deficit.",
  Cash: "Have a cash plan: months of runway today and your reserve goal.",
  Liabilities: "Explain what you owe and how you'll pay it down.",
  Funding: "Show you're widening your funding base: number of funders, earned income.",
  Board: "Add independent board members, or explain who sits on the board and why.",
  Insiders: "Disclose insider transactions and how the board reviewed them.",
};

export async function getCheck(einParam: string): Promise<Check | null> {
  const ein = einParam.replace(/\D/g, "");
  if (ein.length !== 9) return null;
  const [{ rows: [o] }, { rows: [f] }] = await Promise.all([
    db.query(`SELECT ein, name, city, state FROM orgs WHERE ein = $1`, [ein]),
    db.query(`SELECT * FROM filing_flag WHERE ein = $1 ORDER BY tax_year DESC NULLS LAST LIMIT 1`, [ein]),
  ]);
  if (!o || !f) return null;
  const d = diligence(f as FlagRow, `https://projects.propublica.org/nonprofits/organizations/${ein}/${f.object_id}/full`);
  const concerns = d.rating.signals.filter((s: Signal) => s.level !== "ok").sort((a, b) => Number(a.level === "watch") - Number(b.level === "watch")); // weak first
  const prepare = [
    ...concerns.map((s) => ({ topic: `${s.label}: ${s.note}`, ask: PREPARE[s.label] })),
    ...d.checks.filter((c) => !c.ok && !c.minor).map((c) => ({ topic: c.label.replace(/^No /, "Reports ").replace("Financial statements audited", "Financial statements not audited").replace(/ policy$/, " policy missing"), ask: c.label.includes("audited") ? "Get an audit or an independent review; most foundations expect one at your size." : c.label.includes("policy") ? `Adopt a ${c.label.toLowerCase().replace(/^no /, "")} and note it in your next 990.` : "Be ready to explain this and how the board handled it." })),
  ];
  return { ein: `${ein.slice(0, 2)}-${ein.slice(2)}`, name: titleCase(o.name), place: [o.city && titleCase(o.city), o.state].filter(Boolean).join(", "), d, prepare };
}
