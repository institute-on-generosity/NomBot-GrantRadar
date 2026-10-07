import { SavedFunders } from "@/components/GrantStore";

export default function SavedFundersPage() {
  return (
    <main>
      <h1 className="pagetitle">Starred funders</h1>
      <p className="hint">Saved in this browser only.</p>
      <SavedFunders />
    </main>
  );
}
