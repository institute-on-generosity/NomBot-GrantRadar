import { readable } from "./text";

// One short excerpt of the filing text, centered on the first required term
// (e.g. "workforce"), with every required term highlighted.
export function Snippet({ text, patterns, max = 200 }: { text: string; patterns: string[]; max?: number }) {
  const t = readable(text);
  const re = patterns.length ? new RegExp(`(${patterns.join("|")})`, "gi") : null;
  let start = 0;
  if (re) {
    const m = new RegExp(patterns.join("|"), "i").exec(t);
    if (m && m.index > max - 60) start = Math.max(0, m.index - 70);
  }
  let s = t.slice(start, start + max);
  if (start > 0) s = "…" + s.replace(/^\S*\s/, "");
  if (start + max < t.length) s = s.replace(/\s\S*$/, "") + "…";
  const parts = re ? s.split(re) : [s];
  return (
    <div className="line">
      {parts.map((p, i) => (re && i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
    </div>
  );
}
