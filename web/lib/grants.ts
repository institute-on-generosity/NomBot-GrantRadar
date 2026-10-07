// GrantRadar: mission -> similar nonprofits -> who funded them -> ranked foundations.
// A foundation ranks high only if it already funded organizations like yours: its score is the sum,
// over the similar grantees it paid, of how alike each grantee is to your mission.
// Tables (generosity-data migration 007): funders, grants (recipient_ein = matched org).
import { db } from "./db";
import { embedQuery, toSql } from "./embedder";
import { memo } from "./memo";

const PEERS = 150;    // most similar grantee organizations considered
const FLOOR = 0.55;   // cosine similarity below this isn't "like you"
export const SIZES = { small: [0, 5_000], mid: [5_000, 25_000], large: [25_000, Infinity] } as const;
export type Size = keyof typeof SIZES;

export type MatchFilters = { state?: string; open?: boolean; size?: Size };
export type Evidence = { grantId: number; recipient: string; ein: string; city: string | null; state: string | null; amount: number | null; purpose: string | null; year: number | null; similarity: number };
export type FunderMatch = {
  ein: string; name: string; city: string | null; state: string | null;
  assets: number | null; grantsPaid: number | null; grantCount: number; inviteOnly: boolean;
  score: number; peers: number; typical: number | null; inState: number; evidence: Evidence[];
};

type Row = { funder_ein: string; grant_id: number; recipient_ein: string; recipient_name: string; recipient_city: string | null; recipient_state: string | null; amount: string | null; purpose: string | null; tax_year: number | null; sim: number };

// Grants paid to the PEERS grantees most like the mission (brute force over grantees with filings: ~10K vectors).
async function peerGrants(mission: string): Promise<Row[]> {
  const v = toSql(await embedQuery(mission));
  const { rows } = await db.query(
    `WITH peers AS (
       SELECT ein, sim FROM (
         SELECT DISTINCT ON (f.ein) f.ein, 1 - (f.embedding <=> $1::vector) AS sim
         FROM filing_text f WHERE f.embedding IS NOT NULL
           AND f.ein IN (SELECT recipient_ein FROM grants WHERE recipient_ein IS NOT NULL)
         ORDER BY f.ein, f.tax_year DESC) p
       WHERE sim >= $3 ORDER BY sim DESC LIMIT $2)
     SELECT g.funder_ein, g.id AS grant_id, g.recipient_ein, g.recipient_name, g.recipient_city, g.recipient_state,
            g.amount, g.purpose, g.tax_year, p.sim
     FROM grants g JOIN peers p ON p.ein = g.recipient_ein`,
    [v, PEERS, FLOOR],
  );
  return rows;
}
const cachedPeers = memo<Row[]>("grants:peers", 200, 24 * 3600_000);

export async function matchFunders(mission: string, f: MatchFilters = {}, limit = 20): Promise<{ funders: FunderMatch[]; total: number; peers: number }> {
  const rows = await cachedPeers(mission.toLowerCase().replace(/\s+/g, " ").trim(), () => peerGrants(mission));
  const byFunder = new Map<string, Row[]>();
  for (const r of rows) byFunder.set(r.funder_ein, [...(byFunder.get(r.funder_ein) ?? []), r]);
  if (!byFunder.size) return { funders: [], total: 0, peers: 0 };

  const { rows: info } = await db.query(
    `SELECT f.ein, f.name, f.city, f.state, f.assets, f.grants_paid, f.grant_count, f.invite_only,
            (SELECT count(*) FROM grants g WHERE g.funder_ein = f.ein AND g.recipient_state = $2)::int AS in_state,
            (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) FROM grants g WHERE g.funder_ein = f.ein AND g.amount > 0) AS median
     FROM funders f WHERE f.ein = ANY($1)`,
    [[...byFunder.keys()], f.state ?? ""],
  );

  const scored: FunderMatch[] = info.map((x) => {
    const gs = byFunder.get(x.ein)!;
    const best = new Map<string, Row>(); // strongest grant per grantee
    for (const g of gs) if (!best.has(g.recipient_ein) || Number(g.amount ?? 0) > Number(best.get(g.recipient_ein)!.amount ?? 0)) best.set(g.recipient_ein, g);
    const evidence = [...best.values()].sort((a, b) => b.sim - a.sim).map((g): Evidence => ({
      grantId: g.grant_id, recipient: g.recipient_name, ein: g.recipient_ein, city: g.recipient_city, state: g.recipient_state,
      amount: g.amount == null ? null : Number(g.amount), purpose: g.purpose, year: g.tax_year, similarity: g.sim,
    }));
    // Closer grantees count much more than loose ones: ((sim - floor) / (1 - floor))^2, summed.
    const score = evidence.reduce((s, e) => s + ((e.similarity - FLOOR) / (1 - FLOOR)) ** 2, 0);
    return {
      ein: x.ein, name: x.name, city: x.city, state: x.state,
      assets: x.assets == null ? null : Number(x.assets), grantsPaid: x.grants_paid == null ? null : Number(x.grants_paid),
      grantCount: x.grant_count, inviteOnly: x.invite_only, score, peers: evidence.length,
      typical: x.median == null ? null : Math.round(Number(x.median)), inState: x.in_state, evidence,
    };
  });

  const [lo, hi] = f.size ? SIZES[f.size] : [0, Infinity];
  const kept = scored
    .filter((m) => !f.open || !m.inviteOnly)
    .filter((m) => !f.state || m.inState > 0)
    .filter((m) => !f.size || (m.typical != null && m.typical >= lo && m.typical < hi))
    .sort((a, b) => b.score - a.score || (b.grantsPaid ?? 0) - (a.grantsPaid ?? 0));
  return { funders: kept.slice(0, limit), total: kept.length, peers: new Set(rows.map((r) => r.recipient_ein)).size };
}

