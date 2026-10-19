// IRS text is often ALL CAPS; show it in sentence case.
export function readable(line: string) {
  const letters = line.replace(/[^A-Za-z]/g, "");
  const caps = letters.length > 0 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7;
  return caps ? line.charAt(0) + line.slice(1).toLowerCase() : line;
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
  const words = raw.replace(/\s+/g, " ").trim().split(" ");
  const low = words.map((w) => w.toLowerCase().replace(/[.,]+$/, ""));
  const out = words.map((w, i) => {
    const k = low[i];
    const trail = /[,]$/.test(w) ? "," : "";
    let word: string;
    if (k === "tr" && i > 0 && low[i - 1].length > 1) word = "Trust"; // "SMITH TR", not an initial "T R"
    else if (ABBR[k] && (!NEAR_ONLY.has(k) || MARKERS.test(low[i + 1] ?? "") || MARKERS.test(low[i - 1] ?? ""))) word = ABBR[k];
    else if (SPELL[k]) word = SPELL[k];
    else if (ACRONYM.has(k) || (k.length >= 2 && k.length <= 4 && /^[a-z]+$/.test(k) && !/[aeiouy]/.test(k) && !KEEP.has(k))) word = k.toUpperCase();
    else if (i > 0 && SMALL.has(k)) word = k;
    else word = k.replace(/[a-z][a-z']*/g, (p) => (p.startsWith("mc") && p.length > 3 ? `Mc${p[2].toUpperCase()}${p.slice(3)}` : p[0].toUpperCase() + p.slice(1)))
      .replace(/^([A-Za-z]{1,3})&([A-Za-z]{1,3})$/, (m) => m.toUpperCase()); // LG&E, AT&T
    return word + trail;
  });
  while (out.length > 1 && SMALL.has(out[out.length - 1].toLowerCase())) out.pop(); // IRS cut "FEDERATION OF"
  let s = out.join(" ");
  if (s.length > max) s = s.slice(0, max + 1).replace(/\s+\S*$/, "").replace(/[\s,&-]+$/, "") + "…";
  return s;
}
