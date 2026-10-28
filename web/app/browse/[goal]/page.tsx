import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Below, Focal, SubList } from "@/components/BrowseFigures";
import { Icon } from "@/components/Icons";
import { CauseIcon } from "@/components/CauseIcon";
import { BrowseBack } from "@/components/BrowseBack";
import { ENVIRONMENT, findSub, SDGS, sdgSlug, trustOf, trustText, type Sdg, type Sub } from "@/lib/sdg";
import { TrustLegend, TrustMark } from "@/components/TrustMark";
import "../browse.css";

// A goal (sdg-4) or the Environment umbrella (Oct 27 redesign): the goal's foundation dollars as the focal number
// with its trend, then its subcategories as a ranked list, then top funders and states. Method under "How we count".
type Goal = { sdg: Sdg | null; title: string; scope: Sub; subs: { sub: Sub; sdg: Sdg | null; isScope: boolean }[] };
function goalOf(slug: string): Goal | null {
  if (slug === ENVIRONMENT.id) return { sdg: null, title: ENVIRONMENT.name, scope: ENVIRONMENT.scope, subs: ENVIRONMENT.includes.map((id) => findSub(id)).filter((f) => !!f).map((f) => ({ sub: f!.sub, sdg: f!.sdg, isScope: f!.isScope })) };
  const g = SDGS.find((x) => sdgSlug(x.n) === slug);
  return g ? { sdg: g, title: g.name, scope: g.scope, subs: g.subs.map((sub) => ({ sub, sdg: g, isScope: false })) } : null;
}
export function generateStaticParams() { return [...SDGS.map((g) => ({ goal: sdgSlug(g.n) })), { goal: ENVIRONMENT.id }]; }

export async function generateMetadata(props: PageProps<"/browse/[goal]">): Promise<Metadata> {
  const g = goalOf((await props.params).goal);
  return { title: g ? `${g.sdg ? `Goal ${g.sdg.n}: ` : ""}${g.title} · Browse · NomBot` : "Browse · NomBot" };
}

export default async function GoalPage(props: PageProps<"/browse/[goal]">) {
  const slug = (await props.params).goal;
  const g = goalOf(slug);
  if (!g) notFound();
  const s = g.sdg;
  const see = (s?.seeAlso ?? []).map((id) => findSub(id)).filter((f) => !!f);
  const items = g.subs.map(({ sub, sdg, isScope }) => ({
    id: sub.id, name: sub.name, note: [sub.plain, sub.note].filter(Boolean).join(". "), trust: trustOf(sub, isScope ? sdg : null), tip: trustText(sub, isScope ? sdg : null),
    href: sub.coverage === "none" ? null : `/browse/${sdg ? sdgSlug(sdg.n) : ENVIRONMENT.id}${isScope ? "" : `/${sub.id}`}`,
  }));
  return (
    <main className="br-page">
      <Suspense fallback={<Link href="/browse" className="back">← All causes</Link>}><BrowseBack /></Suspense>
      <h1 className="pagetitle br-title" title={s ? `${s.plain}. UN: “${s.goal}.”` : ENVIRONMENT.plain}>
        {s ? <CauseIcon n={s.n} color={s.color} size={48} /> : <CauseIcon label="Environment" size={48} />}
        {g.title}
        <TrustMark trust={trustOf(g.scope, s)} tip={s?.limited ? `Limited nonprofit data for this cause. ${s.limited}` : trustText(g.scope, s)} />
      </h1>
      <Suspense fallback={<p className="hint">Loading figures…</p>}><Focal id={g.scope.id} /></Suspense>
      <section className="br-sec">
        <h2>By subcategory</h2>
        <Suspense fallback={<p className="hint">Loading…</p>}><SubList items={items} /></Suspense>
        <TrustLegend limited={items.some((x) => x.trust === "limited")} />
        {see.length > 0 && (
          <p className="br-see">Also: {see.map((f, i) => <span key={f!.sub.id}>{i > 0 && ", "}<Link href={`/browse/${f!.sdg ? sdgSlug(f!.sdg.n) : ENVIRONMENT.id}${f!.isScope ? "" : `/${f!.sub.id}`}`}>{f!.sub.name}</Link></span>)}</p>
        )}
      </section>
      <section className="br-sec">
        <Suspense fallback={null}><Below id={g.scope.id} searchName={g.scope.name.toLowerCase()} /></Suspense>
      </section>
    </main>
  );
}
