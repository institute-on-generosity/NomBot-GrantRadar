import { AskedQuestions } from "@/components/AskedQuestions";
import { ResearchTabs } from "@/components/ResearchTabs";
import { ResearchAsk } from "@/components/ResearchAsk";
import { PROMPT_SETS } from "@/lib/examples";

export const metadata = { title: "Research · NomBot" };

export default function ResearchPage() {
  const research = PROMPT_SETS.find((x) => x.word === "research")!;
  return (
    <main className="ins-page">
      <h1 className="pagetitle sr-only">Research</h1>
      <ResearchTabs on="ask" />
      {/* Ask: the ask box, then the goal grid with its question popover (components/GoalGrid). Reports live on /research/reports */}
      <ResearchAsk groups={research.groups ?? []} placeholder={research.placeholder} />
      <AskedQuestions />
    </main>
  );
}
