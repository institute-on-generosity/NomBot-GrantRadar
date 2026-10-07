"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loading } from "./Loading";

export function SearchBox({ action = "/", name = "question", value = "", placeholder = "Search in plain language" }: { action?: string; name?: string; value?: string; placeholder?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      action={action}
      className="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get(name) ?? "").trim();
        if (q) start(() => router.push(`${action}?${new URLSearchParams({ [name]: q })}`));
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input name={name} defaultValue={value} placeholder={placeholder} aria-label="Search" autoFocus />
      <button type="submit" disabled={pending}>{pending ? "Searching…" : "Search"}</button>
      {pending && <Loading label="Reading your question…" />}
    </form>
  );
}
