// Money in and out of one organization from the grant sources, each kept separate because they overlap:
//   foundations  990-PF grants received (grants.recipient_ein), tax years
//   charities    Schedule I grants received from public charities (charity_grants.recipient_ein), tax years,
//                split by funder type (charity_funder_profile.funder_class: DAF sponsor, community foundation ...)
//   federal      USAspending grants and cooperative agreements (federal_awards.recipient_ein), federal fiscal years
//   given        what this organization reported paying: Schedule I (charity_grants.funder_ein) and 990-PF (grants.funder_ein),
//                plus Schedule I money reported but not itemized (charity_filers.not_itemized_usd, generosity-data 050)
// Schedule I lines that name no recipient ("SEE ATTACHED", "VARIOUS": is_placeholder_recipient()) are never grants to
// or from a named organization here. They count in the filer's not-itemized amount instead.
// Non-cash transfers between related organizations (restructurings, mergers, transfers of assets) and a few hand-checked
// reporting errors (grant_transfers, generosity-data 067) are left out of grants received and given and shown on their own.
// Every query runs on an index on the EIN column (recipient_ein partial indexes, funder_ein indexes). Grants given
// read per-funder rollups (generosity-data 051: org_given_year, org_given_top), refreshed by refresh_research_layer().
import { db } from "./db";
import { WHO_NAME } from "./recipientTypes";

