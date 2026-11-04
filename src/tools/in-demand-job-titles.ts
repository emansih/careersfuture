import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McfClient } from "../mcf/client.js";
import { inDemandJobTitlesSchema } from "../mcf/jobs.js";
import { errorResult, jsonResult, READ_ONLY_ANNOTATIONS } from "./shared.js";

export function registerInDemandJobTitlesTool(server: McpServer, client: McfClient): void {
  server.registerTool(
    "in_demand_job_titles",
    {
      title: "In-demand job titles",
      description: "List the in-demand job titles on MyCareersFuture with their counts.",
      inputSchema: {},
      outputSchema: { titles: z.array(z.object({ title: z.string(), count: z.number().nullable() })) },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => {
      try {
        const response = await client.request(
          { method: "GET", path: "/in-demand-job-titles" },
          inDemandJobTitlesSchema,
        );
        return jsonResult({
          titles: response.map((t) => ({ title: t.jobTitle, count: t.count ?? null })),
        });
      } catch (error: unknown) {
        return errorResult(error, "list in-demand job titles");
      }
    },
  );
}