export type FunderDetail = {
  ein: string; name: string; city: string | null; state: string | null; taxYear: number | null; objectId: string;
  assets: number | null; grantsPaid: number | null; grantCount: number; inviteOnly: boolean; website: string | null;
  apply: { contact: string | null; form: string | null; deadlines: string | null; restrictions: string | null };
  grants: { id: number; recipient: string; ein: string | null; city: string | null; state: string | null; amount: number | null; purpose: string | null }[];
  byState: { state: string; count: number; amount: number }[];
};

export async function getFunder(einParam: string): Promise<FunderDetail | null> {
  const ein = einParam.replace(/\D/g, "");
  if (ein.length !== 9) return null;
  const [{ rows: [f] }, { rows: gs }, { rows: st }] = await Promise.all([
    db.query("SELECT * FROM funders WHERE ein = $1", [ein]),
    db.query(`SELECT id, recipient_name, recipient_ein, recipient_city, recipient_state, amount, purpose FROM grants
              WHERE funder_ein = $1 ORDER BY amount DESC NULLS LAST, id LIMIT 400`, [ein]),
    db.query(`SELECT recipient_state AS state, count(*)::int AS count, coalesce(sum(amount), 0)::bigint AS amount FROM grants
              WHERE funder_ein = $1 AND recipient_state IS NOT NULL GROUP BY 1 ORDER BY 3 DESC LIMIT 8`, [ein]),
  ]);
  if (!f) return null;
  const n = (v: unknown) => (v == null ? null : Number(v));
  // Filers often write N/A or NONE instead of leaving a field blank.
  const s = (v: string | null) => (v && v.trim() && !/^(n\/?a|none|not applicable|see statement.*|-+)$/i.test(v.trim()) ? v.trim() : null);
  return {
    ein: f.ein, name: f.name, city: f.city, state: f.state, taxYear: f.tax_year, objectId: f.object_id,
    assets: n(f.assets), grantsPaid: n(f.grants_paid), grantCount: f.grant_count, inviteOnly: f.invite_only, website: s(f.website),
    apply: { contact: s(f.apply_contact), form: s(f.apply_form), deadlines: s(f.apply_deadlines), restrictions: s(f.apply_restrictions) },
    grants: gs.map((g) => ({ id: g.id, recipient: g.recipient_name, ein: g.recipient_ein, city: g.recipient_city, state: g.recipient_state, amount: n(g.amount), purpose: g.purpose })),
    byState: st.map((r) => ({ state: r.state, count: r.count, amount: Number(r.amount) })),
  };
}

// The funder's 990-PF, readable on ProPublica (same link style as NomBot's Form 990 sources).
export const filingUrl = (ein: string, objectId: string) => `https://projects.propublica.org/nonprofits/organizations/${ein}/${objectId}/full`;
