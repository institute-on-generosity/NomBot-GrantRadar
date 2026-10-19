// IoG internal knowledge for the partner API: the Institute on Generosity's Giving Guides (GG2026), loaded by
// generosity-data etl/load_iog_docs.py into iog_documents and iog_chunks (migration 059).
// INTERNAL ONLY: served to keys with the iog_internal scope (/api/v1/iog/*, MCP search_iog_guides and get_iog_guide).
// Never link or render these on a public page. No Claude calls: keyword search plus the local embedding model.
import { db } from "./db";
import { embedQuery, toSql, MODEL_ID } from "./embedder";

export const IOG_SCOPE = "iog_internal";
const COLLECTION = "giving_guides";
const NOTE = "IoG internal. Institute on Generosity Giving Guides (course material). Do not publish or share outside IoG.";

export class IogBadParam extends Error {}
const SLUG = /^[a-z0-9-]{1,120}$/;

export async function apiIogGuides(base: string) {
  const { rows } = await db.query(
    `SELECT d.slug, d.title, d.guide, d.edition, d.notes, d.words, d.modified, d.source_url, count(c.id)::int AS chunks
       FROM iog_documents d LEFT JOIN iog_chunks c ON c.doc_id = d.id
      WHERE d.collection = $1 GROUP BY d.id ORDER BY d.guide`, [COLLECTION]);
  return {
    collection: COLLECTION, note: NOTE, count: rows.length,
    guides: rows.map((r) => ({
      slug: r.slug as string, title: r.title as string, guide: r.guide as string, edition: r.edition as string, notes: r.notes as string | null,
      words: r.words as number, chunks: r.chunks as number, modified: iso(r.modified), source_url: r.source_url as string,
      api_url: `${base}/api/v1/iog/guides/${r.slug}`,
    })),
  };
}

// Sections from the stored Markdown: "# Section" and "## Subsection" headings, each with its own text.
function sections(text: string) {
  const out: { level: number; heading: string; path: string[]; text: string }[] = [];
  let path: string[] = [];
  let cur = { level: 0, heading: "", path: [] as string[], text: [] as string[] };
  const push = () => { const t = cur.text.join("\n").trim(); if (cur.heading || t) out.push({ ...cur, text: t }); };
  for (const line of text.split("\n")) {
    const m = /^(#{1,2})\s+(.*)$/.exec(line);
    if (!m) { cur.text.push(line); continue; }
    push();
    const level = m[1].length, heading = m[2].trim();
    path = level === 1 || !path.length ? [heading] : [path[0], heading];
    cur = { level, heading, path, text: [] };
  }
  push();
  return out;
}

export async function apiIogGuide(slug: string) {
  if (!SLUG.test(slug)) return null;
  const { rows: [d] } = await db.query(
    `SELECT slug, title, guide, edition, notes, words, modified, source_url, text FROM iog_documents WHERE collection = $1 AND slug = $2`, [COLLECTION, slug]);
  if (!d) return null;
  return {
    note: NOTE,
    guide: {
      slug: d.slug as string, title: d.title as string, guide: d.guide as string, edition: d.edition as string, notes: d.notes as string | null,
      words: d.words as number, modified: iso(d.modified), source_url: d.source_url as string,
      sections: sections(d.text as string), text: d.text as string,
    },
  };
}

export type IogSearchParams = { q?: string; guide?: string; limit?: number | string };
const K = 60; // reciprocal rank fusion constant
const CANDIDATES = 40;

// Hybrid search over passages: Postgres full text (any of the words, section names weigh more) and vector
// similarity, fused by reciprocal rank. score is the fused score; similarity is the cosine similarity.
export async function apiIogSearch(p: IogSearchParams) {
  const q = String(p.q ?? "").trim().slice(0, 300);
  if (!q) throw new IogBadParam("q is required: a question or topic in plain words.");
  const guide = p.guide ? String(p.guide) : null;
  if (guide && !SLUG.test(guide)) throw new IogBadParam("guide must be a guide slug from /api/v1/iog/guides.");
  const limit = Math.min(Math.max(Number(p.limit) || 5, 1), 20);
  const vec = toSql(await embedQuery(q));
  const { rows } = await db.query(
    `WITH q AS (SELECT nullif(replace(plainto_tsquery('english', $1)::text, ' & ', ' | '), '')::tsquery AS tq),
     pool AS (SELECT c.* FROM iog_chunks c JOIN iog_documents d ON d.id = c.doc_id WHERE d.collection = $4 AND ($5::text IS NULL OR d.slug = $5)),
     kw AS (SELECT id, row_number() OVER (ORDER BY ts_rank_cd(tsv, q.tq) DESC, id) AS r FROM pool, q WHERE q.tq IS NOT NULL AND tsv @@ q.tq
            ORDER BY r LIMIT ${CANDIDATES}),
     vec AS (SELECT id, row_number() OVER (ORDER BY embedding <=> $2::vector, id) AS r FROM pool WHERE embedding_model = $3
             ORDER BY r LIMIT ${CANDIDATES}),
     fused AS (SELECT id, sum(1.0 / (${K} + r)) AS score, min(r) FILTER (WHERE src = 'kw') AS kw_rank, min(r) FILTER (WHERE src = 'vec') AS vec_rank
                 FROM (SELECT id, r, 'kw' AS src FROM kw UNION ALL SELECT id, r, 'vec' FROM vec) x GROUP BY id)
     SELECT f.score, f.kw_rank, f.vec_rank, 1 - (c.embedding <=> $2::vector) AS similarity, c.position, c.section, c.heading_path, c.text,
            d.slug, d.title, d.guide, d.edition, d.source_url
       FROM fused f JOIN iog_chunks c ON c.id = f.id JOIN iog_documents d ON d.id = c.doc_id
      ORDER BY f.score DESC, similarity DESC LIMIT $6`,
    [q, vec, MODEL_ID, COLLECTION, guide, limit]);
  return {
    query: { q, guide, limit }, model: MODEL_ID, note: NOTE, count: rows.length,
    results: rows.map((r) => ({
      guide: { slug: r.slug as string, title: r.title as string, name: r.guide as string, edition: r.edition as string },
      section: r.section as string | null, heading_path: r.heading_path as string[], position: r.position as number,
      text: r.text as string, source_url: r.source_url as string,
      score: round(Number(r.score), 5), similarity: r.similarity == null ? null : round(Number(r.similarity), 4),
      matched: { keyword_rank: r.kw_rank == null ? null : Number(r.kw_rank), vector_rank: r.vec_rank == null ? null : Number(r.vec_rank) },
    })),
  };
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : (d as string | null));
