"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loading } from "./Loading";

// `big`: the centered, Claude-style composer on the empty home page.
export function SearchBox({ action = "/", name = "question", value = "", placeholder = "Search in plain language", big = false }: { action?: string; name?: string; value?: string; placeholder?: string; big?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      action={action}
      className={big ? "composer" : "search"}
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get(name) ?? "").trim();
        if (q) start(() => router.push(`${action}?${new URLSearchParams({ [name]: q })}`));
      }}
    >
      {big ? (
        <>
          <input name={name} defaultValue={value} placeholder={placeholder} aria-label="Search" autoFocus />
          <div className="composer-row">
            <span>Public IRS data · WV, KY, TN, VA, OH</span>
            <button type="submit" disabled={pending} aria-label="Search" title="Search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </div>
        </>
      ) : (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input name={name} defaultValue={value} placeholder={placeholder} aria-label="Search" autoFocus />
          <button type="submit" disabled={pending}>{pending ? "Searching…" : "Search"}</button>
        </>
      )}
      {pending && <Loading label="Reading your question…" />}
    </form>
  );
}
