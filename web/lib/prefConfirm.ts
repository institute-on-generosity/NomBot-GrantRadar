// Soft preferences on each search row (Oct 29): which ones a source beyond the 990 confirms. A row's own website
// (org_web_profile) or a place program it runs (data/place-programs.json) must name the preference's own words
// (strictPrefRe: "mobile dental care" needs mobile and dental). A preferred cause label ("ideally focused on girls")
// is marked with the org's graded tier for it. A filing "mention" is kept only when the 990 text names those same words. Read by the result card and the search summary's preference line.
import type { Filters } from "./parse";
import type { Scope } from "./place";
import { labelName } from "./labels";
import { programsFor } from "./placePrograms";
import type { Result } from "./search";
import { strictPrefRe } from "./summaryFacts";
import { webProfiles } from "./webProfile";

export const preferredLabel = (f: Filters) => (f.preferLabel && f.preferLabel !== f.label ? f.preferLabel : null);
// Text preferences that say the same as the preferred cause label ("focused on girls" with Women and girls): they fold
// into the label's count, chip and card tag, so each preference shows once
export function foldedPrefs(f: Filters): string[] {
  const pl = preferredLabel(f);
  if (!pl) return [];
  return (f.prefer ?? []).filter((p) => { try { return new RegExp(`\\b(${p.pattern})\\b`, "i").test(labelName(pl)); } catch { return false; } }).map((p) => p.label);
}
export const prefSlug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// The preference chip's filter (?only=<slug>): keeps the rows the summary counted for that preference, from the same
// search and the same scores, so the chip's number and the list agree. Null for an unknown slug.
export function onlyPref(f: Filters, slug: string): ((r: Result) => boolean) | null {
  const folded = foldedPrefs(f), pl = preferredLabel(f);
  const label = pl ? (folded[0] ?? labelName(pl).toLowerCase()) : null;
  if (label && prefSlug(label) === slug) return (r) => Boolean(r.preferLabel) || (r.prefer ?? []).some((x) => folded.includes(x));
  const p = (f.prefer ?? []).find((x) => !folded.includes(x.label) && prefSlug(x.label) === slug);
  return p ? (r) => (r.prefer ?? []).includes(p.label) || (r.preferConfirmed ?? []).some((c) => c.label === p.label) : null;
}

export async function confirmPrefs(rows: Result[], filters: Filters, scope: Scope | null | undefined): Promise<void> {
  const pl = preferredLabel(filters);
  if (pl) for (const r of rows) { const t = r.topicLabels?.find((x) => x.label === pl); if (t) r.preferLabel = t; }
  const prefs = (filters.prefer ?? []).map((p) => ({ label: p.label, re: strictPrefRe(p.label) })).filter((p) => p.re);
  if (!prefs.length || !rows.length) return;
  // A mention needs the preference's own words in the 990 text too (strictPrefRe), not just a broad synonym from the
  // search pattern: "dental care" alone is not a mention of mobile dental care (Oct 29, Hunter)
  for (const r of rows) if (r.prefer?.length) {
    const text = `${r.name} ${r.mission ?? ""} ${r.programs ?? ""}`;
    r.prefer = r.prefer.filter((label) => { const re = prefs.find((p) => p.label === label)?.re; return re ? re.test(text) : true; });
  }
  const progs = programsFor(scope, [filters.topic ?? "", ...prefs.map((p) => p.label)].join(" ")).filter((p) => p.serves === "confirmed");
  const web = await webProfiles(rows.map((r) => r.ein)).catch(() => new Map());
  for (const r of rows) {
    const ein = r.ein.replace(/\D/g, ""), w = web.get(ein);
    const conf = prefs.flatMap((p): NonNullable<Result["preferConfirmed"]> => w && p.re!.test(`${w.description} ${w.quote ?? ""}`) ? [{ label: p.label, via: "website" }]
      : progs.some((g) => g.operator.replace(/\D/g, "").includes(ein) && p.re!.test(`${g.kind} ${g.name}`)) ? [{ label: p.label, via: "program" }] : []);
    if (conf.length) r.preferConfirmed = conf;
  }
}
