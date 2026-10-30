// Recents and starred searches (Oct 29): one entry per question, a rerun moves to the top, stars persist and never
// age out. Runs lib/history against an in-memory localStorage (the browser API it uses).
//   npm run test:history
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  window: { dispatchEvent: () => true },
});
const h = await import("../lib/history");
let fails = 0;
const ok = (c: boolean, what: string) => { if (c) console.log(`ok    ${what}`); else { fails++; console.log(`FAIL  ${what}`); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

h.recordSearch({ question: "How much foundation money goes to health?", href: "/research/ask?q=health", total: 1 }); await sleep(2);
h.recordSearch({ question: "How much foundation money goes to education?", href: "/research/ask?q=education", total: 1 }); await sleep(2);
h.recordSearch({ question: "how much foundation money goes to HEALTH ", href: "/research/ask?q=health2", total: 1 });
let list = h.readHistory();
ok(list.length === 2, `the same question asked again is one entry (${list.length})`);
ok(list[0].key === h.historyKey("How much foundation money goes to health") && list[0].href === "/research/ask?q=health2", "a rerun moves to the top with its newest link");
// Old lists with repeats are merged on read
store.set(h.HISTORY_KEY, JSON.stringify([{ key: "a", question: "Youth sports in Inglewood?", href: "/1", total: 1, at: 5 }, { key: "b", question: "youth sports in inglewood", href: "/2", total: 1, at: 9 }, { key: "c", question: "Food banks", href: "/3", total: 1, at: 7 }]));
list = h.readHistory();
ok(list.length === 2 && list[0].href === "/2", "existing repeats merge on read, the newest kept");
// Stars
ok(h.toggleStar({ question: "Food banks", href: "/3" }) === true && h.isStarred("food banks?"), "star a search");
ok(h.readStarred().length === 1, "starred list persists in storage");
for (let i = 0; i < 60; i++) h.recordSearch({ question: `question ${i}`, href: `/q${i}`, total: 0 });
ok(h.readHistory().length <= 50 && h.isStarred("Food banks"), "a starred search never ages out when Recents fills up");
const reread = JSON.parse(store.get(h.STARRED_KEY)!);
ok(reread[0].question === "Food banks", "persists across reload (read back from storage)");
ok(h.toggleStar({ question: "Food banks", href: "/3" }) === false && !h.isStarred("Food banks"), "unstar removes it");
// Short labels keep the part that tells questions apart
const a = h.shortQuestion("How much foundation money goes to health care in Inglewood?"), b = h.shortQuestion("How much foundation money goes to education in Inglewood?");
ok(a !== b && a.includes("…") && /care in Inglewood\?$/.test(a) && /education in Inglewood\?$/.test(b), `long questions keep the part that differs (${a} | ${b})`);
ok(h.shortQuestion("Food banks in Ohio") === "Food banks in Ohio", "short questions unchanged");
ok(![a, b].some((x) => /;|—/.test(x)), "no semicolons or em dashes");
const labels = h.rowLabels(["How much foundation money goes to health?", "How much foundation money goes to education?", "Youth sports programs in Inglewood, CA"]);
ok(labels[2] === "Youth sports programs in Inglewood, CA" && labels[0] !== labels[1] && /education\?$/.test(labels[1]), `only questions that start alike are shortened (${labels.join(" | ")})`);
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
