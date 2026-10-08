// When a foundation takes applications, read from its 990-PF "deadlines" answer (Part XV 2c).
// Deterministic rules, no Claude: named months ("JANUARY 15 AND AUGUST 15" → Jan, Aug), "no deadline"
// style answers → any time, "quarterly" → quarterly. "May" counts only as a date ("May 1", "May and June"),
// not the verb ("applications may be submitted"). Anything else (or blank) is unclear.
export type Deadline = { months: number[]; anytime: boolean; quarterly: boolean };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may(?=\s*(?:\d|$|[,.;&]|and\b|or\b|of\b|through\b|to\b))|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/g;
const ANYTIME = /\b(none|no (submission |specific |set |application |current )?deadlines?|no$|rolling|any ?time|ongoing|open|year.?round|throughout the year|continuous|as (needed|received)|daily|periodically)\b/;

export function parseDeadline(text: string | null): Deadline | null {
  const t = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || /^(n\/?a|-+|not applicable|see statement.*)$/.test(t)) return null;
  const months = [...new Set([...t.matchAll(MONTH)].map((m) => MONTHS.indexOf(m[1].slice(0, 3))))].sort((a, b) => a - b);
  // Numeric dates: "12/31", "03 31", "7 1 2024", "03152025" (month first, as US filers write them).
  const num = /^(0?[1-9]|1[0-2])(?:[/\s.-]\d{1,2}\b|\d{6}$)/.exec(t);
  if (num) months.push(Number(num[1]) - 1);
  if (months.length) return { months: [...new Set(months)].sort((a, b) => a - b), anytime: false, quarterly: false };
  if (/quarter/.test(t)) return { months: [], anytime: false, quarterly: true };
  if (ANYTIME.test(t)) return { months: [], anytime: true, quarterly: false };
  return null;
}

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
