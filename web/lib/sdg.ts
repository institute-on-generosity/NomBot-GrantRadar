// The 17 UN Sustainable Development Goals as NomBot's cause taxonomy: one source of truth for the home Research
// blocks (lib/examples.ts), Browse by cause (/browse, lib/browse.ts) and SDG phrasing in research questions
// (lib/answerRoute.ts: "SDG 4", "Goal 13", "quality education", "life below water").
// Each goal -> subcategories -> what the answer engine can query: a graded cause label (lib/labels.ts), IRS NTEE code
// prefixes, or a keyword set (approximate). Coverage is said plainly: label, NTEE, keywords or not covered yet.
// Goal names and texts: UN SDG goals and targets (https://sdgs.un.org/goals). Plain subtitles are ours.
// Several goals are mostly about governments and infrastructure (9, 12, 16, 17): we map what US nonprofits do and
// say "limited nonprofit data". Animal welfare has no SDG target, so it sits under Life on Land, the nearest goal.
// Client-safe: no database imports.
import { isLabel, type LabelSlug } from "./labels";

export type Coverage = "label" | "ntee" | "keywords" | "none";
// Labels being graded in generosity-data (a separate label agent, Oct 26). Until one loads, its subcategory counts
// by the NTEE codes below. TODO(labels): once `environment`, `workforce` or `healthcare` is in lib/labels.ts LABELS
// (and answerSpec LABELS, with its router line and LABEL_SCOPE), causeOf() switches that subcategory to the label
// with no other change here. Then bump the browse cache (BROWSE_VERSION in lib/browse.ts) and re-run eval/browse.mts.
export const PENDING_LABELS = ["environment", "workforce", "healthcare"] as const;
export const COVERAGE_TEXT: Record<Coverage, string> = { label: "Graded label", ntee: "IRS codes", keywords: "Keywords, approximate", none: "Not in our data yet" };
export type PendingLabel = (typeof PENDING_LABELS)[number];

export type Sub = {
  id: string;           // unique across the taxonomy, used in /browse/<sdg>/<id>
  name: string;         // plain name, "Food banks and pantries"
  plain: string;        // what it counts, one line
  coverage: Coverage;
  label?: LabelSlug;    // coverage label
  ntee?: string[];      // coverage ntee: IRS NTEE prefixes (max 8, the engine's limit). Corrected codes: "With corrected categories?"
  keywords?: string[];  // coverage keywords: words in names and 990 mission text (approximate)
  pending?: PendingLabel; // a label in progress that will replace the NTEE codes (causeOf)
  targets?: string[];   // UN targets it serves, "4.1"
  note?: string;        // an honest limit
  alias?: RegExp;       // other words that name it in a question, besides its name
};
export type Pillar = "people" | "planet" | "prosperity" | "peace" | "partnership";
export type Sdg = {
  n: number;
  name: string;         // official short name, "Quality Education"
  goal: string;         // official goal text
  plain: string;        // plain-language subtitle
  pillar: Pillar;       // the UN's five Ps
  color: string;        // official SDG color
  coverage: "label" | "ntee" | "limited";
  limited?: string;     // why nonprofit data covers it only in part
  scope: Sub;           // the whole goal as one engine cause (block figures)
  subs: Sub[];
  seeAlso?: string[];   // subcategory ids under other goals that serve it too
  alias?: RegExp;       // other names for the goal in a question
};

export const PILLARS: { id: Pillar; name: string; plain: string }[] = [
  { id: "people", name: "People", plain: "Poverty, hunger, health, education and gender" },
  { id: "planet", name: "Planet", plain: "Environment, climate, water, oceans and land" },
  { id: "prosperity", name: "Prosperity", plain: "Energy, jobs, innovation, equality and communities" },
  { id: "peace", name: "Peace", plain: "Justice, safety and civic life" },
  { id: "partnership", name: "Partnership", plain: "Philanthropy and global cooperation" },
];

