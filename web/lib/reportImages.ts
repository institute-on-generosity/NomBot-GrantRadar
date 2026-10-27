// Report images (Oct 27, per report): each report's photo was chosen for its own headline and finding from openly
// licensed Wikimedia Commons candidates (2-3 queries each, every candidate looked at), self-hosted in public/reports/
// as WebP with author, license, source, the queries used and a one-line reason in lib/reportImages.json. When no
// photo was clearly relevant, the report gets a generated cover from its own key number (ReportImage), never a
// stock picture. No photo is used by more than 2 reports. A report not in the manifest also gets the cover.
import manifest from "./reportImages.json";

export type ReportImage = { file: string; small: string; alt: string; title: string; author: string; license: string; license_url: string; source: string; credit: string };
type Entry = ({ type: "photo" } & ReportImage | { type: "cover" }) & { queries: string[]; reason: string };
const MAN = manifest as Record<string, Entry>;

export function reportImage(i: { slug: string }): ReportImage | null {
  const e = MAN[i.slug];
  return e && e.type === "photo" ? e : null;
}

// The cover's number: the report's first key number, else the first number in its headline.
export function coverNumber(i: { headline: string; stats?: { value: string; label: string }[] | null }): { value: string; label?: string } | null {
  if (i.stats?.[0]) return { value: i.stats[0].value, label: i.stats[0].label };
  const m = /\$?\d[\d,.]*\s?(?:%|[KMB]\b|-fold|x\b|times\b)?/.exec(i.headline);
  return m ? { value: m[0].trim() } : null;
}
