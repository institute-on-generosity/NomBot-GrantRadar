export function SearchBox({ action = "/", name = "question", value = "", placeholder = "Search in plain language" }: { action?: string; name?: string; value?: string; placeholder?: string }) {
  return (
    <form action={action} className="search">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input name={name} defaultValue={value} placeholder={placeholder} aria-label="Search" autoFocus />
      <button type="submit">Search</button>
    </form>
  );
}
