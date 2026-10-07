import { Header } from "@/components/Header";
import { SavedList } from "@/components/SavedList";

export default function SavedPage() {
  return (
    <main>
      <Header />
      <h1 className="pagetitle">Saved organizations</h1>
      <p className="hint">Organizations you starred. Saved only in this browser.</p>
      <SavedList />
    </main>
  );
}
