import { Pool } from "pg";

// Vector search with a place filter: let the HNSW index keep scanning until enough matches pass the
// filter (pgvector 0.8 iterative scans), instead of returning the nearest 40 nationwide and filtering after.
// Set at connection start, so no query runs before them.
const HNSW = "-c hnsw.iterative_scan=relaxed_order -c hnsw.ef_search=200 -c hnsw.max_scan_tuples=200000";

const g = globalThis as unknown as { pgPool?: Pool };
export const db = g.pgPool ?? (g.pgPool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql:///nombot", max: 5, options: HNSW }));
