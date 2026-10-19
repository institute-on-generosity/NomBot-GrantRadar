// IRS SOI individual returns: itemized charitable deductions by state, county or ZIP and tax year, paginated.
// GET /api/v1/household-giving?level=county&state=WV&year_from=2022&by_agi=false
import { listRoute, apiHouseholdGiving } from "@/lib/apiData";

export const GET = listRoute("/api/v1/household-giving", (p) => apiHouseholdGiving(p));
