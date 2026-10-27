import Link from "next/link";
import { InsightsFeed } from "@/components/InsightsFeed";
import { SearchBox } from "@/components/SearchBox";

export const metadata = { title: "Research · NomBot" };

export default function ResearchPage() {
  return (
    <main className="ins-page">
      <h1 className="pagetitle">Research</h1>
      <p className="hint">Ask about foundation money and nonprofits, or <Link href="/browse" className="ins-browse">browse by cause</Link>.</p>
      {/* The page's focal point and primary action: ask a research question (UX audit R1) */}
      <div className="ins-ask"><SearchBox action="/research/ask" name="q" placeholder="e.g. How much foundation money goes to food banks in Ohio?" /></div>
      <InsightsFeed />
    </main>
  );
}
