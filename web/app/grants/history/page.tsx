import { RecentMissions } from "@/components/GrantStore";

export default function MissionHistoryPage() {
  return (
    <main>
      <h1 className="pagetitle">Recent missions</h1>
      <p className="hint">Saved in this browser only.</p>
      <RecentMissions />
    </main>
  );
}
