// Research feed and detail pages (server side): verified rows of the `insights` table, best first.
// The table is filled by a separate job (generosity-data etl/mine_insights.py); until it exists the feed is simply empty.
import { cacheLife } from "next/cache";
import { db } from "./db";
import type { Insight } from "./insightMeta";

const COLS = `id, slug, section, headline, summary, chart, method, caveats, coalesce(sources, '[]'::jsonb) as sources, query,
  coalesce(data, '[]'::jsonb) as data, coalesce(org_eins, '{}') as org_eins, explore_query, cause, state, score, stats, points,
  refreshed_at, created_at`;
const missing = (e: unknown) => ["42P01", "42703"].includes((e as { code?: string }).code ?? ""); // table or column not created yet

export async function listInsights(): Promise<{ insights: Insight[]; ready: boolean }> {
  try {
    const { rows } = await db.query<Insight>(
      `select ${COLS} from insights where verified
        order by score desc nulls last, refreshed_at desc nulls last
        limit 300`);
    return { insights: rows, ready: true };
  } catch (e) {
    if (missing(e)) return { insights: [], ready: false };
    throw e;
  }
}

// One verified finding by slug, for /research/<slug> and its chat. Cached: the miner refreshes nightly.
export async function getInsight(slug: string): Promise<Insight | null> {
  "use cache";
  cacheLife("hours");
  try {
    const { rows } = await db.query<Insight>(`select ${COLS} from insights where verified and slug = $1`, [slug]);
    return rows[0] ? { ...rows[0], refreshed_at: iso(rows[0].refreshed_at), created_at: iso(rows[0].created_at) } : null;
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : (d as string | null));

// Up to 3 other verified findings: same section first, then same cause, best score first.
export async function relatedInsights(i: Pick<Insight, "slug" | "section" | "cause">) {
  "use cache";
  cacheLife("hours");
  const { rows } = await db.query<Pick<Insight, "slug" | "section" | "headline">>(
    `select slug, section, headline from insights
      where verified and slug <> $1 and (section = $2 or cause = $3)
      order by (section = $2) desc, score desc nulls last limit 3`, [i.slug, i.section, i.cause]);
  return rows;
}

// Names, places and newest revenue for an insight's organizations.
export async function orgsByEin(eins: string[]) {
  const { rows } = await db.query<{ ein: string; name: string; city: string | null; state: string | null; ntee_cd: string | null; revenue_amt: string | null; tax_year: number | null }>(
    `select o.ein, o.name, o.city, o.state, o.ntee_cd, coalesce(f.revenue, o.revenue_amt) as revenue_amt, f.tax_year
       from orgs o left join financials_latest f on f.ein = o.ein
      where o.ein = any($1::text[]) order by coalesce(f.revenue, o.revenue_amt) desc nulls last`, [eins]);
  return rows;
}
