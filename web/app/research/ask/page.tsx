import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AnswerCard, AnswerSkeleton } from "@/components/AnswerCard";
import { RecordSearch } from "@/components/HistoryRecorder";
import { NavLink } from "@/components/NavLink";
import { ResearchBuddy } from "@/components/ResearchBuddy";
import { FollowUpBox, FollowUpText, ScrollToTurn } from "@/components/ResearchThread";
import { SearchBox } from "@/components/SearchBox";
import type { Answer } from "@/lib/answer";
import { contentPlan } from "@/lib/answerSpec";
import { suggestFollowUps } from "@/lib/followUp";
import { recordQuestion } from "@/lib/researchQuestions";
import { MAX_FOLLOW_UPS, resolveThread, threadHref } from "@/lib/thread";

export const metadata = { title: "Research question · NomBot" };

type SP = Promise<Record<string, string | string[] | undefined>>;

// A research thread: the first question's answer card, then each follow-up as its own turn (a new answer
// card for a new number, a short streamed interpretation for "why" questions, a search link for "show me
// the organizations"). The thread lives in the URL (?q=first&f=follow1&f=follow2), so a link reproduces
// it. Search sends pure research questions here; a first question that's an org search, or about a
// specific org set, goes back to the search page. Every answered turn is saved (research_questions).
export default function AskPage(props: { searchParams: SP }) {
  return (
    <main className="ins-page ask-page">
      {/* Back to where research questions are asked: the home page's Research prompts. A link, not history:
          inside a thread, history steps back one follow-up at a time. */}
      <Link href="/?tab=research" className="back rd-back">← Research questions</Link>
      <Suspense fallback={<AnswerSkeleton />}>
        <Ask searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const orgLink = (a: Answer) => a.searchQuery && (
  <p className="answer-orgs">
    <NavLink href={`/?${new URLSearchParams({ question: a.searchQuery, as: "topic" })}`} label="Loading organizations…">
      {a.orgCount ? `See the ${a.orgCount.toLocaleString("en-US")} organizations behind this` : "See the organizations behind this"} →
    </NavLink>
  </p>
);

async function Ask({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = String(list(sp.q)[0] ?? "").trim().slice(0, 300);
  if (!q) redirect("/?tab=research");
  const fs = list(sp.f).map((f) => f.trim().slice(0, 300)).filter(Boolean).slice(0, MAX_FOLLOW_UPS);
  await connection();
  const toSearch = `/?${new URLSearchParams({ question: q })}`;
  const turns = await resolveThread(q, fs).catch((err) => { console.error("research thread failed", err); return null; });
  if (!turns) redirect(toSearch);
  const first = turns[0] as Extract<(typeof turns)[number], { kind: "answer" }>;
  if (contentPlan(first.spec, first.answer.status) !== "research") redirect(toSearch);
  // Save each answered turn under its standalone question (repeat renders within 30 s count once).
  await Promise.all(turns.map((t) => t.kind === "answer" ? recordQuestion(t.standalone, t.spec, t.answer.headline, t.answer.status) : null))
    .catch((err) => console.error("saving questions failed", err));
  const lastAnswer = [...turns].reverse().find((t) => t.kind === "answer") as typeof first;
  const chips = suggestFollowUps(lastAnswer.spec).map((c) => c.label);
  const href = threadHref(q, fs);
  const many = turns.length > 3;
  return (
    <>
      <div className="ask-box"><SearchBox key={q} value="" placeholder="Ask a new research question" /></div>
      <RecordSearch question={q} href={threadHref(q, [])} total={first.answer.orgCount ?? 0} />
      <ResearchBuddy key={href} convKey={href} question={q} overrides={{}} all={false} />
      <div className="thread">
        {turns.map((t, i) => (
          <section key={`${i}:${t.text}`} className="turn" id={`turn-${i}`}>
            {i > 0 && <p className="turn-q">{t.text}{t.standalone !== t.text && t.kind === "answer" && <span title="How NomBot read this follow-up"> · {t.standalone}</span>}</p>}
            {t.kind === "answer" && <><AnswerCard key={String(many && i < turns.length - 2)} a={t.answer} compact={many && i < turns.length - 2} />{(i === turns.length - 1 || i === 0) && orgLink(t.answer)}</>}
            {t.kind === "text" && <FollowUpText q={q} fs={fs} i={i - 1} />}
            {t.kind === "search" && (
              <p className="answer-orgs"><NavLink href={`/?${new URLSearchParams({ question: t.standalone, as: "topic" })}`} label="Loading organizations…">Open “{t.standalone}” as an organization search →</NavLink></p>
            )}
          </section>
        ))}
      </div>
      {fs.length > 0 && <ScrollToTurn key={`scroll:${href}`} id={`turn-${turns.length - 1}`} />}
      <FollowUpBox key={`follow-up:${href}`} q={q} fs={fs} chips={chips} max={MAX_FOLLOW_UPS} />
    </>
  );
}
