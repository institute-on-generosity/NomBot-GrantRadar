import { Suspense } from "react";
import { connection } from "next/server";
import { BackLink } from "@/components/BackLink";
import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { titleCase } from "@/components/text";
import { nteeLabel } from "@/lib/ntee";
import { orgsByEin } from "@/lib/insights";

export const metadata = { title: "Organizations · Research · NomBot" };

type Props = { searchParams: Promise<{ ein?: string }> };

// "Explore" on an insight with no saved search: the organizations behind it, largest first.
export default function InsightOrgs({ searchParams }: Props) {
  return (
    <main>
      <BackLink fallback="/research">← Back to research</BackLink>
      <h1 className="pagetitle">Organizations in this insight</h1>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: Props) {
  await connection();
  const eins = [...new Set(((await searchParams).ein ?? "").split(",").map((e) => e.replace(/\D/g, "")).filter((e) => e.length === 9))].slice(0, 200);
  const orgs = eins.length ? await orgsByEin(eins) : [];
  if (!orgs.length) return <p className="hint">No organizations to show.</p>;
  return (
    <>
      <p className="hint">{orgs.length} {orgs.length === 1 ? "organization" : "organizations"}, largest revenue first.</p>
      <ul className="ins-orgs">
        {orgs.map((o) => (
          <li key={o.ein}>
            <NavLink href={`/org/${o.ein}`} label="Opening…">{titleCase(o.name)}</NavLink>
            <span>{[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ")}{o.ntee_cd && nteeLabel(o.ntee_cd) ? ` · ${nteeLabel(o.ntee_cd)}` : ""}{o.revenue_amt ? ` · ${money(Number(o.revenue_amt))} revenue` : ""}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
