// Data-year badge (Oct 28, advisor research brief: "a data-year badge on every figure"): one small muted pill after a
// number, saying which filing years it comes from ("2022–24", "990 2024", "990-PF 2022–24"). Always from the data.
export const yy = (a: number, b: number) => (a === b ? String(a) : `${a}–${String(b).slice(2)}`);
export function Yr({ children, title }: { children: React.ReactNode; title?: string }) {
  return <span className="yr" title={title}>{children}</span>;
}
// An answer's years: its forms and tax years (Answer.recency); "newest return per org" when it reads each org's latest
export function recencyBadge(r: { form: string; from: number; to: number; newest_per_org: boolean; partial_in_range: number[] } | null | undefined): string | null {
  if (!r || !r.from) return null;
  const form = r.form.replace(/^Form /, "").replace(/ and /g, ", ");
  return `${r.newest_per_org ? "newest returns" : ""}${r.newest_per_org ? ", " : ""}${form ? `${form} ` : ""}${yy(r.from, r.to)}${r.partial_in_range.length ? ` (${r.partial_in_range.join(", ")} partial)` : ""}`;
}
