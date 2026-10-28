// Plain-language labels for NTEE cause codes (NCCS).
const MAJOR: Record<string, string> = {
  A: "Arts, Culture & Humanities", B: "Education", C: "Environment", D: "Animal-Related", E: "Health Care",
  F: "Mental Health", G: "Diseases & Disorders", H: "Medical Research", I: "Crime & Legal", J: "Employment",
  K: "Food, Agriculture & Nutrition", L: "Housing & Shelter", M: "Public Safety & Disaster", N: "Recreation & Sports",
  O: "Youth Development", P: "Human Services", Q: "International Affairs", R: "Civil Rights & Advocacy",
  S: "Community Improvement", T: "Philanthropy & Grantmaking", U: "Science & Technology", V: "Social Science",
  W: "Public & Societal Benefit", X: "Religion-Related", Y: "Mutual & Membership Benefit", Z: "Unknown",
};
// Mid-sentence short names for a major group ("funds mostly education and health")
const SHORT: Record<string, string> = {
  A: "the arts", B: "education", C: "the environment", D: "animals", E: "health", F: "mental health", G: "disease work",
  H: "medical research", I: "legal aid and justice", J: "jobs", K: "food and agriculture", L: "housing", M: "disaster relief",
  N: "sports and recreation", O: "youth", P: "human services", Q: "international causes", R: "civil rights",
  S: "community development", T: "other grantmakers", U: "science", V: "social science", W: "public benefit causes",
  X: "religious groups", Y: "membership groups",
};
export const nteeShort = (letter: string): string | null => SHORT[letter[0]?.toUpperCase()] ?? null;
const DETAIL: Record<string, string> = {
  K30: "Food Programs", K31: "Food Banks, Food Pantries", K34: "Congregate Meals", K35: "Soup Kitchens", K36: "Meals on Wheels",
};

export function nteeLabel(code: string): string | null {
  return DETAIL[code.slice(0, 3)] ?? MAJOR[code[0]] ?? null;
}
