// Which candidate grantees really do work like the user's nonprofit. Embedding similarity finds
// candidates but over-weights shared place words ("rural West Virginia" pulls in health clinics for an
// animal-rescue mission), so Claude scores each candidate's work 0-100, ignoring location.
// Without ANTHROPIC_API_KEY (or if the call fails), the embedding similarity is used instead.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { readable } from "../components/text";
import { db } from "./db";
import { claude, LLM_MODEL } from "./llm";
import { memo } from "./memo";

const BATCH = 25;

const SYSTEM = `You compare nonprofits with a user's nonprofit mission to find organizations doing the same kind of work.
Score each organization 0-100 for how alike its actual work (cause, activity, people served) is to the mission:
- 85-100: the same kind of work (e.g. both run animal shelters).
- 70-84: closely related work in the same cause. When the mission names several activities (e.g. a food pantry and job training), an organization that does one of them as a main activity belongs here or higher.
- 50-69: same broad cause, different activity.
- 0-49: different work, or the overlap is only incidental (a church that also hands out food baskets is not a food bank).
Ignore location entirely: where an organization is says nothing about whether its work is alike. Judge only from the facts given.`;

const schema = z.object({ results: z.array(z.object({ id: z.string(), score: z.number() })) });

export type Peer = { ein: string; sim: number };

async function scoreBatch(mission: string, peers: { ein: string; name: string; text: string }[]): Promise<Map<string, number>> {
  const client = claude();
  const out = new Map<string, number>();
  if (!client) return out;
  const items = peers.map((p, i) => ({ id: `p${i + 1}`, name: p.name, work: p.text || null }));
  const res = await client.beta.messages.parse({
    model: LLM_MODEL,
    max_tokens: 2048,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Mission: ${mission}\n\nOrganizations:\n${JSON.stringify(items)}` }],
  });
  for (const r of res.parsed_output?.results ?? []) {
    const p = peers[Number(r.id.replace(/\D/g, "")) - 1];
    if (p) out.set(p.ein, Math.max(0, Math.min(100, Math.round(r.score))));
  }
  return out;
}

async function scoreFresh(mission: string, peers: Peer[]): Promise<Map<string, number>> {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (f.ein) f.ein, o.name, f.mission, f.programs FROM filing_text f JOIN orgs o USING (ein)
     WHERE f.ein = ANY($1) ORDER BY f.ein, f.tax_year DESC`, [peers.map((p) => p.ein)]);
  const info = rows.map((r) => ({ ein: r.ein as string, name: r.name as string, text: readable([r.mission, r.programs].filter(Boolean).join(" ")).slice(0, 350) }));
  const batches = Array.from({ length: Math.ceil(info.length / BATCH) }, (_, i) => info.slice(i * BATCH, (i + 1) * BATCH));
  const maps = await Promise.all(batches.map((b) => scoreBatch(mission, b)));
  return new Map(maps.flatMap((m) => [...m]));
}

// Mission -> ein -> work-alike score (0-100). Empty map when Claude isn't available.
const cached = memo<Map<string, number>>("grants:peerfit:v2", 200, 24 * 3600_000); // bump when the rubric changes
export function peerFit(mission: string, peers: Peer[]) {
  const key = mission.toLowerCase().replace(/\s+/g, " ").trim();
  return cached(key, () => scoreFresh(mission, peers).catch((err) => {
    console.error("Grantee scoring failed; using embedding similarity", err);
    return new Map<string, number>();
  }));
}
