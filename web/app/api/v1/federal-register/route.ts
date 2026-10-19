// Federal Register documents, newest first, keyword search. GET /api/v1/federal-register?q=nonprofit&funding_only=true
import { listRoute, apiFederalRegister } from "@/lib/apiData";

export const GET = listRoute("/api/v1/federal-register", (p) => apiFederalRegister(p));
