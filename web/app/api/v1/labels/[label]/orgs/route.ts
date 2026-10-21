// Organizations carrying a cause label, by EIN, paginated. GET /api/v1/labels/climate/orgs?tier=primary&state=CO
import { listRoute, apiLabelOrgs } from "@/lib/apiData";

type Ctx = { params: Promise<{ label: string }> };
export const GET = listRoute("/api/v1/labels/orgs", async (p, { params }: Ctx) => apiLabelOrgs((await params).label, p),
  "Unknown label. Use climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health, education or health_equity.");
