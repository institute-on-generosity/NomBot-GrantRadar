// People on nonprofit and foundation boards (generosity-data migration 018: board_members, person_key()).
// A person is matched by first + last name (person_key) plus graded same-person merges (075: board_person_merges)
// and splits (078: board_person_splits, one name held by several people). Unsplit names can still be two people:
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

// Each seat's person key, as in generosity-data's board_person_canon view (078) without its full-table cost: a merged
// seat (075: board_person_merges, the same person under another name) takes the fuller name's key; a split seat (078:
// board_person_splits, one name held by several people, told apart by middle initial or Jr / Sr) takes its split key
// ("JOHN SMITH #A"); every other seat keeps person_key. `src` is a CTE of (ein, name); adds `${src}_k` (ein, name, key).
const keyed = (src: string) => `
    ${src}_m AS (
      SELECT x.ein, x.name, min((SELECT v.k FROM (VALUES (coalesce(pa.split_key, person_key(m.name_a))), (coalesce(pb.split_key, person_key(m.name_b)))) v(k)
                                 WHERE v.k IS NOT NULL ORDER BY length(split_part(v.k, ' ', 1)) DESC, v.k LIMIT 1)) AS k
      FROM (SELECT DISTINCT ein, name FROM ${src}) x
      JOIN board_person_merges m ON (m.ein_a = x.ein AND m.name_a = x.name) OR (m.ein_b = x.ein AND m.name_b = x.name)
      LEFT JOIN board_person_splits pa ON pa.ein = m.ein_a AND pa.name = m.name_a
      LEFT JOIN board_person_splits pb ON pb.ein = m.ein_b AND pb.name = m.name_b
      GROUP BY 1, 2),
    ${src}_k AS (
      SELECT DISTINCT x.ein, x.name, coalesce(mk.k, sp.split_key, person_key(x.name)) AS key
      FROM ${src} x LEFT JOIN ${src}_m mk ON mk.ein = x.ein AND mk.name = x.name
      LEFT JOIN board_person_splits sp ON sp.ein = x.ein AND sp.name = x.name)`;

// Every board seat for a name, one per organization, person key and spelling (its newest return), with the organization's size
// and cause and a link to the return the seat comes from. Seats join by person_key plus one step through
// board_person_merges, and each gets its key (keyed() above); personSeats then picks the person.
export const SEATS_SQL = `
    WITH q AS (SELECT person_key($1) AS key, person_middle($1) AS mid, person_suffix($1) AS sfx),
         s0 AS (SELECT b.ein, b.name FROM q JOIN board_members b ON b.person_key = q.key),
         s1 AS (SELECT ein, name FROM s0
                UNION SELECT m.ein_b, m.name_b FROM board_person_merges m JOIN s0 ON s0.ein = m.ein_a AND s0.name = m.name_a
                UNION SELECT m.ein_a, m.name_a FROM board_person_merges m JOIN s0 ON s0.ein = m.ein_b AND s0.name = m.name_b),
         ${keyed("s1")}
     SELECT DISTINCT ON (s.key, b.ein, b.name) q.key AS base, q.mid AS qmid, q.sfx AS qsfx, s.key, person_middle(b.name) AS mid, person_suffix(b.name) AS sfx,
            b.ein, coalesce(o.name, f.name) AS org, coalesce(o.city, f.city) AS city,
            coalesce(o.state, f.state, b.state) AS state, (f.ein IS NOT NULL) AS foundation,
            b.name, b.title, b.tax_year AS year, coalesce(b.pay, 0)::float8 AS pay, b.hours, b.object_id,
            o.ntee_cd, o.revenue_amt::float8 AS revenue, coalesce(f.assets, o.asset_amt)::float8 AS assets, f.grants_paid::float8 AS grants_paid
     FROM q CROSS JOIN s1_k s JOIN board_members b ON b.ein = s.ein AND b.name = s.name
     LEFT JOIN orgs o ON o.ein = b.ein LEFT JOIN funders f ON f.ein = b.ein
     WHERE s.key IS NOT NULL
     ORDER BY s.key, b.ein, b.name, b.tax_year DESC NULLS LAST, b.pay DESC NULLS LAST
     LIMIT 5000`;

