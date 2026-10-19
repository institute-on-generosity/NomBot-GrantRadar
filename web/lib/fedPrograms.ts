// Named federal programs a cause can mean on federal_awards (USAspending assistance listings, CFDA numbers).
// "Head Start providers" is the Head Start program (93.600), not orgs with some NTEE code: a recipient-cause
// match found $0 (Oct 19). Matched on the cause's name and keywords; an explicit listing number ("93.600") also
// works. Numbers checked against federal_awards (Oct 19). Other sources keep the recipient cause.
export type FedProgram = { name: string; cfda: string[] }; // cfda: LIKE patterns ("94.%" = every AmeriCorps listing)

const PROGRAMS: { re: RegExp; p: FedProgram }[] = [
  { re: /\b(early )?head start\b/, p: { name: "Head Start", cfda: ["93.600", "93.356"] } },
  { re: /\bamericorps\b/, p: { name: "AmeriCorps", cfda: ["94.%"] } },
  { re: /\b(community|federally qualified) health cent(er|re)s?\b|\bfqhcs?\b/, p: { name: "the Health Center Program", cfda: ["93.224", "93.527"] } },
  { re: /\bryan white\b/, p: { name: "Ryan White HIV/AIDS", cfda: ["93.914", "93.917", "93.918", "93.924", "93.153"] } },
  { re: /\btitle x\b/, p: { name: "Title X family planning", cfda: ["93.217"] } },
  { re: /\btrio\b|\bupward bound\b|\bmcnair scholars?\b/, p: { name: "TRIO", cfda: ["84.042", "84.044", "84.047", "84.066", "84.217"] } },
  { re: /\bhealthy start\b/, p: { name: "Healthy Start", cfda: ["93.926"] } },
  { re: /\bsenior community service employment\b|\bscsep\b/, p: { name: "the Senior Community Service Employment Program", cfda: ["17.235"] } },
  { re: /\bsupportive services for veteran families\b|\bssvf\b/, p: { name: "Supportive Services for Veteran Families", cfda: ["64.033"] } },
  { re: /\bunaccompanied (alien |migrant )?(children|minors)\b/, p: { name: "the Unaccompanied Children Program", cfda: ["93.676"] } },
];

export function fedProgram(c: { name: string; keywords?: string[] } | null | undefined): FedProgram | null {
  if (!c) return null;
  const words = [c.name, ...(c.keywords ?? [])].map((w) => w.toLowerCase());
  const num = words.map((w) => /\b\d{2}\.\d{3}\b/.exec(w)?.[0]).find(Boolean);
  if (num) return { name: `assistance listing ${num}`, cfda: [num] };
  return PROGRAMS.find((x) => words.some((w) => x.re.test(w)))?.p ?? null;
}
