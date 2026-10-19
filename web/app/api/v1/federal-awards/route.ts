// USAspending grants and cooperative agreements to nonprofits, newest fiscal year first, paginated.
// GET /api/v1/federal-awards?recipient_ein=&agency=075&assistance_listing=93.866&fiscal_year_from=2024&state=WV&county=54011
import { listRoute, apiFederalAwards } from "@/lib/apiData";

export const GET = listRoute("/api/v1/federal-awards", (p) => apiFederalAwards(p));