const s = (x: Sub) => x;
export const SDGS: Sdg[] = [
  {
    n: 1, name: "No Poverty", goal: "End poverty in all its forms everywhere", plain: "Basic needs, money help and relief", pillar: "people", color: "#E5243B", coverage: "ntee",
    scope: s({ id: "no_poverty", name: "No poverty", plain: "Human services, emergency aid, financial counseling and international relief", coverage: "ntee", ntee: ["P20", "P24", "P26", "P51", "P60", "Q30", "Q32", "Q33"], targets: ["1.1", "1.2", "1.4", "1.5"] }),
    subs: [
      s({ id: "basic_needs", name: "Basic needs and emergency help", plain: "Multi-service human service agencies, Salvation Army, Volunteers of America, emergency assistance", coverage: "ntee", ntee: ["P20", "P24", "P26", "P60"], targets: ["1.2", "1.5"], alias: /\b(basic needs|emergency (assistance|aid|help)|human services?)\b/i }),
      s({ id: "financial_security", name: "Financial counseling and security", plain: "Financial counseling, money management and asset building", coverage: "ntee", ntee: ["P51"], targets: ["1.4"], alias: /\bfinancial (counseling|security|coaching|empowerment)\b|\basset building\b/i }),
      s({ id: "intl_development", name: "International development and relief", plain: "Development and relief abroad by US nonprofits", coverage: "ntee", ntee: ["Q30", "Q32", "Q33"], targets: ["1.1", "1.5"], note: "Grants paid to foreign recipients aren't in our data, only grants to US nonprofits that work abroad.", alias: /\binternational (development|relief|aid)\b|\bhumanitarian\b/i }),
      s({ id: "social_protection", name: "Social protection programs", plain: "Public safety nets (SNAP, cash aid, social insurance)", coverage: "none", targets: ["1.3"], note: "Run by governments, not in nonprofit filings." }),
    ],
    seeAlso: ["housing", "food_banks"],
  },
  {
    n: 2, name: "Zero Hunger", goal: "End hunger, achieve food security and improved nutrition and promote sustainable agriculture", plain: "Food banks, meals, nutrition and farming", pillar: "people", color: "#DDA63A", coverage: "ntee",
    scope: s({ id: "zero_hunger", name: "Zero hunger", plain: "Food banks, meal programs, nutrition and agriculture", coverage: "ntee", ntee: ["K20", "K25", "K26", "K28", "K3", "K40", "Q31"], targets: ["2.1", "2.2", "2.3", "2.4"] }),
    subs: [
      s({ id: "food_banks", name: "Food banks and pantries", plain: "Food banks and food pantries (NTEE K31)", coverage: "ntee", ntee: ["K31"], targets: ["2.1"], alias: /\bfood (banks?|pantr(y|ies))\b/i }),
      s({ id: "meals", name: "Meal programs", plain: "Food programs, congregate meals, soup kitchens, Meals on Wheels", coverage: "ntee", ntee: ["K30", "K34", "K35", "K36"], targets: ["2.1"], alias: /\b(meal programs?|soup kitchens?|meals on wheels)\b/i }),
      s({ id: "nutrition", name: "Nutrition", plain: "Nutrition programs (NTEE K40)", coverage: "ntee", ntee: ["K40"], targets: ["2.2"] }),
      s({ id: "agriculture", name: "Farming and agriculture", plain: "Agricultural programs, farmland preservation, animal husbandry, farm bureaus, agriculture abroad", coverage: "ntee", ntee: ["K20", "K25", "K26", "K28", "Q31"], targets: ["2.3", "2.4"], alias: /\b(farming|agricultur(e|al)|farmland|farmers)\b/i }),
    ],
  },
  {
    n: 3, name: "Good Health and Well-being", goal: "Ensure healthy lives and promote well-being for all at all ages", plain: "Health care, mental health, addiction and medical research", pillar: "people", color: "#4C9F38", coverage: "label",
    scope: s({ id: "healthcare", name: "Health care", plain: "All health: health care, mental health and crisis care, diseases and medical research (NTEE E, F, G, H)", coverage: "ntee", ntee: ["E", "F", "G", "H"], pending: "healthcare", targets: ["3.4", "3.8"] }),
    subs: [
      s({ id: "hospitals_clinics", name: "Hospitals and clinics", plain: "Hospitals, community health systems, primary care and community clinics", coverage: "ntee", ntee: ["E2", "E3"], targets: ["3.8"], note: "Public and government hospitals often don't file Form 990.", alias: /\b(hospitals?|clinics?|primary care)\b/i }),
      s({ id: "mental_health", name: "Mental health", plain: "Mental health treatment, crisis lines, suicide prevention", coverage: "label", label: "mental_health", targets: ["3.4"] }),
      s({ id: "substance_use", name: "Substance use and addiction", plain: "Prevention, treatment, recovery and harm reduction", coverage: "label", label: "substance_use", targets: ["3.5"] }),
      s({ id: "health_equity", name: "Health equity", plain: "Closing health gaps by race, income and place", coverage: "label", label: "health_equity", targets: ["3.8"] }),
      s({ id: "public_health", name: "Public health", plain: "Public health programs (NTEE E70)", coverage: "ntee", ntee: ["E70"], targets: ["3.3", "3.d"] }),
      s({ id: "diseases_research", name: "Diseases and medical research", plain: "Disease associations and medical research (NTEE G, H)", coverage: "ntee", ntee: ["G", "H"], targets: ["3.4", "3.b"], alias: /\b(medical research|diseases?)\b/i }),
    ],
  },
  {
    n: 4, name: "Quality Education", goal: "Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all", plain: "Schools, colleges, literacy and learning outside school", pillar: "people", color: "#C5192D", coverage: "label",
    scope: s({ id: "education", name: "Education and learning", plain: "Schools, colleges, early childhood, tutoring, literacy, scholarships, libraries, adult education (graded label)", coverage: "label", label: "education", targets: ["4.1", "4.2", "4.3", "4.6"] }),
    subs: [
      // Environmental education sits with education (UN target 4.7, education for sustainable development), and under the
      // Environment umbrella; it was under Climate until Oct 27, where researchers didn't expect it
      s({ id: "env_education", name: "Environmental education", plain: "Environmental education and outdoor programs (NTEE C60)", coverage: "ntee", ntee: ["C60"], targets: ["4.7", "13.3"], alias: /\benvironmental education\b/i }),
      s({ id: "k12", name: "K-12 schools", plain: "Elementary, secondary, special education and charter schools", coverage: "ntee", ntee: ["B20", "B24", "B25", "B28", "B29"], targets: ["4.1"], alias: /\bk-?12\b|\b(elementary|secondary|high|charter) schools?\b/i }),
      s({ id: "early_childhood", name: "Early childhood", plain: "Preschools (NTEE B21)", coverage: "ntee", ntee: ["B21"], targets: ["4.2"], alias: /\b(early childhood|pre-?schools?|pre-?k)\b/i }),
      s({ id: "higher_ed", name: "Colleges and universities", plain: "Colleges, universities, graduate and professional schools", coverage: "ntee", ntee: ["B4", "B5"], targets: ["4.3"], note: "Public universities often don't file Form 990.", alias: /\b(higher education|colleges?|universit(y|ies))\b/i }),
      s({ id: "adult_literacy", name: "Adult education and literacy", plain: "Adult education and reading programs", coverage: "ntee", ntee: ["B6", "B92"], targets: ["4.6"], alias: /\b(adult (education|literacy)|literacy)\b/i }),
      s({ id: "libraries", name: "Libraries", plain: "Libraries (NTEE B70)", coverage: "ntee", ntee: ["B70"], targets: ["4.a"] }),
      s({ id: "scholarships", name: "Scholarships", plain: "Scholarships and student aid (NTEE B82)", coverage: "ntee", ntee: ["B82"], targets: ["4.b"] }),
      s({ id: "tech_ai", name: "Tech and AI skills", plain: "Coding, digital and AI literacy, tech careers", coverage: "label", label: "ai_tech_learning_work", targets: ["4.4"], alias: /\btech and ai\b|\bdigital (skills|literacy)\b|\bai literacy\b/i }),
      s({ id: "youth_development", name: "Youth development", plain: "Mentoring, youth leadership and learning outside school", coverage: "label", label: "youth_development", targets: ["4.4"], note: "The label finds about half of youth orgs, so counts are a floor." }),
    ],
  },
  {
    n: 5, name: "Gender Equality", goal: "Achieve gender equality and empower all women and girls", plain: "Women and girls, safety, rights and reproductive health", pillar: "people", color: "#FF3A21", coverage: "label",
    scope: s({ id: "women_girls", name: "Women and girls", plain: "Orgs serving or led for women and girls (graded label)", coverage: "label", label: "women_girls", targets: ["5.1", "5.5"] }),
    subs: [
      s({ id: "gender_violence", name: "Domestic and sexual violence", plain: "Family violence shelters, abuse prevention, sexual assault services", coverage: "ntee", ntee: ["P43", "I71", "I73", "F42"], targets: ["5.2"], alias: /\b(domestic|sexual|gender[- ]based|intimate partner) (violence|abuse|assault)\b/i }),
      s({ id: "womens_rights", name: "Women's rights and centers", plain: "Women's rights groups and women's centers", coverage: "ntee", ntee: ["R24", "P83"], targets: ["5.1", "5.5"], alias: /\bwomen'?s (rights|centers?)\b/i }),
      s({ id: "reproductive_health", name: "Reproductive health", plain: "Reproductive health care and family planning", coverage: "ntee", ntee: ["E40", "E42"], targets: ["5.6", "3.7"], alias: /\b(reproductive health|family planning)\b/i }),
    ],
  },
  {
    n: 6, name: "Clean Water and Sanitation", goal: "Ensure availability and sustainable management of water and sanitation for all", plain: "Watersheds, clean water and sanitation", pillar: "planet", color: "#26BDE2", coverage: "limited",
    limited: "Water and sewer systems are run by governments and utilities. Nonprofit data covers watershed groups and water projects.",
    alias: /\bclean water and sanitation\b/i,
    scope: s({ id: "clean_water", name: "Water resources and watersheds", plain: "Water resources, wetlands and watershed conservation (NTEE C32)", coverage: "ntee", ntee: ["C32"], targets: ["6.3", "6.6"] }),
    subs: [
      s({ id: "water_access", name: "Drinking water and sanitation projects", plain: "Wells, safe drinking water and sanitation, mostly abroad", coverage: "none", targets: ["6.1", "6.2"], note: "No NTEE code. Mission words find mostly relief groups where water is one program among many (UNICEF USA, the IRC), so we don't count it yet." }),
      s({ id: "water_utilities", name: "Water utilities", plain: "Public water and sewer systems", coverage: "none", targets: ["6.1", "6.2"], note: "Run by governments and utilities, not in nonprofit filings." }),
    ],
  },
  {
    n: 7, name: "Affordable and Clean Energy", goal: "Ensure access to affordable, reliable, sustainable and modern energy for all", plain: "Energy conservation, solar, efficiency and energy bills", pillar: "prosperity", color: "#FCC30B", coverage: "limited",
    limited: "Power plants and grids are utilities and companies. Clean energy groups are mostly counted in the climate label (Goal 13).",
    scope: s({ id: "energy", name: "Energy conservation", plain: "Energy resources conservation and development, solar and efficiency groups coded C35", coverage: "ntee", ntee: ["C35"], targets: ["7.2", "7.3"], note: "Many clean energy groups are coded elsewhere. The climate label (Goal 13) finds them by their own filings." }),
    subs: [
      s({ id: "energy_access", name: "Power plants, grids and energy bills", plain: "Building and running energy systems, help paying energy bills", coverage: "none", targets: ["7.1", "7.b"], note: "Utilities and government programs. Mission words for bill help find mostly United Ways, where it's one program among many." }),
    ],
    seeAlso: ["climate"],
  },
  {
    n: 8, name: "Decent Work and Economic Growth", goal: "Promote sustained, inclusive and sustainable economic growth, full and productive employment and decent work for all", plain: "Job training, local economies and workers", pillar: "prosperity", color: "#A21942", coverage: "ntee",
    alias: /\bdecent work\b/i,
    scope: s({ id: "decent_work", name: "Decent work", plain: "Job training and employment, economic development and small business (NTEE J, S30, S43)", coverage: "ntee", ntee: ["J2", "J3", "S30", "S31", "S32", "S43"], targets: ["8.3", "8.5", "8.6"] }),
    subs: [
      s({ id: "workforce", name: "Workforce development", plain: "Job training, employment services, vocational rehabilitation, Goodwill (NTEE J20 to J33)", coverage: "ntee", ntee: ["J2", "J3"], pending: "workforce", targets: ["8.5", "8.6"], alias: /\b(workforce|job training|job skills|skilling|employment (services|training)|vocational)\b/i }),
      s({ id: "economic_dev", name: "Community economic development", plain: "Economic development, urban, community and rural", coverage: "ntee", ntee: ["S30", "S31", "S32"], targets: ["8.3"], alias: /\beconomic development\b/i }),
      s({ id: "small_business", name: "Small business", plain: "Small business development (NTEE S43)", coverage: "ntee", ntee: ["S43"], targets: ["8.3"], alias: /\b(small business|entrepreneurs?(hip)?)\b/i }),
      s({ id: "workers_rights", name: "Workers' rights", plain: "Labor unions and workers' rights groups", coverage: "none", targets: ["8.8"], note: "Labor unions file as 501(c)(5) and only one org in our data is coded workers' rights (R29), so we don't count it yet." }),
    ],
    seeAlso: ["tech_ai"],
  },
  {
    n: 9, name: "Industry, Innovation and Infrastructure", goal: "Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation", plain: "Science and research, and nonprofit utilities", pillar: "prosperity", color: "#FD6925", coverage: "limited",
    limited: "Roads, ports, industry and broadband are built by governments and companies. Nonprofit data covers research institutes and a few utilities.",
    alias: /\bindustry,? innovation and infrastructure\b/i,
    scope: s({ id: "science_research", name: "Science and technology research", plain: "General science, physical, earth and life sciences, engineering and technology (NTEE U)", coverage: "ntee", ntee: ["U20", "U30", "U31", "U33", "U34", "U36", "U4", "U5"], targets: ["9.5"] }),
    subs: [
      s({ id: "public_utilities", name: "Transit, telecom and utilities", plain: "Nonprofit transit, telecommunications and utility organizations", coverage: "ntee", ntee: ["W40", "W50", "W80"], targets: ["9.1", "9.c"], note: "Few in number. Most infrastructure is public." }),
      s({ id: "industry", name: "Roads, ports and industry", plain: "Public and private infrastructure and manufacturing", coverage: "none", targets: ["9.1", "9.2"], note: "Built by governments and companies, not in nonprofit filings." }),
    ],
    seeAlso: ["tech_ai"],
  },
  {
    n: 10, name: "Reduced Inequalities", goal: "Reduce inequality within and among countries", plain: "Racial equity, immigrants, disability and civil rights", pillar: "prosperity", color: "#DD1367", coverage: "label",
    alias: /\breduced? inequalit(y|ies)\b/i,
    scope: s({ id: "inequality", name: "Reduced inequality", plain: "Civil, immigrant, minority, disability and LGBTQ rights, race relations, immigrant and LGBTQ centers (NTEE)", coverage: "ntee", ntee: ["R20", "R21", "R22", "R23", "R26", "R30", "P84", "P88"], targets: ["10.2", "10.3", "10.7"] }),
    subs: [
      s({ id: "racial_equity", name: "Racial equity", plain: "Racism, racial justice, racial gaps (graded label)", coverage: "label", label: "racial_equity", targets: ["10.2", "10.3"], note: "Counts are a floor." }),
      s({ id: "immigrants", name: "Immigrants and refugees", plain: "Resettlement, legal aid, newcomer services (graded label)", coverage: "label", label: "immigrants_refugees", targets: ["10.7"] }),
      s({ id: "civil_rights", name: "Civil and minority rights", plain: "Civil rights, minority rights, race relations", coverage: "ntee", ntee: ["R20", "R22", "R30"], targets: ["10.3"], alias: /\b(civil|minority) rights\b/i }),
      s({ id: "disability", name: "Disability", plain: "Disability rights and centers for people with disabilities", coverage: "ntee", ntee: ["R23", "P82", "P86", "P87"], targets: ["10.2"], alias: /\bdisabilit(y|ies)\b/i }),
      s({ id: "lgbtq", name: "LGBTQ", plain: "LGBTQ rights groups and centers", coverage: "ntee", ntee: ["R26", "P88"], targets: ["10.2"], alias: /\blgbt\w*\b|\bgay\b/i }),
    ],
  },
  {
    n: 11, name: "Sustainable Cities and Communities", goal: "Make cities and human settlements inclusive, safe, resilient and sustainable", plain: "Housing, community development, disasters and culture", pillar: "prosperity", color: "#FD9D24", coverage: "label",
    alias: /\bsustainable cities\b/i,
    scope: s({ id: "communities", name: "Sustainable communities", plain: "Housing and shelter, community and neighborhood development, disaster preparedness and relief (NTEE L, S20, M2)", coverage: "ntee", ntee: ["L", "S20", "S21", "S22", "M2"], targets: ["11.1", "11.3", "11.5"] }),
    subs: [
      s({ id: "housing", name: "Housing and homelessness", plain: "Homeless services, affordable housing, eviction prevention (graded label)", coverage: "label", label: "housing_homelessness", targets: ["11.1"] }),
      s({ id: "community_dev", name: "Community development", plain: "Community and neighborhood development, coalitions, block associations", coverage: "ntee", ntee: ["S20", "S21", "S22"], targets: ["11.3"], alias: /\b(community|neighborhood) development\b/i }),
      s({ id: "disaster", name: "Disaster preparedness and relief", plain: "Disaster preparedness and relief, search and rescue", coverage: "ntee", ntee: ["M2"], targets: ["11.5", "13.1"], alias: /\bdisasters?\b/i }),
      s({ id: "arts_heritage", name: "Arts, culture and heritage", plain: "Arts, museums, historic preservation (NTEE A)", coverage: "ntee", ntee: ["A"], targets: ["11.4"], note: "Target 11.4 covers cultural heritage. Most arts giving is wider than the goal, so it isn't in the goal total.", alias: /\b(arts?|culture|museums?|heritage)\b/i }),
    ],
  },
  {
    n: 12, name: "Responsible Consumption and Production", goal: "Ensure sustainable consumption and production patterns", plain: "Recycling, pollution and food waste", pillar: "planet", color: "#BF8B2E", coverage: "limited",
    limited: "Mostly about how companies produce and governments regulate. Nonprofit data covers recycling, pollution and food rescue groups.",
    alias: /\bresponsible consumption\b/i,
    scope: s({ id: "consumption", name: "Pollution and recycling", plain: "Pollution abatement and recycling (NTEE C20, C27)", coverage: "ntee", ntee: ["C20", "C27"], targets: ["12.4", "12.5"] }),
    subs: [
      s({ id: "food_rescue", name: "Food rescue and food waste", plain: "Orgs whose name or mission names food rescue, food recovery or food waste", coverage: "keywords", keywords: ["food rescue", "food recovery", "food waste"], targets: ["12.3"], note: "Approximate keyword set.", alias: /\bfood (rescue|recovery|waste)\b/i }),
      s({ id: "production", name: "Business production and supply chains", plain: "How companies make and source goods", coverage: "none", targets: ["12.6"], note: "Not in nonprofit filings." }),
    ],
  },
  {
    n: 13, name: "Climate Action", goal: "Take urgent action to combat climate change and its impacts", plain: "Climate change, clean energy and resilience", pillar: "planet", color: "#3F7E44", coverage: "label",
    scope: s({ id: "climate", name: "Climate", plain: "Mitigation, clean energy, adaptation and climate policy (graded label)", coverage: "label", label: "climate", targets: ["13.1", "13.2", "13.3"] }),
    subs: [
    ],
    seeAlso: ["energy", "disaster"],
  },
  {
    n: 14, name: "Life Below Water", goal: "Conserve and sustainably use the oceans, seas and marine resources for sustainable development", plain: "Oceans, coasts and fisheries", pillar: "planet", color: "#0A97D9", coverage: "limited",
    limited: "No NTEE code for oceans alone. Marine science and fisheries have codes, ocean conservation groups are found by their own words.",
    scope: s({ id: "oceans", name: "Oceans", plain: "Orgs whose name or mission names ocean or marine conservation, coral reefs or coasts", coverage: "keywords", keywords: ["ocean conservation", "marine conservation", "coral reefs", "marine life", "ocean health", "coastal conservation"], targets: ["14.1", "14.2"], note: "Approximate keyword set." }),
    subs: [
      s({ id: "marine_science", name: "Marine science and fisheries", plain: "Marine science, oceanography and fisheries resources (NTEE U21, D33)", coverage: "ntee", ntee: ["U21", "D33"], targets: ["14.4", "14.a"], alias: /\b(marine science|oceanography|fisheries)\b/i }),
    ],
  },
  {
    n: 15, name: "Life on Land", goal: "Protect, restore and promote sustainable use of terrestrial ecosystems, sustainably manage forests, combat desertification, and halt and reverse land degradation and halt biodiversity loss", plain: "Land, forests, wildlife and animals", pillar: "planet", color: "#56C02B", coverage: "label",
    scope: s({ id: "life_on_land", name: "Land and wildlife conservation", plain: "Natural resources, land and forest conservation, wildlife and endangered species (NTEE C30 to C36, D30 to D34)", coverage: "ntee", ntee: ["C30", "C34", "C36", "D30", "D31", "D32", "D34"], targets: ["15.1", "15.2", "15.5"] }),
    subs: [
      s({ id: "land_forests", name: "Land and forest conservation", plain: "Natural resources, land trusts and forests", coverage: "ntee", ntee: ["C30", "C34", "C36"], targets: ["15.1", "15.2"], alias: /\b(land (trusts?|conservation)|forests?|conservation)\b/i }),
      s({ id: "wildlife", name: "Wildlife and habitat", plain: "Wildlife preservation, endangered species, bird and wildlife sanctuaries", coverage: "ntee", ntee: ["D30", "D31", "D32", "D34"], targets: ["15.5", "15.7"], alias: /\b(wildlife|endangered species|biodiversity)\b/i }),
      s({ id: "animal_welfare", name: "Animal welfare", plain: "Shelters, rescue, spay and neuter, anti-cruelty (graded label)", coverage: "label", label: "animal_welfare", note: "No SDG target covers animal welfare. It sits here as the nearest goal." }),
    ],
  },
  {
    n: 16, name: "Peace, Justice and Strong Institutions", goal: "Promote peaceful and inclusive societies for sustainable development, provide access to justice for all and build effective, accountable and inclusive institutions at all levels", plain: "Legal aid, justice, safety and civic life", pillar: "peace", color: "#00689D", coverage: "limited",
    limited: "Courts, police and public institutions are government. Nonprofit data covers legal aid, crime prevention, reentry and civic groups.",
    alias: /\bpeace,? justice\b|\bstrong institutions\b/i,
    scope: s({ id: "justice", name: "Peace and justice", plain: "Crime prevention, courts and reentry, child abuse prevention, legal aid, voter and civic participation (NTEE I, R40, W24)", coverage: "ntee", ntee: ["I2", "I3", "I4", "I5", "I72", "I8", "R40", "W24"], targets: ["16.1", "16.2", "16.3", "16.7"] }),
    subs: [
      s({ id: "legal_aid", name: "Legal aid", plain: "Legal services and public interest law (NTEE I80, I83)", coverage: "ntee", ntee: ["I8"], targets: ["16.3"], alias: /\blegal (aid|services)\b/i }),
      s({ id: "justice_reentry", name: "Crime prevention and reentry", plain: "Crime and youth violence prevention, courts, mediation, reentry and prison alternatives", coverage: "ntee", ntee: ["I2", "I3", "I4", "I5"], targets: ["16.1", "16.3"], alias: /\b(crime prevention|reentry|re-entry|violence prevention|criminal justice)\b/i }),
      s({ id: "child_abuse", name: "Child abuse prevention", plain: "Child abuse prevention (NTEE I72)", coverage: "ntee", ntee: ["I72"], targets: ["16.2"], alias: /\bchild abuse\b/i }),
      s({ id: "civic", name: "Civic participation and liberties", plain: "Voter education, citizen participation, civil liberties, free speech", coverage: "ntee", ntee: ["R40", "W24", "R60", "R63"], targets: ["16.7", "16.10"], alias: /\b(civic|voter|democracy|civil liberties)\b/i }),
      s({ id: "peace_rights", name: "Peace and human rights abroad", plain: "International peace and security, arms control, human rights", coverage: "ntee", ntee: ["Q40", "Q41", "Q43", "Q70"], targets: ["16.1", "16.a"], alias: /\b(international peace|peace and security|arms control|human rights)\b/i }),
      s({ id: "institutions", name: "Public institutions", plain: "Courts, police, anti-corruption and government agencies", coverage: "none", targets: ["16.5", "16.6"], note: "Government, not in nonprofit filings." }),
    ],
  },
  {
    n: 17, name: "Partnerships for the Goals", goal: "Strengthen the means of implementation and revitalize the Global Partnership for Sustainable Development", plain: "Philanthropy, nonprofit capacity and global cooperation", pillar: "partnership", color: "#19486A", coverage: "limited",
    limited: "Mostly about government finance, trade, technology transfer and statistics. Nonprofit data covers grantmaking charities, nonprofit capacity and international exchange.",
    alias: /\bpartnerships? for the goals\b/i,
    scope: s({ id: "partnerships", name: "Partnerships", plain: "Community and public foundations, giving and voluntarism programs, nonprofit management, international cooperation (NTEE T, S50, Q2, Q5)", coverage: "ntee", ntee: ["T3", "T4", "T5", "T7", "S50", "Q2", "Q42", "Q5"], targets: ["17.3", "17.9", "17.17"], note: "Money given to grantmakers is granted on again, so it also shows up under other goals." }),
    subs: [
      s({ id: "philanthropy", name: "Community foundations and giving programs", plain: "Public and community foundations, voluntarism, United Ways and federated giving", coverage: "ntee", ntee: ["T3", "T4", "T5", "T7"], targets: ["17.3", "17.17"], note: "Mostly donor-advised fund sponsors and community foundations that grant the money on.", alias: /\b(community foundations?|united ways?|federated giving)\b/i }),
      s({ id: "nonprofit_capacity", name: "Nonprofit capacity", plain: "Nonprofit management and capacity building (NTEE S50)", coverage: "ntee", ntee: ["S50"], targets: ["17.9"], note: "Fidelity Charitable, a donor-advised fund sponsor, is coded S50 and takes most of this money.", alias: /\b(nonprofit (capacity|management)|capacity building)\b/i }),
      s({ id: "intl_cooperation", name: "International cooperation", plain: "International understanding, exchanges, UN associations, foreign policy", coverage: "ntee", ntee: ["Q2", "Q42", "Q5"], targets: ["17.16"], note: "UNICEF USA is coded as a UN association (Q42) and takes about half of this money.", alias: /\binternational (cooperation|exchange|understanding)\b/i }),
      s({ id: "public_finance", name: "Government aid, trade and tax", plain: "Official development aid, trade and tax systems", coverage: "none", targets: ["17.1", "17.2", "17.10"], note: "Government, not in nonprofit filings." }),
    ],
  },
];

// Environment: the umbrella over the Planet goals (Oct 26 ask: "Environment" with climate as a subcategory).
// Its own figure counts NTEE C (environment) and D (animals) until the environment label loads.
export const ENVIRONMENT: { id: string; name: string; plain: string; scope: Sub; includes: string[] } = {
  id: "environment", name: "Environment", plain: "Climate, water, oceans, land, wildlife, animals, energy and pollution",
  scope: s({ id: "environment", name: "Environment and animals", plain: "Environment and animal-related orgs (NTEE C, D)", coverage: "ntee", ntee: ["C", "D"], pending: "environment", note: "Climate groups coded outside C and D aren't in this figure. See Climate (Goal 13)." }),
  includes: ["climate", "env_education", "land_forests", "wildlife", "animal_welfare", "clean_water", "oceans", "marine_science", "energy", "consumption", "food_rescue"],
};

// "Environment and animals" names the umbrella's own set (NTEE C and D), so a Browse link reproduces its figure.
export const namesEnvironment = (text: string) => /\benvironment and animals\b/i.test(text);

// ------------------------------------------------------------------ lookups
export const sdgByN = (n: number) => SDGS.find((g) => g.n === n);
export const sdgSlug = (n: number) => `sdg-${n}`;
export const shortName = (g: Sdg) => g.name;
type Found = { sdg: Sdg | null; sub: Sub; isScope: boolean };
const ALL: Found[] = [
  ...SDGS.flatMap((g) => [{ sdg: g, sub: g.scope, isScope: true }, ...g.subs.map((sub) => ({ sdg: g, sub, isScope: false }))]),
  { sdg: null, sub: ENVIRONMENT.scope, isScope: true },
];
export const findSub = (id: string): Found | undefined => ALL.find((f) => f.sub.id === id);
// Every queryable cause (goal scopes, subcategories, the environment umbrella), not the "not covered" ones.
export const covered = (): Found[] => ALL.filter((f) => f.sub.coverage !== "none");

// Pending labels switch on once loaded (TODO(labels) above).
const liveLabel = (sub: Sub): LabelSlug | null => sub.label ?? (sub.pending && isLabel(sub.pending) ? sub.pending : null);
export const coverageOf = (sub: Sub): Coverage => (liveLabel(sub) ? "label" : sub.coverage);
// The cause the answer engine counts (answerSpec Cause). name: "<subcategory> (SDG n)", lower case mid-sentence, or
// for a goal's own scope the goal's name ("quality education (SDG 4)"), unless nonprofit data covers the goal only in
// part: then the scope's own name ("energy conservation (SDG 7)"), so a headline never claims the whole goal.
// How far to trust a cause's counts (Oct 28, Hunter), from the same coverage the engine uses, so it flips by itself when
// a pending label (environment, workforce, healthcare) goes live in lib/labels.ts:
//   checked    a graded cause label (Claude read each org's 990, graded on a fresh sample against a 95% bar)
//   estimated  IRS NTEE codes or keywords only: may include some off-topic orgs and miss others
//   limited    the goal is mostly governments or infrastructure, or not in our data
export type Trust = "checked" | "estimated" | "limited";
export function trustOf(sub: Sub, sdg?: Sdg | null): Trust {
  if (sdg && sub === sdg.scope && sdg.coverage === "limited") return "limited";
  const c = coverageOf(sub);
  return c === "label" ? "checked" : c === "none" ? "limited" : "estimated";
}
export function trustText(sub: Sub, sdg?: Sdg | null): string {
  const t = trustOf(sub, sdg);
  if (t === "checked") return "Checked cause label: each org's filing was read, graded about 95% right on a fresh sample.";
  if (t === "limited") return "Limited nonprofit data for this cause.";
  return coverageOf(sub) === "keywords"
    ? "Estimated from words in names and filings. Not yet checked by our cause label, so counts may include some off-topic orgs and miss others."
    : "Estimated from IRS cause codes. Not yet checked by our cause label, so counts may include some off-topic orgs and miss others.";
}

export function causeOf(sub: Sub, sdg: Sdg | null): { name: string; label: LabelSlug | null; ntee: string[]; keywords: string[] } | null {
  if (sub.coverage === "none") return null;
  const label = liveLabel(sub);
  const base = (sdg && sub === sdg.scope && sdg.coverage !== "limited" ? sdg.name.toLowerCase() : sub.name).replace(/^[A-Z](?=[a-z])/, (m) => m.toLowerCase());
  const name = sdg ? `${base} (SDG ${sdg.n})` : base;
  return { name, label, ntee: label ? [] : sub.ntee ?? [], keywords: label || sub.ntee?.length ? [] : sub.keywords ?? [] };
}

// ------------------------------------------------------------------ SDG phrasing in questions
// "SDG 4", "SDG #4", "Goal 13", "sustainable development goal 14", or a goal's official name ("quality education",
// "life below water"). Only an explicit reference counts: plain "climate" or "education" stays the router's cause.
// Bare "Goal 4" counts only capitalized ("our goal 3 is" doesn't).
const NUM = /\b(?:sdgs?|un goal|global goal|sustainable development goal)\s*#?\s*(1[0-7]|[1-9])\b/gi, GOAL = /\bGoal\s*#?\s*(1[0-7]|[1-9])\b/g;
const nameRe = (g: Sdg) => new RegExp(`\\b${g.name.toLowerCase().replace(/ and /g, " (?:and|&) ").replace(/-/g, "[- ]?").replace(/,/g, ",?")}\\b`, "i");
const NAMES = SDGS.map((g) => ({ g, re: nameRe(g) }));
export type SdgRef = { sdg: Sdg; sub: Sub | null; at: number };
// Every SDG the question names, in order, each with the subcategory it also names (by name or alias), if any.
export function sdgRefs(text: string): SdgRef[] {
  const out: SdgRef[] = [];
  for (const m of [...text.matchAll(NUM), ...text.matchAll(GOAL)]) { const g = sdgByN(Number(m[1])); if (g && !out.some((r) => r.sdg.n === g.n)) out.push({ sdg: g, sub: null, at: m.index ?? 0 }); }
  for (const { g, re } of NAMES) {
    const m = re.exec(text) ?? g.alias?.exec(text);
    if (m && !out.some((r) => r.sdg.n === g.n)) out.push({ sdg: g, sub: null, at: m.index });
  }
  out.sort((a, z) => a.at - z.at);
  // A subcategory counts when the question names it, nearest its goal (one goal: anywhere in the question).
  return out.map((r, i) => {
    const seg = out.length === 1 ? text : text.slice(i === 0 ? 0 : (out[i - 1].at + r.at) >> 1, i === out.length - 1 ? text.length : (r.at + out[i + 1].at) >> 1);
    const sub = r.sdg.subs.find((x) => x.coverage !== "none" && (seg.toLowerCase().includes(x.name.toLowerCase()) || !!x.alias?.test(seg))) ?? null;
    return { ...r, sub };
  });
}

// Text color on a goal's color: dark on the light ones (yellow, orange, gold), white on the rest (WCAG contrast).
export function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#1d1d1f" : "#fff";
}

// One-word goal names for compact tiles (home Research tab, /research, /browse); the full name goes in the tooltip.
export const SDG_SHORT: Record<number, string> = { 1: "Poverty", 2: "Hunger", 3: "Health", 4: "Education", 5: "Gender", 6: "Water", 7: "Energy", 8: "Work",
  9: "Industry", 10: "Inequality", 11: "Cities", 12: "Consumption", 13: "Climate", 14: "Oceans", 15: "Land", 16: "Justice", 17: "Partnerships" };

// The questions a cause answers in Browse and in the home goal panel, one per column (Oct 27). Each routes back to its
// cause (lib/answerRoute withSdg; eval/browse.mts checks every covered cause).
export function causeQuestions(name: string) {
  return {
    total: `How much foundation money goes to ${name}?`,
    trend: `Is foundation money for ${name} growing?`,
    top_funders: `Who are the biggest foundation funders of ${name}?`,
    top_recipients: `Who gets the most foundation money for ${name}?`,
    by_state: `Which states get the most foundation money for ${name}?`,
    concentration: `How concentrated is foundation money for ${name}?`,
    count_orgs: `How many nonprofits work on ${name}?`,
    underfunded: `Which ${name} nonprofits get little foundation money for their size?`,
  };
}

// How a cause reads in questions and answers (Oct 27, Hunter): plain words, never "(SDG n)" or "Goal n". A goal's own
// scope gets a short everyday name; a subcategory keeps its name, lower case mid-sentence.
export const GOAL_NAME: Record<number, string> = { 1: "poverty", 2: "hunger", 3: "health", 4: "education", 5: "gender equality", 6: "clean water",
  7: "clean energy", 8: "jobs and the economy", 9: "innovation and infrastructure", 10: "reducing inequality", 11: "cities and communities",
  12: "responsible consumption", 13: "climate", 14: "oceans", 15: "land and wildlife", 16: "justice and peace", 17: "philanthropy and partnerships" };
export function displayCause(sub: Sub, sdg: Sdg | null): string {
  if (sdg && sub === sdg.scope && sdg.coverage !== "limited") return GOAL_NAME[sdg.n] ?? sdg.name.toLowerCase();
  return sub.name.replace(/^[A-Z](?=[a-z])/, (m) => m.toLowerCase());
}
// Output side: any "(SDG n)" or "Goal n, " left in a generated text goes; a goal's full name becomes its short name.
export function plainCauseText(t: string): string {
  let s = t;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const g of SDGS) {
    const short = GOAL_NAME[g.n] ?? g.name.toLowerCase();
    // "quality education (SDG 4)" -> "education"; at a sentence start "Quality education (SDG 4)" -> "Education"
    s = s.replace(new RegExp(`${esc(g.name)} \\(SDG ${g.n}\\)`, "gi"), (m) => (/^[A-Z]/.test(m) ? short[0].toUpperCase() + short.slice(1) : short));
  }
  return s.replace(/\s\(SDG \d{1,2}\)/g, "").replace(/\b(SDG|Goal) \d{1,2}, /g, "");
}
