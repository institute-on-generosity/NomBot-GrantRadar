// "In the news": recent headlines that name an organization, from news_org_links (generosity-data migration 071,
// etl/news_links/match.py: org-name dictionary matched against GDELT headlines, then disambiguated by place, outlet
// and size; 100 random links hand-checked all right). Canonical stories only (copies hidden, migration 065).
// Shared by the org page, /api/v1/org/{ein} (news), /api/v1/news?ein= and MCP search_policy (ein). No Claude calls.
import { db } from "./db";

export const ORG_NEWS_NOTE = "Headlines that name this organization, matched by name (curated short names like 'Gates Foundation', unique legal and DBA names, and shared or generic names only when the headline also names the org's city or state). Headlines only, no article text; one row per story. Matching is strict, so many mentions are missed. From June 2026 on, refreshed daily.";

export type OrgHeadline = { id: number; title: string; url: string; outlet: string | null; seen_at: string; matched: string };

// HTML entities GDELT leaves in headlines (&#x2013;, &amp;, &#xA0;)
export function cleanHeadline(t: string) {
  return t
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, n) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " })[n as string] ?? "")
    .replace(/\s+/g, " ").trim();
}

// Newest `limit` headlines naming this EIN, plus the total. null when the table isn't there yet (migration 071).
export async function orgNews(ein: string, limit = 5): Promise<{ total: number; results: OrgHeadline[] } | null> {
  try {
    const { rows } = await db.query(
      `SELECT n.id, n.title, n.url, n.domain, n.seen_at, l.match_text, count(*) OVER () AS total
         FROM news_org_links l JOIN news_articles n ON n.id = l.news_id AND n.duplicate_of IS NULL
        WHERE l.ein = $1 ORDER BY n.seen_at DESC, n.id DESC LIMIT $2`, [ein, Math.min(Math.max(limit, 1), 50)]);
    return {
      total: rows.length ? Number(rows[0].total) : 0,
      results: rows.map((r) => ({
        id: Number(r.id), title: cleanHeadline(r.title), url: r.url, outlet: r.domain,
        seen_at: r.seen_at instanceof Date ? r.seen_at.toISOString() : String(r.seen_at), matched: r.match_text,
      })),
    };
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return null;
    throw e;
  }
}
