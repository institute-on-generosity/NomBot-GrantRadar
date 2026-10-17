// Money in and out of one organization from the grant sources, each kept separate because they overlap:
//   foundations  990-PF grants received (grants.recipient_ein), tax years
//   charities    Schedule I grants received from public charities (charity_grants.recipient_ein), tax years,
//                split by funder type (charity_funder_profile.funder_class: DAF sponsor, community foundation ...)
//   federal      USAspending grants and cooperative agreements (federal_awards.recipient_ein), federal fiscal years
//   given        what this organization reported paying: Schedule I (charity_grants.funder_ein) and 990-PF (grants.funder_ein),
//                plus Schedule I money reported but not itemized (charity_filers.not_itemized_usd, generosity-data 050)
// Schedule I lines that name no recipient ("SEE ATTACHED", "VARIOUS": is_placeholder_recipient()) are never grants to
// or from a named organization here. They count in the filer's not-itemized amount instead.
// Every query runs on an index on the EIN column (recipient_ein partial indexes, funder_ein indexes).
import { db } from "./db";

export type YearTotal = { year: number; n: number; total: number };
export type Funder = { ein: string; name: string; n: number; total: number; latest: number; kind?: string | null };
export type Recipient = { ein: string | null; name: string; city: string | null; state: string | null; n: number; total: number; latest: number };

export const FUNDER_CLASS: Record<string, string> = {
  daf_sponsor: "Donor-advised fund sponsor",
  community_foundation: "Community foundation",
  united_way: "United Way",
  other: "Other charity",
};

export type OrgFunding = Awaited<ReturnType<typeof orgFunding>>;

const TOP = 25;
const num = (v: unknown) => Number(v ?? 0);
const years = (rows: { year: number; n: number; total: string }[]): YearTotal[] => rows.map((r) => ({ year: Number(r.year), n: r.n, total: num(r.total) }));
const sum = (ys: YearTotal[]) => ys.reduce((a, y) => a + y.total, 0);
const count = (ys: YearTotal[]) => ys.reduce((a, y) => a + y.n, 0);

