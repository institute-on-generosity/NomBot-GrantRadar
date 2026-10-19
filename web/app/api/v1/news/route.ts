// Sector news headlines (GDELT), newest first, keyword search. GET /api/v1/news?q=layoffs&topic=nonprofit+cuts
import { listRoute, apiNews } from "@/lib/apiData";

export const GET = listRoute("/api/v1/news", (p) => apiNews(p));
