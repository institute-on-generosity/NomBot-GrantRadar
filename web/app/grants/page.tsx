import { Suspense, ViewTransition } from "react";
import { connection } from "next/server";
import { FilterChips, type Chip } from "@/components/FilterChips";
import { FunderRow } from "@/components/FunderRow";
import { NavLink } from "@/components/NavLink";
import { SearchBox } from "@/components/SearchBox";
import { LOADED_STATES, money } from "@/lib/filters";
import { matchFunders, SIZES, type MatchFilters, type Size } from "@/lib/grants";
import { MATCH_STEPS, MISSIONS } from "@/lib/grantExamples";
import { parseQuestion } from "@/lib/parse";
import { RadarMark } from "@/components/RadarMark";

type Params = { mission?: string; st?: string; open?: string; size?: string; n?: string };

const PLACEHOLDER = "e.g. We run a food pantry and job training program in eastern Kentucky";
const SIZE_LABEL: Record<Size, string> = { small: "Under $5K", mid: "$5K–$25K", large: "$25K and up" };

function url(p: Params, change: Partial<Params>) {
  const merged = { ...p, ...change };
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
  const guessed = parsed?.states.find((s) => LOADED_STATES.some(([c]) => c === s)) ?? "";
  const state = p.st === "any" ? "" : (p.st ?? guessed).toUpperCase();
  const size = (p.size && p.size in SIZES ? p.size : undefined) as Size | undefined;
  const filters: MatchFilters = { state: state || undefined, open: p.open === "1", size };
  const { funders, total, peers } = await matchFunders(mission, filters, n);

  const chips: Chip[] = [
    {
      key: "st", kind: state ? "set" : "unset", label: state ? `Gives in ${state}` : "Gives anywhere",
      options: [{ label: "Anywhere", href: url(p, { st: "any", n: "" }), on: !state }, ...LOADED_STATES.map(([s, name]) => ({ label: `Gives in ${name}`, href: url(p, { st: s, n: "" }), on: s === state }))],
      removeHref: state ? url(p, { st: "any", n: "" }) : undefined,
    },
    {
      key: "open", kind: p.open === "1" ? "set" : "unset", label: p.open === "1" ? "Open to applications" : "Any application policy",
      options: [{ label: "Any application policy", href: url(p, { open: "", n: "" }), on: p.open !== "1" }, { label: "Open to applications", href: url(p, { open: "1", n: "" }), on: p.open === "1" }],
      removeHref: p.open === "1" ? url(p, { open: "", n: "" }) : undefined,
    },
    {
      key: "size", kind: size ? "set" : "unset", label: size ? `Typical grant ${SIZE_LABEL[size].toLowerCase()}` : "Any grant size",
      options: [{ label: "Any grant size", href: url(p, { size: "", n: "" }), on: !size }, ...(Object.keys(SIZES) as Size[]).map((k) => ({ label: SIZE_LABEL[k], href: url(p, { size: k, n: "" }), on: k === size }))],
      removeHref: size ? url(p, { size: "", n: "" }) : undefined,
    },
  ];
  const back = encodeURIComponent(url(p, {}));
  const why = (ein: string) => `/grants/funder/${ein}?${new URLSearchParams({ mission, ...(state ? { st: state } : {}), back: decodeURIComponent(back) })}`;

  return (
    <>
      <SearchBox key={mission} action="/grants" name="mission" value={mission} placeholder={PLACEHOLDER} examples={MISSIONS} recents={false} submitLabel="Match" loading={{ label: "Reading your mission…", steps: MATCH_STEPS }} />
      <FilterChips chips={chips} />
      {funders.length === 0 ? (
        <p className="notice">No foundation in the loaded data funded organizations like this{state ? ` in ${state}` : ""}. Try removing a filter, or describe your work in different words.</p>
      ) : (
        <div className="funders">
          <div className="bar">
            <span>{total.toLocaleString("en-US")} {total === 1 ? "foundation has" : "foundations have"} funded nonprofits like yours</span>
            <span title="Grantees whose filed mission is closest to yours">based on the {peers} grantees most like you</span>
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
      <p className="note">Test version · foundations in WV, KY, TN, VA, OH · from their 2025 IRS Form 990-PF grants lists · {money(funders.reduce((s, f) => s + (f.evidence.reduce((a, e) => a + (e.amount ?? 0), 0)), 0))} of grants to nonprofits like yours shown</p>
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
      <p className="note">Foundations rank by the nonprofits like yours they already funded · from public IRS Form 990-PF filings · WV, KY, TN, VA, OH</p>
    </div>
  );
}
