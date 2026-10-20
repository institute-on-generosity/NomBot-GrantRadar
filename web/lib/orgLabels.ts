// One organization's graded cause labels (org_labels, generosity-data migration 032). Server only: it queries
// Postgres, so it stays out of lib/labels.ts, which client components reach through lib/filters.ts.
import { db } from "./db";
import { isLabel, labelName, type LabelSlug } from "./labels";

// subtypes: for labels with sub-types (immigrants_refugees: services, policy), else absent.
export type OrgLabel = { label: LabelSlug; name: string; tier: "primary" | "partial"; why: string | null; method: string; version: string; subtypes?: string[] };
export async function orgLabels(ein: string): Promise<OrgLabel[]> {
  const { rows } = await db.query(
    `SELECT label, tier, evidence, method, version, subtypes FROM org_labels WHERE ein = $1 ORDER BY tier = 'primary' DESC, label`, [ein]);
  return rows.filter((r) => isLabel(r.label)).map((r) => ({ label: r.label, name: labelName(r.label), tier: r.tier, why: r.evidence ?? null, method: r.method, version: r.version, ...(r.subtypes ? { subtypes: r.subtypes } : {}) }));
}
