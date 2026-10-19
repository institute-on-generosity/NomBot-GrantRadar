// Graded cause labels (climate, women_girls, substance_use, housing_homelessness) with definitions, counts and grades.
import { listRoute, apiLabels } from "@/lib/apiData";

export const GET = listRoute("/api/v1/labels", () => apiLabels());
