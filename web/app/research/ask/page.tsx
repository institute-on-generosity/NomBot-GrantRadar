import { plainCauseText } from "@/lib/sdg";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ChatAnswer } from "@/components/ChatAnswer";
import { RecordSearch } from "@/components/HistoryRecorder";
import { NavLink } from "@/components/NavLink";
import { Chat, FollowUpText, Suggestions, ThinkingSteps } from "@/components/ResearchThread";
import { contentPlan } from "@/lib/answerSpec";
import { PROMPT_SETS } from "@/lib/examples";
import { pickFollowUps, type Turn } from "@/lib/followUp";
import { recordQuestion } from "@/lib/researchQuestions";
import { MAX_FOLLOW_UPS, resolveThread, threadHref } from "@/lib/thread";

export const metadata = { title: "Research question · NomBot" };

type SP = Promise<Record<string, string | string[] | undefined>>;

// A research conversation, ChatGPT style: one centered column, each question a right-aligned bubble,
// each answer plain content (lib/answer: a number, a chart, bullets, icon actions), the composer pinned
// at the bottom. Follow-ups are new answers (a changed question), streamed interpretations ("why?") or a
// link to the organizations. The thread lives in the URL (?q=first&f=follow1&f=follow2), so a link
// reproduces it; ?new=1 is an empty chat. Search sends pure research questions here; a first question
// that's an org search, or about a specific org set, goes back to the search page. Every answered turn
// is saved (research_questions) for Research's Asked questions.
export default function AskPage(props: { searchParams: SP }) {
  return (
    <main className="chat">
      <header className="chat-top">
        {/* A link, not history: inside a thread, history steps back one follow-up at a time. */}
        <Link href="/?tab=research" className="chat-back">← Research questions</Link>
        <NavLink href="/research/ask?new=1" className="chat-new" label="Starting a new question…">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          New question
        </NavLink>
      </header>
      <Suspense fallback={<div className="chat-thread"><Suspense fallback={null}><Echo searchParams={props.searchParams} /></Suspense><ThinkingSteps /></div>}>
        <Ask searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

// The question, shown at once while the answer is worked out
async function Echo({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = String(list(sp.q)[0] ?? "").trim().slice(0, 300), fs = list(sp.f);
  const last = fs.length ? fs[fs.length - 1] : q;
  return last ? <div className="chat-q"><p>{plainCauseText(last)}</p></div> : null;
}

async function Ask({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = String(list(sp.q)[0] ?? "").trim().slice(0, 300);
  if (!q) {
    if (!list(sp.new).length) redirect("/?tab=research");
    // New question: an empty conversation, the composer focused, a few example questions.
    const examples = PROMPT_SETS.find((s) => s.word === "research")?.prompts.slice(0, 4) ?? [];
    return (
      <Chat q={null} fs={[]} max={MAX_FOLLOW_UPS}>
        <div className="chat-empty">
          <h1>What do you want to know?</h1>
          <p>Ask about money, shares, trends or counts across US nonprofits and foundations.</p>
          <Suggestions chips={examples} />
        </div>
      </Chat>
    );
  }
  const fs = list(sp.f).map((f) => f.trim().slice(0, 300)).filter(Boolean).slice(0, MAX_FOLLOW_UPS);
  // In-place settings for the latest answer (corrected categories, a start year): not chat turns
  const sinceY = Number(list(sp.since)[0]);
  const mods = { corr: list(sp.corr)[0] === "1", since: Number.isInteger(sinceY) && sinceY > 2000 && sinceY < 2100 ? sinceY : undefined };
  await connection();
  const toSearch = `/?${new URLSearchParams({ question: q })}`;
  const turns = await resolveThread(q, fs, mods).catch((err) => { console.error("research thread failed", err); return null; });
  if (!turns) redirect(toSearch);
  const first = turns[0] as Extract<(typeof turns)[number], { kind: "answer" }>;
  if (contentPlan(first.spec, first.answer.status) !== "research") redirect(toSearch);
  // Save each answered turn under its standalone question (repeat renders within 30 s count once).
  await Promise.all(turns.map((t) => t.kind === "answer" ? recordQuestion(t.standalone, t.spec, t.answer.headline, t.answer.status) : null))
    .catch((err) => console.error("saving questions failed", err));
  const history: Turn[] = turns.flatMap((t) => (t.kind === "answer" ? [{ question: t.standalone, spec: t.spec }] : []));
  return (
    <>
      <RecordSearch question={q} href={threadHref(q, [])} total={first.answer.orgCount ?? 0} />
      <Chat q={q} fs={fs} max={MAX_FOLLOW_UPS}>
        {turns.map((t, i) => (
          <section key={`${i}:${t.text}`} className="chat-turn" id={`turn-${i}`}>
            <div className="chat-q">
              {/* One bubble: the full question (a follow-up chip's short label or a terse follow-up reads in full) */}
              <p title={t.standalone !== t.text ? `You asked: ${t.text}` : undefined}>{t.kind === "answer" ? plainCauseText(t.standalone) : t.text}</p>
            </div>
            {/* Older answers fold to their headline; the latest stays open */}
            {t.kind === "answer" && (i < turns.length - 1
              ? <details className="chat-old"><summary>{t.answer.headline}</summary><ChatAnswer a={t.answer} /></details>
              : <ChatAnswer a={t.answer} controls={{ corr: Boolean(mods.corr), since: mods.since ?? null }} />)}
            {t.kind === "text" && <FollowUpText q={q} fs={fs} i={i - 1} />}
            {t.kind === "search" && (
              <div className="chat-answer">
                <p>That needs a list of organizations. <NavLink href={`/?${new URLSearchParams({ question: t.standalone, as: "topic" })}`} className="chat-orgs" label="Loading organizations…">Search “{t.standalone}” →</NavLink></p>
              </div>
            )}
            {/* The answer shows first; the picked follow-ups stream in after it */}
            {i === turns.length - 1 && <Suspense fallback={null}><FollowUpChips history={history} first={t.kind === "answer" ? t.answer.followUps ?? [] : []} /></Suspense>}
          </section>
        ))}
      </Chat>
    </>
  );
}

// Chips the answer's own numbers suggest ("Since 2021?" after a start-year spike) come first, then the picked ones.
async function FollowUpChips({ history, first }: { history: Turn[]; first: string[] }) {
  const picks = await pickFollowUps(history);
  return <Suggestions chips={[...first, ...picks.filter((p) => !first.includes(p))].slice(0, 3)} />;
}
