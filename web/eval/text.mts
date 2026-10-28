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
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
