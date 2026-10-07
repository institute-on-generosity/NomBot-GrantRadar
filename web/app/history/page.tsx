import { Header } from "@/components/Header";
import { HistoryList } from "@/components/HistoryList";

export default function HistoryPage() {
  return (
    <main>
      <Header />
      <h1 className="pagetitle">History</h1>
      <p className="hint">Your recent questions. Click one to return to the results you were viewing. Saved only in this browser.</p>
      <HistoryList />
    </main>
  );
}
