// A nonprofit's Form 990 / 990-EZ finance panel by tax year: revenue, expenses, surplus, cash months, deficit streak.
// GET /api/v1/orgs/341877332/finances
import { listRoute, apiOrgFinances } from "@/lib/apiData";

type Ctx = { params: Promise<{ ein: string }> };
export const GET = listRoute("/api/v1/orgs/finances", async (_p, { params }: Ctx) => apiOrgFinances((await params).ein),
  "No Form 990 finances for this EIN.");
