import { SavedList } from "@/components/SavedList";

export default function SavedPage() {
  return (
    <main>
      <h1 className="pagetitle">Saved organizations</h1>
      <p className="hint">Organizations you starred. Saved only in this browser.</p>
      <SavedList />
    </main>
  );
}
