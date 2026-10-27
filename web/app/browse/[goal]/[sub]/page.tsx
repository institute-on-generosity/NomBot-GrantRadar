import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Below, Focal } from "@/components/BrowseFigures";
import { SdgIcon, SdgNote } from "@/components/SdgIcon";
import { covered, ENVIRONMENT, findSub, sdgSlug } from "@/lib/sdg";
import "../../browse.css";

// One subcategory (Oct 27 redesign): its foundation dollars and growth as the focal point, one chart by year, then
// top funders and states, the crowded or under-funded line and one "Ask about this". Method under "How we count".
function subOf(goal: string, id: string) {
  const f = findSub(id);
  if (!f || f.isScope || f.sub.coverage === "none") return null;
  return (f.sdg ? sdgSlug(f.sdg.n) : ENVIRONMENT.id) === goal ? f : null;
}
export function generateStaticParams() {
  return covered().filter((f) => !f.isScope && f.sdg).map((f) => ({ goal: sdgSlug(f.sdg!.n), sub: f.sub.id }));
}
export async function generateMetadata(props: PageProps<"/browse/[goal]/[sub]">): Promise<Metadata> {
  const p = await props.params, f = subOf(p.goal, p.sub);
  return { title: f ? `${f.sub.name} · Browse · NomBot` : "Browse · NomBot" };
}

export default async function SubPage(props: PageProps<"/browse/[goal]/[sub]">) {
  const p = await props.params;
  const f = subOf(p.goal, p.sub);
  if (!f) notFound();
  const s = f.sdg!, sub = f.sub;
  return (
    <main className="br-page">
      <Link href={`/browse/${sdgSlug(s.n)}`} className="back" title={`Goal ${s.n}: ${s.name}`}>← {s.name}</Link>
      <h1 className="pagetitle br-title" title={[sub.plain, sub.targets?.length ? `Serves UN targets ${sub.targets.join(", ")}` : "", sub.note].filter(Boolean).join(". ")}>
        <SdgIcon n={s.n} name={s.name} size={48} />{sub.name}
      </h1>
      <Suspense fallback={<p className="hint">Loading figures…</p>}><Focal id={sub.id} chart /></Suspense>
      <SdgNote />
      <section className="br-sec">
        <Suspense fallback={null}><Below id={sub.id} searchName={sub.name.toLowerCase()} /></Suspense>
      </section>
    </main>
  );
}
