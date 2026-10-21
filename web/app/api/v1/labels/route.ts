// Graded cause labels (climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health, education) with definitions, counts and grades.
import { listRoute, apiLabels } from "@/lib/apiData";

export const GET = listRoute("/api/v1/labels", () => apiLabels());
