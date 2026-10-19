// A private foundation's 990-PF finances by tax year: assets, grants paid, payout rate, distributable amount.
// GET /api/v1/foundations/131684331/finances
import { listRoute, apiFoundationFinances } from "@/lib/apiData";

type Ctx = { params: Promise<{ ein: string }> };
export const GET = listRoute("/api/v1/foundations/finances", async (_p, { params }: Ctx) => apiFoundationFinances((await params).ein),
  "No 990-PF finances for this EIN.");
