import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AnswerCard, AnswerSkeleton } from "@/components/AnswerCard";
import { RecordSearch } from "@/components/HistoryRecorder";
import { NavLink } from "@/components/NavLink";
import { ResearchBuddy } from "@/components/ResearchBuddy";
import { SearchBox } from "@/components/SearchBox";
import { answer } from "@/lib/answer";
import { routeQuestion } from "@/lib/answerRoute";
import { contentPlan } from "@/lib/answerSpec";
import { askHref, recordQuestion } from "@/lib/researchQuestions";

export const metadata = { title: "Research question · NomBot" };

// A research question, answered (lib/answer): the answer card, the organizations behind it as a search,
// and Research Buddy for follow-ups. Search sends pure research questions here; anything the router
// reads as an organization search (or a question about a specific org set) goes back to the search page.
// Each answered question is saved (research_questions) for the Asked questions list on /research.
export default function AskPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="ins-page ask-page">
      <Link href="/research" className="back rd-back">← Research</Link>
      <Suspense fallback={<AnswerSkeleton />}>
        <Ask searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Ask({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = String(Array.isArray(sp.q) ? sp.q[0] : sp.q ?? "").trim().slice(0, 300);
  if (!q) redirect("/research");
  await connection();
  const toSearch = `/?${new URLSearchParams({ question: q })}`;
  const r = await routeQuestion(q);
  if (!r.research) redirect(toSearch);
  const a = await answer(q, r.spec).catch((err) => { console.error("research answer failed", err); return null; });
  if (!a) redirect(toSearch);
  if (contentPlan(r.spec, a.status) !== "research") redirect(toSearch);
  await recordQuestion(q, r.spec, a.headline, a.status).catch((err) => console.error("saving the question failed", err));
  const orgsHref = a.searchQuery ? `/?${new URLSearchParams({ question: a.searchQuery, as: "topic" })}` : null;
  const href = askHref(q);
  return (
    <>
      <div className="ask-box"><SearchBox key={q} value={q} placeholder="Ask another research question" /></div>
      <RecordSearch question={q} href={href} total={a.orgCount ?? 0} />
      <ResearchBuddy key={href} convKey={href} question={q} overrides={{}} all={false} />
      <AnswerCard a={a} />
      {orgsHref && (
        <p className="answer-orgs">
          <NavLink href={orgsHref} label="Loading organizations…">{a.orgCount ? `See the ${a.orgCount.toLocaleString("en-US")} organizations behind this` : "See the organizations behind this"} →</NavLink>
        </p>
      )}
    </>
  );
}
