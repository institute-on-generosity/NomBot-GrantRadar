import { readable } from "./text";

const MAX = 150; // characters per bullet (CSS trims each to one line)

// Cut at a word boundary, with an ellipsis when shortened.
const clip = (t: string, n = MAX) => (t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`);
const firstSentence = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z])/)[0];

// An excerpt centered on the first required term (e.g. "job training"), or the opening sentence.
function excerpt(t: string, find: RegExp | null) {
  const m = find?.exec(t);
  if (!m || m.index < 50) return clip(firstSentence(t).length > 40 ? firstSentence(t) : t);
  const s = t.slice(Math.max(0, m.index - 30)).replace(/^\S*\s/, "").replace(/^[|\s]+/, ""); // "|" separates programs
  return `…${clip(s)}`;
}

function Marked({ text, patterns }: { text: string; patterns: string[] }) {
  const re = patterns.length ? new RegExp(`(${patterns.join("|")})`, "gi") : null;
  const parts = re ? text.split(re) : [text];
  return <>{parts.map((p, i) => (re && i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}

// A result's preview: one line, the mission (searched terms highlighted). Programs only when there's
// no mission on file. Size and team sit in the line above.
export function Preview({ mission, programs, patterns }: { mission: string | null; programs: string | null; patterns: string[] }) {
  const find = patterns.length ? new RegExp(patterns.join("|"), "i") : null;
  const tidy = (t: string) => readable(t).replace(/\s+/g, " ").trim(); // filings wrap lines and double-space
  const m = mission ? tidy(mission) : null;
  const p = programs && programs !== mission ? tidy(programs) : null;
  const text = m ?? p;
  if (!text) return null;
  return <p className="preview-line"><b>{m ? "Mission:" : "Programs:"}</b> <Marked text={excerpt(text, find)} patterns={patterns} /></p>;
}