export type YearTotal = { year: number; n: number; total: number };
export type Funder = { ein: string; name: string; n: number; total: number; latest: number; kind?: string | null };
export type Recipient = { ein: string | null; name: string; city: string | null; state: string | null; n: number; total: number; latest: number };
export type Transfer = { id: number; year: number; ein: string | null; name: string; amount: number; cash: number; noncash: number; kind: "transfer" | "error"; reason: string };
// Schedule I lines left out of grant totals (generosity-data 067, grant_transfers), as SQL to AND onto a charity_grants alias.
export const NOT_TRANSFER = (alias: string) => `NOT EXISTS (SELECT 1 FROM grant_transfers t WHERE t.source = 'si' AND t.id = ${alias}.id)`;

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
  const pfTypeP = pfGivenTypes(ein);
  const [pfYears, pfTop, ciYears, ciClass, ciTop, fedYears, fedAgency, fedProgram, fedPlace, fedAwards, siYears, siTop, pfGivenYears, pfGivenTop, xfer] = await Promise.all([
    q<{ year: number; n: number; total: string }>(
      `SELECT tax_year AS year, count(*)::int AS n, sum(amount)::bigint AS total FROM grants
        WHERE recipient_ein = $1 AND tax_year IS NOT NULL GROUP BY 1 ORDER BY 1 DESC`),
    q<{ ein: string; name: string; n: number; total: string; latest: number }>(
      `SELECT g.funder_ein AS ein, min(f.name) AS name, count(*)::int AS n, sum(g.amount)::bigint AS total, max(g.tax_year) AS latest
         FROM grants g JOIN funders f ON f.ein = g.funder_ein
        WHERE g.recipient_ein = $1 GROUP BY 1 ORDER BY total DESC NULLS LAST LIMIT ${TOP + 1}`),
    q<{ year: number; n: number; total: string }>(
      `SELECT c.tax_year AS year, count(*)::int AS n, sum(c.amount)::bigint AS total FROM charity_grants c
        WHERE c.recipient_ein = $1 AND c.funder_ein <> $1 AND c.tax_year IS NOT NULL AND NOT is_placeholder_recipient(c.recipient_name) AND ${NOT_TRANSFER("c")}
        GROUP BY 1 ORDER BY 1 DESC`),
    q<{ kind: string; n: number; total: string; funders: number }>(
      `SELECT coalesce(fp.funder_class, 'other') AS kind, count(*)::int AS n, sum(c.amount)::bigint AS total, count(DISTINCT c.funder_ein)::int AS funders
         FROM charity_grants c LEFT JOIN charity_funder_profile fp ON fp.ein = c.funder_ein
        WHERE c.recipient_ein = $1 AND c.funder_ein <> $1 AND NOT is_placeholder_recipient(c.recipient_name) AND ${NOT_TRANSFER("c")} GROUP BY 1 ORDER BY total DESC NULLS LAST`),
    q<{ ein: string; name: string; n: number; total: string; latest: number; kind: string | null }>(
      `SELECT c.funder_ein AS ein, coalesce(min(o.name), min(fp.name)) AS name, min(fp.funder_class) AS kind,
              count(*)::int AS n, sum(c.amount)::bigint AS total, max(c.tax_year) AS latest
         FROM charity_grants c LEFT JOIN charity_funder_profile fp ON fp.ein = c.funder_ein LEFT JOIN orgs o ON o.ein = c.funder_ein
        WHERE c.recipient_ein = $1 AND c.funder_ein <> $1 AND NOT is_placeholder_recipient(c.recipient_name) AND ${NOT_TRANSFER("c")}
        GROUP BY 1 ORDER BY total DESC NULLS LAST LIMIT ${TOP + 1}`),
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
    // organizations), what's reported but not itemized (line 1 minus named lines, placeholders inside it) and
    // transfers to related organizations left out of the listed total (generosity-data 067)
    q<{ year: number; n: number; total: string; line1: string | null; not_itemized: string | null; transfers: string }>(
      `SELECT year, coalesce(y.n, 0) AS n, coalesce(y.total, 0) AS total, f.line1, f.not_itemized, coalesce(t.transfers, 0) AS transfers FROM
         (SELECT year, n, total FROM org_given_year WHERE ein = $1 AND source = 'si') y
         FULL JOIN (SELECT tax_year AS year, sum(grants_domestic)::bigint AS line1, sum(not_itemized_usd)::bigint AS not_itemized
                      FROM charity_filers WHERE ein = $1 GROUP BY 1) f USING (year)
         FULL JOIN (SELECT tax_year AS year, sum(amount)::bigint AS transfers FROM grant_transfers WHERE funder_ein = $1 GROUP BY 1) t USING (year)
        WHERE coalesce(y.n, 0) > 0 OR coalesce(f.not_itemized, 0) > 0 OR coalesce(t.transfers, 0) > 0
        ORDER BY year DESC`),
    givenTop(ein, "si"),
    q<{ year: number; n: number; total: string }>(
      `SELECT year, n, total FROM org_given_year WHERE ein = $1 AND source = 'pf' ORDER BY 1 DESC`),
    givenTop(ein, "pf"),
    // Transfers to or from this organization left out of grant totals (generosity-data 067)
    q<{ id: string; year: number; funder_ein: string; funder: string | null; recipient_ein: string | null; recipient: string; amount: string; cash: string | null; noncash: string | null; kind: "transfer" | "error"; reason: string }>(
      `SELECT t.id, t.tax_year AS year, t.funder_ein, coalesce(o.name, fp.name) AS funder, t.recipient_ein, coalesce(r.name, t.recipient_name) AS recipient,
              t.amount, t.cash, t.noncash, t.kind, t.reason
         FROM grant_transfers t LEFT JOIN orgs o ON o.ein = t.funder_ein LEFT JOIN charity_funder_profile fp ON fp.ein = t.funder_ein
         LEFT JOIN orgs r ON r.ein = t.recipient_ein
        WHERE t.source = 'si' AND (t.funder_ein = $1 OR t.recipient_ein = $1) ORDER BY t.amount DESC`),
  ]);

  const funders = (rows: typeof ciTop) => rows.slice(0, TOP).map((r) => ({ ein: r.ein, name: r.name, n: r.n, total: num(r.total), latest: Number(r.latest), kind: r.kind ?? null }));
  const recipients = (rows: typeof siTop): Recipient[] => rows.slice(0, TOP).map((r) => ({ ein: r.ein, name: r.name, city: r.city, state: r.state, n: r.n, total: num(r.total), latest: Number(r.latest) }));

  const pfY = years(pfYears), ciY = years(ciYears), fedY = years(fedYears), pfgY = years(pfGivenYears);
  const siY = siYears.map((r) => ({ year: Number(r.year), n: r.n, total: num(r.total), line1: r.line1 == null ? null : num(r.line1), notItemized: num(r.not_itemized), transfers: num(r.transfers) }));
  const transfer = (r: (typeof xfer)[number], side: "funder" | "recipient"): Transfer => ({
    id: Number(r.id), year: Number(r.year), ein: side === "funder" ? r.funder_ein : r.recipient_ein, name: (side === "funder" ? r.funder : r.recipient) ?? r.funder_ein,
    amount: num(r.amount), cash: num(r.cash), noncash: num(r.noncash), kind: r.kind, reason: r.reason,
  });
  const pfTypes = await pfTypeP;
  const xIn = xfer.filter((r) => r.recipient_ein === ein && r.funder_ein !== ein).map((r) => transfer(r, "funder"));
  const xOut = xfer.filter((r) => r.funder_ein === ein).map((r) => transfer(r, "recipient"));
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
        ? { total: sum(siY), n: count(siY), notItemized: siY.reduce((a, y) => a + y.notItemized, 0), transfers: siY.reduce((a, y) => a + y.transfers, 0), years: siY, top: recipients(siTop), more: siTop.length > TOP }
        : null,
      foundation: pfgY.length ? { total: sum(pfgY), n: count(pfgY), years: pfgY, top: recipients(pfGivenTop), more: pfGivenTop.length > TOP, byType: pfTypes } : null,
    },
    // Schedule I transfers between related organizations, left out of every total above
    transfers: xIn.length || xOut.length ? { received: xIn, given: xOut } : null,
  };
}