// A split key's people: "A", "A/JR", "?/SR" (no middle initial, Sr), "A+C" (two initials kept as one person).
const splitParts = (key: string) => key.split(" #")[1]?.split("+").map((p) => { const [i, s] = p.split("/"); return { mid: i === "?" ? null : i, sfx: s ?? null }; }) ?? [];
const fitsSplit = (key: string, mid: string | null, sfx: string | null) =>
  splitParts(key).some((p) => (mid ? p.mid === mid : sfx ? true : false) && (!sfx || !p.sfx || p.sfx === sfx));

// Another person with the same name, for "Other people named …" (link: /person?name=…&ein=…).
export type Namesake = { name: string; ein: string; boards: number; states: string[]; noMiddle: boolean };

// One person's seats. With `ein`, the person holding that seat (links from org pages). Otherwise the name decides: a
// middle initial or Jr / Sr picks that person when the name is split (078); a bare name picks the person with the most
// boards. Seats with no middle initial stay apart from split people, as in board_interlocks: "JOHN SMITH" never
// matches every JOHN x SMITH. On an unsplit name a conflicting middle initial or Jr / Sr is left out ("John A Smith"
// never shows JOHN R SMITH's seats). `others` lists the rest of the people under the name.
export async function personSeats(name: string, ein?: string): Promise<{ key: string | null; keys: string[]; seats: Seat[]; others: Namesake[] }> {
  const { rows } = await db.query(SEATS_SQL, [name]);
  if (!rows.length) return { key: null, keys: [], seats: [], others: [] };
  const { base, qmid, qsfx } = rows[0] as { base: string; qmid: string | null; qsfx: string | null };
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  const isSplit = (k: string) => k.startsWith(`${base} #`);
  const family = [...byKey.keys()].filter((k) => k === base || isSplit(k));
  const size = (k: string) => new Set(byKey.get(k)!.map((r) => r.ein)).size;
  const biggest = (ks: string[]) => [...ks].sort((a, b) => size(b) - size(a) || a.localeCompare(b))[0];
  const unsplit = [...byKey.keys()].filter((k) => !isSplit(k));
  const splits = family.filter(isSplit);

  let keys: string[] = [];
  const held = ein ? rows.find((r) => r.ein === ein && r.name.toUpperCase() === name.trim().toUpperCase()) : null;
  if (held) keys = isSplit(held.key) ? [held.key] : unsplit;
  else if (qmid || qsfx) {
    const fit = splits.filter((k) => fitsSplit(k, qmid, qsfx));
    keys = fit.length ? [biggest(fit)] : unsplit;
  } else if (splits.length) {
    const top = biggest([...splits, ...(byKey.has(base) ? [base] : [])]);
    keys = top === base ? unsplit : [top];
  } else keys = unsplit;
  if (!keys.length) keys = [biggest([...byKey.keys()])];

  // The middle-initial / suffix guard applies within a name's own key; split keys were already told apart.
  const mid = held ? held.mid : qmid, sfx = held ? held.sfx : qsfx;
  const chosen = rows.filter((r) => keys.includes(r.key) && (isSplit(r.key) || r.key !== base ||
    ((!mid || !r.mid || r.mid === mid) && (!sfx || !r.sfx || r.sfx === sfx))));
  const newest = new Map<string, (typeof rows)[number]>();
  const better = (r: (typeof rows)[number], o: (typeof rows)[number]) => (r.year ?? 0) - (o.year ?? 0) || r.name.length - o.name.length; // newest, then fullest spelling
  for (const r of chosen) { const o = newest.get(r.ein); if (!o || better(r, o) > 0) newest.set(r.ein, r); }
  const seats: Seat[] = [...newest.values()].map((r) => ({
    ein: r.ein, org: r.org ?? r.ein, city: r.city, state: r.state, foundation: r.foundation,
    name: r.name, title: r.title, year: r.year, pay: Number(r.pay), hours: r.hours == null ? null : Number(r.hours),
    cause: r.ntee_cd ? nteeLabel(r.ntee_cd) : null, revenue: r.revenue, assets: r.assets, grantsPaid: r.grants_paid,
    filing: r.object_id ? `https://projects.propublica.org/nonprofits/organizations/${r.ein}/${r.object_id}/full` : null,
  }));
  seats.sort((a, b) => Number(b.foundation) - Number(a.foundation) || (a.state ?? "").localeCompare(b.state ?? "") || a.org.localeCompare(b.org));
  const others: Namesake[] = family.filter((k) => !keys.includes(k)).map((k) => {
    const rs = byKey.get(k)!;
    // its fullest name; on the plain key, a seat with no middle initial (named seats there are on unsplit names)
    const rep = [...rs].sort((a, b) => (k === base ? Number(!!a.mid) - Number(!!b.mid) : Number(!!b.mid) - Number(!!a.mid) || Number(!!b.sfx) - Number(!!a.sfx)) || (b.year ?? 0) - (a.year ?? 0))[0];
    return { name: rep.name, ein: rep.ein, boards: size(k), states: [...new Set(rs.map((r) => r.state).filter(Boolean))].sort() as string[], noMiddle: k === base };
  }).sort((a, b) => b.boards - a.boards);
  return { key: keys[0], keys, seats, others };
}

