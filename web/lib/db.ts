import { Pool } from "pg";

const g = globalThis as unknown as { pgPool?: Pool };
export const db = g.pgPool ?? (g.pgPool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql:///nombot", max: 5 }));
