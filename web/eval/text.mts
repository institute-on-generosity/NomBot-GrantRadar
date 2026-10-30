// Display casing for IRS names and filing text (Oct 27, round-2 audit V3). Display only: data and exports stay raw.
//   npm run test:text
import { orgTitle, readable } from "../components/text";
let fails = 0;
const eq = (got: string, want: string) => { if (got === want) console.log(`ok    ${want}`); else { fails++; console.log(`FAIL  got "${got}", want "${want}"`); } };
eq(orgTitle("H O O P FOUNDATION HOLISTIC OFFERINGS & OPPORTUNITY PEOPLE"), "HOOP Foundation Holistic Offerings & Opportunity People");
eq(orgTitle("D R E A M ACADEMY LA INC"), "DREAM Academy LA");
eq(orgTitle("INGLEWOOD SC"), "Inglewood SC");
eq(orgTitle("LA84 FOUNDATION"), "LA84 Foundation");
eq(orgTitle("HELEN AND WILL WEBSTER FOUNDATION"), "Helen and Will Webster Foundation");
eq(orgTitle("CASA DE LA ROSA"), "Casa de la Rosa");
eq(orgTitle("WILLIAM & FLORA HEWLETT FDN"), "William & Flora Hewlett Foundation");
eq(readable("the los angeles dodgers foundation (ladf) is the official team charity of the los angeles dodgers.", ["THE LOS ANGELES DODGERS FOUNDATION"]),
  "The Los Angeles Dodgers Foundation (LADF) is the official team charity of the Los Angeles Dodgers.");
eq(readable("TO ASSIST THIRTEEN AND FOURTEEN YEAR OLDS IN CALIFORNIA. WE SERVE K-12 YOUTH"), "To assist thirteen and fourteen year olds in California. We serve K-12 youth");
eq(readable("We help everyone.In 2025 we grew"), "We help everyone. In 2025 we grew");
eq(readable("Mixed Case stays As Filed"), "Mixed Case stays As Filed");
eq(orgTitle("GIRLS INC"), "Girls Inc");
eq(orgTitle("WALTON FAMILY FOUNDATION INC"), "Walton Family Foundation");
// Mission pointers (Oct 29, HOOP Foundation's memo read "See schedule o"): lib/missionText
const { isPlaceholderText, usableMission, cleanPrograms, bestMission } = await import("../lib/missionText");
const yes = (name: string, ok: boolean) => eq(ok ? name : `NOT ${name}`, name);
for (const t of ["SEE SCHEDULE O", "See schedule o", "SEE SCHED", "SEE SCH O", "See attached", "Refer to Schedule O for mission", "PER SCHEDULE O", "see part III", "SEE STATEMENT 1", "N/A", "None", "same as above", "...", ""]) yes(`placeholder: "${t}"`, isPlaceholderText(t));
for (const t of ["See the world through art", "Seeing every child succeed", "TO PROVIDE SAFE HOUSING", "Partnering with families"]) yes(`real mission: "${t}"`, !isPlaceholderText(t));
eq(String(usableMission("TO PROVIDE SAFE HOUSING SEE SCHEDULE O")), "TO PROVIDE SAFE HOUSING");
// HOOP Foundation (EIN 80-0228843): mission "SEE SCHEDULE O", 2024 programs each ending in "SEE SCHEDULE O"
const hoop = { mission: "SEE SCHEDULE O", programs: "HOOP CLUB SEE SCHEDULE O | SHOES TO FILL TOY DRIVE SEE SCHEDULE O | KIDS VENICE BASKETBALL LEAGUE SEE SCHEDULE O" };
eq(JSON.stringify(bestMission(hoop)), JSON.stringify({ text: "HOOP CLUB | SHOES TO FILL TOY DRIVE | KIDS VENICE BASKETBALL LEAGUE", source: "programs" }));
eq(String(cleanPrograms("SEE SCHEDULE O | SEE SCHEDULE O")), "null");
eq(JSON.stringify(bestMission({ mission: "See Schedule O", programs: "SEE SCHEDULE O", web: "Youth basketball in Venice." })), JSON.stringify({ text: "Youth basketball in Venice.", source: "website" }));
eq(String(bestMission({ mission: "N/A", programs: null, web: null })), "null");
eq(JSON.stringify(bestMission({ mission: "Build girls of courage", programs: "x" })), JSON.stringify({ text: "Build girls of courage", source: "mission" }));
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
