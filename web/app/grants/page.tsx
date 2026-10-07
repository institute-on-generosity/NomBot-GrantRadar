import { Suspense, ViewTransition } from "react";
import { connection } from "next/server";
import { FilterChips, type Chip } from "@/components/FilterChips";
import { FunderRow } from "@/components/FunderRow";
import { GrantBuddy } from "@/components/GrantBuddy";
import { NavLink } from "@/components/NavLink";
import { RecordMission } from "@/components/GrantStore";
import { SearchBox } from "@/components/SearchBox";
import { LOADED_STATES, money } from "@/lib/filters";
import { givingStates, matchFunders, SIZES, STATE_NAMES, type MatchFilters, type Size } from "@/lib/grants";
import { MATCH_STEPS, MISSIONS } from "@/lib/grantExamples";
import { parseQuestion } from "@/lib/parse";
import { RadarMark } from "@/components/RadarMark";

type Params = { mission?: string; st?: string; open?: string; size?: string; type?: string; n?: string; buddy?: string };

const PLACEHOLDER = "Describe your mission and where you work";
const SIZE_LABEL: Record<Size, string> = { small: "Under $5K", mid: "$5K–$25K", large: "$25K+" };
const TYPES = { general: "Mostly unrestricted", program: "Mostly project grants" } as const;

function url(p: Params, change: Partial<Params>) {
  const merged = { ...p, buddy: "", ...change };
  return `/grants?${new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][])}`;
}

export default function Grants({ searchParams }: PageProps<"/grants">) {
  return (
    <main>
      <Suspense fallback={null}>
        <Results searchParams={searchParams as Promise<Params>} />
      </Suspense>
    </main>
  );
}

async function Results({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const mission = (p.mission ?? "").trim().slice(0, 1000);
  if (!mission) return <Hero />;
  await connection();
  const n = Math.min(Math.max(Number(p.n) || 10, 10), 50);
  // The applicant's state, from the mission unless a chip changed it ("any" clears it).
  const parsed = await parseQuestion(mission).catch(() => null);
  const guessed = parsed?.states.find((s) => s in STATE_NAMES) ?? "";
  const state = p.st === "any" ? "" : (p.st ?? guessed).toUpperCase();
  const size = (p.size && p.size in SIZES ? p.size : undefined) as Size | undefined;
  const type = (p.type && p.type in TYPES ? p.type : undefined) as keyof typeof TYPES | undefined;
  const filters: MatchFilters = { state: state || undefined, open: p.open === "1", size, type };
  const [{ funders, total, peers }, states] = await Promise.all([matchFunders(mission, filters, n), givingStates()]);
  const loaded = new Set(LOADED_STATES.map(([c]) => c));
  const count = (c: string) => states.find((x) => x.state === c)?.grants ?? 0;
  const stateOption = (c: string, group: string) => ({ label: `Gives in ${STATE_NAMES[c]}`, href: url(p, { st: c, n: "" }), on: c === state, group, note: count(c).toLocaleString("en-US") });

  const chips: Chip[] = [
    {
      key: "st", kind: state ? "set" : "unset", label: state ? `Gives in ${state}` : "Anywhere",
      // Loaded states first (similar grantees can be found there), then every other state these foundations give to.
      options: [
        { label: "Anywhere", href: url(p, { st: "any", n: "" }), on: !state },
        ...LOADED_STATES.map(([c]) => stateOption(c, "Full data")),
        ...states.filter((x) => !loaded.has(x.state)).map((x) => stateOption(x.state, "Other states")),
      ],
      removeHref: state ? url(p, { st: "any", n: "" }) : undefined,
    },
    {
      key: "open", kind: p.open === "1" ? "set" : "unset", label: p.open === "1" ? "Open to applications" : "Any policy",
      options: [{ label: "Any policy", href: url(p, { open: "", n: "" }), on: p.open !== "1" }, { label: "Open to applications", href: url(p, { open: "1", n: "" }), on: p.open === "1" }],
      removeHref: p.open === "1" ? url(p, { open: "", n: "" }) : undefined,
    },
    {
      key: "size", kind: size ? "set" : "unset", label: size ? SIZE_LABEL[size] : "Any size",
      options: [{ label: "Any size", href: url(p, { size: "", n: "" }), on: !size }, ...(Object.keys(SIZES) as Size[]).map((k) => ({ label: SIZE_LABEL[k], href: url(p, { size: k, n: "" }), on: k === size }))],
      removeHref: size ? url(p, { size: "", n: "" }) : undefined,
    },
    {
      key: "type", kind: type ? "set" : "unset", label: type ? TYPES[type] : "Any grant type",
      options: [{ label: "Any grant type", href: url(p, { type: "", n: "" }), on: !type }, ...(Object.keys(TYPES) as (keyof typeof TYPES)[]).map((k) => ({ label: TYPES[k], href: url(p, { type: k, n: "" }), on: k === type }))],
      removeHref: type ? url(p, { type: "", n: "" }) : undefined,
    },
  ];
  const back = encodeURIComponent(url(p, {}));
  const why = (ein: string) => `/grants/funder/${ein}?${new URLSearchParams({ mission, ...(state ? { st: state } : {}), back: decodeURIComponent(back) })}`;

  return (
    <>
      <SearchBox key={mission} action="/grants" name="mission" value={mission} placeholder={PLACEHOLDER} examples={MISSIONS} recents={false} submitLabel="Match" loading={{ label: "Reading your mission…", steps: MATCH_STEPS }} />
      <RecordMission mission={mission} href={url(p, {})} total={total} />
      <FilterChips chips={chips} />
      {funders.length === 0 ? (
        <p className="notice">No matching funders{state ? ` in ${state}` : ""}. Remove a filter or reword your mission.</p>
      ) : (
        <div className="funders">
          <div className="bar">
            <span>{total.toLocaleString("en-US")} {total === 1 ? "funder" : "funders"}</span>
            <span title={`Ranked by grants to the ${peers} nonprofits most like yours`}>Best fit first</span>
          </div>
          {funders.map((f, i) => (
            <ViewTransition key={f.ein} enter="rise" default="none">
              <FunderRow f={f} index={i} href={why(f.ein)} state={state} />
            </ViewTransition>
          ))}
        </div>
      )}
      <div className="more">
        {total > n && <NavLink href={url(p, { n: String(n + 10) })} label="Loading more…">Show more</NavLink>}
      </div>
      <p className="note">IRS Form 990-PF, 2025 · WV, KY, TN, VA, OH</p>
      {funders.length > 0 && (
        <GrantBuddy key={url(p, { n: "" })} convKey={url(p, { n: "" })} startOpen={p.buddy === "1"} mission={mission} state={state}
          filters={{ st: state || undefined, open: p.open === "1" ? "1" : undefined, size, type }} />
      )}
    </>
  );
}

function Hero() {
  return (
    <div className="hero">
      <h1 className="greet"><span className="logo radar" aria-hidden><RadarMark /></span>What does your nonprofit do?</h1>
      <SearchBox action="/grants" name="mission" placeholder={PLACEHOLDER} big examples={MISSIONS} recents={false} submitLabel="Find funders" loading={{ label: "Reading your mission…", steps: MATCH_STEPS }} />
      <div className="chips suggest">
        {MISSIONS.slice(0, 4).map((m) => (
          <NavLink key={m} href={url({}, { mission: m })} className="chip link" label="Reading your mission…" steps={MATCH_STEPS} search>{m}</NavLink>
        ))}
      </div>
      <p className="note">Ranked by who they already fund · IRS Form 990-PF · WV, KY, TN, VA, OH</p>
    </div>
  );
}
