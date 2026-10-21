// Who received foundation grant dollars: US nonprofits, or governments, public universities, international bodies and
// companies (generosity-data 079, grants.recipient_type). The tag covers UNLINKED grants only (no EIN, no NCES or IPEDS
// match, no recipient_kind). Linked recipients are classed cheaply by kind:
//   school districts matched to NCES (recipient_entity nces:)          -> government
//   public colleges matched to IPEDS (recipient_entity, college_public) -> public university
//   grants linked by EIN to an EIN that IPEDS lists for a public college -> public university
//   every other linked recipient (private colleges included)             -> nonprofit
// Research totals are unchanged: this only splits them (grant_clean scope: 2012-2025, amount > 0, US organizations).
//
// grant_cube has no recipient_type column, so the tagged and EIN-public-college rows are summed straight from grants
// for each filter: generosity-data 080 (grants_recipient_type_idx, partial, tax_year INCLUDE the filter columns) makes
// the tagged part an index-only scan, and the public-college part uses grants_recipient_idx (~70 ms warm together).
import { db } from "./db";

export type WhoKey = "nonprofit" | "government" | "public_university" | "international" | "company" | "unidentified";
export const WHO_KEYS: WhoKey[] = ["nonprofit", "government", "public_university", "international", "company", "unidentified"];
export const WHO_NAME: Record<WhoKey, string> = {
  nonprofit: "Linked nonprofits",
  government: "Governments",
  public_university: "Public universities",
  international: "International bodies",
  company: "Companies",
  unidentified: "Unidentified",
};
// The one-line rule shown with every split (UI and API). Plain words, no semicolons or dashes.
export const WHO_NOTE = "Linked nonprofits have an EIN match and include private colleges. Governments are recipients named as a government body plus school districts matched to NCES. Public universities are public colleges matched to IPEDS by name or EIN plus state college systems. International bodies are the World Bank group, development banks and UN agencies. Types for unlinked recipients come from their names (graded 146 of 150 right on a fresh sample, top 50 by dollars 50 of 50). Unidentified grants have no match and no type.";

export type WhoFilter = { from: number; to: number; states: string[]; area: "rural" | "urban" | null; fb: [number, number] | null; ftype: string | null };
// Dollars per kind for the filter. k: a recipient_type, or "ein_public_college" (EIN-linked to an IPEDS public college,
// counted inside the cube's nonprofit). add() binds a parameter and returns its placeholder. recipient_type is only set
// while a grant is unlinked (079 apply_recipient_types clears it on link), so the tagged part needs no link columns.
export function whoTaggedSql(f: WhoFilter, add: (v: unknown) => string): string {
  const yr = `g.tax_year BETWEEN ${add(f.from)} AND ${add(f.to)} AND g.amount > 0`;
  const outer: string[] = [];
  if (f.states.length) outer.push(`x.recipient_state = ANY(${add(f.states)}::text[])`);
  if (f.area) outer.push(`x.recipient_zip IS NOT NULL AND left(x.recipient_zip, 5)::char(5) IN (SELECT z.zip5 FROM zip_regions z JOIN county_need cn ON cn.county_fips = z.county_fips WHERE cn.population ${f.area === "rural" ? "<" : ">="} 50000)`);
  // Funders missing from funder_profile count as type 'other', as in grant_cube.
  if (f.fb) outer.push(`fp.asset_band BETWEEN ${add(f.fb[0])} AND ${add(f.fb[1])}`);
  if (f.ftype) outer.push(`coalesce(fp.funder_type, 'other') = ${add(f.ftype)}`);
  return `SELECT x.k, sum(x.amount)::float8 AS usd
FROM (SELECT g.recipient_state, g.recipient_zip, g.funder_ein, g.amount, g.recipient_type AS k
        FROM grants g
       WHERE g.recipient_type IS NOT NULL AND ${yr}
      UNION ALL
      SELECT g.recipient_state, g.recipient_zip, g.funder_ein, g.amount, 'ein_public_college'
        FROM grants g
       WHERE g.recipient_ein IN (SELECT ein FROM public_entities WHERE kind = 'college_public' AND ein IS NOT NULL)
         AND g.recipient_entity IS NULL AND g.recipient_kind IS NULL AND ${yr}) x${f.fb || f.ftype ? "\nLEFT JOIN funder_profile fp ON fp.ein = x.funder_ein" : ""}
WHERE ${outer.length ? outer.join("\n  AND ") : "true"}
GROUP BY 1`;
}
export async function whoTagged(f: WhoFilter): Promise<Record<string, number>> {
  const vals: unknown[] = [];
  const r = await db.query<{ k: string; usd: number }>(whoTaggedSql(f, (v) => { vals.push(v); return `$${vals.length}`; }), vals);
  return Object.fromEntries(r.rows.map((x) => [x.k, Number(x.usd)]));
}

export type WhoPart = { key: WhoKey; label: string; usd: number; share: number };
export type Who = { total: number; parts: WhoPart[]; public_share: number; other_share: number; nonprofit_link_rate: number; all_link_rate: number; note: string };
// The split from the cube's kinds (nonprofit, school_district, college_public, college_private, unidentified, with
// linked $) and the tagged sums. all_link_rate: EIN-linked $ over all $. nonprofit_link_rate: linked nonprofit $ over
// all $ minus what went to governments, public universities, international bodies and companies.
export function whoSplit(kinds: { k: string; usd: number; linked_usd: number }[], tagged: Record<string, number>): Who | null {
  const by = (k: string) => kinds.filter((r) => r.k === k).reduce((a, r) => a + r.usd, 0);
  const total = kinds.reduce((a, r) => a + r.usd, 0);
  if (total <= 0) return null;
  const t = (k: string) => tagged[k] ?? 0;
  const einCollege = Math.min(t("ein_public_college"), by("nonprofit"));
  const tagSum = t("government") + t("public_university") + t("international") + t("company");
  const usd: Record<WhoKey, number> = {
    nonprofit: by("nonprofit") - einCollege + by("college_private"),
    government: by("school_district") + t("government"),
    public_university: by("college_public") + einCollege + t("public_university"),
    international: t("international"),
    company: t("company"),
    unidentified: Math.max(0, by("unidentified") - tagSum),
  };
  const parts = WHO_KEYS.map((key) => ({ key, label: WHO_NAME[key], usd: usd[key], share: usd[key] / total }));
  const linked = kinds.reduce((a, r) => a + r.linked_usd, 0);
  const notNonprofit = usd.government + usd.public_university + usd.international + usd.company;
  return {
    total, parts,
    public_share: (usd.government + usd.public_university) / total,
    other_share: (usd.international + usd.company) / total,
    all_link_rate: linked / total,
    nonprofit_link_rate: usd.nonprofit / Math.max(1, total - notNonprofit),
    note: WHO_NOTE,
  };
}
