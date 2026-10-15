// Grades proposed grant-recipient links (generosity-data etl/rematch_grants.py --sample) before they are
// applied: is the grant recipient the same organization as the IRS record? Reports precision per rule.
//
//   npx tsx eval/judge_matches.mts [path/to/sample.json]   (default ../../generosity-data/data/rematch/sample.json)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { claude, LLM_MODEL } = await import("../lib/llm");

type Pair = {
  method: string; score: number; grant_name: string; grant_city: string; grant_state: string; grant_zip: string;
  ein: string; org_name: string; org_other_name: string | null; org_city: string; org_state: string; org_zip: string; ntee_cd: string | null;
};
const path = process.argv[2] ?? join(import.meta.dirname, "..", "..", "..", "generosity-data", "data", "rematch", "sample.json");
const pairs: Pair[] = JSON.parse(readFileSync(path, "utf8"));

const SYSTEM = `You check record linkage for US nonprofit data. Each item pairs a grant recipient (as a foundation wrote it on its tax return) with an IRS record of a tax-exempt organization.
Decide if they are the same organization: the IRS record is the legal entity that would receive and cash that grant.
- Same organization: the same name written differently (abbreviations, "Inc", "The", word order, truncation, a legal name like "Trustees of X" for X), or a chapter/campus name listed as the IRS record's other name.
- Not the same: a different organization that shares words (a "Friends of X" group vs X itself, a different chapter, a parent vs an unrelated local group), or a different place when the name is generic.
- Be strict: answer same=false when it is a guess.
"why": under 12 words.`;
const verdicts = z.object({ results: z.array(z.object({ id: z.string(), same: z.boolean(), why: z.string() })) });

async function grade(batch: Pair[]) {
  const items = batch.map((p, i) => ({
    id: `p${i + 1}`,
    grant_recipient: `${p.grant_name}, ${p.grant_city}, ${p.grant_state} ${p.grant_zip}`,
    irs_record: `${p.org_name}${p.org_other_name ? ` (other name: ${p.org_other_name})` : ""}, ${p.org_city}, ${p.org_state} ${p.org_zip}${p.ntee_cd ? `, cause ${p.ntee_cd}` : ""}`,
  }));
  const res = await claude()!.beta.messages.parse({
    model: LLM_MODEL, max_tokens: 4096, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(verdicts) },
    system: SYSTEM, messages: [{ role: "user", content: JSON.stringify(items, null, 1) }],
  });
  return new Map((res.parsed_output?.results ?? []).map((v) => [v.id, v]));
}

const graded: (Pair & { same: boolean | null; why: string })[] = [];
const batches = Array.from({ length: Math.ceil(pairs.length / 20) }, (_, i) => pairs.slice(i * 20, i * 20 + 20));
await Promise.all(batches.map(async (b) => {
  const v = await grade(b);
  b.forEach((p, i) => { const r = v.get(`p${i + 1}`); graded.push({ ...p, same: r?.same ?? null, why: r?.why ?? "" }); });
}));

const methods = [...new Set(graded.map((g) => g.method))];
console.log(`Judge: ${LLM_MODEL}, ${graded.length} pairs`);
for (const m of methods) {
  const xs = graded.filter((g) => g.method === m && g.same != null);
  const ok = xs.filter((g) => g.same).length;
  console.log(`  ${m.padEnd(9)} ${Math.round((100 * ok) / (xs.length || 1))}% correct (${ok}/${xs.length})`);
  for (const g of xs.filter((x) => !x.same).slice(0, 4)) console.log(`      ✗ ${g.grant_name} (${g.grant_city}) → ${g.org_name} (${g.org_city}): ${g.why}`);
}
writeFileSync(path.replace(/\.json$/, ".graded.json"), JSON.stringify(graded, null, 1));
