import { InsightsFeed } from "@/components/InsightsFeed";

export const metadata = { title: "Insights · NomBot" };

export default function InsightsPage() {
  return (
    <main className="ins-page">
      <h1 className="pagetitle">Insights</h1>
      <p className="hint">Patterns across US nonprofits and foundations, from public IRS filings, each with its method and sources.</p>
      <InsightsFeed />
    </main>
  );
}
