// "← Back to results" (Oct 29, Hunter): every Back link goes to the search the user came from. The search URL rides
// along as ?back= (question, place, filters, the preference chip's only=) from the results list to an org page and on
// to a memo, a source viewer, compare or another org (components/BackCarry adds it to those links). Back adds
// focus=<org> so the results scroll to the row you opened. No search known (a direct link, a new tab): Back goes to
// the home search, never off the site. Pure functions, unit-tested in eval/back.mts.

// Only our own search page (or the Starred list) is a valid target: never another site, never a blank page
export function safeBack(v: string | null | undefined): string | null {
  if (!v || v.length > 2000) return null;
  if (/^\/\?(.*&)?question=[^&]/.test(v) || /^\/saved(\?|$)/.test(v)) return v;
  return null;
}
// Pages that show a Back link: links to them carry the search along
export const CARRY_PATHS = /^\/(org|memo|compare|source)(\/|$|\?)/;
export function withBack(href: string, back: string | null): string {
  if (!back || /[?&]back=/.test(href)) return href;
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}back=${encodeURIComponent(back)}${hash != null ? `#${hash}` : ""}`;
}
// The search URL with focus=<ein>: the results scroll to that row and mark it "last viewed"
export function withFocus(back: string, ein: string | null | undefined): string {
  if (!ein || !back.startsWith("/?")) return back; // a search keeps the org it was opened from (Starred has no rows to scroll to)
  const q = new URLSearchParams(back.slice(2));
  q.set("focus", ein);
  return `/?${q}`;
}
// "/org/95-4533883" -> "95-4533883"
export const einOf = (href: string) => /^\/(?:preview\/)?org\/([\d-]{9,10})/.exec(href)?.[1] ?? null;
// Where Back goes and what it says
export function backTarget(back: string | null | undefined, fallback = "/"): { href: string; label: string } {
  const b = safeBack(back);
  if (!b) return { href: fallback, label: "← Back" };
  return { href: b, label: b.startsWith("/saved") ? "← Back to Starred" : "← Back to results" };
}
// The search context of the page you're on: the search itself, or the ?back= it carries
export function contextOf(pathname: string, search: string): string | null {
  const q = new URLSearchParams(search);
  if (pathname === "/" && q.get("question")) { q.delete("focus"); return `/?${q}`; }
  return safeBack(q.get("back"));
}
