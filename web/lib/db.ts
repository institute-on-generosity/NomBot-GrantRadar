import { Pool } from "pg";

// Vector search with a place filter: let the HNSW index keep scanning until enough matches pass the
// filter (pgvector 0.8 iterative scans), instead of returning the nearest 40 nationwide and filtering after.
// Set at connection start, so no query runs before them.
const HNSW = "-c hnsw.iterative_scan=relaxed_order -c hnsw.ef_search=200 -c hnsw.max_scan_tuples=200000";
// Research answers hash a few hundred thousand rows for exact distinct counts (lib/answer.ts); the 4MB
// server default spills them to disk. 32MB per connection, 5 connections.
const WORK_MEM = "-c work_mem=32MB";

const g = globalThis as unknown as { pgPool?: Pool; pgWarm?: boolean };
export const db = g.pgPool ?? (g.pgPool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql:///nombot", max: 5, options: `${HNSW} ${WORK_MEM}` }));

// Keep the search's index and filing text in memory (generosity-data migration 034, warm_search()): the
// OS evicts them between searches, and a cold HNSW walk costs ~1s instead of ~50ms. At server start, then
// every 10 minutes (~2s of background reads). Server only: scripts and the build skip it.
if (!g.pgWarm && process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
  g.pgWarm = true;
  const warm = () => db.query("SELECT warm_search()").catch((err) => console.warn("warm_search skipped:", (err as Error).message));
  void warm();
  setInterval(warm, 10 * 60_000).unref();
}
