// Search summary checks (Oct 26, Oct 27): the computed facts object, the pending and scored count lines, the caveat,
// the panel's Key facts (same set and grant years as the summary), the background-rewrite overlap rule, and the
// post-check that drops any sentence with an organization name or number Claude wasn't given, or that states the
// count (lib/summaryFacts.ts). No Claude calls.
// With --base, also loads search pages from a running server: the instant count line streams before the scored one,
// the summary's count equals the list's and the Key facts' count, and the description never states the count
// (each page costs Claude calls unless the server has it cached).
//   npm run test:summary
//   npm run test:summary -- --base=http://localhost:4000
const { summaryFacts, countLine, caveatLine, factsText, checkSummary, allowedFrom, numbersIn, tidy, countNoun, pendingLine, overlap, REGEN_OVERLAP, keyFactTiles, statesCount, summaryPoints } = await import("../lib/summaryFacts");
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
const flat = summaryFacts(orgs.map((o) => ({ ...o, tier: null })), { weaker: 3, related: 2345, scored: true, topic: "climate change and energy policy work", grantYears: [2022, 2024] });
check("no place: cause split", JSON.stringify(flat.split) === JSON.stringify([{ label: "Recreation & Sports", count: 6 }, { label: "Human Services", count: 1 }]), JSON.stringify(flat.split));
check("count line: no chips without place tiers", countLine(flat).parts.length === 0);
const lab = summaryFacts([org("A", { label: "primary" }), org("B", { label: "primary" }), org("C", { label: "partial" })], { weaker: 0, related: 3, scored: true, topic: "girls coding programs", grantYears: [2022, 2024], labelFilter: true });
check("label filter: main vs partial", JSON.stringify(lab.split.map((s) => [s.label, s.count])) === '[["main focus",2],["partial focus",1]]');
check("count noun: group nouns only", countNoun("youth sports programs", true) === "youth sports programs" && countNoun("food banks", true) === "food banks" && countNoun("climate", true) === "climate groups" && countNoun("arts", true) === "arts groups" && countNoun("youth leadership", true) === "youth leadership groups" && countNoun("food banks", false) === "results");

// 2. Count line and caveat
const line = countLine(f);
check("count line", `${line.main} · ${line.parts.join(" · ")}` === "7 youth sports programs · 4 in Inglewood · 2 serving Inglewood · 1 nearby", `${line.main} · ${line.parts.join(" · ")}`);
check("count line: weaker matches left to the list", line.more === null);
check("count line: tiers sum to the strong count", f.tiers!.reduce((a, t) => a + t.count, 0) === f.strong);
const fl = countLine(flat);
check("flat count line: organizations, related count left to the list", fl.main === "7 organizations" && fl.more === null, JSON.stringify(fl));
check("unscored flat says results", countLine(summaryFacts(orgs, { weaker: 0, related: 115, scored: false, grantYears: [2022, 2024] })).main === "115 results");
check("one strong match", countLine(summaryFacts([orgs[0]], { weaker: 0, related: 1, scored: true, topic: "youth sports programs", grantYears: [2022, 2024] })).main === "1 organization");
check("caveat: name only", caveatLine(f) === "3 are known by name only (no IRS program details).", String(caveatLine(f)));
check("caveat: unconfirmed preference", (caveatLine(f, { prefer: ["mobile dental care"] }) ?? "").startsWith("No match's filings mention mobile dental care."));
check("no caveat when it doesn't matter", caveatLine(summaryFacts(orgs.slice(0, 2), { weaker: 0, related: 2, scored: true, grantYears: [2022, 2024] })) === null);
check("facts text has the median", factsText(f).includes("median $132K"));
check("facts text: closest basis says so", factsText(f, "closest").startsWith("Closest matches read (by meaning, not yet checked one by one): 7") && factsText(f).startsWith("Strong matches read: 7"));
const pl = pendingLine(115, [{ label: "in Inglewood", count: 40 }, { label: "serving Inglewood", count: 0 }, { label: "nearby", count: 75 }]);
check("pending line: total and tier totals, empty tiers dropped", `${pl.main} · ${pl.parts.join(" · ")}` === "115 candidates · 40 in Inglewood · 75 nearby" && pl.more === "ranking by relevance…", JSON.stringify(pl));
check("pending line: one candidate, no tiers", pendingLine(1).main === "1 candidate" && pendingLine(1).parts.length === 0);

