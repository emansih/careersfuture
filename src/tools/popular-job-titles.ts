import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McfClient } from "../mcf/client.js";
import { popularJobTitlesSchema } from "../mcf/jobs.js";
import { errorResult, jsonResult, READ_ONLY_ANNOTATIONS } from "./shared.js";

export function registerPopularJobTitlesTool(server: McpServer, client: McfClient): void {
  server.registerTool(
    "popular_job_titles",
    {
      title: "Popular job titles",
      description: "List the most popular job titles on MyCareersFuture with their counts.",
      inputSchema: {},
      outputSchema: { titles: z.array(z.object({ title: z.string(), count: z.number().nullable() })) },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => {
      try {
        const response = await client.request({ method: "GET", path: "/popular-job-titles" }, popularJobTitlesSchema);
        return jsonResult({
          titles: response.map((t) => ({ title: t.icmsJobTitle, count: t.count ?? null })),
        });
      } catch (error: unknown) {
        return errorResult(error, "list popular job titles");
      }
    },
  );
}
