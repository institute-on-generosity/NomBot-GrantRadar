// Insights feed (server side): verified rows of the `insights` table, best first.
// The table is filled by a separate job; until it exists the feed is simply empty.
import { db } from "./db";
import type { Insight } from "./insightMeta";

export async function listInsights(): Promise<{ insights: Insight[]; ready: boolean }> {
  try {
    const { rows } = await db.query<Insight>(
      `select id, slug, section, headline, summary, chart, method, caveats, coalesce(sources, '[]'::jsonb) as sources, query,
              coalesce(data, '[]'::jsonb) as data, coalesce(org_eins, '{}') as org_eins, explore_query, cause, state, score,
              refreshed_at, created_at
         from insights where verified
        order by score desc nulls last, refreshed_at desc nulls last
        limit 300`);
    return { insights: rows, ready: true };
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return { insights: [], ready: false }; // table not created yet
    throw e;
  }
}

// Names and places for an insight's organizations ("Explore" without a saved search).
export async function orgsByEin(eins: string[]) {
  const { rows } = await db.query<{ ein: string; name: string; city: string | null; state: string | null; ntee_cd: string | null; revenue_amt: string | null }>(
    `select ein, name, city, state, ntee_cd, revenue_amt from orgs where ein = any($1::text[]) order by revenue_amt desc nulls last`, [eins]);
  return rows;
}
