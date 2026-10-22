import { partialYears } from "@/lib/answer";
import { orgFinancialHealth } from "@/lib/financialHealth";
import { AnswerHealth } from "./AnswerHealth";

// Org page: financial indicators over the org's full filing years (lib/financialHealth), streamed after the profile.
// Same figures as the research answer "Is X financially healthy?" and the API's financial_health field.
export async function OrgHealthSection({ ein }: { ein: string }) {
  const { latestFull } = await partialYears("f990").catch(() => ({ latestFull: 0 }));
  if (!latestFull) return null;
  const h = await orgFinancialHealth(ein, latestFull).catch(() => null);
  if (!h || !h.years.length) return null;
  const a = h.years[0].year, z = h.years.at(-1)!.year;
  return (
    <section>
      <h2>Financial indicators <small>{a === z ? `tax year ${a}` : `tax years ${a} to ${z}`}</small></h2>
      <AnswerHealth h={h} />
    </section>
  );
}
