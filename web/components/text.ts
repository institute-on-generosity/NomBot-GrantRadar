// IRS filing text (missions, programs) is often ALL CAPS or all lowercase; show it in sentence case, display only (data
// and exports keep the raw text). Proper words come back: US state names, America/American, known acronyms, "I", and
// the words of names passed in (the org's own name). A missing space after a sentence ("everyone.In 2025") is added.
const STATE_NAMES = ["alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico","new york","north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee","texas","utah","vermont","virginia","washington","west virginia","wisconsin","wyoming","los angeles","san francisco","chicago","america","american","americans","african","latino","latina","latinx","hispanic","native american","asian","black","christ","christian","god","jewish","catholic","english","spanish"];
const PROPER = new RegExp(`\\b(${STATE_NAMES.sort((a, b) => b.length - a.length).map((w) => w.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");
const TEXT_ACRONYMS = /\b(usa|u\.s\.|us|ymca|ywca|naacp|aarp|aclu|unicef|pbs|npr|lgbtq?\+?|hiv|aids|k-12|stem|steam|ged|esl|covid(-19)?|501\(c\)\(3\)|ceo|cpr|ptsd|adhd|nfl|nba|mlb|ucla|usc)\b/gi;
export function readable(line: string, names: string[] = []) {
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (!letters) return line;
  const upper = letters.replace(/[^A-Z]/g, "").length / letters.length;
  let t = line.replace(/([a-z]{2})\.([A-Z][a-z])/g, "$1. $2"); // "everyone.In 2025"
  if (upper <= 0.7 && upper > 0.02) return t; // mixed case: as filed
  t = t.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
  t = t.replace(PROPER, (m) => m.replace(/\b[a-z]/g, (c) => c.toUpperCase()))
    .replace(TEXT_ACRONYMS, (m) => (/^covid/i.test(m) ? m.toUpperCase() : m.toUpperCase()))
    .replace(/\bi\b/g, "I")
    .replace(/\(([a-z]{2,6})\)/g, (_m, a: string) => `(${a.toUpperCase()})`); // "(ladf)" is an acronym
  // The org's own name as a phrase keeps its display form ("the Los Angeles Dodgers Foundation (LADF)")
  for (const n of names) {
    const shown = orgName(n, 200).replace(/^The /, "");
    if (shown.split(" ").length < 2) continue;
    t = t.replace(new RegExp(`\\b${shown.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}\\b`, "gi"), shown);
  }
  const own = [...new Set(names.flatMap((n) => n.split(/[^A-Za-z']+/)).filter((w) => w.length > 2 && !/^(the|and|for|inc|foundation|fund|trust|of|corp|association|society|center|club|group)$/i.test(w)))];
  for (const w of own) t = t.replace(new RegExp(`\\b${w}\\b`, "gi"), (m) => m[0].toUpperCase() + m.slice(1).toLowerCase());
  return t;
}

export function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/'S\b/g, "'s")                                        // God'S -> God's
    .replace(/\b[A-Za-z]{1,3}&[A-Za-z]{1,3}\b/g, (m) => m.toUpperCase()); // Lg&E -> LG&E
}

// Foundation and organization names as IRS files them ("WILLIAM & FLORA HEWLETT FDN", "SMITH FAM CHRTBL TR")
// in readable form: IRS abbreviations spelled out, title case with small words lower and acronyms kept.
// Used by research answers (headlines, tiles, bullets, chart labels). max: cut at a whole word.
const ABBR: Record<string, string> = {
  fdn: "Foundation", fdtn: "Foundation", fndn: "Foundation", fndtn: "Foundation", foundatio: "Foundation", foundati: "Foundation", fou: "Foundation",
  chrtbl: "Charitable", charitabl: "Charitable", chartbl: "Charitable", chrt: "Charitable", char: "Charitable",
  assn: "Association", assoc: "Association", natl: "National", intl: "International", meml: "Memorial", mem: "Memorial",
  univ: "University", ctr: "Center", cntr: "Center", svcs: "Services", educ: "Education", fam: "Family", comm: "Community", cmnty: "Community",
};
// Expanded only next to a word that marks a grantmaker ("CHAR TR", "MEM FDN"), never on its own.
const NEAR_ONLY = new Set(["char", "chrt", "mem", "fam", "comm", "fou"]);
const MARKERS = /^(fdn|fdtn|fndn|fndtn|foundation|tr|trust|fund|charitable|chrtbl|family|fam|memorial|meml|mem|char|chrt|fou)$/;
const SPELL: Record<string, string> = { macarthur: "MacArthur", mcarthur: "McArthur", macdonald: "MacDonald", macmillan: "MacMillan", ebay: "eBay", iii: "III" };
const SMALL = new Set(["of", "and", "for", "the", "in", "on", "to", "at", "by", "a", "an", "or", "de", "la"]);
const KEEP = new Set(["st", "dr", "mr", "mrs", "ms", "jr", "sr", "mt", "ft", "pl"]); // no vowel but not acronyms
const ACRONYM = new Set(["usa", "us", "ymca", "ywca", "naacp", "aarp", "aclu", "unicef", "jpb", "uja", "pbs", "npr", "mit", "ucla", "nyu", "lgbt", "lgbtq", "hiv", "aids", "ii", "iii", "iv", "vi", "vii", "viii", "ix", "llc", "lp", "pc", "ua", "fbo", "dtd"]);
export function orgName(raw: string, max = 56): string {
  // Spaced initials are one acronym: "D R E A M ACADEMY" -> "DREAM Academy"
  const joined = raw.replace(/\s+/g, " ").trim().replace(/\b[A-Za-z](?: [A-Za-z]\b){2,}/g, (m) => m.replace(/ /g, "").toUpperCase());
  const words = joined.split(" ");
  const low = words.map((w) => w.toLowerCase().replace(/[.,]+$/, ""));
  const initials = new Set((raw.match(/\b[A-Za-z](?: [A-Za-z]\b){2,}/g) ?? []).map((m) => m.replace(/ /g, "").toLowerCase()));
  const out = words.map((w, i) => {
    const k = low[i];
    const trail = /[,]$/.test(w) ? "," : "";
    let word: string;
    if (initials.has(k) || /^la\d+$/.test(k) || (k === "la" && i > 0 && low.slice(i + 1).every((x) => /^(inc|incorporated|corp|co|ltd|llc)$/.test(x)))) word = k.toUpperCase(); // LA84, "... Academy LA"
    else if (k === "tr" && i > 0 && low[i - 1].length > 1) word = "Trust"; // "SMITH TR", not an initial "T R"
    else if (ABBR[k] && (!NEAR_ONLY.has(k) || MARKERS.test(low[i + 1] ?? "") || MARKERS.test(low[i - 1] ?? ""))) word = ABBR[k];
    else if (SPELL[k]) word = SPELL[k];
    else if (ACRONYM.has(k) || (k.length >= 2 && k.length <= 4 && /^[a-z]+$/.test(k) && !/[aeiouy]/.test(k) && !KEEP.has(k))) word = k.toUpperCase();
    else if (i > 0 && SMALL.has(k)) word = k;
    else word = k.replace(/[a-z][a-z']*/g, (p) => (p.startsWith("mc") && p.length > 3 ? `Mc${p[2].toUpperCase()}${p.slice(3)}` : p[0].toUpperCase() + p.slice(1)))
      .replace(/^([A-Za-z]{1,3})&([A-Za-z]{1,3})$/, (m) => m.toUpperCase()); // LG&E, AT&T
    return word + trail;
  });
  while (out.length > 1 && SMALL.has(out[out.length - 1].toLowerCase())) out.pop(); // IRS cut "FEDERATION OF"
  // Display only: no legal suffix ("Walton Family Foundation Inc" -> "Walton Family Foundation"); data and exports keep the raw name
  while (out.length > 1 && /^(inc|incorporated|corp|corporation|co|ltd|llc|lp)\.?,?$/i.test(out[out.length - 1])) out.pop();
  if (out.length) out[out.length - 1] = out[out.length - 1].replace(/,$/, "");
  let s = out.join(" ");
  if (s.length > max) s = s.slice(0, max + 1).replace(/\s+\S*$/, "").replace(/[\s,&-]+$/, "") + "…";
  return s;
}

// An org or foundation name for display anywhere (no length cut): orgName rules, legal suffix dropped, acronyms kept
export const orgTitle = (raw: string) => orgName(raw, 200);
