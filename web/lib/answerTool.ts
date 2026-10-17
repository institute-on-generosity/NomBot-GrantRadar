// The research answer engine as a tool: Research Buddy (Claude tool use) and the MCP server share this
// definition. Input is the structured Spec itself, so a tool call needs no extra routing call.
import { z } from "zod";
import { specSchema } from "./answerSpec";

export const ANSWER_TOOL_NAME = "research_answer";
export const ANSWER_TOOL_DESCRIPTION = `Compute an aggregate answer from NomBot's IRS data with fixed, tested SQL: how much money goes to a cause, its share, trend, which states/causes get most or least (per resident), rural vs urban, top funders or recipients, out-of-state funding, grant sizes, general operating support share, concentration, foundations funding two causes, and how many orgs (run deficits, have under 3 months of cash, rely on government grants).
Sources: foundation_grants (990-PF grants, tax years 2022-2025, 2025 partial; default years 2022-24), government_grants / contributions / revenue (as reported on recipients' Form 990, default tax year 2024).
Causes: label 'climate' or 'women_girls' when they fit, else NTEE prefixes, else keywords (approximate). Returns headline, key numbers, bullets, method, caveats, coverage, missing pieces and data rows. Quote numbers exactly and pass on the caveats.`;
export const answerToolSchema = z.toJSONSchema(specSchema) as { type: "object"; properties: Record<string, unknown>; required?: string[] };
