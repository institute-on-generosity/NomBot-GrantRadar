import { orgNews } from "@/lib/orgNews";

// "In the news" on the org page: the 5 newest headlines that name this org (generosity-data news_org_links), with
// outlet and date, linking out. Async server component: the org page streams it in its own Suspense.
export async function OrgNews({ ein }: { ein: string }) {
  const news = await orgNews(ein.replace(/\D/g, ""), 5);
  if (!news?.results.length) return null;
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return (
    <section>
      <h2>In the news</h2>
      <ul className="org-news">
        {news.results.map((h) => (
          <li key={h.id}>
            <a href={h.url} target="_blank" rel="noreferrer">{h.title} ↗</a>
            <span>{[h.outlet?.replace(/^www\./, ""), date(h.seen_at)].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
      <p className="hint">
        {news.total > news.results.length && <>{news.total} headlines in all. </>}
        Headlines that name this organization, matched by name from GDELT news. Many mentions are missed.
      </p>
    </section>
  );
}
