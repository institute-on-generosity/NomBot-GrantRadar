// Bills of the current Congress (Congress.gov), latest action first, keyword search. GET /api/v1/congress/bills?q=charitable+deduction
import { listRoute, apiBills } from "@/lib/apiData";

export const GET = listRoute("/api/v1/congress/bills", (p) => apiBills(p));
