// Plain-language labels for NTEE cause codes (NCCS).
const MAJOR: Record<string, string> = {
  A: "Arts, Culture & Humanities", B: "Education", C: "Environment", D: "Animal-Related", E: "Health Care",
  F: "Mental Health", G: "Diseases & Disorders", H: "Medical Research", I: "Crime & Legal", J: "Employment",
  K: "Food, Agriculture & Nutrition", L: "Housing & Shelter", M: "Public Safety & Disaster", N: "Recreation & Sports",
  O: "Youth Development", P: "Human Services", Q: "International Affairs", R: "Civil Rights & Advocacy",
  S: "Community Improvement", T: "Philanthropy & Grantmaking", U: "Science & Technology", V: "Social Science",
  W: "Public & Societal Benefit", X: "Religion-Related", Y: "Mutual & Membership Benefit", Z: "Unknown",
};
const DETAIL: Record<string, string> = {
  K30: "Food Programs", K31: "Food Banks, Food Pantries", K34: "Congregate Meals", K35: "Soup Kitchens", K36: "Meals on Wheels",
};

export function nteeLabel(code: string): string | null {
  return DETAIL[code.slice(0, 3)] ?? MAJOR[code[0]] ?? null;
}
