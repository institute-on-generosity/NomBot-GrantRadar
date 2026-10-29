// What an organization says on its own website (generosity-data org_web_profile, migration 086, filled by
// scripts/web-profiles.mts for orgs with no 990 program text). Always shown apart from IRS data, as
// "From their website (date)" with the link. Facts from the site only, confirmed as the same org by name plus EIN,
// address, ZIP or city (lib/webMatch).
import { db } from "./db";
import { memo } from "./memo";

export type WebProfile = { ein: string; url: string; site: string; fetched: string; description: string; quote: string | null; servesPlaces: string[]; servesQuote: string | null; confidence: "high" | "medium" };
const row = (r: Record<string, unknown>): WebProfile => ({
  ein: String(r.ein), url: String(r.url), site: String(r.site), fetched: new Date(r.fetched_at as string).toISOString().slice(0, 10),
  description: String(r.description), quote: (r.quote as string) ?? null, servesPlaces: (r.serves_places as string[]) ?? [], servesQuote: (r.serves_quote as string) ?? null,
  confidence: r.confidence as "high" | "medium",
});
// One query for a list of orgs (search rows, report tables); a missing table (an older database) means none
export async function webProfiles(eins: string[]): Promise<Map<string, WebProfile>> {
  const list = [...new Set(eins.map((e) => e.replace(/\D/g, "")).filter((e) => e.length === 9))];
  if (!list.length) return new Map();
  const { rows } = await db.query(`SELECT * FROM org_web_profile WHERE ein = ANY($1::char(9)[])`, [list]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return new Map(rows.map((r) => [String(r.ein), row(r)]));
}
const one = memo<WebProfile | null>("web-profile:v1", 2000, 3600_000);
export const webProfile = (ein: string) => one(ein.replace(/\D/g, ""), async () => (await webProfiles([ein])).get(ein.replace(/\D/g, "")) ?? null);
// "June 2026" for the "From their website" line
export const fetchedLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
export const siteHost = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
