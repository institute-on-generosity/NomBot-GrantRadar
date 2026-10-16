import { redirect } from "next/navigation";

// Renamed to /research/orgs (Oct 16); old links keep working.
export default async function OldInsightOrgs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  redirect(`/research/orgs?${new URLSearchParams(await searchParams)}`);
}
