// The viewer's insights "report": saved cards, kept in this browser only (localStorage).
// Whole cards are stored, so the report still exports after the feed changes.
import type { Insight } from "./insightMeta";

export const REPORT_KEY = "nombot.report.v1";
export const REPORT_EVENT = "nombot-report";

export function readReport(): Insight[] {
  try { return JSON.parse(localStorage.getItem(REPORT_KEY) ?? "[]"); } catch { return []; }
}

function write(items: Insight[]) {
  try { localStorage.setItem(REPORT_KEY, JSON.stringify(items)); } catch { /* storage full or blocked */ }
  window.dispatchEvent(new Event(REPORT_EVENT));
}

export function toggleReport(i: Insight) {
  const items = readReport();
  write(items.some((x) => x.slug === i.slug) ? items.filter((x) => x.slug !== i.slug) : [...items, i]);
}

export const removeFromReport = (slug: string) => write(readReport().filter((x) => x.slug !== slug));
export const clearReport = () => write([]);