// 2b. Key facts: the summary's set ("of the N shown") and its grant years
const kf = keyFactTiles(f, { count: 3, of: 6 });
check("key facts: at most 3 tiles, the count left to the summary", kf.shown === f.strong && kf.tiles.length <= 3 && !kf.tiles.some((t) => t.label.includes("shown")));
check("key facts: no repeat of the summary's median income", !kf.tiles.some((t) => t.label.includes("median")), JSON.stringify(kf.tiles));
check("key facts: grants use the summary's years", kf.tiles.some((t) => t.label === "from foundations, 2022–24" && t.value === "$1.2M" && !t.note), JSON.stringify(kf.tiles));
check("key facts: deficit share, with how many report only when not all", kf.tiles.some((t) => t.value === "50%" && t.note === "6 report"));
check("key facts: the base is stated once", kf.basis === "Of the 7 shown", kf.basis);
check("key facts: small deficit samples skipped", !keyFactTiles(f, { count: 1, of: 2 }).tiles.some((t) => t.label.includes("spent more")));

// 2b'. Points under the lead sentence: computed from the scored set
const pts = summaryPoints(f, [{ name: "The Los Angeles Dodgers Foundation", revenue: 12_900_000 }, { name: "Second To None Youth Sports Inc", revenue: 135_000 }]);
check("points: size, grants, largest", JSON.stringify(pts.map((p) => p.text)) === JSON.stringify(["$132K median yearly income", "2 of 7 got foundation grants, 2022–24", "Largest: The Los Angeles Dodgers Foundation $12.9M, Second To None Youth Sports Inc $135K"]), JSON.stringify(pts));
check("points: no semicolons or em dashes", pts.every((p) => !/[;—]/.test(p.text)));

// 2c. Background rewrite rule: only when under 60% of what the first description read is a strong match
check("overlap: share of the read set that is strong", overlap(["a", "b", "c", "d", "e"], ["a", "b", "c", "x"]) === 0.6 && REGEN_OVERLAP === 0.6);
check("overlap: 3 of 5 keeps the first text, 2 of 5 rewrites", overlap(["a", "b", "c", "d", "e"], ["a", "b", "c"]) >= REGEN_OVERLAP && overlap(["a", "b", "c", "d", "e"], ["a", "b"]) < REGEN_OVERLAP);
check("overlap: nothing read never rewrites", overlap([], ["a"]) === 1);

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
check("count statement rejected", checkSummary("There are 7 strong matches. Most are small.", a).text === "Most are small.");
check("N results / N closest matches rejected", statesCount("These 7 results are mostly leagues.") && statesCount("The 7 closest matches run leagues.") && statesCount("Seven matches are local."));
check("\"of the N\" and plain shares pass", !statesCount("2 of the 7 closest matches get grants.") && !statesCount("Most of the closest matches are small leagues.") && !statesCount("Only 2 of 7 get foundation grants."));
check("numbersIn reads units", JSON.stringify(numbersIn("$1.4M, 44%, 1,234 and eight").map((n) => n.value)) === "[1400000,44,1234,8]");
const t = tidy("Small groups; mostly local — and young");
check("no semicolons or em dashes", !/[;—]/.test(t), t);
check("ranges keep their en dash", tidy("$100K–$1M") === "$100K–$1M");

// 4. Live page: the instant count line streams first; the scored one equals the list's count and the Key facts';
// the description never states the count.
const base = process.argv.find((x) => x.startsWith("--base="))?.slice(7).replace(/\/$/, "");
if (base) {
  for (const q of ["Youth sports programs in Inglewood, CA", "food banks in Ohio"]) {
    const html = await (await fetch(`${base}/?question=${encodeURIComponent(q)}`)).text();
    const sum = /class="sum-count" data-strong="(\d+)"/.exec(html)?.[1];
    const bar = [...html.matchAll(/<span(?: class="sr-only")?>([\d,]+) strong match(?:es)?(?: in \d+ groups?| · )/g)].map((m) => m[1].replace(/,/g, "")).pop();
    const key = /aria-label="Key facts" data-shown="(\d+)"/.exec(html)?.[1];
    const text = (/class="sum-text"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/<!-- -->/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
    const pend = html.indexOf('class="sum-count" aria-busy="true"'), scored = html.indexOf('class="sum-count" data-strong=');
    check(`page: summary count = list count (${q})`, sum != null && sum === bar, `summary ${sum}, list ${bar}`);
    check(`page: Key facts count = summary count (${q})`, key != null && key === sum, `key facts ${key}, summary ${sum}`);
    check(`page: instant count line before the scored one (${q})`, pend >= 0 && scored > pend, `${pend} ${scored}`);
    check(`page: description present and never states the count (${q})`, text.length > 30 && !statesCount(text), text.slice(0, 120));
    check(`page: the lead is one complete sentence of at most 18 words (${q})`, text.split(/\s+/).filter(Boolean).length <= 18 && !text.endsWith("…"), text);
    check(`page: no semicolons or em dashes in the summary (${q})`, !/[;—]/.test(text));
  }
}

console.log(fail ? `\n${fail} failed, ${pass} passed` : `\nall ${pass} passed`);
process.exit(fail ? 1 : 0);
