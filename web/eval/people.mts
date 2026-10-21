// Board people test: same-person merges (generosity-data 075, board_person_merges) and the middle-initial / suffix guard
// in personSeats and boardLinks. No Claude calls.
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

await db.end?.();
console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