// Top recipients of what this organization gave. Funders with 1,000+ lines in a source (Fidelity Charitable: ~308K)
// read the precomputed top 26 (generosity-data 051, org_given_top); the rest group their own lines, the same way.
type RecipientRow = { ein: string | null; name: string; city: string | null; state: string | null; n: number; total: string; latest: number };
const GIVEN_LINES = {
  si: `SELECT c.recipient_ein, c.recipient_name, c.recipient_city, c.recipient_state, c.amount, c.tax_year FROM charity_grants c
        WHERE c.funder_ein = $1 AND NOT is_placeholder_recipient(c.recipient_name) AND ${NOT_TRANSFER("c")}`,
  pf: `SELECT g.recipient_ein, g.recipient_name, g.recipient_city, g.recipient_state, g.amount, g.tax_year FROM grants g WHERE g.funder_ein = $1`,
};
async function givenTop(ein: string, source: "si" | "pf"): Promise<RecipientRow[]> {
  const pre = await db.query(
    `SELECT recipient_ein AS ein, name, city, state, n, total, latest FROM org_given_top WHERE ein = $1 AND source = $2 ORDER BY rank`, [ein, source]);
  if (pre.rows.length) return pre.rows as RecipientRow[];
  const live = await db.query(
    `SELECT l.recipient_ein AS ein, coalesce(min(o.name), min(l.recipient_name)) AS name, min(l.recipient_city) AS city, min(l.recipient_state) AS state,
            count(*)::int AS n, sum(l.amount)::bigint AS total, max(l.tax_year) AS latest
       FROM (${GIVEN_LINES[source]}) l LEFT JOIN orgs o ON o.ein = l.recipient_ein
      GROUP BY l.recipient_ein, CASE WHEN l.recipient_ein IS NULL THEN upper(l.recipient_name) END
      ORDER BY total DESC NULLS LAST, ein, name LIMIT ${TOP + 1}`, [ein]);
  return live.rows as RecipientRow[];
}

