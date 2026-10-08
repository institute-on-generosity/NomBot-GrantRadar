import { money } from "./money";
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

// A result's preview, one line each: what the organization says it does, the program that
// matches the search (required terms highlighted), and its size and team.
export function Preview({ mission, programs, expenses, staff, volunteers, patterns }: {
  mission: string | null; programs: string | null; expenses: number | null; staff: number | null; volunteers: number | null; patterns: string[];
}) {
  const find = patterns.length ? new RegExp(patterns.join("|"), "i") : null;
  const tidy = (t: string) => readable(t).replace(/\s+/g, " ").trim(); // filings wrap lines and double-space
  const m = mission ? tidy(mission) : null;
  const p = programs && programs !== mission ? tidy(programs) : null;
  const size = [
    expenses ? `${money(expenses)} spent` : null,
    staff != null ? `${staff.toLocaleString("en-US")} staff` : null,
    volunteers ? `${volunteers.toLocaleString("en-US")} volunteers` : null,
  ].filter(Boolean).join(" · ");
  const items = [
    m && { k: "Mission", v: excerpt(m, find) },
    p && { k: "Programs", v: excerpt(p, find) },
    size && { k: "Size", v: size },
  ].filter((x): x is { k: string; v: string } => Boolean(x));
  if (!items.length) return null;
  return (
    <ul className="preview">
      {items.map(({ k, v }) => <li key={k}><b>{k}:</b> <Marked text={v} patterns={patterns} /></li>)}
    </ul>
  );
}
