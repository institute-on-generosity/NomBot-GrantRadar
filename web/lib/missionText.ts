// Mission text that is really a pointer (Oct 29, Hunter: HOOP Foundation's memo read "See schedule o"). Many 990s put
// "SEE SCHEDULE O", "See attached", "N/A" or a cut-off "SEE SCHED" in the mission box, and program lines like
// "HOOP CLUB SEE SCHEDULE O". We don't load Schedule O, so the fallback is the program description, then the org's
// own website summary, else nothing. Used wherever a mission shows: search rows (lib/search), org pages (lib/org),
// hover cards (lib/orgPreview), memos (lib/brief, PDF and Word) and the reports. Pure, tested in eval/text.mts.

// The whole text is a pointer elsewhere, a non-answer, or a cut-off pointer
const POINTER = /^(?:see|refer to|refer|per|as (?:stated|described|listed) (?:in|on)|please see|described (?:in|on))\b[\s:,-]*(?:the\s+)?(?:attached|attachment|schedule|sched|sch|statement|stmt|part|form|below|above|exhibit|addendum|supplement|organization'?s? (?:website|bylaws))\b.{0,40}$/i;
const NONE = /^(?:n\/?a|none|na|nil|not applicable|same(?: as (?:above|prior year|last year))?|\.+|-+|x+|\?+|0)$/i;
// "SEE SCHEDULE O", "SEE SCH O", "(SEE SCHEDULE O)" inside a longer line
const POINTER_IN = /[(\[]?\s*\b(?:see|refer to|per)\s+(?:the\s+)?(?:schedule|sched|sch)\.?\s*o\b(?:\s*(?:for|part)[^|.;]*)?[)\]]?/gi;

export function isPlaceholderText(t: string | null | undefined): boolean {
  const s = (t ?? "").replace(/\s+/g, " ").trim().replace(/[.:;,]+$/, "");
  if (!s) return true;
  if (NONE.test(s) || POINTER.test(s)) return true;
  // What's left once the pointers are removed is too short to say anything ("SEE SCH O" cut to "SEE SCH")
  return s.replace(POINTER_IN, "").replace(/[^a-z]/gi, "").length < 4;
}
// Program lines with their pointers removed; a line that was only a pointer is dropped. Null when nothing is left.
export function cleanPrograms(t: string | null | undefined): string | null {
  if (!t) return null;
  const parts = t.split(/\s*\|\s*/).map((p) => p.replace(POINTER_IN, " ").replace(/\s+/g, " ").trim().replace(/^[-:,]\s*|\s*[-:,]$/g, "")).filter((p) => !isPlaceholderText(p));
  return parts.length ? parts.join(" | ") : null;
}
export function usableMission(t: string | null | undefined): string | null {
  return t && !isPlaceholderText(t) ? t.replace(POINTER_IN, " ").replace(/\s+/g, " ").trim() || null : null;
}
// The best line to show as what the org does: its mission, else its programs, else its website summary
export function bestMission(o: { mission?: string | null; programs?: string | null; web?: string | null }): { text: string; source: "mission" | "programs" | "website" } | null {
  const m = usableMission(o.mission);
  if (m) return { text: m, source: "mission" };
  const p = cleanPrograms(o.programs);
  if (p) return { text: p, source: "programs" };
  return o.web?.trim() ? { text: o.web.trim(), source: "website" } : null;
}
