// People on nonprofit and foundation boards (generosity-data migration 018: board_members, person_key()).
// A person is matched by first + last name (person_key), so two people with one name can merge:
// pages group seats by state and say so.
import { db } from "./db";
import { nteeLabel } from "./ntee";

export type Seat = {
  ein: string; org: string; city: string | null; state: string | null; foundation: boolean;
  name: string; title: string | null; year: number | null; pay: number; hours: number | null;
  cause: string | null; revenue: number | null; assets: number | null; grantsPaid: number | null; filing: string | null;
};

// "Darren Walker", "Dr. Ai-jen Poo": 2 to 5 words of letters. Topic searches ("food banks in Ohio")
// usually have more words or match nobody, and the results page offers a way back to a topic search.
export function looksLikeName(q: string) {
  const words = q.trim().split(/\s+/);
  return /^[\p{L}][\p{L}.'\- ]{2,60}$/u.test(q.trim()) && words.length >= 2 && words.length <= 5;
}

// Every board seat for a name, one per organization (its newest return), foundations first, with the
// organization's size and cause and a link to the return the seat comes from.
export async function personSeats(name: string): Promise<{ key: string | null; seats: Seat[] }> {
  const { rows } = await db.query(
    `WITH k AS (SELECT person_key($1) AS key)
     SELECT DISTINCT ON (b.ein) k.key, b.ein, coalesce(o.name, f.name) AS org, coalesce(o.city, f.city) AS city,
            coalesce(o.state, f.state, b.state) AS state, (f.ein IS NOT NULL) AS foundation,
            b.name, b.title, b.tax_year AS year, coalesce(b.pay, 0)::float8 AS pay, b.hours, b.object_id,
            o.ntee_cd, o.revenue_amt::float8 AS revenue, coalesce(f.assets, o.asset_amt)::float8 AS assets, f.grants_paid::float8 AS grants_paid
     FROM k JOIN board_members b ON b.person_key = k.key
     LEFT JOIN orgs o ON o.ein = b.ein LEFT JOIN funders f ON f.ein = b.ein
     ORDER BY b.ein, b.tax_year DESC NULLS LAST, b.pay DESC NULLS LAST
     LIMIT 300`,
    [name]);
  const seats: Seat[] = rows.map((r) => ({
    ein: r.ein, org: r.org ?? r.ein, city: r.city, state: r.state, foundation: r.foundation,
    name: r.name, title: r.title, year: r.year, pay: Number(r.pay), hours: r.hours == null ? null : Number(r.hours),
    cause: r.ntee_cd ? nteeLabel(r.ntee_cd) : null, revenue: r.revenue, assets: r.assets, grantsPaid: r.grants_paid,
    filing: r.object_id ? `https://projects.propublica.org/nonprofits/organizations/${r.ein}/${r.object_id}/full` : null,
  }));
  seats.sort((a, b) => Number(b.foundation) - Number(a.foundation) || (a.state ?? "").localeCompare(b.state ?? "") || a.org.localeCompare(b.org));
  return { key: rows[0]?.key ?? null, seats };
}

export type Profile = {
  key: string | null; seats: Seat[];
  giving: { ein: string; org: string; total: number; grants: number; years: string; top: { ein: string | null; name: string; amount: number; grants: number }[] }[];
  peers: { name: string; shared: { ein: string; org: string }[] }[];   // people on 2+ of the same boards
  between: { from: string; fromOrg: string; to: string; toOrg: string; amount: number; grants: number }[]; // grants between their boards
};

// Everything we can say about one person from IRS filings: seats, what the foundations they help lead
// give and to whom, who they keep serving with, and money moving between the boards they sit on.
export async function personProfile(name: string): Promise<Profile> {
  const { key, seats } = await personSeats(name);
  if (!key || !seats.length) return { key, seats, giving: [], peers: [], between: [] };
  const eins = seats.map((s) => s.ein), funders = seats.filter((s) => s.foundation).map((s) => s.ein);
  const orgName = new Map(seats.map((s) => [s.ein, s.org]));
  const [giving, peers, between] = await Promise.all([
    funders.length ? db.query(
      `WITH g AS (SELECT funder_ein, recipient_ein, max(recipient_name) AS name, sum(amount)::float8 AS amount, count(*)::int AS grants
                  FROM grants WHERE funder_ein = ANY($1) GROUP BY funder_ein, recipient_ein, CASE WHEN recipient_ein IS NULL THEN recipient_name END),
            t AS (SELECT funder_ein, sum(amount)::float8 AS total, sum(grants)::int AS grants FROM g GROUP BY 1),
            y AS (SELECT funder_ein, min(tax_year) || '–' || max(tax_year) AS years FROM grants WHERE funder_ein = ANY($1) GROUP BY 1),
            r AS (SELECT g.*, row_number() OVER (PARTITION BY funder_ein ORDER BY amount DESC NULLS LAST) AS n FROM g)
       SELECT t.funder_ein, t.total, t.grants, y.years,
              json_agg(json_build_object('ein', r.recipient_ein, 'name', coalesce(o.name, r.name), 'amount', r.amount, 'grants', r.grants) ORDER BY r.amount DESC NULLS LAST) AS top
       FROM t JOIN y USING (funder_ein) JOIN r USING (funder_ein) LEFT JOIN orgs o ON o.ein = r.recipient_ein
       WHERE r.n <= 5 GROUP BY t.funder_ein, t.total, t.grants, y.years ORDER BY t.total DESC NULLS LAST`, [funders]) : { rows: [] },
    db.query(
      `SELECT min(b.name) AS name, json_agg(DISTINCT jsonb_build_object('ein', b.ein)) AS shared
       FROM board_members b WHERE b.ein = ANY($1) AND b.person_key IS NOT NULL AND b.person_key <> $2
       GROUP BY b.person_key HAVING count(DISTINCT b.ein) >= 2
       ORDER BY count(DISTINCT b.ein) DESC, min(b.name) LIMIT 12`, [eins, key]),
    eins.length > 1 ? db.query(
      `SELECT funder_ein, recipient_ein, sum(amount)::float8 AS amount, count(*)::int AS grants FROM grants
       WHERE funder_ein = ANY($1) AND recipient_ein = ANY($1) AND recipient_ein <> funder_ein
       GROUP BY 1, 2 ORDER BY amount DESC NULLS LAST LIMIT 10`, [eins]) : { rows: [] },
  ]);
  return {
    key, seats,
    giving: giving.rows.map((r) => ({ ein: r.funder_ein, org: orgName.get(r.funder_ein) ?? r.funder_ein, total: Number(r.total ?? 0), grants: r.grants, years: r.years, top: r.top })),
    peers: peers.rows.map((r) => ({ name: r.name, shared: (r.shared as { ein: string }[]).map((x) => ({ ein: x.ein, org: orgName.get(x.ein) ?? x.ein })) })),
    between: between.rows.map((r) => ({ from: r.funder_ein, fromOrg: orgName.get(r.funder_ein) ?? r.funder_ein, to: r.recipient_ein, toOrg: orgName.get(r.recipient_ein) ?? r.recipient_ein, amount: Number(r.amount ?? 0), grants: r.grants })),
  };
}

export type BoardLink = { name: string; title: string | null; others: { ein: string; org: string; foundation: boolean; title: string | null }[] };

// People on this organization's board who also sit on other boards in its state. Names on more than
// 8 boards there are skipped: those are usually different people sharing a common name.
export async function boardLinks(ein: string): Promise<BoardLink[]> {
  const { rows } = await db.query(
    `WITH me AS (SELECT DISTINCT ON (person_key) person_key, name, title FROM board_members WHERE ein = $1 AND person_key IS NOT NULL),
          st AS (SELECT coalesce((SELECT state FROM orgs WHERE ein = $1), (SELECT state FROM funders WHERE ein = $1)) AS s),
          seat AS (  -- one row per (person, other organization), even when they hold two titles there
            SELECT DISTINCT ON (me.person_key, b.ein) me.person_key, me.name, me.title, b.ein,
                   coalesce(f.name, o.name, b.ein) AS org, f.ein IS NOT NULL AS foundation, b.title AS other_title
            FROM me JOIN board_members b ON b.person_key = me.person_key AND b.ein <> $1
            LEFT JOIN orgs o ON o.ein = b.ein LEFT JOIN funders f ON f.ein = b.ein
            CROSS JOIN st
            WHERE coalesce(o.state, f.state) = st.s
            ORDER BY me.person_key, b.ein, b.tax_year DESC NULLS LAST)
     SELECT name, title, json_agg(json_build_object('ein', ein, 'org', org, 'foundation', foundation, 'title', other_title) ORDER BY foundation DESC, org) AS others
     FROM seat GROUP BY person_key, name, title
     HAVING count(*) <= 8
     ORDER BY count(*) DESC, name
     LIMIT 15`,
    [ein]);
  return rows.map((r) => ({ name: r.name, title: r.title, others: r.others as BoardLink["others"] }));
}