export async function orgFunding(ein: string) {
  const q = <T,>(sql: string) => db.query(sql, [ein]).then((r) => r.rows as T[]);
  const [pfYears, pfTop, ciYears, ciClass, ciTop, fedYears, fedAgency, fedProgram, fedPlace, fedAwards, siYears, siTop, pfGivenYears, pfGivenTop] = await Promise.all([
    q<{ year: number; n: number; total: string }>(
      `SELECT tax_year AS year, count(*)::int AS n, sum(amount)::bigint AS total FROM grants
        WHERE recipient_ein = $1 AND tax_year IS NOT NULL GROUP BY 1 ORDER BY 1 DESC`),
    q<{ ein: string; name: string; n: number; total: string; latest: number }>(
      `SELECT g.funder_ein AS ein, min(f.name) AS name, count(*)::int AS n, sum(g.amount)::bigint AS total, max(g.tax_year) AS latest
         FROM grants g JOIN funders f ON f.ein = g.funder_ein
        WHERE g.recipient_ein = $1 GROUP BY 1 ORDER BY total DESC NULLS LAST LIMIT ${TOP + 1}`),
    q<{ year: number; n: number; total: string }>(
      `SELECT tax_year AS year, count(*)::int AS n, sum(amount)::bigint AS total FROM charity_grants
        WHERE recipient_ein = $1 AND funder_ein <> $1 AND tax_year IS NOT NULL AND NOT is_placeholder_recipient(recipient_name) GROUP BY 1 ORDER BY 1 DESC`),
    q<{ kind: string; n: number; total: string; funders: number }>(
      `SELECT coalesce(fp.funder_class, 'other') AS kind, count(*)::int AS n, sum(c.amount)::bigint AS total, count(DISTINCT c.funder_ein)::int AS funders
         FROM charity_grants c LEFT JOIN charity_funder_profile fp ON fp.ein = c.funder_ein
        WHERE c.recipient_ein = $1 AND c.funder_ein <> $1 AND NOT is_placeholder_recipient(c.recipient_name) GROUP BY 1 ORDER BY total DESC NULLS LAST`),
    q<{ ein: string; name: string; n: number; total: string; latest: number; kind: string | null }>(
      `SELECT c.funder_ein AS ein, coalesce(min(o.name), min(fp.name)) AS name, min(fp.funder_class) AS kind,
              count(*)::int AS n, sum(c.amount)::bigint AS total, max(c.tax_year) AS latest
         FROM charity_grants c LEFT JOIN charity_funder_profile fp ON fp.ein = c.funder_ein LEFT JOIN orgs o ON o.ein = c.funder_ein
        WHERE c.recipient_ein = $1 AND c.funder_ein <> $1 AND NOT is_placeholder_recipient(c.recipient_name) GROUP BY 1 ORDER BY total DESC NULLS LAST LIMIT ${TOP + 1}`),
    q<{ year: number; n: number; total: string }>(
      `SELECT fiscal_year AS year, count(*)::int AS n, sum(amount)::bigint AS total FROM federal_awards
        WHERE recipient_ein = $1 GROUP BY 1 ORDER BY 1 DESC`),
    q<{ name: string; n: number; total: string }>(
      `SELECT coalesce(agency_name, 'Unknown agency') AS name, count(DISTINCT award_key)::int AS n, sum(amount)::bigint AS total FROM federal_awards
        WHERE recipient_ein = $1 GROUP BY 1 ORDER BY total DESC NULLS LAST`),
    q<{ cfda: string | null; title: string | null; agency: string | null; n: number; total: string }>(
      `SELECT cfda_number AS cfda, min(cfda_title) AS title, min(agency_name) AS agency, count(DISTINCT award_key)::int AS n, sum(amount)::bigint AS total
         FROM federal_awards WHERE recipient_ein = $1 GROUP BY 1 ORDER BY total DESC NULLS LAST LIMIT ${TOP + 1}`),
    q<{ place: string; total: string }>(
      `SELECT CASE WHEN pop_state IS NOT NULL THEN pop_state WHEN upper(pop_scope) = 'FOREIGN' THEN 'Abroad' ELSE 'Several states' END AS place,
              sum(amount)::bigint AS total
         FROM federal_awards WHERE recipient_ein = $1 GROUP BY 1 ORDER BY total DESC NULLS LAST`),
    q<{ awards: number }>(`SELECT count(DISTINCT award_key)::int AS awards FROM federal_awards WHERE recipient_ein = $1`),
    // Schedule I given: lines naming a recipient, the return's own Part IX line 1 total (grants to domestic
    // organizations) and what's reported but not itemized (line 1 minus named lines, placeholders inside it)
    q<{ year: number; n: number; total: string; line1: string | null; not_itemized: string | null }>(
      `SELECT year, coalesce(y.n, 0) AS n, coalesce(y.total, 0) AS total, f.line1, f.not_itemized FROM
         (SELECT tax_year AS year, count(*)::int AS n, sum(amount)::bigint AS total FROM charity_grants
           WHERE funder_ein = $1 AND tax_year IS NOT NULL AND NOT is_placeholder_recipient(recipient_name) GROUP BY 1) y
         FULL JOIN (SELECT tax_year AS year, sum(grants_domestic)::bigint AS line1, sum(not_itemized_usd)::bigint AS not_itemized
                      FROM charity_filers WHERE ein = $1 GROUP BY 1) f USING (year)
        WHERE coalesce(y.n, 0) > 0 OR coalesce(f.not_itemized, 0) > 0
        ORDER BY year DESC`),
    q<{ ein: string | null; name: string; city: string | null; state: string | null; n: number; total: string; latest: number }>(
      `SELECT recipient_ein AS ein, coalesce(min(o.name), min(c.recipient_name)) AS name, min(c.recipient_city) AS city, min(c.recipient_state) AS state,
              count(*)::int AS n, sum(c.amount)::bigint AS total, max(c.tax_year) AS latest
         FROM charity_grants c LEFT JOIN orgs o ON o.ein = c.recipient_ein
        WHERE c.funder_ein = $1 AND NOT is_placeholder_recipient(c.recipient_name)
        GROUP BY recipient_ein, CASE WHEN recipient_ein IS NULL THEN upper(c.recipient_name) END
        ORDER BY total DESC NULLS LAST LIMIT ${TOP + 1}`),
    q<{ year: number; n: number; total: string }>(
      `SELECT tax_year AS year, count(*)::int AS n, sum(amount)::bigint AS total FROM grants
        WHERE funder_ein = $1 AND tax_year IS NOT NULL GROUP BY 1 ORDER BY 1 DESC`),
    q<{ ein: string | null; name: string; city: string | null; state: string | null; n: number; total: string; latest: number }>(
      `SELECT recipient_ein AS ein, coalesce(min(o.name), min(g.recipient_name)) AS name, min(g.recipient_city) AS city, min(g.recipient_state) AS state,
              count(*)::int AS n, sum(g.amount)::bigint AS total, max(g.tax_year) AS latest
         FROM grants g LEFT JOIN orgs o ON o.ein = g.recipient_ein
        WHERE g.funder_ein = $1
        GROUP BY recipient_ein, CASE WHEN recipient_ein IS NULL THEN upper(g.recipient_name) END
        ORDER BY total DESC NULLS LAST LIMIT ${TOP + 1}`),
  ]);

  const funders = (rows: typeof ciTop) => rows.slice(0, TOP).map((r) => ({ ein: r.ein, name: r.name, n: r.n, total: num(r.total), latest: Number(r.latest), kind: r.kind ?? null }));
  const recipients = (rows: typeof siTop): Recipient[] => rows.slice(0, TOP).map((r) => ({ ein: r.ein, name: r.name, city: r.city, state: r.state, n: r.n, total: num(r.total), latest: Number(r.latest) }));

  const pfY = years(pfYears), ciY = years(ciYears), fedY = years(fedYears), pfgY = years(pfGivenYears);
  const siY = siYears.map((r) => ({ year: Number(r.year), n: r.n, total: num(r.total), line1: r.line1 == null ? null : num(r.line1), notItemized: num(r.not_itemized) }));
  return {
    foundations: pfY.length ? { total: sum(pfY), n: count(pfY), years: pfY, top: funders(pfTop.map((r) => ({ ...r, kind: null }))), more: pfTop.length > TOP } : null,
    charities: ciY.length
      ? {
          total: sum(ciY), n: count(ciY), years: ciY,
          byKind: ciClass.map((c) => ({ kind: c.kind, label: FUNDER_CLASS[c.kind] ?? c.kind, n: c.n, funders: c.funders, total: num(c.total) })),
          top: funders(ciTop), more: ciTop.length > TOP,
        }
      : null,
    federal: fedY.length
      ? {
          total: sum(fedY), awards: fedAwards[0]?.awards ?? 0, years: fedY,
          agencies: fedAgency.map((a) => ({ name: a.name, n: a.n, total: num(a.total) })),
          programs: fedProgram.slice(0, TOP).map((p) => ({ cfda: p.cfda, title: p.title, agency: p.agency, n: p.n, total: num(p.total) })),
          places: fedPlace.map((p) => ({ place: p.place, total: num(p.total) })),
          more: fedProgram.length > TOP,
        }
      : null,
    given: {
      scheduleI: siY.length
        ? { total: sum(siY), n: count(siY), notItemized: siY.reduce((a, y) => a + y.notItemized, 0), years: siY, top: recipients(siTop), more: siTop.length > TOP }
        : null,
      foundation: pfgY.length ? { total: sum(pfgY), n: count(pfgY), years: pfgY, top: recipients(pfGivenTop), more: pfGivenTop.length > TOP } : null,
    },
  };
}

// Caveats shown with the numbers (UI and API), one per source.
export const FUNDING_NOTES = {
  foundations: "Grants private foundations list on Form 990-PF, linked to this EIN by reported EIN, name and address. Tax years. Some grants are not linked, so totals can be low.",
  charities: "Grants public charities list on Form 990 Schedule I (over $5,000 per recipient), linked to this EIN. Tax years. A multi-year grant can appear as installments in several years.",
  federal: "Direct federal grants and cooperative agreements from USAspending, by federal fiscal year (October to September), not tax year. Net obligations, so a year can be negative. Linked by name and place.",
  given: "What this organization reported paying. Schedule I lists grants over $5,000 per recipient. Not itemized is the return's Part IX line 1 total minus the grants listed by name, including lines such as \"SEE ATTACHED\" or \"VARIOUS\" that name no recipient. That money has no recipient, so NomBot's totals by cause and place leave it out.",
  overlap: "The sources overlap. A donor-advised fund grant can start as a foundation grant to the sponsor, and federal money passed through a charity shows in both. Do not add the columns together.",
};
