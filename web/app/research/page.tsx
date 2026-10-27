import { InsightsFeed } from "@/components/InsightsFeed";
import { ResearchAsk } from "@/components/ResearchAsk";
import { PROMPT_SETS } from "@/lib/examples";

export const metadata = { title: "Research · NomBot" };

export default function ResearchPage() {
  const research = PROMPT_SETS.find((x) => x.word === "research")!;
  return (
    <main className="ins-page">
      <h1 className="pagetitle sr-only">Research</h1>
      {/* Focal point: the ask box, then the goal grid with its question panel (components/GoalGrid) */}
      <ResearchAsk groups={research.groups ?? []} placeholder={research.placeholder} />
      <InsightsFeed />
    </main>
  );
}
