// Web profile matcher and the report's one-page summary rules (Oct 29). No network, no database.
//   npm run test:webprofile
import { matchOrg, nameWords, ownSite } from "../lib/webMatch";
import { badgeOf, choosePicks, gapsOf, programsFor } from "../lib/reportBrief";
import { localFirst } from "../lib/rerank";
import type { Ranked } from "../lib/rerank";
import type { Scope } from "../lib/place";
let fails = 0;
const ok = (c: boolean, what: string) => { if (c) console.log(`ok    ${what}`); else { fails++; console.log(`FAIL  ${what}`); } };
const org = { ein: "954533883", name: "CHILDRENS DENTAL CENTER", city: "INGLEWOOD", zip: "90301", street: "300 E BUCKTHORN ST" };

// 1. Same org: distinctive name words plus EIN, address, ZIP or city
ok(matchOrg("The Children's Dental Center. 300 E. Buckthorn Street, Inglewood, CA 90301", org).match === "name+address", "name and street address: high");
ok(matchOrg("Childrens Dental Center, Inglewood, California", org).match === "name+city" && matchOrg("Childrens Dental Center, Inglewood", org).confidence === "medium", "name and city only: medium");
ok(matchOrg("Children's Dental Center EIN 95-4533883", org).match === "name+ein", "name and EIN");
ok(!matchOrg("Dental Center of Pasadena, 90301", org).same, "missing a name word: not the same org");
ok(!matchOrg("Childrens Dental Center, Portland, Oregon", org).same, "right name, wrong place: not the same org");
ok(matchOrg("Proud Fathers mentors dads across Los Angeles", { ein: "471935868", name: "PROUD FATHERS", city: "INGLEWOOD", zip: "90301", street: null }).match === "name+region", "full distinctive name in the LA region: medium");
ok(!matchOrg("Proud Fathers mentors dads in Chicago", { ein: "471935868", name: "PROUD FATHERS", city: "INGLEWOOD", zip: "90301", street: null }).same, "full name in another region: no");
ok(!matchOrg("Lotus Foundation, Los Angeles", { ein: "1", name: "LOTUS GARDEN FOUNDATION", city: "INGLEWOOD", zip: "90301", street: null }).same, "region needs the full name");
ok(matchOrg("Welcome to HOOP Foundation in Inglewood", { ein: "800228843", name: "H O O P FOUNDATION HOLISTIC OFFERINGS & OPPORTUNITY PEOPLE", city: "INGLEWOOD", zip: "90302", street: null }).same === false, "a long legal name needs most of its words");
ok(nameWords("H O O P FOUNDATION").join() === "hoop", "spaced initials are one word");
ok(matchOrg("HOOP Foundation basketball league, Inglewood CA 90302", { ein: "1", name: "H O O P FOUNDATION", city: "INGLEWOOD", zip: "90302", street: null }).match === "name+zip", "spaced initials match the site's spelling");
// 2. Own site only
ok(!ownSite("https://www.facebook.com/hoopfoundation") && !ownSite("https://www.guidestar.org/profile/1") && !ownSite("https://projects.propublica.org/x"), "directories and social media are never own sites");
ok(ownSite("https://www.tcdc.org/") && ownSite("https://laxpoint.org"), "an org domain is");

// 3. One-page summary rules
const r = (o: Partial<Ranked> & { ein: string; tier: string; score: number }): Ranked => ({ ein: o.ein, name: o.name ?? `ORG ${o.ein}`, city: "INGLEWOOD", state: "CA", ntee: null, revenue: o.revenue ?? null, financials: null, health: null, mission: o.mission ?? null, programs: null, team: null, filing: o.filing ?? null,
  exact: null, score: 0, data_completeness: "basic", sources: [], label: null, place: { tier: o.tier as "in", basis: "hq", note: "" }, relevance: { score: o.score, why: "Fits. More detail." }, web: o.web ?? null, prefer: o.prefer } as Ranked);
const y = new Date().getFullYear();
const rows = [r({ ein: "1", tier: "nearby", score: 95 }), r({ ein: "2", tier: "in", score: 72, filing: { year: y - 1, form: "990" } }), r({ ein: "3", tier: "serves", score: 90 }), r({ ein: "4", tier: "in", score: 88 }), r({ ein: "5", tier: "in", score: 60 })];
ok(choosePicks(rows).map((x) => x.ein).join() === "1,3,4,2", `picks: 70+, local first on close scores, a clearly better nearby match still wins (${choosePicks(rows).map((x) => x.ein).join()})`);
// Local-first tie-break (Inglewood v3): HOOP (in Inglewood, 80) above a nearby club (82); a nearby 90 still above a local 70
const hoop = r({ ein: "h", tier: "in", score: 80 }), club = r({ ein: "c", tier: "nearby", score: 82 }), dodgers = r({ ein: "d", tier: "serves", score: 80 });
ok(localFirst([club, dodgers, hoop]).map((x) => x.ein).join() === "h,d,c", "local first: in the place, then serving, above a nearby club 2 points higher");
ok(localFirst([r({ ein: "l", tier: "in", score: 70 }), r({ ein: "n", tier: "nearby", score: 90 })])[0].ein === "n", "a much better nearby match still ranks first");
ok(localFirst([club, hoop, r({ ein: "u", tier: "in", score: 10, relevance: null } as never)]).at(-1)!.ein === "u", "unscored rows last");
ok(badgeOf(rows[1], false) === "Active filer" && badgeOf(rows[3], true) === "Website live" && badgeOf(rows[3], false) === "Name only", "badges: active filer, website live, name only");
const inglewood = { kind: "city", city: "INGLEWOOD", state: "CA", label: "Inglewood, CA", zips: [], near: [], county: null } as Scope;
const progs = programsFor(inglewood, "Health nonprofits in Inglewood, CA, especially mobile dental care (dental bus)");
ok(progs.length >= 5 && progs.some((p) => p.serves === "confirmed") && progs.every((p) => p.url.startsWith("https://")), `dental programs for Inglewood (${progs.length}, each with a source)`);
ok(programsFor(inglewood, "Youth sports programs in Inglewood, CA").length === 0, "no dental programs for a sports question");
const gaps = gapsOf(rows, rows.filter((x) => x.place?.tier === "in" && (x.relevance?.score ?? 0) >= 70), progs, "Inglewood", "dental care");
ok(/^No confirmed mobile or school-based dental service \(dental bus\) in Inglewood\. Confirmed fixed-site option: Inglewood Clinic Group/.test(gaps[0] ?? ""), `dental gap names the confirmed options (${gaps[0]?.slice(0, 90)})`);
ok(gaps.some((g) => /^Only 2 strong matches are based in Inglewood\./.test(g)), "thin place gap");
ok(gaps.every((g) => !/;|—/.test(g)), "no semicolons or em dashes in gaps");
const girls = gapsOf(rows, rows.slice(1, 4), [], "Inglewood", "youth leadership", new Set(["4"]), "girls");
ok(girls.some((g) => /^Few groups based in Inglewood match "girls": none confirmed/.test(g)), "preference gap");
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