export type Profile = {
  key: string | null; seats: Seat[]; others: Namesake[];
  giving: { ein: string; org: string; total: number; grants: number; years: string; top: { ein: string | null; name: string; city: string | null; state: string | null; amount: number; grants: number }[] }[];
  peers: { name: string; ein: string; shared: { ein: string; org: string }[] }[];   // people on 2+ of the same boards
  between: { from: string; fromOrg: string; to: string; toOrg: string; amount: number; grants: number }[]; // grants between their boards
};

// Everything we can say about one person from IRS filings: seats, what the foundations they help lead
// give and to whom, who they keep serving with, and money moving between the boards they sit on.
export async function personProfile(name: string, ein?: string): Promise<Profile> {
  const { key, keys, seats, others } = await personSeats(name, ein);
  if (!key || !seats.length) return { key, seats, others, giving: [], peers: [], between: [] };
  const eins = seats.map((s) => s.ein), funders = seats.filter((s) => s.foundation).map((s) => s.ein);
  const orgName = new Map(seats.map((s) => [s.ein, s.org]));
  const [giving, peers, between] = await Promise.all([
    funders.length ? db.query(
      `WITH g AS (SELECT funder_ein, recipient_ein, max(recipient_name) AS name, max(recipient_city) AS city, max(recipient_state) AS state, sum(amount)::float8 AS amount, count(*)::int AS grants
                  FROM grants WHERE funder_ein = ANY($1) GROUP BY funder_ein, recipient_ein, CASE WHEN recipient_ein IS NULL THEN recipient_name END),
            t AS (SELECT funder_ein, sum(amount)::float8 AS total, sum(grants)::int AS grants FROM g GROUP BY 1),
            y AS (SELECT funder_ein, min(tax_year) || '–' || max(tax_year) AS years FROM grants WHERE funder_ein = ANY($1) GROUP BY 1),
            r AS (SELECT g.*, row_number() OVER (PARTITION BY funder_ein ORDER BY amount DESC NULLS LAST) AS n FROM g)
       SELECT t.funder_ein, t.total, t.grants, y.years,
              json_agg(json_build_object('ein', r.recipient_ein, 'name', coalesce(o.name, r.name), 'city', r.city, 'state', r.state, 'amount', r.amount, 'grants', r.grants) ORDER BY r.amount DESC NULLS LAST) AS top
       FROM t JOIN y USING (funder_ein) JOIN r USING (funder_ein) LEFT JOIN orgs o ON o.ein = r.recipient_ein
       WHERE r.n <= 5 GROUP BY t.funder_ein, t.total, t.grants, y.years ORDER BY t.total DESC NULLS LAST`, [funders]) : { rows: [] },
    db.query(  // grouped by person key, so two people sharing a name aren't one peer
      `WITH s AS (SELECT DISTINCT ein, name FROM board_members WHERE ein = ANY($1) AND person_key IS NOT NULL), ${keyed("s")}
       SELECT (array_agg(name ORDER BY name))[1] AS name, (array_agg(ein ORDER BY name))[1] AS ein, json_agg(DISTINCT jsonb_build_object('ein', ein)) AS shared
       FROM s_k WHERE key IS NOT NULL AND NOT key = ANY($2)
       GROUP BY key HAVING count(DISTINCT ein) >= 2
       ORDER BY count(DISTINCT ein) DESC, 1 LIMIT 12`, [eins, keys]),
    eins.length > 1 ? db.query(
      `SELECT funder_ein, recipient_ein, sum(amount)::float8 AS amount, count(*)::int AS grants FROM grants
       WHERE funder_ein = ANY($1) AND recipient_ein = ANY($1) AND recipient_ein <> funder_ein
       GROUP BY 1, 2 ORDER BY amount DESC NULLS LAST LIMIT 10`, [eins]) : { rows: [] },
  ]);
  return {
    key, seats, others,
    giving: giving.rows.map((r) => ({ ein: r.funder_ein, org: orgName.get(r.funder_ein) ?? r.funder_ein, total: Number(r.total ?? 0), grants: r.grants, years: r.years, top: r.top })),
    peers: peers.rows.map((r) => ({ name: r.name, ein: r.ein, shared: (r.shared as { ein: string }[]).map((x) => ({ ein: x.ein, org: orgName.get(x.ein) ?? x.ein })) })),
    between: between.rows.map((r) => ({ from: r.funder_ein, fromOrg: orgName.get(r.funder_ein) ?? r.funder_ein, to: r.recipient_ein, toOrg: orgName.get(r.recipient_ein) ?? r.recipient_ein, amount: Number(r.amount ?? 0), grants: r.grants })),
  };
}