// 990-PF grants given split by who received them (generosity-data 079, lib/recipientTypes): linked nonprofits,
// governments (school districts and named government bodies), public universities (IPEDS public colleges by match or
// EIN, state systems), international bodies, companies, foreign addresses, other lines (individuals, unnamed) and
// unidentified. Sums to the foundation's 990-PF total. One pass over its grants on grants_funder_idx (~50 ms warm).
export type GivenType = { type: string; label: string; n: number; total: number; share: number; top: { name: string; total: number }[] };
const GIVEN_TYPE_LABEL: Record<string, string> = { ...WHO_NAME, foreign: "Foreign addresses", other: "Individuals and unnamed lines" };
const GIVEN_TYPE_ORDER = ["nonprofit", "government", "public_university", "international", "company", "foreign", "other", "unidentified"];
async function pfGivenTypes(ein: string): Promise<GivenType[]> {
  const r = await db.query<{ k: string; name: string; n: number; total: string }>(
    `WITH l AS (
       SELECT CASE WHEN g.recipient_kind = 'foreign' THEN 'foreign'
                   WHEN g.recipient_kind IS NOT NULL THEN 'other'
                   WHEN pe.kind = 'school_district' THEN 'government'
                   WHEN pe.kind = 'college_public' OR pc.ein IS NOT NULL THEN 'public_university'
                   WHEN g.recipient_type IS NOT NULL THEN g.recipient_type
                   WHEN g.recipient_ein IS NOT NULL OR pe.kind IS NOT NULL THEN 'nonprofit'
                   ELSE 'unidentified' END AS k,
              coalesce(g.recipient_entity, g.recipient_ein, upper(btrim(g.recipient_name))) AS who,
              coalesce(pe.name, g.recipient_name) AS name, g.amount
         FROM grants g
         LEFT JOIN public_entities pe ON pe.id = g.recipient_entity
         LEFT JOIN (SELECT DISTINCT ein FROM public_entities WHERE kind = 'college_public' AND ein IS NOT NULL) pc ON pc.ein = g.recipient_ein AND g.recipient_entity IS NULL
        WHERE g.funder_ein = $1 AND g.tax_year IS NOT NULL),
     w AS (SELECT k, who, min(name) AS name, count(*)::int AS n, coalesce(sum(amount), 0)::bigint AS total,
                  row_number() OVER (PARTITION BY k ORDER BY sum(amount) DESC NULLS LAST) AS rk
             FROM l GROUP BY k, who)
     SELECT k, NULL AS name, sum(n)::int AS n, sum(total)::bigint AS total FROM w GROUP BY k
     UNION ALL
     SELECT k, name, n, total FROM w WHERE rk <= 3 AND k IN ('government', 'public_university', 'international', 'company')`, [ein]);
  const sums = r.rows.filter((x) => x.name == null);
  const all = sums.reduce((a, x) => a + Number(x.total), 0);
  if (!sums.some((x) => ["government", "public_university", "international", "company"].includes(x.k))) return [];
  return GIVEN_TYPE_ORDER.flatMap((k) => {
    const s0 = sums.find((x) => x.k === k);
    if (!s0 || Number(s0.total) === 0) return [];
    const top = r.rows.filter((x) => x.k === k && x.name != null).map((x) => ({ name: x.name, total: Number(x.total) })).sort((a, z) => z.total - a.total);
    return [{ type: k, label: GIVEN_TYPE_LABEL[k] ?? k, n: Number(s0.n), total: Number(s0.total), share: all > 0 ? Number(s0.total) / all : 0, top }];
  });
}

// Caveats shown with the numbers (UI and API), one per source.
export const FUNDING_NOTES = {
  foundations: "Grants private foundations list on Form 990-PF, linked to this EIN by reported EIN, name and address. Tax years. Some grants are not linked, so totals can be low.",
  charities: "Grants public charities list on Form 990 Schedule I (over $5,000 per recipient), linked to this EIN. Tax years. A multi-year grant can appear as installments in several years.",
  federal: "Direct federal grants and cooperative agreements from USAspending, by federal fiscal year (October to September), not tax year. Net obligations, so a year can be negative. Linked by name and place.",
  types: "Who received this foundation's 990-PF grants. Types for unlinked recipients come from their names (generosity-data 079, graded 146 of 150 right). School districts and public colleges are matched to NCES and IPEDS lists, by name or EIN. Foreign addresses are recipients outside the US, often foreign NGOs. Shares are of every grant line listed, all years.",
  given: "What this organization reported paying. Schedule I lists grants over $5,000 per recipient. Not itemized is the return's Part IX line 1 total minus the grants listed by name, including lines such as \"SEE ATTACHED\" or \"VARIOUS\" that name no recipient. That money has no recipient, so NomBot's totals by cause and place leave it out.",
  transfers: "Schedule I lines that move assets between related organizations (a restructuring, merger, dissolution or a transfer to a subsidiary, parent or supporting organization), mostly non-cash, plus a few amounts that are clearly reporting errors. They are real lines on the return but not grantmaking, so NomBot leaves them out of grants received, grants given and every total by cause and place, and lists them here.",
  overlap: "The sources overlap. A donor-advised fund grant can start as a foundation grant to the sponsor, and federal money passed through a charity shows in both. Do not add the columns together.",
};
