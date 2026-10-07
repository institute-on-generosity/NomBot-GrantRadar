// Mirrors generosity-data/embed/embedder.mjs: query vectors must come from the same
// model as the stored document vectors. Proof of concept: local nomic-embed-text-v1.5,
// Matryoshka 512 (free, runs on the laptop; Claude has no embedding model).
import { memo } from "./memo";

const DIMS = 512;
export const MODEL_ID = "local:nomic-embed-text-v1.5@512";

type Extractor = (t: string[], o: { pooling: "mean" }) => Promise<{ tolist(): number[][] }>;
let extractor: Promise<Extractor> | undefined;

const cached = memo<number[]>("embed", 500, 24 * 3600_000);
export function embedQuery(text: string): Promise<number[]> {
  return cached(text, () => embedFresh(text));
}

async function embedFresh(text: string): Promise<number[]> {
  extractor ??= import("@huggingface/transformers").then(
    ({ pipeline }) => pipeline("feature-extraction", "nomic-ai/nomic-embed-text-v1.5", { dtype: "q8" }) as unknown as Extractor,
  );
  const [v] = (await (await extractor)(["search_query: " + text], { pooling: "mean" })).tolist();
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) || 1;
  const t = v.map((x) => (x - mean) / sd).slice(0, DIMS);
  const norm = Math.hypot(...t) || 1;
  return t.map((x) => x / norm);
}

export const toSql = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;
