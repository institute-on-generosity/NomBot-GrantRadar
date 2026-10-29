// Is this website the organization we think it is? (Oct 29, web profiles for orgs with no 990 program text.) Pure rules,
// no AI: the org's distinctive name words must be on the page, plus one place or identity clue (EIN, street address,
// ZIP, or city). Unsure means skip. Used by scripts/web-profiles.mts, tested by eval/webprofile.mts.

export type OrgId = { ein: string; name: string; city: string | null; zip: string | null; street: string | null };
export type Match = { same: boolean; nameScore: number; match: "name+ein" | "name+address" | "name+zip" | "name+city" | "name+region" | null; confidence: "high" | "medium" | null };

// Words that don't tell orgs apart
const GENERIC = new Set("the of and for in a an inc incorporated corp corporation co ltd llc foundation fdn fund trust association assn society center ctr club group organization org nonprofit non profit program programs services service community los angeles la ca california inglewood usa us america american national international".split(" "));
const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// Spaced initials are one word ("H O O P" -> "hoop"), as on the org's own site
const joinInitials = (s: string) => s.replace(/\b([a-z])(?: ([a-z])\b)+/g, (m) => m.replace(/ /g, ""));

export function nameWords(name: string): string[] {
  const ws = joinInitials(norm(name)).split(" ").filter((w) => w.length > 1 && !GENERIC.has(w));
  return ws.length ? ws : joinInitials(norm(name)).split(" ").filter((w) => w.length > 1); // an all-generic name keeps its words
}

export function matchOrg(pageText: string, org: OrgId): Match {
  const page = ` ${joinInitials(norm(pageText))} `;
  const words = nameWords(org.name);
  const hits = words.filter((w) => page.includes(` ${w} `) || page.includes(` ${w}s `));
  const nameScore = words.length ? hits.length / words.length : 0;
  const compact = page.replace(/ /g, "");
  const nameAsOne = words.join("");
  const name = nameScore >= 0.8 || (nameAsOne.length >= 6 && compact.includes(nameAsOne));
  const ein = org.ein.replace(/\D/g, "");
  const hasEin = new RegExp(`\\b${ein.slice(0, 2)}\\s*-?\\s*${ein.slice(2)}\\b`).test(pageText);
  const st = norm(org.street ?? "").match(/^(\d+) ([a-z0-9]+(?: [a-z0-9]+)?)/);
  const hasAddress = !!st && page.includes(` ${st[1]} `) && page.includes(` ${st[2].split(" ")[0]} `);
  const hasZip = !!org.zip && new RegExp(`\\b${org.zip.slice(0, 5)}\\b`).test(pageText);
  const hasCity = !!org.city && page.includes(` ${norm(org.city)} `);
  // A full, distinctive name (two or more telling words, all on the page) in the right region (Los Angeles, the South
  // Bay, Southern California) is a medium match: a same-named org elsewhere is unlikely to say it works there
  const fullName = words.length >= 2 && hits.length === words.length;
  const hasRegion = !!org.city && /\b(los angeles|south bay|south la|southern california|la county|socal)\b/.test(page) && (!org.zip || /^9[0-3]/.test(org.zip));
  const match = !name ? null : hasEin ? "name+ein" : hasAddress ? "name+address" : hasZip ? "name+zip" : hasCity ? "name+city" : fullName && hasRegion ? "name+region" : null;
  return { same: !!match, nameScore: +nameScore.toFixed(2), match, confidence: match ? (match === "name+city" || match === "name+region" ? "medium" : "high") : null };
}

// Sites that list or host many orgs: never an org's own website
export const NOT_OWN_SITE = /(^|\.)(facebook|instagram|linkedin|twitter|x|youtube|tiktok|guidestar|candid|propublica|causeiq|charitynavigator|greatnonprofits|idealist|yelp|bizapedia|opencorporates|dnb|zoominfo|nonprofitlight|eintaxid|taxexemptworld|charityweb|give\.?lively|gofundme|eventbrite|google|wikipedia|mapquest|yellowpages|bbb|manta|buzzfile|irs|ca\.gov|lacounty\.gov|cityofinglewood|nonprofitfacts|501c3lookup|nonprofitmetrics|instrumentl|grantstation|foundationcenter)\.(com|org|net|gov|co)$/i;
export function ownSite(url: string): boolean {
  try { const h = new URL(url).hostname.replace(/^www\./, ""); return !NOT_OWN_SITE.test(h) && !/\.(gov|edu)$/.test(h); } catch { return false; }
}
