// IRS tax-exempt status for one EIN: Pub 78 eligibility (tax-deductible gifts) and automatic revocation, with
// foundation grants received after a revocation. GET /api/v1/orgs/341877332/status
import { listRoute } from "@/lib/apiData";
import { apiOrgStatus } from "@/lib/taxStatus";

type Ctx = { params: Promise<{ ein: string }> };
export const GET = listRoute("/api/v1/orgs/status", async (_p, { params }: Ctx) => apiOrgStatus((await params).ein),
  "This EIN is not on IRS Pub 78, the revocation list or the master file.");
