import Link from "next/link";

// /research has two areas: Ask (the ask box and goal tiles) and Reports (finished findings as articles).
export function ResearchTabs({ on }: { on: "ask" | "reports" }) {
  return (
    <nav className="rs-tabs" aria-label="Research">
      <Link href="/research" aria-current={on === "ask" ? "page" : undefined} className={on === "ask" ? "on" : undefined}>Ask</Link>
      <Link href="/research/reports" aria-current={on === "reports" ? "page" : undefined} className={on === "reports" ? "on" : undefined}>Reports</Link>
    </nav>
  );
}
