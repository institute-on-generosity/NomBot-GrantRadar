// What kind of money a foundation gives, from each grant's purpose as written on its 990-PF:
//   general: unrestricted / general operating / "charitable purposes" (the recipient decides how to use it)
//   program: tied to something specific (a program, project, scholarship, building, event)
//   policy:  advocacy, public policy, civic engagement
//   unknown: uninformative ("donation", "support", a bare cause like "education")
// Deterministic keyword rules (no Claude): fast, offline, and the same answer every time.
import { db } from "./db";
import { memo } from "./memo";

export type GrantType = "general" | "program" | "policy" | "unknown";

// Advocacy that is a direct service (victim advocates, CASA, child advocacy centers) is not policy work.
const POLICY = /\b(public polic|polic(y|ies)\b|legislat|lobbying|civic engagement|voter|ballot|systems? change|justice reform|policy advoca)/;
const POLICY_ADVOCACY = /\badvoca(cy|ting)\b|\badvocates? (for|to)\b/;
const SERVICE_ADVOCACY = /\b(victim|child(ren)?'?s?|family|families|court|casa|domestic|abuse|patient|special advocates|advocacy center|advocate for (a|an|the)? ?(child|famil|victim))/;
// Restricted even when "general" also appears ("general scholarship fund", "restricted support").
const RESTRICTED = /\b(scholarships?|scholorship|tuition|fellowships?|internships?|capital|building|construction|renovat\w*|expansion|equipment|endowment|restricted|designated|earmarked|purchase)\b/;
const GENERAL = /\b(unrestricted|general (operat\w*|support|purposes?|funds?|use|charit\w*|donations?|contributions?|grants?|gifts?|giving|budget|expenses?|funding|needs?|& unrestricted|, unrestricted|exempt)|operating|operations?|operational|overhead|annual (fund|campaign|giving|support|appeal)|greatest need|most pressing need|flexible|discretionary|as (they|it) see fits?|no restrictions|(exempt|charitable) (purpose|function|mission|activities|works|uses?)s?|mission support|support (for|of) (the |its )?mission|capacity|sustaining support|charitable (support|contribution|gift|donation)s?|gen\. charitable|philanthropic purposes?|daily|organization support|most beneficial|tax.exempt (status|purpose)|(purpose|mission) of (the )?(donee|recipient|organization)|donee'?s'? (stated |own )?(purpose|mission)|(further|advance|fulfill|support)\w* (the |its |their |donee'?s'? |recipient'?s'? )?(\w+ )?(mission|purpose)s?)\b|^(general|charitable|charity|charitable purposes?)\.?$/;
const PROGRAM = /\b(programs?|programming|programmatic|projects?|initiative|pilot|camps?|trips?|books?|supplies|meals|pantry|backpack|relief|recovery|research|training|workshops?|curriculum|conference|events?|gala|tournament|festival|concerts?|exhibit\w*|sponsor\w*|awards?|prize|residency|campaign|vehicles?|roof|repairs?|facility|facilities|assistance|rental|utility|literacy|tutoring|mentoring|after.?school|summer)\b/;

export function classifyPurpose(purpose: string | null): GrantType {
  const p = (purpose ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (p.length < 3) return "unknown";
  if (POLICY.test(p) || (POLICY_ADVOCACY.test(p) && !SERVICE_ADVOCACY.test(p))) return "policy";
  if (RESTRICTED.test(p) || /\bgeneral program/.test(p)) return "program";
  if (GENERAL.test(p)) return "general";
  if (PROGRAM.test(p)) return "program";
  return "unknown";
}

export type GrantMix = {
  dollars: Record<GrantType, number>; count: Record<GrantType, number>;
  lean: "general" | "program" | "policy" | null; // set only when the evidence is enough (see MIN_*)
};

// A funder's lean is shown only when its classified grants are a real sample: at least MIN_GRANTS of
// them, covering at least half its grant dollars; it leans one way when that type is >= LEAN of the
// classified dollars.
const MIN_GRANTS = 5;
const MIN_COVER = 0.5;
const LEAN = 0.6;

export const classified = (m: GrantMix) => m.dollars.general + m.dollars.program + m.dollars.policy;
export const share = (m: GrantMix, t: Exclude<GrantType, "unknown">) => (classified(m) ? m.dollars[t] / classified(m) : 0);

function finish(m: Omit<GrantMix, "lean">): GrantMix {
  const n = m.count.general + m.count.program + m.count.policy;
  const total = classified(m as GrantMix) + m.dollars.unknown;
  const enough = n >= MIN_GRANTS && total > 0 && classified(m as GrantMix) / total >= MIN_COVER;
  const lean = !enough ? null : (["general", "program", "policy"] as const).find((t) => share(m as GrantMix, t) >= LEAN) ?? null;
  return { ...m, lean };
}

const empty = () => ({ general: 0, program: 0, policy: 0, unknown: 0 });

// Every funder's mix, built once from the distinct purposes (~23K) and cached for a day.
const cached = memo<Map<string, GrantMix>>("grants:types:v1", 1, 24 * 3600_000);
export function grantMixes(): Promise<Map<string, GrantMix>> {
  return cached("all", async () => {
    const { rows } = await db.query(
      `SELECT funder_ein, purpose, count(*)::int AS n, coalesce(sum(amount) FILTER (WHERE amount > 0), 0)::float8 AS amount
       FROM grants GROUP BY 1, 2`);
    const acc = new Map<string, Omit<GrantMix, "lean">>();
    const types = new Map<string, GrantType>();
    for (const r of rows) {
      const key = r.purpose ?? "";
      if (!types.has(key)) types.set(key, classifyPurpose(r.purpose));
      const t = types.get(key)!;
      const m = acc.get(r.funder_ein) ?? { dollars: empty(), count: empty() };
      m.dollars[t] += r.amount; m.count[t] += r.n;
      acc.set(r.funder_ein, m);
    }
    return new Map([...acc].map(([ein, m]) => [ein, finish(m)]));
  });
}

export const LEAN_LABEL = { general: "Mostly unrestricted", program: "Mostly project grants", policy: "Mostly policy" } as const;
export const TYPE_LABEL = { general: "Unrestricted", program: "Project", policy: "Policy", unknown: "Unclear" } as const;

// One line for Claude's context ("Why this funder", Research Buddy).
export function mixLine(m: GrantMix | undefined) {
  if (!m) return null;
  const c = classified(m);
  if (!c) return "Grant types: purposes too vague to tell restricted from unrestricted";
  const pct = (t: Exclude<GrantType, "unknown">) => `${Math.round(100 * share(m, t))}%`;
  return `Grant types (from grant purposes, share of classified grant dollars): general/unrestricted ${pct("general")}, specific programs/projects ${pct("program")}, policy/advocacy ${pct("policy")}`
    + (m.lean ? ` — ${LEAN_LABEL[m.lean].toLowerCase()}` : " — no clear lean or too few clear purposes");
}
