import { similarOrgs } from "@/lib/similar";
import { SimilarToggle } from "@/components/SimilarToggle";

// "Similar organizations" on the org page: the 6 nearest orgs by 990 mission and program text (generosity-data
// org_similar), with a toggle for less-funded peers (little or no foundation funding 2022-24).
// Async server component: the org page streams it in its own Suspense.
export async function OrgSimilar({ ein }: { ein: string }) {
  const e = ein.replace(/\D/g, "");
  const [all, less] = await Promise.all([similarOrgs(e, { limit: 6 }), similarOrgs(e, { limit: 6, lessFunded: true })]);
  if (!all?.length && !less?.length) return null;
  return <SimilarToggle all={all ?? []} less={less ?? []} />;
}
