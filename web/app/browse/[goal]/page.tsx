import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Below, Focal, SubList } from "@/components/BrowseFigures";
import { Icon } from "@/components/Icons";
import { SdgIcon, SdgNote } from "@/components/SdgIcon";
import { ENVIRONMENT, findSub, SDGS, sdgSlug, type Sdg, type Sub } from "@/lib/sdg";
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
    id: sub.id, name: sub.name, note: [sub.plain, sub.note].filter(Boolean).join(". "),
    href: sub.coverage === "none" ? null : `/browse/${sdg ? sdgSlug(sdg.n) : ENVIRONMENT.id}${isScope ? "" : `/${sub.id}`}`,
  }));
  return (
    <main className="br-page">
      <Link href="/browse" className="back">← All causes</Link>
      <h1 className="pagetitle br-title" title={s ? `${s.plain}. UN: “${s.goal}.”` : ENVIRONMENT.plain}>
        {s ? <SdgIcon n={s.n} name={s.name} size={56} /> : <i className="sdg-dot big env" aria-hidden />}
        {g.title}
        {s?.limited && <span className="br-lim" title={`Limited nonprofit data. ${s.limited}`} aria-label="Limited nonprofit data" tabIndex={0}><Icon name="warn" size={18} /></span>}
      </h1>
      <Suspense fallback={<p className="hint">Loading figures…</p>}><Focal id={g.scope.id} /></Suspense>
      <section className="br-sec">
        <h2>By subcategory</h2>
        <Suspense fallback={<p className="hint">Loading…</p>}><SubList items={items} /></Suspense>
        {see.length > 0 && (
          <p className="br-see">Also: {see.map((f, i) => <span key={f!.sub.id}>{i > 0 && ", "}<Link href={`/browse/${f!.sdg ? sdgSlug(f!.sdg.n) : ENVIRONMENT.id}${f!.isScope ? "" : `/${f!.sub.id}`}`}>{f!.sub.name}</Link></span>)}</p>
        )}
      </section>
      {s && <SdgNote />}
      <section className="br-sec">
        <Suspense fallback={null}><Below id={g.scope.id} searchName={g.scope.name.toLowerCase()} /></Suspense>
      </section>
    </main>
  );
}
