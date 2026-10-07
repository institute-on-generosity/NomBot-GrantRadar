// Mirrors generosity-data/embed/embedder.mjs: query vectors must come from the same
// model as the stored document vectors.
//   EMBED_PROVIDER=openai -> text-embedding-3-small @512 (needs OPENAI_API_KEY)
//   EMBED_PROVIDER=local  -> LOCAL POC FALLBACK: nomic-embed-text-v1.5, Matryoshka 512
import { embed as aiEmbed } from "ai";
import { openai } from "@ai-sdk/openai";

const DIMS = 512;
const provider = process.env.EMBED_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "local");
export const MODEL_ID = provider === "openai" ? "openai:text-embedding-3-small@512" : "local:nomic-embed-text-v1.5@512";

type Extractor = (t: string[], o: { pooling: "mean" }) => Promise<{ tolist(): number[][] }>;
let extractor: Promise<Extractor> | undefined;

export async function embedQuery(text: string): Promise<number[]> {
  if (provider === "openai") {
    const { embedding } = await aiEmbed({
      model: openai.embedding("text-embedding-3-small"),
      value: text,
      providerOptions: { openai: { dimensions: DIMS } },
    });
    return embedding;
  }
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
