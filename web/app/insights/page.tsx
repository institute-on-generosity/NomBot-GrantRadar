import { redirect } from "next/navigation";

// Renamed to Research (Oct 16); old links keep working.
export default function OldInsights() {
  redirect("/research");
}
