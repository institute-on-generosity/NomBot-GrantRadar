import { InsightsFeed } from "@/components/InsightsFeed";

export const metadata = { title: "Research · NomBot" };

export default function ResearchPage() {
  return (
    <main className="ins-page">
      <h1 className="pagetitle">Research</h1>
      <p className="hint">Patterns across US nonprofits and foundations, from public IRS filings, each with its method and sources.</p>
      <InsightsFeed />
    </main>
  );
}
