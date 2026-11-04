import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McfClient } from "../mcf/client.js";
import { jobSummarySchema, searchResponseSchema, summarizeJob } from "../mcf/jobs.js";
import { errorResult, jsonResult, READ_ONLY_ANNOTATIONS } from "./shared.js";

export function registerSuggestJobsTool(server: McpServer, client: McfClient): void {
  server.registerTool(
    "suggest_jobs",
    {
      title: "Suggest jobs",
      description:
        "Suggest jobs related to search terms and/or skills. Provide at least one of searchTerms or skillUuids. Returns the same compact summaries as search_jobs.",
      inputSchema: {
        searchTerms: z
          .array(z.string().trim().min(1))
          .optional()
          .describe("Search terms, e.g. ['software engineer']."),
        skillUuids: z
          .array(z.string().trim().min(1))
          .optional()
          .describe("Skill UUIDs, e.g. from suggest_skills."),
      },
      outputSchema: { total: z.number(), results: z.array(jobSummarySchema) },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ searchTerms, skillUuids }) => {
      const body: Record<string, unknown> = {};
      if (searchTerms && searchTerms.length > 0) body["searchTerms"] = searchTerms;
      if (skillUuids && skillUuids.length > 0) body["skillUuids"] = skillUuids;
      if (Object.keys(body).length === 0) {
        return errorResult(new Error("Provide at least one of searchTerms or skillUuids."), "suggest jobs");
      }
      try {
        const response = await client.request(
          { method: "POST", path: "/v2/jobs/suggestions", body },
          searchResponseSchema,
        );
        const results = response.results.map((job) => summarizeJob(job));
        return jsonResult({ total: response.total ?? results.length, results });
      } catch (error: unknown) {
        return errorResult(error, "suggest jobs");
      }
    },
  );
}
