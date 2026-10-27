// Search summary checks (Oct 26): the computed facts object, the count line and caveat, and the post-check that drops
// any sentence with an organization name or number Claude wasn't given (lib/summaryFacts.ts). No Claude calls.
// With --base, also loads search pages from a running server and checks the summary's count equals the list's count
// (each page costs Claude calls unless the server has it cached).
//   npm run test:summary
//   npm run test:summary -- --base=http://localhost:4000
const { summaryFacts, countLine, caveatLine, factsText, checkSummary, allowedFrom, numbersIn, tidy, countNoun } = await import("../lib/summaryFacts");
type Org = import("../lib/summaryFacts").SummaryOrg;

let fail = 0, pass = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`); };

const org = (name: string, o: Partial<Org> = {}): Org => ({ name, tier: null, cause: "Recreation & Sports", label: null, revenue: null, grants: 0, hasText: true, prefers: [], ...o });
const orgs: Org[] = [
  org("Laxpoint", { tier: "in", revenue: 31_000 }),
  org("Inglewood Little League", { tier: "in", revenue: 132_000 }),
  org("Supreme Elite Basketball", { tier: "in", revenue: 0, hasText: false }),
  org("Swim Up Hill Foundation Inc", { tier: "in", hasText: false }),
  org("The Los Angeles Dodgers Foundation", { tier: "serves", revenue: 12_900_000, grants: 1_200_000 }),
  org("Clockedin", { tier: "serves", cause: "Human Services", revenue: 60_000, grants: 25_000 }),
  org("Second To None Youth Sports Inc", { tier: "nearby", revenue: 135_000, hasText: false }),
];
const tiers = [{ key: "in", label: "in Inglewood" }, { key: "serves", label: "serving Inglewood" }, { key: "nearby", label: "nearby" }];
const f = summaryFacts(orgs, { weaker: 9, related: 115, scored: true, topic: "youth sports programs", grantYears: [2022, 2024], tiers });

// 1. Facts object
check("strong count", f.strong === 7);
check("tier counts", JSON.stringify(f.tiers!.map((t) => t.count)) === "[4,2,1]", JSON.stringify(f.tiers));
check("revenue: zero and missing don't count", f.revenue?.reported === 5 && f.revenue.median === 132_000 && f.revenue.min === 31_000 && f.revenue.max === 12_900_000, JSON.stringify(f.revenue));
check("revenue bands", f.revenue?.under250k === 4 && f.revenue.over1m === 1);
check("funded and total grants", f.funded === 2 && f.grantsTotal === 1_225_000);
check("name only", f.nameOnly === 3);
check("largest two", f.largest.map((l) => l.name).join("|") === "The Los Angeles Dodgers Foundation|Second To None Youth Sports Inc");
const flat = summaryFacts(orgs.map((o) => ({ ...o, tier: null })), { weaker: 3, related: 2345, scored: true, topic: "climate", grantYears: [2022, 2024] });
check("no place: cause split", JSON.stringify(flat.split) === JSON.stringify([{ label: "Recreation & Sports", count: 6 }, { label: "Human Services", count: 1 }]), JSON.stringify(flat.split));
const lab = summaryFacts([org("A", { label: "primary" }), org("B", { label: "primary" }), org("C", { label: "partial" })], { weaker: 0, related: 3, scored: true, topic: "girls coding programs", grantYears: [2022, 2024], labelFilter: true });
check("label filter: main vs partial", JSON.stringify(lab.split.map((s) => [s.label, s.count])) === '[["main focus",2],["partial focus",1]]');
check("count noun", countNoun("youth sports programs", true) === "youth sports programs" && countNoun("climate", true) === "strong matches" && countNoun("health", true) === "strong matches" && countNoun("food banks", false) === "results");

// 2. Count line and caveat
const line = countLine(f);
check("count line", `${line.main} · ${line.parts.join(" · ")}` === "7 youth sports programs · 4 in Inglewood · 2 serving Inglewood · 1 nearby", `${line.main} · ${line.parts.join(" · ")}`);
check("count line: weaker folded", line.more === "9 weaker matches folded in the list");
check("count line: tiers sum to the strong count", f.tiers!.reduce((a, t) => a + t.count, 0) === f.strong);
const fl = countLine(flat);
check("flat count line", fl.main === "7 strong matches" && fl.more === "2,345 related in all", JSON.stringify(fl));
check("unscored flat says results", countLine(summaryFacts(orgs, { weaker: 0, related: 115, scored: false, grantYears: [2022, 2024] })).main === "115 results");
check("one strong match", countLine(summaryFacts([orgs[0]], { weaker: 0, related: 1, scored: true, topic: "youth sports programs", grantYears: [2022, 2024] })).main === "1 strong match");
check("caveat: name only", caveatLine(f) === "3 are known by name only (no IRS program details).", String(caveatLine(f)));
check("caveat: unconfirmed preference", (caveatLine(f, { prefer: ["mobile dental care"] }) ?? "").startsWith("No match's filings mention mobile dental care."));
check("no caveat when it doesn't matter", caveatLine(summaryFacts(orgs.slice(0, 2), { weaker: 0, related: 2, scored: true, grantYears: [2022, 2024] })) === null);
check("facts text has the median", factsText(f).includes("median $132K"));

// 3. Post-check
const figures = factsText(f);
const lines = orgs.map((o) => `${o.name} · ${o.revenue ? `income $${o.revenue}` : ""}`);
const a = allowedFrom([figures, ...lines], [...orgs.map((o) => o.name), "Inglewood", "Los Angeles", "CA", "Recreation & Sports", "Human Services"]);
const good = "Most are small sports groups in Inglewood, with a median income of $132K. The Los Angeles Dodgers Foundation is the largest at $12.9M, and Laxpoint and Inglewood Little League run local leagues. Only 2 of 7 get foundation grants.";
const g = checkSummary(good, a);
check("grounded text passes whole", g.text === good && g.dropped.length === 0, JSON.stringify(g.dropped));
const madeName = checkSummary("Most are small. Sunrise Dental Bus Collective runs a mobile clinic.", a);
check("made-up org name rejected", madeName.text === "Most are small." && /Sunrise/.test(madeName.dropped[0]?.why ?? ""), JSON.stringify(madeName));
const madeNum = checkSummary("Most are small. The median income is $7.3M.", a);
check("made-up number rejected", madeNum.text === "Most are small." && /7\.3M/.test(madeNum.dropped[0]?.why ?? ""), JSON.stringify(madeNum));
check("made-up spelled number rejected", checkSummary("Eleven of them run leagues.", a).text === "");
check("made-up percent rejected", checkSummary("About 63% get grants.", a).text === "");
check("partial exact name passes", checkSummary("The Dodgers Foundation is the largest.", a).dropped.length === 0);
check("altered name rejected", checkSummary("The LA Dodgers Charity is the largest.", a).dropped.length === 1);
check("two names joined by and pass", checkSummary("Groups like Laxpoint and Inglewood Little League are tiny.", a).dropped.length === 0);
check("amount with a decimal stays one sentence", checkSummary("The largest takes in $12.9M a year.", a).text === "The largest takes in $12.9M a year.");
check("sentence-initial word passes", checkSummary("Typical income is $132K.", a).dropped.length === 0);
check("sentence-initial word plus a known name passes", checkSummary("Small Inglewood groups dominate.", a).dropped.length === 0);
check("outside place name rejected", checkSummary("Most sit along the Front Range.", a).dropped.length === 1);
check("numbersIn reads units", JSON.stringify(numbersIn("$1.4M, 44%, 1,234 and eight").map((n) => n.value)) === "[1400000,44,1234,8]");
const t = tidy("Small groups; mostly local — and young");
check("no semicolons or em dashes", !/[;—]/.test(t), t);
check("ranges keep their en dash", tidy("$100K–$1M") === "$100K–$1M");

// 4. Live page: the summary's count equals the list's count.
const base = process.argv.find((x) => x.startsWith("--base="))?.slice(7).replace(/\/$/, "");
if (base) {
  for (const q of ["Youth sports programs in Inglewood, CA", "food banks in Ohio"]) {
    const html = await (await fetch(`${base}/?question=${encodeURIComponent(q)}`)).text();
    const sum = /class="sum-count" data-strong="(\d+)"/.exec(html)?.[1];
    const bar = [...html.matchAll(/<span>([\d,]+) strong match(?:es)?(?: in \d+ groups?| · )/g)].map((m) => m[1].replace(/,/g, "")).pop();
    check(`page: summary count = list count (${q})`, sum != null && sum === bar, `summary ${sum}, list ${bar}`);
    check(`page: no semicolons or em dashes in the summary (${q})`, !/class="sum-text">[^<]*[;—]/.test(html));
  }
}

console.log(fail ? `\n${fail} failed, ${pass} passed` : `\nall ${pass} passed`);
process.exit(fail ? 1 : 0);
