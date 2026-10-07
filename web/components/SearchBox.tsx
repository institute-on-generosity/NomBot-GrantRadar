"use client";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { EXAMPLES } from "@/lib/examples";
import { HISTORY_KEY, type HistoryEntry } from "@/lib/history";
import { Loading } from "./Loading";
import { useStoredList } from "./useStored";

const MAX_RECENT = 3;
const MAX_TOTAL = 8;

type Suggestion = { text: string; kind: "recent" | "example" };

// `big`: the centered, Claude-style composer on the empty home page (pills sit below it).
// Compact bar: focusing it opens recent questions and example questions, filtered as you type.
// examples/recents/loading: GrantRadar passes its own mission examples and loading steps and skips NomBot's recent questions.
export function SearchBox({ action = "/", name = "question", value = "", placeholder = "Search in plain language", big = false, examples = EXAMPLES, recents = true, loading = { label: "Reading your question…" }, submitLabel = "Search" }: {
  action?: string; name?: string; value?: string; placeholder?: string; big?: boolean; examples?: string[]; recents?: boolean; loading?: { label: string; steps?: string[] }; submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const history = useStoredList<HistoryEntry>(HISTORY_KEY, "nombot-history");

  const go = (question: string) => {
    const t = question.trim();
    if (!t) return;
    setQ(t); setOpen(false); setActive(-1);
    start(() => router.push(`${action}?${new URLSearchParams({ [name]: t })}`));
  };

  const needle = q.trim().toLowerCase();
  const current = value.trim().toLowerCase();
  const match = (s: string) => s.toLowerCase() !== current && (!needle || s.toLowerCase().includes(needle));
  const recent: Suggestion[] = (recents ? history : []).map((h) => h.question).filter(match).slice(0, MAX_RECENT).map((text) => ({ text, kind: "recent" }));
  const seen = new Set(recent.map((r) => r.text.toLowerCase()));
  const shownExamples: Suggestion[] = examples.filter((e) => match(e) && !seen.has(e.toLowerCase())).map((text) => ({ text, kind: "example" }));
  const items = [...recent, ...shownExamples].slice(0, MAX_TOTAL);
  const show = !big && open && items.length > 0;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (big) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const n = items.length;
      if (n) setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === "Enter" && show && active >= 0) {
      e.preventDefault();
      go(items[active].text);
    } else if (e.key === "Escape") {
      setOpen(false); setActive(-1);
    }
  };

  const input = (
    <input
      name={name} value={q} placeholder={placeholder} aria-label="Search" autoComplete="off" autoFocus={big}
      role={big ? undefined : "combobox"} aria-expanded={big ? undefined : show} aria-controls={big ? undefined : listId}
      aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
      onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
      onFocus={() => setOpen(true)}
      onBlur={() => { setOpen(false); setActive(-1); }}
      onKeyDown={onKeyDown}
    />
  );

  return (
    <form action={action} className={big ? "composer" : "search"} onSubmit={(e) => { e.preventDefault(); go(q); }}>
      {big ? (
        <>
          {input}
          <div className="composer-row">
            <button type="submit" disabled={pending} aria-label={submitLabel} title={submitLabel}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </div>
        </>
      ) : (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          {input}
          <button type="submit" disabled={pending}>{pending ? "Searching…" : submitLabel}</button>
        </>
      )}
      {show && (
        <ul className="suggest-pop" id={listId} role="listbox" aria-label="Suggested questions">
          {items.map((s, i) => (
            <li
              key={s.text} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={`suggest-item${i === active ? " on" : ""}${i === recent.length && i > 0 ? " first-example" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); go(s.text); }}
              onMouseEnter={() => setActive(i)}
            >
              {s.kind === "recent"
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="Recent"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="Example"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>}
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      )}
      {pending && <Loading label={loading.label} steps={loading.steps} search />}
    </form>
  );
}
