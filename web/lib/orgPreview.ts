// The org hover card's data (Oct 27): a few facts about one organization or foundation, no AI text. Cached per EIN.
//   GET /api/org-preview/[ein]
import { orgName } from "../components/text";
import { db } from "./db";
import { memo } from "./memo";
import { nteeLabel } from "./ntee";
import { GRANT_YEARS } from "./placeReport";

export type OrgPreview = {
  ein: string; name: string; place: string | null; type: "Private foundation" | "Public charity" | "Organization";
  mission: string | null; latestYear: number | null; href: string;
  stats: { label: string; value: number; kind: "money" | "count" }[];
  causes: string[]; // top causes it funds (foundations) or its own cause (charities)
};

const clip = (t: string, n = 140) => (t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`);
const sentence = (t: string) => { const s = t.replace(/\s+/g, " ").trim(); return /[A-Z]/.test(s) && s === s.toUpperCase() ? s[0] + s.slice(1).toLowerCase() : s.charAt(0).toUpperCase() + s.slice(1); };

async function build(ein: string): Promise<OrgPreview | null> {
  const [{ rows: [o] }, { rows: [f] }, { rows: [t] }] = await Promise.all([
    db.query(`SELECT ein, name, city, state, ntee_cd, revenue_amt, asset_amt, left(tax_period, 4) AS yr FROM orgs WHERE ein = $1`, [ein]),
    db.query(`SELECT name, city, state, assets, tax_year FROM funders WHERE ein = $1`, [ein]),
    db.query(`SELECT mission, programs, tax_year FROM filing_text WHERE ein = $1 ORDER BY tax_year DESC NULLS LAST LIMIT 1`, [ein]),
  ]);
  if (!o && !f) return null;
  const isPf = Boolean(f);
  const stats: OrgPreview["stats"] = [];
  let causes: string[] = [];
  if (isPf) {
    const [{ rows: [g] }, { rows: top }] = await Promise.all([
      db.query(`SELECT coalesce(sum(amount), 0)::float8 AS usd, count(DISTINCT recipient_ein)::int AS grantees FROM grant_clean WHERE funder_ein = $1 AND tax_year BETWEEN $2 AND $3`, [ein, ...GRANT_YEARS]),
      db.query(`SELECT left(recipient_ntee, 1) AS k, sum(amount)::float8 AS usd FROM grant_clean WHERE funder_ein = $1 AND tax_year BETWEEN $2 AND $3 AND recipient_ntee IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 3`, [ein, ...GRANT_YEARS]),
    ]);
    if (g?.usd > 0) stats.push({ label: `given ${GRANT_YEARS[0]}–${String(GRANT_YEARS[1]).slice(2)}`, value: Number(g.usd), kind: "money" });
    if (f.assets != null) stats.push({ label: "assets", value: Number(f.assets), kind: "money" });
    if (g?.grantees > 0) stats.push({ label: "grantees", value: g.grantees, kind: "count" });
    causes = top.map((r) => nteeLabel(r.k) ?? r.k).filter(Boolean);
  } else if (o) {
    if (o.revenue_amt != null) stats.push({ label: "yearly income", value: Number(o.revenue_amt), kind: "money" });
    if (o.asset_amt != null && Number(o.asset_amt) > 0) stats.push({ label: "assets", value: Number(o.asset_amt), kind: "money" });
    const c = o.ntee_cd ? nteeLabel(o.ntee_cd) ?? nteeLabel(o.ntee_cd[0]) : null;
    causes = c ? [c] : [];
  }
  const raw = t?.mission || t?.programs || null;
  const name = orgName(o?.name ?? f.name, 80);
  const city = o?.city ?? f?.city, state = o?.state ?? f?.state;
  return {
    ein, name, place: [city && orgName(city, 40), state].filter(Boolean).join(", ") || null,
    type: isPf ? "Private foundation" : o ? "Public charity" : "Organization",
    mission: raw ? clip(sentence(raw)) : null,
    latestYear: Number(t?.tax_year ?? f?.tax_year ?? o?.yr) || null,
    href: `/org/${ein}`, stats: stats.slice(0, 3), causes,
  };
}

const cached = memo<OrgPreview | null>("org-preview:v1", 2000, 3600_000);
export function orgPreview(ein: string) {
  const e = ein.replace(/\D/g, "");
  if (!/^\d{9}$/.test(e)) return Promise.resolve(null);
  return cached(e, () => build(e));
}
