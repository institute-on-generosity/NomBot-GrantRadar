// Grant rows, newest first, paginated: 990-PF foundation grants (default) or Schedule I grants from public charities (source=charity).
// GET /api/v1/grants?funder_ein=&recipient_ein=&year_from=2022&year_to=2024&state=WV&county=54011&label=climate&amount_min=10000&limit=50&cursor=
import { listRoute, apiGrants } from "@/lib/apiData";

export const GET = listRoute("/api/v1/grants", (p) => apiGrants(p));
