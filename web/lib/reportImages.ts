// Report images (Oct 27): one openly licensed photo per cause or topic, self-hosted in public/reports/ (WebP, 800 and
// 1600 wide), with author, license and source in lib/reportImages.json. Scenes, places and objects only: no
// identifiable people tied to a claim, no logos, nothing that implies an org endorses a finding. Each was checked by
// hand. A finding gets its image from keywords in its slug and headline; with no match, a tinted pattern by section.
import manifest from "./reportImages.json";

export type ReportImage = { file: string; small: string; alt: string; title: string; author: string; license: string; license_url: string; source: string; credit: string };
const IMAGES = manifest as Record<string, ReportImage>;

// First match wins.
const RULES: [RegExp, string][] = [
  [/pharma|patient|medical|drug/i, "medicine"],
  [/violence|shelter/i, "shelter"],
  [/women|girls/i, "classroom"],
  [/climate/i, "climate"],
  [/civil rights|advocacy/i, "civilrights"],
  [/child care/i, "childcare"],
  [/education|school|universit/i, "library"],
  [/public health/i, "health"],
  [/disaster|public safety/i, "disaster"],
  [/international|family ties/i, "globe"],
  [/appalachia|poorest counties|county|counties|poverty|poor person/i, "appalachia"],
  [/state|massachusetts|vermont|washington|west virginia|federal/i, "capitol"],
  [/new charities/i, "seedlings"],
  [/board|insider|invite|unsolicited|affiliat/i, "boardroom"],
];
const BY_SECTION: Record<string, string> = { "money-flows": "ledger", "track-record": "ledger", "financial-stress": "ledger", affiliations: "boardroom" };

export function reportImage(i: { slug: string; headline: string; section: string }): ReportImage | null {
  const text = `${i.slug.replace(/-/g, " ")} ${i.headline}`;
  const hit = RULES.find(([re]) => re.test(text))?.[1] ?? BY_SECTION[i.section];
  if (/nursing|senior|retirement/i.test(text)) return null; // no good open image: the pattern
  return hit ? IMAGES[hit] ?? null : null;
}