export type BoardLink = { name: string; title: string | null; others: { ein: string; org: string; foundation: boolean; title: string | null }[] };

// People on this organization's board who also sit on other boards in its state: the same person key (keyed(): merges
// and splits, so a seat with no middle initial never links to every JOHN x SMITH of a split name; on unsplit names,
// middle initials and Jr / Sr not conflicting). Names on more than 8 boards there are skipped: those are usually
// different people sharing a common name.
export async function boardLinks(ein: string): Promise<BoardLink[]> {
  const { rows } = await db.query(
    `WITH h AS (SELECT DISTINCT ein, name FROM board_members WHERE ein = $1 AND person_key IS NOT NULL),
          ${keyed("h")},
          me AS (SELECT DISTINCT ON (k.key) k.key, k.name, b.title, b.person_key
                 FROM h_k k JOIN board_members b ON b.ein = k.ein AND b.name = k.name
                 WHERE k.key IS NOT NULL ORDER BY k.key, b.tax_year DESC NULLS LAST, length(k.name) DESC, k.name),
          c AS (  -- other seats that can share a key: same first + last name, or merged with a seat here
            SELECT b.ein, b.name FROM board_members b
            WHERE b.person_key IN (SELECT DISTINCT split_part(key, ' #', 1) FROM me) AND b.ein <> $1
            UNION SELECT CASE WHEN m.ein_a = $1 THEN m.ein_b ELSE m.ein_a END, CASE WHEN m.ein_a = $1 THEN m.name_b ELSE m.name_a END
            FROM board_person_merges m JOIN h ON (m.ein_a = h.ein AND m.name_a = h.name) OR (m.ein_b = h.ein AND m.name_b = h.name)),
          ${keyed("c")},
          st AS (SELECT coalesce((SELECT state FROM orgs WHERE ein = $1), (SELECT state FROM funders WHERE ein = $1)) AS s),
          seat AS (  -- one row per (person, other organization), even when they hold two titles there
            SELECT DISTINCT ON (me.key, b.ein) me.key, me.name, me.title, b.ein,
                   coalesce(f.name, o.name, b.ein) AS org, f.ein IS NOT NULL AS foundation, b.title AS other_title
            FROM me JOIN c_k ck ON ck.key = me.key AND ck.ein <> $1
            JOIN board_members b ON b.ein = ck.ein AND b.name = ck.name
            LEFT JOIN orgs o ON o.ein = b.ein LEFT JOIN funders f ON f.ein = b.ein
            CROSS JOIN st
            WHERE coalesce(o.state, f.state) = st.s
              AND (position(' #' IN me.key) > 0 OR b.person_key IS DISTINCT FROM me.person_key
                   OR ((person_middle(me.name) IS NULL OR person_middle(b.name) IS NULL OR person_middle(me.name) = person_middle(b.name))
                       AND (person_suffix(me.name) IS NULL OR person_suffix(b.name) IS NULL OR person_suffix(me.name) = person_suffix(b.name))))
            ORDER BY me.key, b.ein, b.tax_year DESC NULLS LAST)
     SELECT name, title, json_agg(json_build_object('ein', ein, 'org', org, 'foundation', foundation, 'title', other_title) ORDER BY foundation DESC, org) AS others
     FROM seat GROUP BY key, name, title
     HAVING count(*) <= 8
     ORDER BY count(*) DESC, name
     LIMIT 15`,
    [ein]);
  return rows.map((r) => ({ name: r.name, title: r.title, others: r.others as BoardLink["others"] }));
}
