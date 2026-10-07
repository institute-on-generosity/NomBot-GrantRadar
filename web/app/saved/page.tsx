import { SavedList } from "@/components/SavedList";

export default function SavedPage() {
  return (
    <main>
      <h1 className="pagetitle">Starred</h1>
      <p className="hint">Sort them into folders. Saved in this browser only.</p>
      <SavedList />
    </main>
  );
}
