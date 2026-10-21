// Board people test: same-person merges (generosity-data 075, board_person_merges), splits (078, board_person_splits:
// one name, several people) and the middle-initial / suffix guard in personSeats and boardLinks. No Claude calls.
//   npm run test:people
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }

const { db } = await import("../lib/db");
const { personSeats, boardLinks } = await import("../lib/people");

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) fail++;
};
const eins = async (name: string) => new Set((await personSeats(name)).seats.map((s) => s.ein));

// Nickname pair: STEVEN DANE (043295014) and STEVE DANE (043321157), two boards with 15 members in common
const steven = await eins("Steven Dane"), steve = await eins("Steve Dane");
check("nickname: Steven Dane finds Steve Dane's seat", steven.has("043295014") && steven.has("043321157"), [...steven].join(","));
check("nickname: Steve Dane finds Steven Dane's seat", steve.has("043295014") && steve.has("043321157"), [...steve].join(","));
const links = await boardLinks("043295014");
check("nickname: boardLinks on 043295014 lists 043321157 for Steven Dane",
  links.some((l) => /DANE/i.test(l.name) && l.others.some((o) => o.ein === "043321157")));

// Guard: J MICHAEL KEMP SR (630288846) goes by Michael, so he is not JOHN KEMP (630288847) on the sister board
const { rows: km } = await db.query(
  `SELECT count(*)::int AS n FROM board_person_merges WHERE (ein_a, ein_b) IN (('630288846', '630288847'), ('630288847', '630288846'))`);
check("guard: no merge between J MICHAEL KEMP SR and JOHN KEMP", km[0].n === 0);
const john = await eins("John Kemp");
check("guard: John Kemp's seats leave out 630288846", john.has("630288847") && !john.has("630288846"), [...john].join(","));

// Middle initial and suffix guard: no seat with another middle initial or Jr / Sr
const a = await personSeats("John A Smith");
const bad = a.seats.filter((s) => / [B-Z]\.? /.test(` ${s.name.toUpperCase().replace(/^\s*JOHN\s+/, "JOHN ")} `) && !/ A\.? /i.test(` ${s.name} `)
  && /^JOHN [B-Z]\.? SMITH/i.test(s.name.trim()));
check("middle initial: John A Smith shows no JOHN R / JOHN B ... SMITH seats", bad.length === 0, bad.slice(0, 3).map((s) => s.name).join("; "));
const jr = await personSeats("Robert Scales Jr");
check("suffix: Robert Scales Jr shows no SR seats", !jr.seats.some((s) => /\bSR\b/i.test(s.name)), jr.seats.map((s) => s.name).join("; "));

// Splits (078): JAMES O COLEMAN (Blaffer foundations, TX / LA / IN) and JAMES P COLEMAN (Albany NY housing boards) share
// the key JAMES COLEMAN but are two people; a bare "James Coleman" seat matches neither.
const jo = await personSeats("James O Coleman"), jp = await personSeats("James P Coleman"), jb = await personSeats("James Coleman");
const joE = new Set(jo.seats.map((s) => s.ein)), jpE = new Set(jp.seats.map((s) => s.ein));
check("split: James O Coleman has 760387338, not James P's 141425851", joE.has("760387338") && !joE.has("141425851"), [...joE].join(","));
check("split: James P Coleman has 141425851, not James O's 760387338", jpE.has("141425851") && !jpE.has("760387338"), [...jpE].join(","));
check("split: the two list each other as other people with the name",
  jo.others.some((o) => /^JAMES P COLEMAN$/i.test(o.name)) && jp.others.some((o) => /^JAMES O(WEN)? COLEMAN$/i.test(o.name)));
check("split: bare James Coleman shows no JAMES O / JAMES P COLEMAN seats",
  !jb.seats.some((s) => /^JAMES (O|OWEN|P) COLEMAN$/i.test(s.name.trim())), jb.seats.filter((s) => /^JAMES [OP]/i.test(s.name)).map((s) => s.name).join("; "));
// Jr / Sr split: LINCOLN NAIWI JR and SR (Hawaii iron workers boards). The bare seat at 990055048 is attached to Jr.
const nj = await personSeats("Lincoln Naiwi Jr"), ns = await personSeats("Lincoln Naiwi Sr");
check("split: Lincoln Naiwi Jr shows no SR seats", nj.seats.length > 0 && !nj.seats.some((s) => /\bSR\b/i.test(s.name)), nj.seats.map((s) => s.name).join("; "));
check("split: Lincoln Naiwi Sr shows no JR seats", ns.seats.length > 0 && !ns.seats.some((s) => /\bJR\b/i.test(s.name)), ns.seats.map((s) => s.name).join("; "));
const held = await personSeats("LINCOLN NAIWI", "990055048");
check("split: the seat link (name + ein 990055048) opens the Jr", held.key === nj.key, `${held.key} vs ${nj.key}`);
const nl = (await boardLinks("990055048")).find((l) => /NAIWI/i.test(l.name));
check("split: boardLinks on 990055048 links Naiwi to 990257598 only, not the Sr's boards",
  !!nl && nl.others.some((o) => o.ein === "990257598") && !nl.others.some((o) => ["990166475", "990168649", "990166477"].includes(o.ein)),
  nl?.others.map((o) => o.ein).join(","));

await db.end?.();
console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
